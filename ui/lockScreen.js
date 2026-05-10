/**
 * lockScreen.js — 잠금 해제 화면 + 자동 잠금 상태 머신
 *
 * 상태: LOCKED ↔ UNLOCKED
 * UNLOCKED → 15분 무활동 → LOCKED (DEK 폐기)
 */

let _dek = null;
let _lockTimer = null;
let _lockTimeoutMs = 15 * 60 * 1000; // 기본 15분
let _onUnlock = null; // 콜백
let _onLock = null;

/**
 * 초기화
 */
export function initLockScreen({ onUnlock, onLock, timeoutMinutes = 15 }) {
    _onUnlock = onUnlock;
    _onLock = onLock;
    _lockTimeoutMs = timeoutMinutes * 60 * 1000;

    // 활동 감지 → 타이머 리셋
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetLockTimer, { passive: true });
    });

    renderLockScreen();
}

/**
 * DEK 설정 (잠금 해제)
 */
export function setUnlocked(dek) {
    _dek = dek;
    hideLockScreen();
    resetLockTimer();
    if (_onUnlock) _onUnlock(dek);
}

/**
 * 잠금 (DEK 폐기)
 */
export function lock() {
    _dek = null;
    clearTimeout(_lockTimer);
    showLockScreen();
    if (_onLock) _onLock();
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

function resetLockTimer() {
    if (_dek === null) return;
    clearTimeout(_lockTimer);
    _lockTimer = setTimeout(() => {
        lock();
    }, _lockTimeoutMs);
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const el = document.getElementById('lock-timer-display');
    if (!el) return;
    const mins = Math.ceil(_lockTimeoutMs / 60000);
    el.textContent = `🔒 ${mins}분`;
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
            <p class="lock-subtitle">마스터 비밀번호를 입력해주세요</p>
            <input type="password" id="lock-password-input" class="lock-input"
                   placeholder="마스터 비밀번호" autocomplete="off" />
            <div id="lock-error" class="lock-error hidden"></div>
            <button id="lock-unlock-btn" class="lock-btn">열기</button>
            <button id="lock-recovery-btn" class="lock-link-btn">복구 코드로 열기</button>
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
        showError(errorEl, '비밀번호를 입력해주세요.');
        return;
    }

    const btn = document.getElementById('lock-unlock-btn');
    btn.textContent = '확인 중...';
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

function showLockScreen() {
    const el = document.getElementById('lock-screen-overlay');
    if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; }
    const input = document.getElementById('lock-password-input');
    if (input) { input.value = ''; input.focus(); }
}

function hideLockScreen() {
    const el = document.getElementById('lock-screen-overlay');
    if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
}
