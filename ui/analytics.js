/**
 * analytics.js — GA4 트래킹 헬퍼 (2026-05-19 v82)
 *
 * Firebase Analytics 위에 얇은 래퍼.
 * 메모리 합의: project_ga4_event_design_track.md (2026-05-15 단원 1~4 통과)
 *
 * 🚫 영적 안전장치 — 절대 GA4로 안 보내는 자리:
 *   - 도트 본문·묵상 노트·기도 제목·간증 본문
 *   - 인물·조직 이름·관계 메모
 *   - 사용자 이메일·실명·전화번호·생일·주소
 *   - 비밀번호·24단어·DEK·암호화 키
 *   - 거래 금액·거래 메모
 *
 * ✅ GA4 OK 자리:
 *   - 가명 user_id (selfCard.gaAnonymousId)
 *   - 이벤트 이름·카운트·길이·시간 메타
 *   - 상위 enum 카테고리 (life·work·family·spiritual·rest)
 *   - 사용자 속성 enum 라벨
 *
 * 컨벤션:
 *   - snake_case + 동사 과거형 (예: meditation_saved, mission_clear)
 *   - 한 호출 = 한 사용자 행동
 */

import { getAnalyticsInstance, logEvent, setUserProperties, setUserId, auth } from '../data/firebase.js';
import { isSwanAdmin } from '../config/adminConfig.js';

// ─── 운영자 가드 (2026-05-19 v83) ───────────────────────────
//   Swan 본인이 직접 앱 사용·테스트하는 자리는 GA4에 안 보냄.
//   사용자 행동 데이터와 운영자 행동 분리. IP·기기·환경 무관 — UID 결로 식별.
function isAdminUser() {
    try {
        const currentUser = auth?.currentUser;
        if (!currentUser) return false;
        return isSwanAdmin(currentUser.uid);
    } catch (_) {
        return false;
    }
}

// ─── 영적 안전장치 — PII·민감정보 거부 키 카탈로그 ───────────────────
const FORBIDDEN_PARAM_KEYS = new Set([
    // PII
    'email', 'name', 'realName', 'phone', 'birthday', 'address',
    // 비밀번호·키
    'password', 'pin', 'dek', 'mnemonic', 'recoveryKey',
    // 본문·메모
    'content', 'text', 'note', 'notes', 'reason', 'memo',
    'prayer', 'meditation', 'testimony', 'decision', 'situation',
    'plannedTask', 'actualTask', 'description',
    // 금액
    'amount', 'exactAmount', 'principal', 'exactPrincipal',
    // 식별자
    'userId', 'personId', 'orgId',
]);

/**
 * 파라미터 안전성 검사 — 금지 키 제거 + 긴 문자열 잘림.
 * @returns {Object} 정제된 params
 */
function sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const safe = {};
    for (const [k, v] of Object.entries(params)) {
        if (FORBIDDEN_PARAM_KEYS.has(k)) {
            console.warn(`[analytics] forbidden param '${k}' filtered — 영적 안전장치`);
            continue;
        }
        // 문자열은 50자 잘림 (PII 보호 + GA4 권장)
        if (typeof v === 'string') {
            safe[k] = v.length > 50 ? v.slice(0, 50) : v;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
            safe[k] = v;
        } else if (v == null) {
            // null/undefined 무시
        } else {
            // 객체·배열은 길이만 보내기 (구조 노출 X)
            try {
                safe[k] = Array.isArray(v) ? `arr_${v.length}` : `obj`;
            } catch (_) { /* 무시 */ }
        }
    }
    return safe;
}

/**
 * 이벤트 호출.
 * @param {string} eventName  - snake_case + 동사 과거형
 * @param {Object} [params]    - 메타 (PII·본문 자동 필터됨)
 *
 * @example
 *   trackEvent('meditation_saved', { devotional_level: 'intermediate', length_chars: 280 });
 *   trackEvent('mission_clear', { mission_id: 'first_meditation' });
 */
