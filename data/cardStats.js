/**
 * cardStats.js — 인물·조직 카드의 "함께한 흔적" 통계
 *
 * 원칙 (memory/project_person_card_policy.md):
 *   - 자동 조정 X — 점수 슬라이더는 사용자만 변경
 *   - 두 면 나란히 — "내가 본 사람" + "함께한 흔적"
 *   - 차이는 묵상 재료로만 표시 ("주의" 톤 금지)
 *
 * 입력: dot 배열 (getAllDots 결과)
 * 출력: 인물/조직 id → 통계 객체
 *
 * 통계 항목:
 *   meetingCount       총 만남 횟수 (그 사람/조직이 linkedXxxIds에 포함된 도트 수)
 *   ratedCount         그중 만족도 점수가 매겨진 도트 수 (0/미평가 제외)
 *   avgRating          평균 만족도 (1.0~5.0, ratedCount===0이면 null)
 *   totalMinutes       함께한 시간 (분, 각 도트의 durationSlots*15)
 *   recent4wAvg        최근 28일 평균 만족도 (null if 표본 없음)
 *   prev4wAvg          그 이전 28일 평균 만족도 (null if 표본 없음)
 *   trend              'up' | 'down' | 'flat' | null  (recent vs prev 비교, |차이|>=0.5만 방향 부여)
 *   recentDots         최근 3개 도트 (id, date, timeSlot, actualTask, rating)
 */

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * 모든 인물에 대해 통계를 한 번에 계산.
 * @param {Object[]} dots - getAllDots 결과
 * @returns {Map<string, Object>}  personId → stats
 */
export function computeAllPersonStats(dots) {
    return computeAllStats(dots, 'linkedPersonIds', 'personRatings');
}

/**
 * 모든 조직에 대해 통계를 한 번에 계산.
 */
export function computeAllOrgStats(dots) {
    return computeAllStats(dots, 'linkedOrgIds', 'orgRatings');
}

/**
 * 단일 인물/조직 통계 (그리드는 batch, 모달은 개별로 가능).
 */
export function computePersonStats(dots, personId) {
    return computeAllPersonStats(dots).get(personId) || emptyStats();
}
export function computeOrgStats(dots, orgId) {
    return computeAllOrgStats(dots).get(orgId) || emptyStats();
}

// ─── 내부 ───────────────────────────────────────────────

function emptyStats() {
    return {
        meetingCount: 0,
        ratedCount: 0,
        avgRating: null,
        totalMinutes: 0,
        recent4wAvg: null,
        prev4wAvg: null,
        trend: null,
        recentDots: [],
    };
}

function computeAllStats(dots, linkKey, ratingKey) {
    const map = new Map();
    const now = Date.now();
    const recentCut = now - FOUR_WEEKS_MS;
    const prevCut   = now - 2 * FOUR_WEEKS_MS;

    for (const dot of dots) {
        const ids = dot[linkKey];
        if (!Array.isArray(ids) || ids.length === 0) continue;
        const dur = dot.durationSlots || 1;
        const minutes = dur * 15;
        const ratings = (dot[ratingKey] && typeof dot[ratingKey] === 'object') ? dot[ratingKey] : {};
        const dateMs = dateToMs(dot.date);

        for (const id of ids) {
            if (!map.has(id)) map.set(id, freshAccumulator());
            const acc = map.get(id);
            acc.meetingCount++;
            acc.totalMinutes += minutes;

            const r = ratings[id];
            if (typeof r === 'number' && r >= 1 && r <= 5) {
                acc.ratingSum += r;
                acc.ratedCount++;
                if (dateMs != null) {
                    if (dateMs >= recentCut) {
                        acc.recentSum += r;
                        acc.recentCount++;
                    } else if (dateMs >= prevCut) {
                        acc.prevSum += r;
                        acc.prevCount++;
                    }
                }
            }

            acc.recentDots.push({
                id: dot.id,
                date: dot.date,
                timeSlot: dot.timeSlot,
                actualTask: dot.actualTask || dot.plannedTask || '',
                rating: typeof r === 'number' ? r : 0,
            });
        }
    }

    // 누적기 → 최종 stats
    const out = new Map();
    for (const [id, acc] of map.entries()) {
        const avgRating  = acc.ratedCount  > 0 ? +(acc.ratingSum / acc.ratedCount).toFixed(2) : null;
        const recent4w   = acc.recentCount > 0 ? +(acc.recentSum / acc.recentCount).toFixed(2) : null;
        const prev4w     = acc.prevCount   > 0 ? +(acc.prevSum   / acc.prevCount).toFixed(2)   : null;
        let trend = null;
        if (recent4w != null && prev4w != null) {
            const diff = recent4w - prev4w;
            if (diff >= 0.5) trend = 'up';
            else if (diff <= -0.5) trend = 'down';
            else trend = 'flat';
        }
        // 최근 도트 3개 — date+timeSlot 역순
        const recentDots = acc.recentDots
            .sort((a, b) => {
                const dc = (b.date || '').localeCompare(a.date || '');
                if (dc) return dc;
                return (b.timeSlot ?? 0) - (a.timeSlot ?? 0);
            })
            .slice(0, 3);

        out.set(id, {
            meetingCount: acc.meetingCount,
            ratedCount: acc.ratedCount,
            avgRating,
            totalMinutes: acc.totalMinutes,
            recent4wAvg: recent4w,
            prev4wAvg: prev4w,
            trend,
            recentDots,
        });
    }
    return out;
}

function freshAccumulator() {
    return {
        meetingCount: 0,
        ratedCount: 0,
        ratingSum: 0,
        totalMinutes: 0,
        recentSum: 0, recentCount: 0,
        prevSum: 0,   prevCount: 0,
        recentDots: [],
    };
}

function dateToMs(dateStr) {
    if (!dateStr) return null;
    // "YYYY-MM-DD" → 로컬 자정 ms (UTC 보정 불필요 — 우리는 일자만 비교)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

// ─── 포맷 헬퍼 (UI에서 그대로 사용) ──────────────────

export function formatMinutes(min) {
    if (!min || min < 1) return '0분';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
}

export function formatTrend(trend) {
    if (trend === 'up')   return '↑';
    if (trend === 'down') return '↓';
    if (trend === 'flat') return '↔';
    return '';
}

export function slotToTimeStr(slot) {
    if (slot == null) return '';
    const h = Math.floor(slot / 4);
    const m = (slot % 4) * 15;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 5도트(●●●○○ 형태) HTML — UI 어디서든 재사용.
 * value: 0~5 (null/undefined도 0으로 처리)
 */
export function ratingDotsHtml(value) {
    const v = Math.max(0, Math.min(5, Math.round(value || 0)));
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `<span class="rating-dot${i <= v ? ' filled' : ''}"></span>`;
    }
    return `<span class="rating-dots" aria-label="${v}점">${html}</span>`;
}
