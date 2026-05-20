/**
 * featureFlags.js — 사용자 tier 분기 (베타 슬림 모드)
 *
 * (베타 슬림 v1, 2026-05-18)
 *
 * 합의:
 *   - 사업기획서 §4.2 — 베타 슬림 = "1층 6개 방만" / 메인 앱 = 1+2+3층 전체.
 *   - Freemium 정책 §5.1 — 슬림 = 무료 / 메인 = 월 6,900원 (정식 출시 후).
 *   - 1차 베타 14명은 'beta_unlimited' — 슬림 메뉴만 보이지만 데이터는 그대로 누적.
 *   - 사용자가 직접 토글 가능 (설정 카드).
 *   - URL `?tier=slim` 으로 진입하면 자동 슬림.
 *
 * 구현:
 *   - <html data-tier="slim"> + style.css 의 [data-slim="hidden"] 분기.
 *   - localStorage `sanctum.tier.v1` 영구 저장.
 *   - 디폴트 = 'full' (현재 모든 메뉴 노출 그대로).
 *
 * accentColor.js / systemFont.js 와 같은 결.
 */

const KEY = 'sanctum.tier.v1';

export const TIERS = {
    full: {
        label: '전체 (메인 앱)',
        desc: '모든 모듈이 보여요. 도트·인물·가계부·의사결정·공동체까지.',
    },
    slim: {
        label: '베타 슬림',
        desc: '6 화면 루프만 보여요. 말씀 → 묵상 → 다짐 → 시간표 → 했/안함 → 주간 거울.',
    },
};

const DEFAULT_TIER = 'full';

/**
 * 저장된 tier (없으면 'full').
 */
export function getTier() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw && TIERS[raw]) return raw;
    } catch (_) {}
    return DEFAULT_TIER;
}

/**
 * tier 자리잡기 + 즉시 <html data-tier> 적용.
 */
export function setTier(value) {
    if (!TIERS[value]) return;
    try { localStorage.setItem(KEY, value); } catch (_) {}
    applyTierToHtml(value);
}

/**
 * 부팅 시 호출 — localStorage 의 값으로 <html data-tier> 적용.
 */
export function applyTierFromStorage() {
    const value = getTier();
    applyTierToHtml(value);
}

/**
 * URL `?tier=slim` 또는 `?tier=full` 인식 → localStorage 저장 후 적용.
 * 사용자가 링크 클릭만으로 슬림 진입 가능.
 * 반환값: 변경되었으면 true.
 */
export function applyTierFromURL() {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('tier');
        if (fromUrl && TIERS[fromUrl]) {
            setTier(fromUrl);
            // URL 깨끗하게 정리 — history.replaceState 로 ?tier= 제거.
            params.delete('tier');
            const qs = params.toString();
            const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
            window.history.replaceState({}, '', newUrl);
            return true;
        }
    } catch (_) {}
    return false;
}

/**
 * 현재 슬림 모드인가?
 */
export function isSlimMode() {
    return getTier() === 'slim';
}

/**
 * (2026-05-20 v100) 일반 유저 = 강제 슬림. 운영자만 자유 자리.
 *   사용자 명시 "일반 유저들은 베타버전 화면만 보여야 해. 모든 일반 유저는 베타버전만".
 *   로그인 끝나고 currentUserId 자리잡힌 직후 호출.
 *
 * @param {boolean} isAdmin - isSwanAdmin(uid) 결과
 */
export function enforceTierForUser(isAdmin) {
    if (isAdmin) {
        // 운영자 — localStorage 자리 그대로 (full/slim 자유 자리잡힘)
        applyTierFromStorage();
        return;
    }
    // 일반 유저 — 강제 slim. localStorage 값 무시.
    //   설정에서 토글 안 보임 (settings.js tierCard 는 이미 isSwanAdmin 가드 자리).
    applyTierToHtml('slim');
}

/**
 * 내부 — <html data-tier="..."> 토글.
 *   디폴트 'full' 일 때는 속성 제거(현재 모든 메뉴 자연 노출).
 *   'slim' 일 때만 data-tier 자리잡힘.
 */
function applyTierToHtml(value) {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (value === 'full' || !TIERS[value]) {
        html.removeAttribute('data-tier');
    } else {
        html.setAttribute('data-tier', value);
    }
}
