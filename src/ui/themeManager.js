/**
 * themeManager.js — 화면 모드 자리잡기 (라이트 · 다크 · 시스템)
 *
 * v101 (2026-05-20): 사용자 명시 "시스템 따라가기 버튼 하나 추가".
 *   기존 2 옵션 토글(라이트/다크) → 3 옵션 칩(라이트/다크/시스템) 결로 갈음.
 *   시스템 결 = OS 자체 결(prefers-color-scheme) 자연 따라감 + 변경 감지 listener.
 *
 * localStorage 'sanctum-theme' = 'light' | 'dark' | 'system'
 *   - 'light'  → 항상 라이트 (data-theme 제거)
 *   - 'dark'   → 항상 다크 (data-theme="dark")
 *   - 'system' → OS 결 따라감 (실시간 OS 갈음 시 자동 갱신)
 *
 * 기존 사용자 호환: 옛 값(없음)은 'system' 결로 자연 폴백.
 */

const STORAGE_KEY = 'sanctum-theme';

export const THEME_MODES = {
    light: { label: '라이트', desc: '밝은 자리. 낮 자리 결.' },
    dark: { label: '다크', desc: '어두운 자리. 눈 편한 결.' },
    system: { label: '시스템', desc: 'OS 결 자연 따라감.' },
};

function readSavedMode() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && THEME_MODES[saved]) return saved;
    } catch (_) {}
    // 옛 사용자(없거나 옛 결) — 시스템 디폴트
    return 'system';
}

function osPrefersDark() {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
        return false;
    }
}

/**
 * 현재 자리잡힌 모드를 실제 라이트/다크 결로 풀어서 <html data-theme> 자리잡기.
 *   - light → removeAttribute
 *   - dark → setAttribute 'dark'
 *   - system → osPrefersDark() 결로 분기
 */
function applyMode(mode) {
    const effective = mode === 'system' ? (osPrefersDark() ? 'dark' : 'light') : mode;
    if (effective === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

/**
 * 사용자가 모드 갈음 시 호출.
 *   localStorage 자리잡기 + 즉시 적용 + system 결이면 OS listener 자리잡기.
 */
export function setThemeMode(mode) {
    if (!THEME_MODES[mode]) return;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
    applyMode(mode);
    _ensureOsListener();   // system 모드면 OS 갈음 감지 자리잡힘
    renderThemeChips();
}

/**
 * 현재 자리잡힌 모드 반환.
 */
export function getThemeMode() {
    return readSavedMode();
}

// OS 결 갈음 감지 listener — 'system' 모드일 때 자동 적용. 한 번만 자리잡힘.
let _osListenerInstalled = false;
function _ensureOsListener() {
    if (_osListenerInstalled) return;
    try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
            if (getThemeMode() === 'system') {
                applyMode('system');
            }
        };
        // 새 브라우저는 addEventListener, 옛 브라우저는 addListener
        if (mq.addEventListener) mq.addEventListener('change', handler);
        else if (mq.addListener) mq.addListener(handler);
        _osListenerInstalled = true;
    } catch (_) {}
}

/**
 * 설정 카드 안 칩 렌더 — 강조색·노트 폰트 카드 같은 결.
 */
function renderThemeChips() {
    const row = document.getElementById('theme-mode-row');
    if (!row) return;
    const current = getThemeMode();
    row.innerHTML = Object.entries(THEME_MODES).map(([id, cfg]) => `
        <button type="button"
                class="settings-font-chip${current === id ? ' selected' : ''}"
                data-theme-mode="${id}">
            <span class="settings-font-chip-label">${cfg.label}</span>
            <span class="settings-font-chip-desc">${cfg.desc}</span>
        </button>
    `).join('');
    row.querySelectorAll('.settings-font-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.themeMode;
            if (!THEME_MODES[id]) return;
            setThemeMode(id);
            // (2026-05-20 v95) theme_change 미션 트리거 — 화면 모드 갈음 1회.
            (async () => {
                try {
                    const uid = window.currentUserId;
                    if (!uid) return;
                    const { getDEK } = await import('./lockScreen.js');
                    const dek = getDEK();
                    if (!dek) return;
                    const { markMissionComplete } = await import('../data/personRepo.js');
                    await markMissionComplete(dek, uid, 'theme_change', { signal: 'mode:' + id });
                } catch (e) {
                    console.warn('[mission] theme_change(mode) 자리잡지 실패:', e?.message || e);
                }
            })();
        });
    });
}

export function initThemeManager() {
    // 1) 저장된 모드 즉시 적용 (FOUC 가드와 일관)
    const initial = readSavedMode();
    applyMode(initial);

    // 2) 'system' 모드면 OS 갈음 자동 감지 자리잡힘
    _ensureOsListener();

    // 3) 설정 카드 칩 렌더 — settings 화면 진입 자리에서 호출되므로 안전 가드.
    if (document.getElementById('theme-mode-row')) {
        renderThemeChips();
    }
}
