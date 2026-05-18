/**
 * consentModal.js — 가입 직후 동의 모달 (2026-05-18 v81)
 *
 * 한국 개인정보보호법 정합:
 *  - 필수 4 동의 (약관·개인정보·민감정보·국외이전)
 *  - 별도 동의 (민감·국외) 시각 분리
 *  - 만 14세 이상 자격 확인 1 체크박스
 *  - 각 동의 옆 [전문보기] 자리 (privacy.html · terms.html 새 탭)
 *  - [전체 동의하기] 1 클릭으로 5 체크박스 일괄 체크
 *  - 동의 결과 Firestore consents 컬렉션에 기록
 *
 * 흐름:
 *   ui/app.js 가입 성공 → hasAnyConsent(userId) → 없으면 이 모달 노출
 *   → 5 모두 체크 + [동의하고 시작하기] → saveConsent → resolve({ agreed: true })
 *   → [동의 안 함] → resolve({ agreed: false }) — 호출자가 로그아웃 처리
 */

import { saveConsent } from '../data/consentsRepo.js';

const CURRENT_VERSION = 'v1.1';

// (2026-05-19) 중복 호출 방지 — 모달 1번에 1개만
let _modalOpen = false;

const CONSENT_ITEMS = [
    {
        key: 'agreeTerms',
        label: '서비스 이용약관',
        href: '/terms.html',
        group: 'general',
    },
    {
        key: 'agreePrivacy',
        label: '개인정보 수집·이용',
        href: '/privacy.html#s2',
        group: 'general',
    },
    {
        key: 'agreeSensitive',
        label: '민감정보 처리 (묵상·기도·적용 사항)',
        href: '/privacy.html#s4',
        group: 'separate',
    },
    {
        key: 'agreeOverseas',
        label: '개인정보 국외 이전 (Google · 미합중국)',
        href: '/privacy.html#s5',
        group: 'separate',
    },
    {
        key: 'agreeAge14',
        label: '만 14세 이상입니다',
        href: null,
        group: 'eligibility',
    },
];

/**
 * 동의 모달 노출. 사용자 결과 받을 때까지 Promise 대기.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @returns {Promise<{ agreed: boolean }>}
 */
export function showConsentModal({ userId }) {
    if (_modalOpen) {
        console.warn('[consentModal] 이미 열림 — 중복 호출 무시');
        return Promise.resolve({ agreed: false });
    }
    _modalOpen = true;
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'consent-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'consent-title');

        overlay.innerHTML = renderHtml();
        document.body.appendChild(overlay);
        document.documentElement.classList.add('consent-modal-open');

        const checkboxes = Array.from(overlay.querySelectorAll('input[data-consent-key]'));
        const allBtn = overlay.querySelector('#consent-all-btn');
        const agreeBtn = overlay.querySelector('#consent-agree-btn');
        const cancelBtn = overlay.querySelector('#consent-cancel-btn');

        function allChecked() {
            return checkboxes.every(cb => cb.checked);
        }
        function refreshState() {
            agreeBtn.disabled = !allChecked();
            allBtn.textContent = allChecked() ? '전체 해제' : '전체 동의하기';
        }
        function setAll(checked) {
            checkboxes.forEach(cb => { cb.checked = checked; });
            refreshState();
        }

        checkboxes.forEach(cb => cb.addEventListener('change', refreshState));

        allBtn.addEventListener('click', () => {
            setAll(!allChecked());
        });

        agreeBtn.addEventListener('click', async () => {
            if (!allChecked()) return;
            agreeBtn.disabled = true;
            agreeBtn.textContent = '저장 중…';
            const payload = {
                version: CURRENT_VERSION,
                userAgent: navigator.userAgent,
            };
            checkboxes.forEach(cb => {
                payload[cb.dataset.consentKey] = cb.checked;
            });
            try {
                await saveConsent(userId, payload);
            } catch (e) {
                // 저장 실패해도 동의 자체는 성립. 다음 라운드에 재시도.
                console.error('[consentModal] saveConsent failed:', e?.message || e);
            }
            close();
            resolve({ agreed: true });
        });

        cancelBtn.addEventListener('click', () => {
            close();
            resolve({ agreed: false });
        });

        function close() {
            overlay.remove();
            document.documentElement.classList.remove('consent-modal-open');
            _modalOpen = false;
        }
    });
}

function renderHtml() {
    const generalRows = CONSENT_ITEMS
        .filter(i => i.group === 'general')
        .map(renderRow).join('');
    const separateRows = CONSENT_ITEMS
        .filter(i => i.group === 'separate')
        .map(renderRow).join('');
    const eligibilityRows = CONSENT_ITEMS
        .filter(i => i.group === 'eligibility')
        .map(renderRow).join('');

    return `
        <div class="consent-modal">
            <header class="consent-header">
                <h2 id="consent-title">Sanctum OS 시작 전에 동의가 필요해요</h2>
                <p class="consent-subtitle">개인정보보호법에 따라 아래 항목에 동의해야 서비스를 이용할 수 있어요.</p>
            </header>

            <button type="button" id="consent-all-btn" class="consent-all-btn">전체 동의하기</button>

            <div class="consent-list">
                <div class="consent-group consent-group-general">
                    <h3 class="consent-group-title">필수 동의</h3>
                    ${generalRows}
                </div>

                <div class="consent-group consent-group-separate">
                    <h3 class="consent-group-title">별도 동의 항목</h3>
                    <p class="consent-group-hint">민감정보와 국외이전은 법적으로 별도 동의가 필요해요.</p>
                    ${separateRows}
                </div>

                <div class="consent-group consent-group-eligibility">
                    <h3 class="consent-group-title">가입 자격 확인</h3>
                    ${eligibilityRows}
                </div>
            </div>

            <div class="consent-footer">
                <button type="button" id="consent-agree-btn" class="consent-agree-btn" disabled>동의하고 시작하기</button>
                <button type="button" id="consent-cancel-btn" class="consent-cancel-btn">동의 안 함 (서비스 이용 불가)</button>
            </div>
        </div>
    `;
}

function renderRow(item) {
    const viewLink = item.href
        ? `<a href="${item.href}" target="_blank" rel="noopener" class="consent-view-link">전문보기</a>`
        : '';
    return `
        <label class="consent-row">
            <input type="checkbox" data-consent-key="${item.key}">
            <span class="consent-checkmark"></span>
            <span class="consent-label">
                <span class="consent-required">[필수]</span>
                <span class="consent-text">${escapeHtml(item.label)}</span>
            </span>
            ${viewLink}
        </label>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}
