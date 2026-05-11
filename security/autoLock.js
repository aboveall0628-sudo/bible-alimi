/**
 * autoLock.js — 자동 잠금(기본 15분) 및 무차별 대입(Brute Force) 방지 머신
 *
 * 사용자가 설정 페이지에서 분 단위 시간을 바꿀 수 있고,
 * localStorage('sanctum-autolock-minutes')에 영속화한다.
 */

import { lock } from '../ui/lockScreen.js';
import { logAuditAction } from './auditLog.js';

const STORAGE_KEY = 'sanctum-autolock-minutes';
const DEFAULT_MIN = 15;
const MIN_MIN = 1;
const MAX_MIN = 120;

let _timeoutMs = DEFAULT_MIN * 60 * 1000;
let _timer = null;
let _idleSince = Date.now();
let _failedAttempts = 0;
let _lockoutUntil = 0;

export function getSavedTimeoutMinutes() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < MIN_MIN || n > MAX_MIN) return DEFAULT_MIN;
    return Math.floor(n);
}

export function saveTimeoutMinutes(minutes) {
    const clamped = Math.min(MAX_MIN, Math.max(MIN_MIN, Math.floor(Number(minutes) || DEFAULT_MIN)));
    localStorage.setItem(STORAGE_KEY, String(clamped));
    setTimeoutMinutes(clamped);
    return clamped;
}

export function initAutoLock(timeoutMinutes) {
    const minutes = Number.isFinite(timeoutMinutes) ? timeoutMinutes : getSavedTimeoutMinutes();
    _timeoutMs = Math.max(MIN_MIN, minutes) * 60 * 1000;
    
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    // 앱이 백그라운드로 갈 때 유예 처리
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 브라우저가 숨겨지면 3분 뒤 즉시 잠금
            clearTimeout(_timer);
            _timer = setTimeout(() => lockVault('background_timeout'), 3 * 60 * 1000);
        } else {
            resetIdleTimer();
        }
    });

    resetIdleTimer();
}

function resetIdleTimer() {
    if (document.hidden) return;
    _idleSince = Date.now();
    clearTimeout(_timer);
    _timer = setTimeout(() => lockVault('idle_timeout'), _timeoutMs);
}

function lockVault(_reason) {
    lock();
    // userId는 app.js의 onVaultLocked 이벤트에서 audit log 처리
}

/**
 * 자동 잠금까지 남은 ms (음수면 즉시 잠금)
 */
export function getRemainingMs() {
    return Math.max(0, _timeoutMs - (Date.now() - _idleSince));
}

/**
 * 잠금 타임아웃 변경
 */
export function setTimeoutMinutes(minutes) {
    _timeoutMs = Math.max(1, minutes) * 60 * 1000;
    resetIdleTimer();
}

/**
 * 비밀번호 실패 카운터 및 30초 락아웃 제어
 * @returns {boolean} true면 락아웃 상태
 */
export function registerFailedAttempt(userId) {
    const now = Date.now();
    if (now < _lockoutUntil) return true; // 아직 락아웃

    _failedAttempts++;
    if (_failedAttempts >= 5) {
        _lockoutUntil = now + 30 * 1000; // 30초 락아웃
        _failedAttempts = 0; // 리셋
        logAuditAction(userId, 'lockout_triggered', { reason: '5 failed attempts' });
        return true;
    }
    return false;
}

export function resetFailedAttempts() {
    _failedAttempts = 0;
    _lockoutUntil = 0;
}

export function isLockoutActive() {
    return Date.now() < _lockoutUntil;
}

export function getLockoutRemainingSec() {
    if (!isLockoutActive()) return 0;
    return Math.ceil((_lockoutUntil - Date.now()) / 1000);
}