export function trackEvent(eventName, params = {}) {
    if (isAdminUser()) return;  // 운영자 가드 — Swan 본인 행동은 GA4 안 보냄
    const analytics = getAnalyticsInstance();
    if (!analytics) return;  // 일부 환경 미지원 — 조용히 통과
    try {
        const safe = sanitizeParams(params);
        logEvent(analytics, eventName, safe);
    } catch (e) {
        // GA4 실패해도 앱 흐름 영향 X
        console.warn(`[analytics] trackEvent '${eventName}' failed:`, e?.message || e);
    }
}

/**
 * 사용자 속성 설정 — 가입 이후 모든 이벤트에 자동 동행.
 * 메모리 합의 4종: devotional_level, age_tone, beta_cohort, user_role.
 *
 * @param {Object} properties
 *
 * @example
 *   setUserProps({
 *       devotional_level: 'intermediate',
 *       age_tone: 'middle',
 *       beta_cohort: '2026_05_W3',
 *       user_role: 'family'
 *   });
 */
export function setUserProps(properties) {
    if (isAdminUser()) return;  // 운영자 가드
    const analytics = getAnalyticsInstance();
    if (!analytics) return;
    try {
        const safe = sanitizeParams(properties);
        setUserProperties(analytics, safe);
    } catch (e) {
        console.warn(`[analytics] setUserProps failed:`, e?.message || e);
    }
}

/**
 * 가명 사용자 ID 설정 — selfCard.gaAnonymousId 결로 자리잡힌 값 사용.
 * 절대 이메일·UID 원본 안 보냄.
 *
 * @param {string} anonymousId  - 가명 토큰 (예: 'anon_xy7k...')
 */
export function setAnonymousUserId(anonymousId) {
    if (isAdminUser()) return;  // 운영자 가드
    const analytics = getAnalyticsInstance();
    if (!analytics || !anonymousId) return;
    try {
        setUserId(analytics, String(anonymousId));
    } catch (e) {
        console.warn(`[analytics] setAnonymousUserId failed:`, e?.message || e);
    }
}

// ─── 전환 이벤트 카탈로그 — 메모리 합의 결 7 카테고리 ──────────────
// 핵심 전환 (⭐): onboarding_completed · mission_clear · meditation_saved
//   · feedback_submitted · system_completion_first (⭐⭐)
//
// 호출 자리는 ui/onboarding.js·ui/meditation.js·feedbacksRepo.js 등 자연 진입 자리에서.

export const EVENTS = {
    // Day 0 온보딩
    ONBOARDING_STARTED: 'onboarding_started',
    ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',  // params: { step_number }
    ONBOARDING_COMPLETED: 'onboarding_completed',  // ⭐ 전환

    // 묵상
    MEDITATION_STARTED: 'meditation_started',
    MEDITATION_SAVED: 'meditation_saved',  // ⭐ 전환
    PRAYER_SAVED: 'prayer_saved',

    // 도트 (한 결정 인과 체인)
    DOT_SAVED: 'dot_saved',
    PRINCIPLE_OPENED: 'principle_opened',
    DECISION_GATE_ENTERED: 'decision_gate_entered',
    PRECEDENT_SAVED: 'precedent_saved',

    // 튜토리얼 미션
    MISSION_CLEAR: 'mission_clear',  // ⭐ 전환 — params: { mission_id }
    MISSION_LOCKED_MODAL_OPENED: 'mission_locked_modal_opened',

    // 리포트
    REPORT_OPENED: 'report_opened',  // params: { report_type }
    REPORT_QNA_ANSWERED: 'report_qna_answered',

    // 인앱 피드백
    FEEDBACK_BUBBLE_OPENED: 'feedback_bubble_opened',
    FEEDBACK_SUBMITTED: 'feedback_submitted',  // ⭐ 전환

    // 졸업식 (⭐⭐ 최강 신호)
    SYSTEM_COMPLETION_FIRST: 'system_completion_first',
};
