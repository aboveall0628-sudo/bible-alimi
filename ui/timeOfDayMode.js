/**
 * timeOfDayMode.js — 시간대 모드 (아침/낮/저녁)
 *
 * 🌅 아침 (04~11): 말씀 → 묵상 → 결단 → 타임박싱(강조). 시계부 접힘.
 * ☀️ 낮  (11~20): 타임박싱 메인, 현재 시각 하이라이트.
 * 🌙 저녁 (20~04): 시계부 → 평가 → 계획vs실제 → 회고.
 *
 * 자동 전환 + 수동 토글. 200ms 페이드 + 헤더 그라데이션.
 */

const MODES = {
    morning: {
        key: 'morning',
        icon: '🌅',
        label: '아침',
        gradient: 'linear-gradient(90deg, #FFE5B4, transparent)',
        sections: {
            show: ['scripture', 'meditation', 'decisions', 'timebox'],
            collapse: ['timeledger', 'planvsactual'],
        }
    },
    day: {
        key: 'day',
        icon: '☀️',
        label: '낮',
        gradient: 'none',
        sections: {
            show: ['timebox', 'timeledger'],
            collapse: ['scripture', 'meditation', 'decisions', 'planvsactual'],
        }
    },
    evening: {
        key: 'evening',
        icon: '🌙',
        label: '저녁',
        gradient: 'linear-gradient(90deg, #C5CAE9, transparent)',
        sections: {
            show: ['timeledger', 'planvsactual', 'decisions'],
            collapse: ['scripture', 'meditation', 'timebox'],
        }
    },
};

let _currentMode = null;
let _manualOverride = false;

/**
 * 시간대 자동 감지
 */
function detectMode() {
    const h = new Date().getHours();
    if (h >= 4 && h < 11) return 'morning';
    if (h >= 11 && h < 20) return 'day';
    return 'evening';
}

/**
 * 초기화 — UI 렌더 + 자동 모드 적용
 */
export function initTimeOfDayMode() {
    renderModeIndicator();
    const mode = detectMode();
    applyMode(mode);

    // 10분마다 자동 체크 (수동 오버라이드 아닌 경우)
    setInterval(() => {
        if (!_manualOverride) {
            const newMode = detectMode();
            if (newMode !== _currentMode) applyMode(newMode);
        }
    }, 10 * 60 * 1000);
}

/**
 * 모드 인디케이터 렌더
 */
function renderModeIndicator() {
    const container = document.getElementById('mode-indicator');
    if (!container) return;

    container.innerHTML = `
        <div class="mode-segmented">
            ${Object.values(MODES).map(m => `
                <button class="mode-btn" data-mode="${m.key}">
                    <span>${m.icon}</span>
                    <span class="mode-label">${m.label}</span>
                </button>
            `).join('')}
        </div>
    `;

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        if (!btn) return;
        _manualOverride = true;
        applyMode(btn.dataset.mode);
    });
}

/**
 * 모드 적용
 */
function applyMode(modeKey) {
    const mode = MODES[modeKey];
    if (!mode) return;
    _currentMode = modeKey;

    // 버튼 활성 상태
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === modeKey);
    });

    // 헤더 그라데이션
    const header = document.getElementById('mode-gradient-bar');
    if (header) {
        header.style.background = mode.gradient;
        header.style.transition = 'background 200ms ease-out';
    }

    // 섹션 표시/접기
    mode.sections.show.forEach(id => {
        const el = document.getElementById(`section-${id}`);
        if (el) {
            el.style.display = '';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 200ms ease-out';
                el.style.opacity = '1';
            });
        }
    });

    mode.sections.collapse.forEach(id => {
        const el = document.getElementById(`section-${id}`);
        if (el) {
            el.style.transition = 'opacity 200ms ease-out';
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; }, 200);
        }
    });

    // 이벤트 발행
    document.dispatchEvent(new CustomEvent('sanctum:mode-changed', {
        detail: { mode: modeKey }
    }));
}

export function getCurrentMode() {
    return _currentMode;
}

export function setManualMode(modeKey) {
    _manualOverride = true;
    applyMode(modeKey);
}

export { MODES };
