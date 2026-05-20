/**
 * noteFont.js — 묵상·기도 노트 폰트 사용자 선택 (디자인 시스템 v1 후속)
 *
 * (2026-05-20 v93)
 *
 * 합의:
 *   - 사용자 명시 *"사용자가 폰트 선택하게 해주든지"*. 본문 fix(v92 Pretendard 디폴트) 후 자유 선택 자리 추가.
 *   - 3 옵션: pretendard (sans, 디폴트) · serif (Noto Serif KR — v62 디자인 시스템 v1 톤) · system (OS 기본).
 *   - 구현: <html data-note-font="..."> + style.css 의 [data-note-font] 안 분기.
 *   - 디폴트 = "pretendard" (v92 합의).
 *
 * 사용처:
 *   - 부팅 시 (app.js 초기) — applyNoteFontFromStorage()
 *   - 설정 화면 카드 — setNoteFont(value) 호출.
 *
 * accentColor.js 와 같은 결로 정합.
 */

const KEY = 'sanctum.noteFont.v1';

export const NOTE_FONTS = {
    pretendard: { label: '프리텐다드', desc: '읽기 편한 산세리프. OS 기본 폰트.' },
    serif:      { label: '노토 세리프', desc: '묵상 결 깊어지는 영적 톤.' },
};

const DEFAULT = 'pretendard';

/**
 * 저장된 노트 폰트 (없으면 'pretendard').
 */
export function getNoteFont() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw && NOTE_FONTS[raw]) return raw;
    } catch (_) {}
    return DEFAULT;
}

/**
 * 노트 폰트 자리잡기 + 즉시 <html data-note-font> 적용.
 */
export function setNoteFont(value) {
    if (!NOTE_FONTS[value]) return;
    try { localStorage.setItem(KEY, value); } catch (_) {}
    applyNoteFontToHtml(value);
}

/**
 * 부팅 시 호출 — localStorage 의 값으로 <html data-note-font> 적용.
 */
export function applyNoteFontFromStorage() {
    const value = getNoteFont();
    applyNoteFontToHtml(value);
}

/**
 * 내부 — <html data-note-font="..."> 토글.
 *   디폴트 'pretendard' 일 때는 속성 제거(자연 :root 사용).
 *   serif · system 만 data-note-font 자리잡힘.
 */
function applyNoteFontToHtml(value) {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (value === 'pretendard' || !NOTE_FONTS[value]) {
        html.removeAttribute('data-note-font');
    } else {
        html.setAttribute('data-note-font', value);
    }
}
