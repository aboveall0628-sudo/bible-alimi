import { openModal } from './modalManager.js';

/**
 * 모바일/데스크톱 대응 추천 링크 공유 유틸리티
 * @param {Object} params
 * @param {string} params.title - 공유 제목
 * @param {string} params.text - 공유 본문 설명
 * @param {string} params.url - 공유 링크 URL
 */
export async function showShareSheet({ title, text, url }) {
    // 1. 모바일 브라우저의 네이티브 공유 API 호출 시도
    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
            return;
        } catch (e) {
            // 사용자가 의도적으로 취소한 경우(AbortError)는 그냥 리턴
            if (e.name !== 'AbortError') {
                console.warn('[shareSheet] navigator.share failed, fallback to modal:', e);
            } else {
                return;
            }
        }
    }

    // 2. 데스크톱 및 navigator.share 미지원 시 커스텀 프리미엄 공유 모달 팝업
    let overlay = document.getElementById('share-sheet-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'share-sheet-overlay';
        overlay.className = 'share-sheet-overlay hidden';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="share-sheet-modal" role="dialog" aria-modal="true" tabindex="-1">
            <div class="share-sheet-header">
                <h3>추천 링크 공유하기</h3>
                <button type="button" class="share-sheet-close" aria-label="닫기">
                    <span class="share-sheet-close-icon">✕</span>
                </button>
            </div>
            <p class="share-sheet-desc">사랑하는 형제·자매에게 Sanctum OS를 소개해 보세요.</p>
            
            <div class="share-sheet-grid">
                <button type="button" class="share-sheet-btn share-btn-copy" aria-label="링크 복사">
                    <div class="share-icon-wrap bg-gradient-blue">
                        <span class="share-icon">⧉</span>
                    </div>
                    <span class="share-label">링크 복사</span>
                </button>
                <a href="https://sharer.kakao.com/schemes/share/web/share?url=${encodeURIComponent(url)}" target="_blank" rel="noopener" class="share-sheet-btn share-btn-kakao" aria-label="카카오톡 공유">
                    <div class="share-icon-wrap bg-gradient-yellow">
                        <span class="share-icon">💬</span>
                    </div>
                    <span class="share-label">카카오톡</span>
                </a>
                <a href="sms:?body=${encodeURIComponent(text + '\n' + url)}" class="share-sheet-btn share-btn-sms" aria-label="메시지 공유">
                    <div class="share-icon-wrap bg-gradient-green">
                        <span class="share-icon">✉</span>
                    </div>
                    <span class="share-label">문자 메시지</span>
                </a>
                <a href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n' + url)}" class="share-sheet-btn share-btn-email" aria-label="이메일 공유">
                    <div class="share-icon-wrap bg-gradient-purple">
                        <span class="share-icon">📧</span>
                    </div>
                    <span class="share-label">이메일</span>
                </a>
            </div>

            <div class="share-sheet-url-bar">
                <input type="text" class="share-url-input" value="${url}" readonly tabindex="-1">
                <button type="button" class="share-url-copy-btn">복사</button>
            </div>
        </div>
    `;

    const closeBtn = overlay.querySelector('.share-sheet-close');
    const copyBtn = overlay.querySelector('.share-btn-copy');
    const urlCopyBtn = overlay.querySelector('.share-url-copy-btn');
    const urlInput = overlay.querySelector('.share-url-input');

    const handle = openModal({
        overlay,
        closeOnBackdrop: true,
        label: 'share-sheet',
        onClose: () => {
            overlay.remove(); // 닫힐 때 동적 오버레이 요소를 DOM에서 완전히 제거
        }
    });

    closeBtn.addEventListener('click', () => handle.close());

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(url);
            
            // 그리드 복사 버튼 피드백
            const labelEl = copyBtn.querySelector('.share-label');
            const originalText = labelEl.textContent;
            labelEl.textContent = '복사 완료! ✨';
            copyBtn.classList.add('copied');
            
            // 하단 입력창 복사 버튼 피드백
            urlCopyBtn.textContent = '복사됨';
            urlCopyBtn.classList.add('copied');

            setTimeout(() => {
                labelEl.textContent = originalText;
                copyBtn.classList.remove('copied');
                urlCopyBtn.textContent = '복사';
                urlCopyBtn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('[shareSheet] clipboard copy failed:', err);
        }
    }

    copyBtn.addEventListener('click', handleCopy);
    urlCopyBtn.addEventListener('click', handleCopy);
    
    urlInput.addEventListener('click', () => {
        urlInput.select();
    });
}
