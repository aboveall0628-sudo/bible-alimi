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

// (v134 2026-05-22) 사용자 결정 — 새로고침 시 잠금 풀고 싶음.
//   DEK를 sessionStorage에 JWK 결로 임시 저장. 탭 닫으면 자동 비움.
//   새로고침·내부 링크 이동에는 unlock 유지. 누가 같은 탭에서 새로고침해도 안 잠긴다는
//   약점은 있지만, 그 시점엔 이미 화면 노출 = 더 큰 위험. UX 결로 적절.
const SESSION_DEK_KEY = 'sanctum.session.dek.jwk';

async function persistDEKToSession(dek) {
    try {
        const jwk = await crypto.subtle.exportKey('jwk', dek);
        sessionStorage.setItem(SESSION_DEK_KEY, JSON.stringify(jwk));
    } catch (e) {
        console.warn('[lockScreen] persistDEKToSession 실패 (무시):', e?.message || e);
    }
}

function clearSessionDEK() {
    try { sessionStorage.removeItem(SESSION_DEK_KEY); } catch {}
}

/**
 * 부팅 시 sessionStorage 안 DEK 있으면 복원 시도.
 * @returns {Promise<CryptoKey|null>}
 */
export async function tryRestoreDEKFromSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_DEK_KEY);
        if (!raw) return null;
        const jwk = JSON.parse(raw);
        const dek = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        return dek;
    } catch (e) {
        console.warn('[lockScreen] tryRestoreDEKFromSession 실패:', e?.message || e);
        clearSessionDEK();
        return null;
    }
}

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
    // (v134) 새로고침 대비 sessionStorage 임시 보관 — 탭 닫으면 자동 비움
    persistDEKToSession(dek);
    hideLockScreen();
    startTimerTick();
    showManualLockButton();
    if (_onUnlock) _onUnlock(dek);
}

/**
 * 잠금 (DEK 폐기)
 */
export function lock() {
    _dek = null;
    clearSessionDEK();
    stopTimerTick();
    hideManualLockButton();
    showLockScreen();
    if (_onLock) _onLock();
}

/**
 * 우상단 수동 잠금 버튼 — 잠금 해제 후에만 노출, 클릭 시 lock() 호출
 */
function showManualLockButton() {
    const wrap = document.getElementById('manual-lock-wrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const btn = document.getElementById('manual-lock-btn');
    if (btn && !btn.__sanctumLockBound) {
        btn.addEventListener('click', async () => {
            // 열려 있는 모달이 있으면 먼저 모두 닫기 (단축키 lockNow 동작과 일치)
            try {
                const mm = await import('./modalManager.js');
                if (mm && typeof mm.closeAllModals === 'function') mm.closeAllModals();
            } catch (_) { /* 모달 매니저 없으면 통과 */ }
            lock();
        });
        btn.__sanctumLockBound = true;
    }
}

function hideManualLockButton() {
    const wrap = document.getElementById('manual-lock-wrap');
    if (wrap) wrap.classList.add('hidden');
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
            <div class="lock-icon" aria-hidden="true">
                <i data-lucide="lock-keyhole"></i>
            </div>
            <h2>Sanctum OS</h2>
            <p class="lock-subtitle">잠시 잠겨있어요. 비밀번호로 열어주세요.</p>
            <input type="password" id="lock-password-input" class="lock-input"
                   placeholder="내 비밀번호" autocomplete="off" />
            <div id="lock-error" class="lock-error hidden"></div>
            <button id="lock-unlock-btn" class="lock-btn primary-btn">
                <i data-lucide="unlock" class="btn-icon" aria-hidden="true"></i> 열기
            </button>
            <button id="lock-recovery-btn" class="lock-link-btn text-btn">비밀번호를 잊었어요</button>
        </div>
    `;
    document.body.appendChild(overlay);
    if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();

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

    // (2026-05-20 v96 fix) 잠금 화면 자리 자리잡힐 때 자리잡혀 있던 모달 자리 모두 자리잡지 X 자리잡기.
    //   사용자 점검 "모달 켠 채로 잠시 끄고 다시 로그인하니 비밀번호 화면 바로 앞에 모달 나옴"
    //   잠금 자리 z-index 2000 자리잡혀 있어도 모달 자리잡힌 자리 DOM 자리잡혀 사용자한테 혼선 자리.
    try {
        document.querySelectorAll('.modal-overlay, .swan-overlay, .presurvey-backdrop, .mission-achievement').forEach(m => {
            m.classList.add('hidden');
        });
    } catch (_) {}

    // 진행 중이던 fade-out timer 정리 (showLockScreen 빠르게 다시 호출되는 경우).
    if (el._hideTimer) { clearTimeout(el._hideTimer); el._hideTimer = null; }
    el.classList.remove('hidden');
    el.style.display = 'flex';
    // (S-E5 2026-05-15) 부드러운 등장 — display:flex 박은 다음 프레임에 .is-visible 박아야
    //   CSS transition 이 0 → 1 으로 잘 탐. 같은 프레임에 두면 transition 안 먹힘.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('is-visible'));
    });
    const input = document.getElementById('lock-password-input');
    if (input) { input.value = ''; input.focus(); }
    // (2026-05-13 #55) 진입 시 "열기" 버튼 상태 강제 reset — 이전 세션의 "여는 중..." 잔존 차단
    const btn = document.getElementById('lock-unlock-btn');
    if (btn) {
        btn.textContent = '열기';
        btn.disabled = false;
    }
    return true;
}

export function hideLockScreen() {
    const el = document.getElementById('lock-screen-overlay');
    if (!el) return;
    // (S-E5 2026-05-15) fade-out 후 display:none — 갑자기 사라지지 않고 자연스럽게 빠짐.
    if (!el.classList.contains('is-visible')) {
        // 아직 한 번도 안 보였던 상태면 transition 없이 즉시 숨김.
        el.classList.add('hidden');
        el.style.display = 'none';
        return;
    }
    el.classList.remove('is-visible');
    if (el._hideTimer) clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
        el.classList.add('hidden');
        el.style.display = 'none';
        el._hideTimer = null;
    }, 240);  // CSS opacity transition 280ms 보다 살짝 짧게.
}
