/**
 * personNameFormat.js — 인물 표시 이름 포맷 공용 헬퍼
 *
 * 정책 (2026-05-13 변경):
 *   - 본명(name)이 있으면 본명을 본문 이름으로. 별명은 작은 부속으로 옆에 표시.
 *     예: "박서연 (큰형)" — 사용자가 본명을 수정하면 화면에 그대로 반영.
 *   - 본명이 없으면 별명으로 fallback.
 *   - innerCircle 분기는 제거 — 마스킹/라벨링 정책은 AI 입력 단계(enrichStatsForLLM)
 *     에서 처리. 사용자 화면은 사용자가 적은 그대로.
 *
 * 변경 이력:
 *   - 2026-05-12: innerCircle만 본명 노출, 그 외는 별명 마스킹. → 본명 수정이
 *     화면에 반영 안 되어 사용자 혼란.
 *   - 2026-05-13: 본명 우선 정책으로 회귀.
 *
 * 사용 위치: 인물 칩, 멤버 리스트, 자동완성 패널, 그리드 카드 등 본문 표시 지점.
 * (입력값 비교·검색에는 본명/별명 모두 사용.)
 */

function pickNickname(p) {
    if (!p || !Array.isArray(p.nicknames)) return '';
    const nick = p.nicknames.find(n => (n || '').trim());
    return (nick || '').trim();
}

/**
 * 평문 표기 — 토스트·title 속성·tooltip 등 단순 텍스트가 필요한 곳.
 * 예: "박서연 (큰형)" / "박서연" / "큰형"
 */
export function personDisplayText(p) {
    if (!p) return '';
    const name = (p.name || '').trim();
    const nick = pickNickname(p);
    if (name && nick) return `${name} (${nick})`;
    return name || nick;
}

/**
 * HTML 표기 — 별명 부속은 작은 span으로 감쌈. CSS에서 .nick-mark로 톤 다운.
 *
 * @param {object} p — { name, nicknames }
 * @param {(s:string)=>string} escapeFn — HTML escape 함수 (필수)
 */
export function personDisplayHtml(p, escapeFn) {
    if (!p) return '';
    const name = (p.name || '').trim();
    const nick = pickNickname(p);
    const esc = escapeFn || ((s) => s);
    if (name && nick) return `${esc(name)} <span class="nick-mark">(${esc(nick)})</span>`;
    return esc(name || nick);
}
