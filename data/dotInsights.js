/**
 * dotInsights.js — 도트 리스트에서 "어떤 일을 많이 했나"를 뽑는 작은 유틸
 *
 * 두 가지 시각으로 보여줌:
 *   1) computeTopTasks  — actualTask(자유 텍스트) 기준, 시간(분)이 많은 순으로 정렬
 *   2) computeTopLabels — labelIds(도트 평가 시 고른 라벨 칩) 빈도 순
 *
 * 둘은 보완 관계: actualTask는 "내가 실제로 적은 일"의 직관적 모습,
 * labelIds는 "내가 의식적으로 분류한 카테고리"의 시선.
 */

const SLOT_MINUTES = 15;

function normalizeTask(s) {
    return (s || '').trim();
}

/**
 * 시간을 많이 쓴 일 TOP N. actualTask 기준.
 *
 * 빈 값/'(이름 없는 시간)'은 제외. 정확 일치로 묶음 (1차 버전).
 * @param {Array} dots
 * @param {number} limit 기본 3
 * @returns Array<{task, minutes, count}>
 */
export function computeTopTasks(dots, limit = 3) {
    const bucket = new Map();
    (dots || []).forEach(d => {
        const t = normalizeTask(d.actualTask);
        if (!t) return;
        const minutes = (d.durationSlots || 1) * SLOT_MINUTES;
        const cur = bucket.get(t) || { task: t, minutes: 0, count: 0 };
        cur.minutes += minutes;
        cur.count += 1;
        bucket.set(t, cur);
    });
    return [...bucket.values()]
        .sort((a, b) => b.minutes - a.minutes || b.count - a.count)
        .slice(0, limit);
}

/**
 * 자주 고른 라벨 TOP N. labelIds 빈도.
 * @returns Array<{label, count}>
 */
export function computeTopLabels(dots, limit = 3) {
    const bucket = new Map();
    (dots || []).forEach(d => {
        const labels = Array.isArray(d.labelIds) ? d.labelIds : [];
        labels.forEach(l => {
            const key = (l || '').trim();
            if (!key) return;
            bucket.set(key, (bucket.get(key) || 0) + 1);
        });
    });
    return [...bucket.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * 카테고리(category) 기준 시간 합계 TOP N.
 * @returns Array<{categoryId, minutes, count}>
 */
export function computeTopCategories(dots, limit = 3) {
    const bucket = new Map();
    (dots || []).forEach(d => {
        const cat = d.category;
        if (!cat) return;
        const minutes = (d.durationSlots || 1) * SLOT_MINUTES;
        const cur = bucket.get(cat) || { categoryId: cat, minutes: 0, count: 0 };
        cur.minutes += minutes;
        cur.count += 1;
        bucket.set(cat, cur);
    });
    return [...bucket.values()]
        .sort((a, b) => b.minutes - a.minutes || b.count - a.count)
        .slice(0, limit);
}

/**
 * minutes → "1시간 30분" / "45분" 짧은 표기
 */
export function formatMinutesShort(minutes) {
    if (!minutes || minutes <= 0) return '0분';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
}
