/**
 * dotCategories.js — 도트의 '활동 카테고리' 축
 *
 * 정책 (2026-05-12):
 *   - 도트는 category 1개를 가질 수 있다 (선택, null 허용)
 *   - 프리셋 10개 + 사용자가 자유롭게 추가 가능
 *   - 사용자 정의 카테고리는 localStorage에 저장 (개인 도구 한정 단순화)
 *   - 분석 시 '시간을 어디에 썼는지'의 큰 분류로 사용
 *
 * 라벨(labelIds)과 차이:
 *   - labelIds = "이 시간의 감정·태도" 축 (성장/회복/헛헛/…)
 *   - category = "이 시간이 어떤 일이었나" 축 (운동/업무/가족/…)
 */

const STORAGE_KEY_USER = 'sanctum-dot-categories-user';
const STORAGE_KEY_RECENT = 'sanctum-dot-categories-recent';

export const PRESET_CATEGORIES = [
    { id: 'work',     label: '업무',   icon: '💼' },
    { id: 'study',    label: '학습',   icon: '📚' },
    { id: 'workout',  label: '운동',   icon: '🏃' },
    { id: 'family',   label: '가족',   icon: '🏠' },
    { id: 'friend',   label: '관계',   icon: '☕' },
    { id: 'faith',    label: '신앙',   icon: '🙏' },
    { id: 'rest',     label: '휴식',   icon: '🛋️' },
    { id: 'meal',     label: '식사',   icon: '🍚' },
    { id: 'move',     label: '이동',   icon: '🚇' },
    { id: 'chore',    label: '집안일', icon: '🧺' },
];

function loadUserCategories() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_USER);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}

function saveUserCategories(list) {
    try { localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(list)); }
    catch { /* private mode, ignore */ }
}

/**
 * 모든 카테고리 (프리셋 + 사용자 정의) — UI 표시용
 */
export function getAllCategories() {
    const user = loadUserCategories();
    return [...PRESET_CATEGORIES, ...user];
}

/**
 * 카테고리 id로 메타 찾기 (icon·label 표시용)
 */
export function findCategory(id) {
    if (!id) return null;
    return getAllCategories().find(c => c.id === id) || null;
}

/**
 * 사용자가 새 카테고리 추가. 라벨로 id를 자동 생성 (영문 + timestamp).
 * @returns 추가된 카테고리 객체
 */
export function addUserCategory(label) {
    const trimmed = (label || '').trim();
    if (!trimmed) return null;
    const list = loadUserCategories();
    // 같은 라벨이 이미 있으면 그것 반환 (프리셋 포함)
    const existing = getAllCategories().find(c => c.label === trimmed);
    if (existing) return existing;
    const newCat = {
        id: `user_${Date.now().toString(36)}`,
        label: trimmed,
        icon: '🏷️',
        custom: true,
    };
    list.push(newCat);
    saveUserCategories(list);
    return newCat;
}

/**
 * 사용자 정의 카테고리 삭제 (프리셋은 삭제 불가)
 */
export function removeUserCategory(id) {
    if (!id) return false;
    const list = loadUserCategories().filter(c => c.id !== id);
    saveUserCategories(list);
    return true;
}

/**
 * 최근 고른 카테고리 id 목록 — 도트 평가 모달에서 자주 쓰는 것 위로.
 */
export function getRecentCategories(limit = 4) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_RECENT);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.slice(0, limit) : [];
    } catch { return []; }
}

export function pushRecentCategory(id) {
    if (!id) return;
    try {
        const current = getRecentCategories(10).filter(x => x !== id);
        current.unshift(id);
        localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(current.slice(0, 10)));
    } catch { /* ignore */ }
}
