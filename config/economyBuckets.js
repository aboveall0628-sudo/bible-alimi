/**
 * economyBuckets.js — 경제 모듈 bucket 임계값 + 카테고리 상수.
 *
 * "스타벅스 컵 사이즈" 비유:
 *   - 정확한 금액(exactAmount) 은 자물쇠 안에만 저장
 *   - 평문엔 bucket("소액"/"중액"/"고액"/"거액") 만 — 통계·검색용
 *
 * 한국 직장인 표준 임계값 (2026-05 결정):
 *   - 소액 < 1만원
 *   - 중액 1만 ~ 10만
 *   - 고액 10만 ~ 100만
 *   - 거액 > 100만
 *
 * 사용자 라이프스타일이 변하면 settings 에서 조정 가능 (별도 회차).
 * ⚠️ 임계값 변경 시 옛 거래의 amountBucket 라벨도 재계산 필요.
 */

export const AMOUNT_BUCKETS = [
    { id: 'small',  label: '소액', max: 10000,    icon: '🟢', desc: '1만원 미만' },
    { id: 'medium', label: '중액', max: 100000,   icon: '🟡', desc: '1만 ~ 10만' },
    { id: 'large',  label: '고액', max: 1000000,  icon: '🟠', desc: '10만 ~ 100만' },
    { id: 'huge',   label: '거액', max: Infinity, icon: '🔴', desc: '100만 이상' },
];

/**
 * 금액 → bucket id.
 * 음수도 절대값 기준.
 */
export function amountToBucket(amount) {
    const v = Math.abs(Number(amount) || 0);
    for (const b of AMOUNT_BUCKETS) {
        if (v < b.max) return b.id;
    }
    return 'huge';
}

/**
 * bucket id → 한국어 라벨.
 */
export function bucketLabel(bucketId) {
    return AMOUNT_BUCKETS.find(b => b.id === bucketId)?.label || bucketId;
}

/**
 * bucket id → 아이콘 (UI 표시용).
 */
export function bucketIcon(bucketId) {
    return AMOUNT_BUCKETS.find(b => b.id === bucketId)?.icon || '⚪';
}

// ─── 카테고리 (수입 / 지출) ─────────────────────────
// 각 카테고리는 사용자가 직접 추가/수정 가능하지만, 시작 시드 16종.
// 영적 안전장치: 'giving' (헌금·기부) 은 별도 강조 — 일반 expense 와 차등 시각 표시.

export const INCOME_CATEGORIES = [
    { id: 'salary',         label: '근로 소득',  icon: 'briefcase' },
    { id: 'business',       label: '사업 소득',  icon: 'store' },
    { id: 'interest',       label: '이자·배당',  icon: 'trending-up' },
    { id: 'gift-received',  label: '받은 선물',  icon: 'gift' },
    { id: 'other-income',   label: '기타 수입',  icon: 'circle-plus' },
];

export const EXPENSE_CATEGORIES = [
    { id: 'food',           label: '음식',       icon: 'utensils' },
    { id: 'transport',      label: '교통',       icon: 'car' },
    { id: 'housing',        label: '주거',       icon: 'home' },
    { id: 'utility',        label: '공과금',     icon: 'plug' },
    { id: 'telecom',        label: '통신',       icon: 'smartphone' },
    { id: 'subscription',   label: '구독',       icon: 'repeat' },
    { id: 'health',         label: '의료',       icon: 'heart-pulse' },
    { id: 'education',      label: '교육',       icon: 'book-open' },
    { id: 'clothing',       label: '의류',       icon: 'shirt' },
    { id: 'leisure',        label: '여가',       icon: 'sparkles' },
    { id: 'giving',         label: '헌금·기부',  icon: 'hand-heart',  isGiving: true },
    { id: 'tax',            label: '세금',       icon: 'receipt' },
    { id: 'insurance',      label: '보험',       icon: 'shield' },
    { id: 'fixed-cost',     label: '기타 고정비', icon: 'calendar-clock' },
    { id: 'other-expense',  label: '기타 지출',  icon: 'circle-minus' },
];

// expenseType — 지출의 성질 (고정 / 변동). 카테고리와는 별도 축.
// 같은 음식 거래도 매일의 식대(변동) vs 정기 구독(고정) 으로 구분 가능.
export const EXPENSE_TYPES = [
    { id: 'variable', label: '변동 지출' },
    { id: 'fixed',    label: '고정 지출' },
];

export function expenseTypeLabel(typeId) {
    return EXPENSE_TYPES.find(t => t.id === typeId)?.label || typeId;
}

/**
 * direction 별 카테고리 리스트.
 */
export function categoriesFor(direction) {
    return direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/**
 * category id → 라벨 (라벨 표시용).
 */
export function categoryLabel(catId) {
    return [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
        .find(c => c.id === catId)?.label || catId;
}

/**
 * category id → 헌금/기부 여부 (영적 강조 표시용).
 */
export function isGivingCategory(catId) {
    return EXPENSE_CATEGORIES.find(c => c.id === catId)?.isGiving === true;
}
