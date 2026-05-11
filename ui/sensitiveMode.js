/**
 * sensitiveMode.js — 민감 데이터 가리기 모드
 *
 * 설정 페이지의 토글(#sensitive-setting-toggle)로 켜고 끔.
 * 켜져 있으면 .sensitive 요소는 흐리게 가려지고, 클릭 시 5초만 노출.
 */

const STORAGE_KEY = 'sanctum-sensitive-mode';

function readSavedMasked() {
    // 과거 기본값: localStorage 미설정 시 masked=true. 호환 유지.
    return localStorage.getItem(STORAGE_KEY) !== 'false';
}

function applyMasked(masked) {
    document.body.classList.toggle('sensitive-masked', masked);
}

export function initSensitiveMode() {
    // 1) 저장값을 즉시 body에 반영 (토글 UI가 없어도 마스킹은 동작)
    const initialMasked = readSavedMasked();
    applyMasked(initialMasked);

    // 2) 설정 페이지의 토글에 연결 (잠금 해제 후 view-settings가 마운트된 뒤 호출됨)
    const input = document.getElementById('sensitive-setting-toggle');
    if (input) {
        input.checked = initialMasked;
        input.addEventListener('change', () => {
            const masked = input.checked;
            applyMasked(masked);
            localStorage.setItem(STORAGE_KEY, masked ? 'true' : 'false');
        });
    }

    // 3) 민감 요소 클릭 시 5초 해제
    document.body.addEventListener('click', (e) => {
        if (!document.body.classList.contains('sensitive-masked')) return;
        const sensitiveEl = e.target.closest('.sensitive');
        if (sensitiveEl) {
            sensitiveEl.classList.add('revealed');
            setTimeout(() => {
                sensitiveEl.classList.remove('revealed');
            }, 5000);
        }
    });
}
