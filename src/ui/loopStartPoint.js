/**
 * loopStartPoint.js — 묵상 시점에 따른 루프 시작점 결정 헬퍼 (시스템 내부 자리만)
 *
 * (2026-05-21 v120 다이어트) 사용자 명시 "시스템에서만 인식되면 되는거 아닐까".
 *   사용자 노출 결(토글 카드·안내 모달) 폐기. 시스템 내부 자리만 유지:
 *   - meditationTime 평문 저장 (HH:MM)
 *   - 자동 도트 timeSlot 자동 자리잡힘
 *   - getLoopStartHint 헬퍼 (학습 자리·미래 분기용)
 *
 * 4 buckets (R2 합의 — 학습 자리 결로 유지):
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

// (2026-05-21 v120 다이어트) 1회 안내 모달·INTRO_SEEN 플래그 통째 폐기.
//   사용자 명시 "시스템에서만 인식되면 되는거 아닐까" — 사용자 노출 자리 X.
