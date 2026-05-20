/**
 * aiEnabled.js — AI 기능 마스터 토글 (2026-05-18 v81)
 *
 * 한국 개인정보보호법 제37조의2 (자동화된 결정에 관한 권리) 정합.
 * 사용자가 모든 AI 보조 기능을 한 클릭으로 비활성화할 수 있는 자리.
 *
 * AI 자리 4종 통합 게이트:
 *  - SWAN 채팅
 *  - 주간 회고 보고서
 *  - 일정 평가 추천
 *  - 자동 분류
 *
 * 저장 자리: localStorage('sanctum.aiEnabled.v1') — 기기 단위.
 * 디폴트: true (ON) — AI 기능 사용 권유가 본 서비스 흐름의 자연 결.
 *
 * 호출 자리: ui/aiClient.js 안 모든 AI 함수 진입 자리에서 isAIEnabled() 체크.
 */

const KEY = 'sanctum.aiEnabled.v1';

/**
 * AI 기능 활성 여부 조회.
 * @returns {boolean} - true 면 AI 호출 가능, false 면 차단
 */
export function isAIEnabled() {
    try {
        const v = localStorage.getItem(KEY);
        if (v === null) return true;  // 디폴트 ON
        return v === 'true';
    } catch (_) {
        return true;  // localStorage 접근 실패 시 안전 결 ON
    }
}

/**
 * AI 기능 활성 토글.
 * @param {boolean} enabled
 */
export function setAIEnabled(enabled) {
    try {
        localStorage.setItem(KEY, enabled ? 'true' : 'false');
        // 다른 탭에도 즉시 반영되도록 storage 이벤트 자연 흐름 활용.
        // 같은 탭 안 다른 모듈에 알림 — 커스텀 이벤트.
        document.dispatchEvent(new CustomEvent('sanctum:ai-enabled-changed', {
            detail: { enabled }
        }));
    } catch (e) {
        console.warn('[aiEnabled] setAIEnabled failed:', e?.message || e);
    }
}

/**
 * AI 호출 차단 시 사용자에게 안내할 자리 — 공통 메시지.
 */
export const AI_DISABLED_MESSAGE = '설정에서 AI 기능을 끄셨어요. 다시 켜시면 이용할 수 있어요.';
