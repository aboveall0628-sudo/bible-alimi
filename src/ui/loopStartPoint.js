/**
 * loopStartPoint.js — 묵상 시점에 따른 루프 시작점 결정 헬퍼
 *
 * (2026-05-21 v112 묵상 시점 루프 시작점 트랙) 사용자 명시:
 *   "아침에 하는 사람은 당일 계획, 저녁에 하는 사람은 다음날 계획"
 *   "사용자가 이용하는 시간에 맞춰서 다음 순간을 계획하게 만들어줘야"
 *
 * 핵심 결: "자기 리듬을 시스템이 입력 없이 알아채는 결".
 *   사용자 수면 시간대 입력 X. 묵상 시점 시간만으로 휴리스틱 분기.
 *
 * 4 buckets (R2 합의):
 *   5~12시  → 오늘 시작     → 'today'    (오늘 계획)
 *   12~17시 → 한참 진행 중  → 'both'     (오늘 + 내일 둘 다)
 *   17~24시 → 자기 전 결    → 'tomorrow' (내일 계획)
 *   0~5시   → 심야           → 'today'    (잠 안 자고 자기 전, 오늘 계획)
 *
 * 기획서: docs/backlog/묵상시점_루프시작점_기획서_v1.md
 */

// ─── 시점 buckets 정의 (R2 합의) ───────────────────────────
const BUCKETS = [
    { name: 'midnight', hourStart: 0,  hourEnd: 5,  defaultTarget: 'today' },
    { name: 'morning',  hourStart: 5,  hourEnd: 12, defaultTarget: 'today' },
    { name: 'noon',     hourStart: 12, hourEnd: 17, defaultTarget: 'both' },
    { name: 'evening',  hourStart: 17, hourEnd: 24, defaultTarget: 'tomorrow' },
];

/**
 * 현재 시점(시간)으로 디폴트 결 결정.
 *
 * @param {number} [hour] 0~23. 미지정 시 현재 시각.
 * @returns {{ defaultTarget: 'today'|'tomorrow'|'both', bucket: string, hour: number }}
 */
export function getLoopStartHint(hour) {
    const h = (typeof hour === 'number') ? hour : new Date().getHours();
    const bucket = BUCKETS.find(b => h >= b.hourStart && h < b.hourEnd) || BUCKETS[0];
    return {
        defaultTarget: bucket.defaultTarget,
        bucket: bucket.name,
        hour: h,
    };
}

/**
 * 'today' / 'tomorrow' 결로 → 실제 날짜(YYYY-MM-DD) 변환.
 *
 * @param {'today'|'tomorrow'} target
 * @param {string} [baseDate] 'YYYY-MM-DD'. 미지정 시 오늘 로컬.
 * @returns {string}
 */
export function resolveTargetDate(target, baseDate) {
    const base = baseDate ? _parseLocalISO(baseDate) : new Date();
    if (target === 'tomorrow') {
        base.setDate(base.getDate() + 1);
    }
    return _formatLocalISO(base);
}

/**
 * 'YYYY-MM-DD' → Date (로컬 자정).
 */
function _parseLocalISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Date → 'YYYY-MM-DD' (로컬).
 */
function _formatLocalISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 현재 시각 → 'HH:MM' (로컬).
 *   묵상 도큐먼트 meditationTime 평문 메타 자리잡힐 값.
 */
export function currentLocalHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 현재 시각 → 시간표 timeSlot (15분 단위, 0~95).
 *   slot = hour * 4 + floor(minute / 15).
 *   ROW_HEIGHT 1 slot = 15분. timeline.js 같은 결.
 */
export function currentTimeSlot() {
    const d = new Date();
    return d.getHours() * 4 + Math.floor(d.getMinutes() / 15);
}

/**
 * 디폴트 묵상 도트 길이 (slot 단위). 1시간 = 4 slots.
 */
export const DEFAULT_MEDITATION_DURATION_SLOTS = 4;

// ─── 1회 안내 모달 (기존 사용자에게 새 결 알림) ─────────────
const INTRO_SEEN_KEY = 'sanctum.loopStartPoint.intro.v1.seen';

/**
 * 안내 1회 노출 여부.
 */
export function hasSeenLoopStartIntro() {
    try {
        return localStorage.getItem(INTRO_SEEN_KEY) === '1';
    } catch (_) {
        return true; // localStorage 차단 자리 = 안내 안 띄움 (안전)
    }
}

/**
 * 안내 본 표시.
 */
export function markLoopStartIntroSeen() {
    try {
        localStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch (_) { /* ignore */ }
}

/**
 * 안내 모달 자리잡기. 다음 묵상 끝 자리에서 1회만.
 *   사용자가 닫으면 markLoopStartIntroSeen 자동 호출.
 *
 * @returns {Promise<void>}
 */
export function showLoopStartIntroModal() {
    return new Promise(resolve => {
        if (hasSeenLoopStartIntro()) {
            resolve();
            return;
        }
        // 중복 자리 방지
        document.getElementById('loop-start-intro-modal')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'loop-start-intro-modal';
        overlay.className = 'lock-screen-overlay';
        overlay.innerHTML = `
            <div class="lock-screen-box" style="max-width: 440px;">
                <div class="lock-icon">🔄</div>
                <h2>계획 자리가 자리잡혔어요</h2>
                <p class="lock-subtitle" style="text-align:left; font-size:13px; line-height:1.65;">
                    이제 묵상 끝나면 <strong>지금부터 계획하기</strong> 자리가 자연 자리잡혀요.<br><br>
                    묵상한 시간에 맞춰 시스템이 <strong>[오늘]</strong>·<strong>[내일]</strong> 디폴트를 자기 결로 알아채고,
                    원하시면 한 번 톡으로 갈아끼울 수 있어요.
                </p>
                <div style="background:var(--bg-elev); border-radius:8px; padding:12px 14px; margin: 12px 0; text-align:left; font-size:12px; line-height:1.7; color:var(--text-secondary);">
                    🌅 새벽·아침 묵상 → 오늘 계획<br>
                    ☀️ 정오·오후 묵상 → 오늘 + 내일 둘 다<br>
                    🌇 저녁 묵상 → 내일 계획<br>
                    🌙 심야 묵상 → 오늘 계획
                </div>
                <p style="font-size:11px; color:var(--text-secondary); text-align:left; margin: 8px 0 16px;">
                    ※ 묵상한 시간도 시간표에 자동 자리잡혀요. 자기 리듬 자리잡혀가요.
                </p>
                <button id="loop-start-intro-close" class="primary-btn" style="width:100%;">알겠어요</button>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-visible'));

        const close = () => {
            markLoopStartIntroSeen();
            overlay.classList.remove('is-visible');
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 240);
        };
        overlay.querySelector('#loop-start-intro-close').onclick = close;
    });
}
