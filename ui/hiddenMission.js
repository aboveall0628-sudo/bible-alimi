/**
 * hiddenMission.js — 히든 미션 모달 UI
 *
 * (히든 미션 트랙 v1 2026-05-15)
 *
 * 정체성:
 *   - 단어 "히든 미션" (사용자 의도적 선택, 게임 톤 OK)
 *   - 본문 톤 = 회고·간증 ("다음 사람을 위한 편지")
 *   - 시각 톤 = 모노톤 ✨ (Stitch 디자인 톤 정합)
 *
 * 사용:
 *   openHiddenMission({ userId, missionId, onClose? })
 *
 * 흐름:
 *   잠금해제된 사용자가 다음 묵상 후 ✨ 카드 클릭 → 이 모달 노출
 *   본문 + 자유 응답 + 익명 토글 + 공개 동의 토글
 *   → 저장 → afterClearCard 노출 → 닫기
 *
 * 박지 말 것 (가이드 별):
 *   - "리뷰 별점" UI (사용자 선택 = 회고·간증 톤)
 *   - 강제 답변 (모든 질문 required=false)
 *   - 게임 톤이 본문까지 침범 (진입 라벨만 게임 톤, 본문은 영적·회고 톤)
 */

import { getDEK } from './lockScreen.js';
import { showToast } from './quickReview.js';
import { openModal } from './modalManager.js';
import { getHiddenMission } from '../config/hiddenMissionsCatalog.js';
import { submitMission, getStatus } from '../data/hiddenMissionsRepo.js';

const OVERLAY_ID = 'hidden-mission-overlay';

/**
 * 히든 미션 모달 열기.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.missionId — 'hm-01' 등
 * @param {Function} [opts.onClose]
 */
export async function openHiddenMission(opts = {}) {
    const { userId, missionId, onClose } = opts;
    if (!userId) { showToast('사용자 정보가 없어요.'); return; }
    if (!missionId) { showToast('미션 정보가 없어요.'); return; }

    const dek = getDEK();
    if (!dek) { showToast('잠겨 있어요. 비밀번호로 먼저 열어 주실래요?'); return; }

    const mission = getHiddenMission(missionId);
    if (!mission) { showToast('알 수 없는 미션이에요.'); return; }
    if (mission.status !== 'active') {
        showToast('아직 열리지 않은 자리예요.');
        return;
    }

    // 이미 클리어된 미션인지 체크
    const status = await getStatus(dek, userId);
    if (status.cleared.includes(missionId)) {
        showToast('이미 마친 히든 미션이에요.');
        return;
    }
    if (!status.unlocked) {
        showToast('히든 미션 자리가 아직 열리지 않았어요.');
        return;
    }

    // 기존 오버레이 정리
    document.getElementById(OVERLAY_ID)?.remove();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'modal-overlay hm-overlay';
    overlay.innerHTML = renderIntroHtml(mission);
    document.body.appendChild(overlay);

    const handle = openModal({
        overlay,
        initialFocus: '.hm-modal-close',
        closeOnBackdrop: false, // 자유 응답 자리 — 백드롭 클릭으로 닫기 X
        label: `hiddenMission-${missionId}`,
        onClose: () => {
            overlay.remove();
            if (typeof onClose === 'function') onClose();
        }
    });

    bindIntroEvents(overlay, handle, mission, userId, dek);
}

// ─────────────────────────────────────────────────────────────
// 1단계: 인트로 (시작 화면)
// ─────────────────────────────────────────────────────────────

function renderIntroHtml(mission) {
    const { intro, estimatedMinutes } = mission;
    return `
        <div class="modal hm-modal hm-intro" role="document">
            <button type="button" class="modal-close hm-modal-close" aria-label="닫기">×</button>
            <div class="hm-sparkle">✨</div>
            <h2 class="hm-headline">${escapeHtml(intro.headline)}</h2>
            <p class="hm-subtitle">${escapeHtml(intro.subtitle)}</p>
            <p class="hm-body">${escapeHtml(intro.body)}</p>
            <div class="hm-meta">
                <span class="hm-est">⏱ 약 ${estimatedMinutes}분</span>
                <span class="hm-tag">베타 개척자 전용</span>
            </div>
            <div class="hm-actions">
                <button type="button" class="btn-secondary hm-later">다음에 할게요</button>
                <button type="button" class="btn-primary hm-start">시작할게요</button>
            </div>
        </div>
    `;
}

