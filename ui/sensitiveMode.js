/**
 * sensitiveMode.js — 민감 데이터 가리기 모드
 */

export function initSensitiveMode() {
    const toggleBtn = document.getElementById('sensitive-toggle-btn');
    if (!toggleBtn) return;

    // 초기 상태 로드
    const isMasked = localStorage.getItem('sanctum-sensitive-mode') !== 'false';
    if (isMasked) {
        document.body.classList.add('sensitive-masked');
        toggleBtn.classList.add('active');
        toggleBtn.textContent = '👁️';
    } else {
        toggleBtn.textContent = '🙈';
    }

    toggleBtn.addEventListener('click', () => {
        const masked = document.body.classList.toggle('sensitive-masked');
        localStorage.setItem('sanctum-sensitive-mode', masked);
        toggleBtn.classList.toggle('active', masked);
        toggleBtn.textContent = masked ? '👁️' : '🙈';
    });

    // 민감 요소 클릭 시 5초 해제
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
