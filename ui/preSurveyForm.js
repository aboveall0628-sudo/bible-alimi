/**
 * preSurveyForm.js — 사전 설문 풀스크린 카드 폼 (1차 베타 검증)
 *
 * 시안 단계 (2026-05-18): Q1 카드 1장만 — 풀스크린 결 확인용.
 *   확인 후 Phase 1 = 12 카드 전체, Phase 2 = AI 가공,
 *   Phase 3 = 베타 코호트 자동 트리거, Phase 4 = 관리자 다운로드 + v1 폐기.
 *
 * 합의 사항 (사용자, 2026-05-18):
 *   - 풀스크린 카드 (온보딩·마침 카드 결)
 *   - 진행 바 상단 "1 / 12"
 *   - 자유 텍스트 위·객관식 칩 아래 (선입견 약화)
 *   - Q3·Q6·Q9-B 3 자리만 자유 텍스트 필수 — Q1은 (선택)
 *   - [닫기·멈추기] X (베타 진입 시) — 시안 단계엔 임시 [닫기] 자리
 *   - AI 가공은 Phase 2 — 시안은 정적 카피
 */

import { showToast } from './quickReview.js';

const Q1_CHIPS = [
    '가족·관계 회복',
    '직장·진로 분별',
    '말씀 더 깊이 알고 싶음',
    '기도·묵상 습관 들이기',
    '끊고 싶은 죄·습관',
    '봉사·사역 자리',
    '영적 정체기 회복',
    '자녀·신앙 교육',
    '공동체·관계 안 신앙 깊어지기',
];

let _overlayEl = null;

export function openPreSurveyForm() {
    if (_overlayEl) return;

    const overlay = document.createElement('div');
    overlay.className = 'presurvey-overlay';
    overlay.innerHTML = `
        <article class="presurvey-card" role="dialog" aria-labelledby="presurvey-q-title">
            <header class="presurvey-header">
                <span class="presurvey-step-label">사전 설문</span>
                <div class="presurvey-progress" role="progressbar" aria-valuemin="1" aria-valuemax="12" aria-valuenow="1">
                    <div class="presurvey-progress-bar" style="width: 8.33%"></div>
                </div>
                <span class="presurvey-step-count">1 / 12</span>
                <button type="button" class="presurvey-close-temp" aria-label="시안 닫기 (베타에서는 없어요)">×</button>
            </header>

            <p class="presurvey-rapport">
                잠깐, 5~9분 정도 평소 묵상·신앙 흐름 들려주세요.<br>
                정답은 없어요. 솔직한 한 줄이 가장 큰 선물이에요.
            </p>

            <h2 class="presurvey-question" id="presurvey-q-title">
                요즘 신앙 생활에서<br>
                가장 마음에 두고 있는 게 뭐예요?
            </h2>

            <label class="presurvey-free-label" for="presurvey-q1-free">
                (선택) 한 줄 더 들려주실래요
            </label>
            <textarea
                id="presurvey-q1-free"
                class="presurvey-free-input"
                rows="2"
                maxlength="300"
                placeholder=""
            ></textarea>

            <p class="presurvey-chip-hint">비슷한 자리 보기 — 하나만 골라요</p>
            <div class="presurvey-chip-grid" role="radiogroup">
                ${Q1_CHIPS.map((label, i) => `
                    <button type="button" class="presurvey-chip" role="radio" aria-checked="false" data-chip-id="q1-${i}">${escapeHtml(label)}</button>
                `).join('')}
                <div class="presurvey-chip-other">
                    <button type="button" class="presurvey-chip" role="radio" aria-checked="false" data-chip-id="q1-other">기타</button>
                    <input type="text" class="presurvey-chip-other-input" placeholder="자유 입력" maxlength="60" hidden>
                </div>
            </div>

            <footer class="presurvey-footer">
                <button type="button" class="presurvey-btn-prev" disabled>← 이전</button>
                <button type="button" class="presurvey-btn-next" disabled>다음 →</button>
            </footer>

            <p class="presurvey-temp-note">
                ⓘ 시안 단계예요. 이 카드 결 OK이면 Q2~Q12 + AI 가공 이어 만들게요.
            </p>
        </article>
    `;

    document.body.appendChild(overlay);
    _overlayEl = overlay;

    bindCardEvents(overlay);

    setTimeout(() => {
        overlay.querySelector('#presurvey-q1-free')?.focus();
    }, 50);
}

function bindCardEvents(overlay) {
    const chips = overlay.querySelectorAll('.presurvey-chip');
    const otherInput = overlay.querySelector('.presurvey-chip-other-input');
    const nextBtn = overlay.querySelector('.presurvey-btn-next');
    const closeBtn = overlay.querySelector('.presurvey-close-temp');

    let selectedChipId = null;

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => {
                c.classList.remove('presurvey-chip-active');
                c.setAttribute('aria-checked', 'false');
            });
            chip.classList.add('presurvey-chip-active');
            chip.setAttribute('aria-checked', 'true');
            selectedChipId = chip.dataset.chipId;

            if (selectedChipId === 'q1-other') {
                otherInput.hidden = false;
                setTimeout(() => otherInput.focus(), 30);
            } else {
                otherInput.hidden = true;
                otherInput.value = '';
            }

            updateNextButton();
        });
    });

    otherInput.addEventListener('input', updateNextButton);

    function updateNextButton() {
        const chipOk = selectedChipId && selectedChipId !== 'q1-other';
        const otherOk = selectedChipId === 'q1-other' && otherInput.value.trim().length > 0;
        nextBtn.disabled = !(chipOk || otherOk);
    }

    nextBtn.addEventListener('click', () => {
        const freeText = overlay.querySelector('#presurvey-q1-free').value.trim();
        const otherText = otherInput.value.trim();

        const answer = {
            Q: 'Q1',
            chip: selectedChipId,
            chipLabel: selectedChipId === 'q1-other'
                ? `기타: ${otherText}`
                : Q1_CHIPS[parseInt(selectedChipId.split('-')[1], 10)],
            free: freeText,
        };

        console.log('[preSurveyForm] Q1 시안 답변:', answer);
        showToast('Q1 답변 잘 받았어요. (시안 단계 — Q2부터는 다음 작업에서 이어갈게요)');
        closeForm();
    });

    closeBtn?.addEventListener('click', closeForm);

    const escHandler = (e) => {
        if (e.key === 'Escape') closeForm();
    };
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;
}

function closeForm() {
    if (!_overlayEl) return;
    if (_overlayEl._escHandler) {
        document.removeEventListener('keydown', _overlayEl._escHandler);
    }
    _overlayEl.remove();
    _overlayEl = null;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