function bindIntroEvents(overlay, handle, mission, userId, dek) {
    overlay.querySelector('.hm-modal-close')?.addEventListener('click', () => handle.close());
    overlay.querySelector('.hm-later')?.addEventListener('click', () => handle.close());
    overlay.querySelector('.hm-start')?.addEventListener('click', () => {
        renderQuestionsView(overlay, handle, mission, userId, dek);
    });
}

// ─────────────────────────────────────────────────────────────
// 2단계: 질문 응답 (자유 응답 + 토글)
// ─────────────────────────────────────────────────────────────

function renderQuestionsView(overlay, handle, mission, userId, dek) {
    const { questions, sharingOption, anonymousOption } = mission;

    const questionsHtml = (questions || []).map((q) => renderQuestionHtml(q)).join('');

    const sharingHtml = sharingOption?.enabled ? `
        <div class="hm-sharing">
            <label class="hm-toggle">
                <input type="checkbox" id="hm-share-consent" />
                <span class="hm-toggle-label">${escapeHtml(sharingOption.consentLabel)}</span>
            </label>
            <div class="hm-share-options hidden" id="hm-share-options">
                <p class="hm-share-note">${escapeHtml(sharingOption.note)}</p>
                <div class="hm-share-radios">
                    ${(sharingOption.displayNameOptions || []).map((opt) => `
                        <label class="hm-radio">
                            <input type="radio" name="hm-display-name" value="${escapeAttr(opt.value)}" ${opt.value === 'real' ? 'checked' : ''} />
                            <span>${escapeHtml(opt.label)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>
    ` : '';

    const anonHtml = anonymousOption?.enabled ? `
        <div class="hm-anonymous">
            <label class="hm-toggle">
                <input type="checkbox" id="hm-anonymous" />
                <span class="hm-toggle-label">${escapeHtml(anonymousOption.label)}</span>
            </label>
            <p class="hm-anon-desc">${escapeHtml(anonymousOption.description)}</p>
        </div>
    ` : '';

    overlay.innerHTML = `
        <div class="modal hm-modal hm-questions" role="document">
            <button type="button" class="modal-close hm-modal-close" aria-label="닫기">×</button>
            <header class="hm-q-header">
                <h2>${escapeHtml(mission.intro.headline)}</h2>
                <p class="hm-q-subtitle">${escapeHtml(mission.intro.subtitle)}</p>
            </header>
            <div class="hm-questions-list">
                ${questionsHtml}
            </div>
            ${anonHtml}
            ${sharingHtml}
            <div class="hm-actions">
                <button type="button" class="btn-secondary hm-back">처음으로</button>
                <button type="button" class="btn-primary hm-submit">저장하기</button>
            </div>
        </div>
    `;

    bindQuestionsEvents(overlay, handle, mission, userId, dek);
}

function renderQuestionHtml(q) {
    if (q.type === 'choice') {
        const opts = (q.options || []).map((o) => `
            <label class="hm-radio">
                <input type="radio" name="hm-${escapeAttr(q.id)}" value="${escapeAttr(o)}" />
                <span>${escapeHtml(o)}</span>
            </label>
        `).join('');
        return `
            <div class="hm-question" data-qid="${escapeAttr(q.id)}" data-qtype="choice">
                <label class="hm-q-label">${escapeHtml(q.label)}</label>
                <div class="hm-q-choices">${opts}</div>
            </div>
        `;
    }
    const tag = q.type === 'text' ? 'input' : 'textarea';
    const placeholder = escapeAttr(q.placeholder || '');
    return `
        <div class="hm-question" data-qid="${escapeAttr(q.id)}" data-qtype="${escapeAttr(q.type || 'longtext')}">
            <label class="hm-q-label">${escapeHtml(q.label)}</label>
            ${tag === 'input'
                ? `<input type="text" class="hm-q-input" placeholder="${placeholder}" />`
                : `<textarea class="hm-q-textarea" placeholder="${placeholder}" rows="4"></textarea>`}
        </div>
    `;
}

function bindQuestionsEvents(overlay, handle, mission, userId, dek) {
    overlay.querySelector('.hm-modal-close')?.addEventListener('click', () => handle.close());
    overlay.querySelector('.hm-back')?.addEventListener('click', () => {
        overlay.innerHTML = renderIntroHtml(mission);
        bindIntroEvents(overlay, handle, mission, userId, dek);
    });

    // 공개 동의 토글 → 표시 이름 옵션 노출
    const shareCheckbox = overlay.querySelector('#hm-share-consent');
    const shareOptions = overlay.querySelector('#hm-share-options');
    shareCheckbox?.addEventListener('change', () => {
        shareOptions?.classList.toggle('hidden', !shareCheckbox.checked);
    });

    // 저장
    overlay.querySelector('.hm-submit')?.addEventListener('click', async () => {
        const submitBtn = overlay.querySelector('.hm-submit');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const answers = collectAnswers(overlay, mission);
            const anonymousResponse = overlay.querySelector('#hm-anonymous')?.checked || false;
            const publicShareConsent = overlay.querySelector('#hm-share-consent')?.checked || false;
            const displayNameRadio = overlay.querySelector('input[name="hm-display-name"]:checked');
            const displayName = publicShareConsent
                ? (displayNameRadio?.value || 'real')
                : (anonymousResponse ? 'anonymous' : 'real');

            const result = await submitMission(dek, userId, mission.id, {
                answers,
                anonymousResponse,
                publicShareConsent,
                displayName,
            });

            if (!result.saved) {
                showToast('이미 마친 히든 미션이에요.');
                handle.close();
                return;
            }

            // 클리어 후 안내 카드
            renderAfterClearView(overlay, handle, mission);
        } catch (e) {
            console.error('[hiddenMission] submit failed', e);
            showToast('저장에 문제가 있었어요. 잠시 후 다시 시도해 주세요.');
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

function collectAnswers(overlay, mission) {
    const result = {};
    for (const q of (mission.questions || [])) {
        const wrap = overlay.querySelector(`.hm-question[data-qid="${cssEscape(q.id)}"]`);
        if (!wrap) continue;
        if (q.type === 'choice') {
            const checked = wrap.querySelector(`input[name="hm-${cssEscape(q.id)}"]:checked`);
            result[q.id] = checked?.value || null;
        } else if (q.type === 'text') {
            result[q.id] = wrap.querySelector('.hm-q-input')?.value.trim() || '';
        } else {
            result[q.id] = wrap.querySelector('.hm-q-textarea')?.value.trim() || '';
        }
    }
    return result;
}

// ─────────────────────────────────────────────────────────────
// 3단계: 클리어 후 안내 (afterClearCard)
// ─────────────────────────────────────────────────────────────

function renderAfterClearView(overlay, handle, mission) {
    const reward = mission.rewardTier?.betaImmediate;
    const after = mission.afterClearCard;
    const post = mission.rewardTier?.postLaunchActivated;

    const rewardHtml = reward ? `
        <div class="hm-reward">
            ${reward.badgeIcon ? `<div class="hm-reward-icon">${escapeHtml(reward.badgeIcon)}</div>` : ''}
            ${reward.badge ? `<div class="hm-reward-badge">${escapeHtml(reward.badge)}</div>` : ''}
            <p class="hm-reward-copy">${escapeHtml(reward.copy || '')}</p>
        </div>
    ` : '';

    const postLaunchHtml = post ? `
        <div class="hm-future-reward">
            <span class="hm-future-tag">미래 약속</span>
            <p class="hm-future-feature">${escapeHtml(post.feature)}</p>
            <p class="hm-future-copy">${escapeHtml(post.copy)}</p>
        </div>
    ` : '';

    overlay.innerHTML = `
        <div class="modal hm-modal hm-after-clear" role="document">
            <div class="hm-sparkle hm-sparkle-large">✨</div>
            <h2 class="hm-headline">${escapeHtml(after.title)}</h2>
            ${rewardHtml}
            <p class="hm-body">${escapeHtml(after.body)}</p>
            ${postLaunchHtml}
            <div class="hm-actions">
                <button type="button" class="btn-primary hm-done">${escapeHtml(after.cta)}</button>
            </div>
        </div>
    `;

    overlay.querySelector('.hm-done')?.addEventListener('click', () => handle.close());
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return escapeHtml(s);
}

function cssEscape(s) {
    if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(s);
    }
    return String(s).replace(/["\\]/g, '\\$&');
}
