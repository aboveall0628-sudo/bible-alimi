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
 * 설정 카드 안 커스텀 드롭다운 (v105) — 사용자 명시:
 *   "문구 다 빼고 라이트·다크·시스템만 / 강조 표시·네모 박스 디자인 시스템 정합 / 부드러운 애니메이션"
 *
 * 기본 <select> 펼친 자리는 OS 결로 잡혀서 색 갈음 어려움 → 커스텀 결.
 *   - 트리거 버튼: 현재 모드 라벨 + ▾
 *   - 옵션 패널: 3 옵션, hidden 디폴트. open 자리에서 fade + slide 애니메이션.
 *   - 옵션 클릭 → setThemeMode + 패널 닫음.
 *   - ESC / 외부 클릭 → 닫음.
 */
function renderThemeChips() {
    const row = document.getElementById('theme-mode-row');
    if (!row) return;
    // (v103 후속) 옛 settings-font-chip-row 클래스 자리 잡혀 있으면 제거 — 캐시 자리 호환.
    if (row.classList.contains('settings-font-chip-row')) {
        row.classList.remove('settings-font-chip-row');
    }
    const current = getThemeMode();
    row.innerHTML = `
        <div class="theme-dropdown" data-open="false">
            <button type="button" class="theme-dropdown-trigger" id="theme-dropdown-trigger"
                    aria-haspopup="listbox" aria-expanded="false">
                <span class="theme-dropdown-label" id="theme-dropdown-label">${THEME_MODES[current]?.label || '시스템'}</span>
                <svg class="theme-dropdown-caret" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <ul class="theme-dropdown-panel" role="listbox" aria-label="화면 모드">
                ${Object.entries(THEME_MODES).map(([id, cfg]) => `
                    <li class="theme-dropdown-option${current === id ? ' selected' : ''}"
                        role="option" data-theme-mode="${id}"
                        aria-selected="${current === id ? 'true' : 'false'}">
                        ${cfg.label}
                    </li>
                `).join('')}
            </ul>
        </div>
    `;

    const dropdown = row.querySelector('.theme-dropdown');
    const trigger = row.querySelector('#theme-dropdown-trigger');
    const panel = row.querySelector('.theme-dropdown-panel');
    const label = row.querySelector('#theme-dropdown-label');

    const setOpen = (open) => {
        dropdown.dataset.open = open ? 'true' : 'false';
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(dropdown.dataset.open !== 'true');
    });

    panel.addEventListener('click', (e) => {
        const opt = e.target.closest('.theme-dropdown-option');
        if (!opt) return;
        const id = opt.dataset.themeMode;
        if (!THEME_MODES[id]) return;

        setThemeMode(id);
        label.textContent = THEME_MODES[id].label;
        panel.querySelectorAll('.theme-dropdown-option').forEach(o => {
            const isSel = o.dataset.themeMode === id;
            o.classList.toggle('selected', isSel);
            o.setAttribute('aria-selected', isSel ? 'true' : 'false');
        });
        setOpen(false);

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
            } catch (err) {
                console.warn('[mission] theme_change(mode) 자리잡지 실패:', err?.message || err);
            }
        })();
    });

    // 외부 클릭 닫음
    const onOutside = (e) => {
        if (!dropdown.contains(e.target)) setOpen(false);
    };
    // ESC 닫음
    const onKey = (e) => {
        if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
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
