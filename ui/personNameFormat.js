/**
 * personNameFormat.js — 인물 표시 이름 포맷 공용 헬퍼
 *
 * 정책 (2026-05-12 합의):
 *   - 친한 사람(innerCircle === true) → 본명 그대로
 *   - 그 외(innerCircle 아님 + 별명 있음) → 별명을 본문 이름으로 쓰되,
 *     "(별명)" 마크를 작게 붙여 본명이 아닌 별명임을 시각적으로 알림
 *   - 별명 자체가 없으면 본명 fallback
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
 * 예: "큰형 (별명)" / "박서연"
 */
export function personDisplayText(p) {
    if (!p) return '';
    const name = (p.name || '').trim();
    const nick = pickNickname(p);
    if (p.innerCircle) return name || nick;
    if (!nick) return name;
    return `${nick} (별명)`;
}

/**
 * HTML 표기 — "(별명)" 부분을 작은 span으로 감쌈. CSS에서 .nick-mark로 톤 다운.
 * 사용처에서 반드시 사용자 입력(name·nicknames)을 미리 escape해서 안전한 값을
 * 넘기거나, 또는 escapeFn을 같이 호출해야 한다.
 *
 * @param {object} p — { name, nicknames, innerCircle }
 * @param {(s:string)=>string} escapeFn — HTML escape 함수 (필수)
 */
export function personDisplayHtml(p, escapeFn) {
    if (!p) return '';
    const name = (p.name || '').trim();
    const nick = pickNickname(p);
    const esc = escapeFn || ((s) => s);
    if (p.innerCircle) return esc(name || nick);
    if (!nick) return esc(name);
    return `${esc(nick)} <span class="nick-mark">(별명)</span>`;
}
