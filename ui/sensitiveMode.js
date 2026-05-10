/**
 * sensitiveMode.js — 👁 민감 모드 토글
 *
 * 활성화 시 모든 이름/금액을 ●●●● 마스킹.
 * CSS 클래스 'sensitive-masked'를 body에 토글.
 */

let _sensitiveMode = false;

export function initSensitiveMode() {
    const btn = document.getElementById('sensitive-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
        _sensitiveMode = !_sensitiveMode;
        document.body.classList.toggle('sensitive-masked', _sensitiveMode);
        btn.textContent = _sensitiveMode ? '👁‍🗨' : '👁';
        btn.title = _sensitiveMode ? '민감 정보 표시' : '민감 정보 숨기기';
    });
}

export function isSensitiveMode() {
    return _sensitiveMode;
}
