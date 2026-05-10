/**
 * lockScreen.js — 잠금 해제 화면 + 자동 잠금 상태 머신
 *
 * 상태: LOCKED ↔ UNLOCKED
 * UNLOCKED → 15분 무활동 → LOCKED (DEK 폐기)
 */

import { getRemainingMs } from '../security/autoLock.js';

let _dek = null;
let _onUnlock = null; // 콜백
let _onLock = null;
let _timerInterval = null;

/**
 * 초기화
 */
export function initLockScreen({ onUnlock, onLock, startHidden = false }) {
    _onUnlock = onUnlock;
    _onLock = onLock;

    renderLockScreen();
    if (startHidden) {
        hideLockScreen();
    }
}

/**
 * DEK 설정 (잠금 해제)
 */
export function setUnlocked(dek) {
    _dek = dek;
    hideLockScreen();
    startTimerTick();
    if (_onUnlock) _onUnlock(dek);
}

/**
 * 잠금 (DEK 폐기)
 */
export function lock() {
    _dek = null;
    stopTimerTick();
    showLockScreen();
    if (_onLock) _onLock();
}

function startTimerTick() {
    if (_timerInterval) return;
    updateTimerDisplay();
    _timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimerTick() {
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = null;
    const el = document.getElementById('lock-timer-display');
    if (el) el.textContent = '🔒 잠겨있어요';
}

/**
 * 현재 DEK 반환 (null이면 잠금 상태)
 */
export function getDEK() {
    return _dek;
}

export function isLocked() {
    return _dek === null;
}



function updateTimerDisplay() {
    const el = document.getElementById('lock-timer-display');
    if (!el) return;
    if (_dek === null) { el.textContent = '🔒 잠겨있어요'; return; }
    const ms = getRemainingMs();
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    el.textContent = `🔒 ${m}:${String(s).padStart(2, '0')}`;
    el.title = '자동으로 잠기기까지 남은 시간';
}

/**
 * 잠금 화면 렌더
 */
function renderLockScreen() {
    if (document.getElementById('lock-screen-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'lock-screen-overlay';
    overlay.className = 'lock-screen-overlay';
    overlay.innerHTML = `
        <div class="lock-screen-box">
            <div class="lock-icon">🔐</div>
            <h2>Sanctum OS</h2>
            <p class="lock-subtitle">잠시 잠겨있어요. 비밀번호로 열어주세요.</p>
            <input type="password" id="lock-password-input" class="lock-input"
                   placeholder="내 비밀번호" autocomplete="off" />
            <div id="lock-error" class="lock-error hidden"></div>
            <button id="lock-unlock-btn" class="lock-btn">열기</button>
            <button id="lock-recovery-btn" class="lock-link-btn">비밀번호를 잊었어요</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('lock-unlock-btn').addEventListener('click', handleUnlockAttempt);
    document.getElementById('lock-password-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUnlockAttempt();
    });
    document.getElementById('lock-recovery-btn').addEventListener('click', () => {
        // 복구 모드 전환은 auth.js에서 처리
        document.dispatchEvent(new CustomEvent('sanctum:recovery-requested'));
    });
}

async function handleUnlockAttempt() {
    const input = document.getElementById('lock-password-input');
    const errorEl = document.getElementById('lock-error');
    const password = input.value;

    if (!password) {
        showError(errorEl, '비밀번호를 적어주세요.');
        return;
    }

    const btn = document.getElementById('lock-unlock-btn');
    btn.textContent = '여는 중...';
    btn.disabled = true;

    // auth.js의 unlock 함수를 이벤트로 호출
    document.dispatchEvent(new CustomEvent('sanctum:unlock-attempt', {
        detail: { password }
    }));
}

function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

export function showLockError(msg) {
    const errorEl = document.getElementById('lock-error');
    const btn = document.getElementById('lock-unlock-btn');
    if (errorEl) showError(errorEl, msg);
    if (btn) { btn.textContent = '열기'; btn.disabled = false; }
    const input = document.getElementById('lock-password-input');
    if (input) { input.value = ''; input.focus(); }
}

export function showLockScreen() {
    const el = document.getElementById('lock-screen-overlay');
    if (!el) {
        console.error('[lockScreen] showLockScreen 호출됐는데 lock-screen-overlay div가 없음');
        return false;
    }
    el.classList.remove('hidden');
    el.style.display = 'flex';
    const input = document.getElementById('lock-password-input');
    if (input) { input.value = ''; input.focus(); }
    return true;
}

export function hideLockScreen() {
    const el = document.getElementById('lock-screen-overlay');
    if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
}
