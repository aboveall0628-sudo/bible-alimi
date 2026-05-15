/**
 * swanFeedback.js — SWAN 풍선 피드백 UI (CS AI 트랙 §9 3~5단계)
 *
 * 2026-05-15 신규.
 *
 * 흐름:
 *   1. 화면 우하단 풍선 버튼 → 클릭 시 모달 열림
 *   2. 모달: SWAN 첫 인사 → 사용자 입력 → SWAN 응답 (최대 12턴)
 *   3. [보내기] 또는 5분 무응답 → 자동 요약·분류 1회 → Firestore 종료
 *   4. 베타 환경에서만 풍선 노출 — 시작 시 mountSwanFeedback({ userId, getNickname })
 *
 * 의존:
 *   - data/feedbacksRepo.js — startFeedback / addTurn / finalizeFeedback
 *   - infra/feedbackContext.js — 자동 라벨 9종
 *   - ui/aiClient.js — callSwanAgent / callSwanSummary
 *   - ui/modalManager.js — openModal
 *   - ui/quickReview.js — showToast
 */

import { openModal } from './modalManager.js';
import { showToast } from './quickReview.js';
import {
    startFeedback,
    addTurn,
    finalizeFeedback,
} from '../data/feedbacksRepo.js';
import { collectFeedbackContext } from '../infra/feedbackContext.js';
import { callSwanAgent, callSwanSummary } from './aiClient.js';

// ─── 카피 (Rule 9 §10-1~4 디폴트, 2026-05-15) ─────────────────
const COPY = {
    openingTurn:     '안녕하세요. 오늘 어떤 부분을 알려주고 싶으세요?',
    closeFarewell:   '알려주셔서 고마워요. 잘 정리해 둘게요.',
    turnLimitNote:   '여기까지 알려주신 걸 정리해서 보낼게요.',
    inputPlaceholder: '편하게 알려주세요…',
    sendButton:      '보내기',
    closeAria:       '닫기',
    balloonAria:     '의견 보내기',
    summaryFailToast: '전달은 잘 됐어요. 자동 정리만 잠깐 못 했어요.',
    sendFailToast:   '잠깐 문제가 있었어요. 다시 한 번 보내볼까요?',
};

const MAX_TURNS    = 12;          // 비용 가드
const AUTO_CLOSE_MS = 5 * 60_000; // 5분 무응답

// ─── 모듈 상태 ───────────────────────────────────────────────
let _userId        = null;
let _getNickname   = () => '';
let _balloonEl     = null;
let _mounted       = false;

// 세션 상태 — 모달이 열려있는 동안만 유효
let _session = null;
/** _session = {
 *    feedbackId, context, nickname,
 *    turns: [{role:'swan'|'user', text, at}],
 *    waitingForSwan: bool,
 *    autoCloseTimer: number|null,
 *    finalized: bool,
 *    modalHandle: any,
 *    listEl: HTMLElement,
 *    inputEl: HTMLTextAreaElement,
 *    sendBtn: HTMLButtonElement,
 * } */

// ─── 진입점 ──────────────────────────────────────────────────

/**
 * 풍선 마운트. 잠금 해제 후 한 번만 호출.
 * 베타 코호트 아닐 때도 일단 노출 — 1차 베타에선 전체 사용자(=Swan 본인)에게 보임.
 */
export function mountSwanFeedback({ userId, getNickname }) {
    if (_mounted) return;
    _userId      = userId;
    _getNickname = typeof getNickname === 'function' ? getNickname : () => '';

    _balloonEl = renderBalloon();
    document.body.appendChild(_balloonEl);
    if (window.lucide?.createIcons) window.lucide.createIcons({ icons: window.lucide.icons });

    _mounted = true;
}

/**
 * 프로그램적 오픈 — 단축키나 메뉴에서 호출 가능.
 */
export function openSwanFeedback() {
    if (!_mounted || !_userId) {
        console.warn('[swanFeedback] not mounted yet');
        return;
    }
    if (_session) return; // 이미 열려있음
    startSession();
}

// ─── 풍선 렌더 ───────────────────────────────────────────────

function renderBalloon() {
    const btn = document.createElement('button');
    btn.id = 'swan-balloon-btn';
    btn.className = 'swan-balloon';
    btn.type = 'button';
    btn.setAttribute('aria-label', COPY.balloonAria);
    btn.innerHTML = `<i data-lucide="message-circle"></i>`;
    btn.addEventListener('click', openSwanFeedback);
    return btn;
}

// ─── 세션 시작 ───────────────────────────────────────────────

async function startSession() {
    const context  = collectFeedbackContext();
    const nickname = (_getNickname() || '').toString();
    const openingTurn = {
        role: 'swan',
        text: COPY.openingTurn,
        at:   new Date().toISOString(),
    };

    // 1) Firestore 새 문서 생성
    let feedbackId;
    try {
        feedbackId = await startFeedback({
            userId: _userId,
            nickname,
            context,
            openingTurn,
        });
    } catch (e) {
        console.error('[swanFeedback] startFeedback failed:', e);
        showToast('대화창을 못 열었어요. 잠시 후 다시 해볼까요?');
        return;
    }

    // 2) 모달 DOM
    const { overlay, listEl, inputEl, sendBtn, closeBtn } = renderModal();
    document.body.appendChild(overlay);
    if (window.lucide?.createIcons) window.lucide.createIcons({ icons: window.lucide.icons });

    appendTurnDOM(listEl, openingTurn);

    _session = {
        feedbackId,
        context,
        nickname,
        turns: [openingTurn],
        waitingForSwan: false,
        autoCloseTimer: null,
        finalized: false,
        modalHandle: null,
        listEl,
        inputEl,
        sendBtn,
    };

    // 3) modalManager 로 열기
    _session.modalHandle = openModal({
        overlay,
        label: 'swanFeedback',
        initialFocus: inputEl,
        closeOnBackdrop: true,
        onClose: handleModalClose,
    });

    // 4) 이벤트 바인딩
    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    closeBtn.addEventListener('click', () => _session?.modalHandle?.close());

    // 5) 5분 무응답 타이머
    resetAutoCloseTimer();
}

// ─── 모달 DOM 렌더 ───────────────────────────────────────────

function renderModal() {
    const overlay = document.createElement('div');
    overlay.id = 'swan-feedback-overlay';
    overlay.className = 'swan-overlay';
    overlay.innerHTML = `
        <div class="swan-modal" role="dialog" aria-labelledby="swan-title">
            <header class="swan-header">
                <div class="swan-title" id="swan-title">
                    <span class="swan-dot" aria-hidden="true"></span>
                    <span>SWAN</span>
                </div>
                <button type="button" class="swan-close-btn" id="swan-close-btn" aria-label="${COPY.closeAria}">
                    <i data-lucide="x"></i>
                </button>
            </header>
            <ul class="swan-turns" id="swan-turns" aria-live="polite"></ul>
            <footer class="swan-footer">
                <textarea
                    class="swan-input"
                    id="swan-input"
                    rows="2"
                    placeholder="${COPY.inputPlaceholder}"
                ></textarea>
                <button type="button" class="swan-send-btn" id="swan-send-btn">${COPY.sendButton}</button>
            </footer>
        </div>
    `;
    return {
        overlay,
        listEl:   overlay.querySelector('#swan-turns'),
        inputEl:  overlay.querySelector('#swan-input'),
        sendBtn:  overlay.querySelector('#swan-send-btn'),
        closeBtn: overlay.querySelector('#swan-close-btn'),
    };
}

function appendTurnDOM(listEl, turn) {
    const li = document.createElement('li');
    li.className = `swan-turn swan-turn-${turn.role}`;
    li.textContent = turn.text;
    listEl.appendChild(li);
    listEl.scrollTop = listEl.scrollHeight;
}

function appendThinkingDOM(listEl) {
    const li = document.createElement('li');
    li.className = 'swan-turn swan-turn-swan swan-thinking';
    li.id = 'swan-thinking-bubble';
    li.innerHTML = `<span class="swan-dots"><span></span><span></span><span></span></span>`;
    listEl.appendChild(li);
    listEl.scrollTop = listEl.scrollHeight;
}

function removeThinkingDOM(listEl) {
    const el = listEl.querySelector('#swan-thinking-bubble');
    if (el) el.remove();
}

// ─── 사용자 메시지 처리 ──────────────────────────────────────

async function handleSend() {
    if (!_session || _session.waitingForSwan || _session.finalized) return;
    const text = _session.inputEl.value.trim();
    if (!text) return;

    _session.waitingForSwan = true;
    _session.sendBtn.disabled = true;
    _session.inputEl.disabled = true;

    const userTurn = {
        role: 'user',
        text,
        at:   new Date().toISOString(),
    };

    // 1) UI 먼저
    appendTurnDOM(_session.listEl, userTurn);
    _session.turns.push(userTurn);
    _session.inputEl.value = '';
    resetAutoCloseTimer();

    // 2) Firestore turn 저장
    let turnCountAfterUser = _session.turns.length;
    try {
        const res = await addTurn(_userId, _session.feedbackId, userTurn, MAX_TURNS);
        turnCountAfterUser = res.turnCount;
    } catch (e) {
        console.error('[swanFeedback] addTurn(user) failed:', e);
        showToast(COPY.sendFailToast);
        _session.waitingForSwan = false;
        _session.sendBtn.disabled = false;
        _session.inputEl.disabled = false;
        _session.inputEl.focus();
        return;
    }

    // 3) SWAN AI 호출
    appendThinkingDOM(_session.listEl);
    let swanText = '';
    try {
        const result = await callSwanAgent({
            history:       _session.turns,
            screenPath:    _session.context.screenPath || '',
            consoleErrors: _session.context.consoleErrors || [],
            turnCount:     turnCountAfterUser,
        });
        swanText = (result.text || '').trim();
    } catch (e) {
        console.warn('[swanFeedback] callSwanAgent failed:', e);
    }
    removeThinkingDOM(_session.listEl);

    if (!swanText) {
        // AI 응답 실패 — 사용자 입력은 이미 저장됐으니 정중한 한 줄로 마무리
        swanText = '잘 받았어요. 더 알려주고 싶은 게 있으면 한 줄 더 적어 주세요.';
    }

    const swanTurn = {
        role: 'swan',
        text: swanText,
        at:   new Date().toISOString(),
    };
    appendTurnDOM(_session.listEl, swanTurn);
    _session.turns.push(swanTurn);

    let reachedMax = false;
    try {
        const res = await addTurn(_userId, _session.feedbackId, swanTurn, MAX_TURNS);
        reachedMax = res.reachedMax;
    } catch (e) {
        console.warn('[swanFeedback] addTurn(swan) failed:', e);
    }

    // 4) 12턴 도달 — 안내 한 줄 더 + 자동 종료
    if (reachedMax) {
        const limitTurn = {
            role: 'swan',
            text: COPY.turnLimitNote,
            at:   new Date().toISOString(),
        };
        appendTurnDOM(_session.listEl, limitTurn);
        _session.turns.push(limitTurn);
        try { await addTurn(_userId, _session.feedbackId, limitTurn, MAX_TURNS + 1); } catch (_) {}
        await finalizeAndClose('turn_limit_reached');
        return;
    }

    _session.waitingForSwan = false;
    _session.sendBtn.disabled = false;
    _session.inputEl.disabled = false;
    _session.inputEl.focus();
}

// ─── 5분 무응답 타이머 ───────────────────────────────────────

function resetAutoCloseTimer() {
    if (!_session) return;
    if (_session.autoCloseTimer) clearTimeout(_session.autoCloseTimer);
    _session.autoCloseTimer = setTimeout(() => {
        if (!_session || _session.finalized) return;
        finalizeAndClose('auto_timeout_5min');
    }, AUTO_CLOSE_MS);
}

// ─── 종료 + 자동 요약·분류 ──────────────────────────────────

async function finalizeAndClose(endReason) {
    if (!_session || _session.finalized) return;
    _session.finalized = true;
    if (_session.autoCloseTimer) {
        clearTimeout(_session.autoCloseTimer);
        _session.autoCloseTimer = null;
    }

    const { feedbackId, turns, context } = _session;

    // 1) 자동 요약·분류 (실패해도 finalize 는 진행 — turns 는 이미 저장됨)
    let summary, category, confidence;
    try {
        const res = await callSwanSummary({
            turns,
            screenPath:    context.screenPath || '',
            consoleErrors: context.consoleErrors || [],
        });
        summary    = res.summary;
        category   = res.category;
        confidence = res.confidence;
    } catch (e) {
        console.warn('[swanFeedback] callSwanSummary failed:', e);
        summary    = '자동 요약을 만들지 못했어요. 대화 원본을 참고해 주세요.';
        category   = 'other';
        confidence = 0;
    }

    // 2) Firestore finalize
    try {
        await finalizeFeedback(_userId, feedbackId, {
            endReason,
            summary,
            category,
            categoryConfidence: confidence,
        });
    } catch (e) {
        console.error('[swanFeedback] finalizeFeedback failed:', e);
    }

    // 3) 안내 토스트 + 모달 닫기
    showToast(COPY.closeFarewell);

    // modalHandle.close() 가 onClose 콜백을 부르지만, finalized 플래그로 이중 처리 방지
    try { _session.modalHandle?.close(); } catch (_) {}
}

function handleModalClose() {
    if (!_session) return;

    // 사용자가 백드롭/ESC/X 로 닫은 경우 — 아직 finalize 안 됐으면 manual_send 로 처리
    const wasFinalized = _session.finalized;
    const sess = _session;
    _session = null;

    // overlay DOM 정리
    try { sess.modalHandle?.overlay?.remove(); } catch (_) {}
    if (sess.autoCloseTimer) clearTimeout(sess.autoCloseTimer);

    if (!wasFinalized) {
        // 사용자 메시지가 하나라도 있으면 manual_send 로 마무리, 없으면 그냥 폐기
        const hasUserTurn = sess.turns.some(t => t.role === 'user');
        if (hasUserTurn) {
            finalizeAfterClose(sess, 'manual_send').catch(e =>
                console.warn('[swanFeedback] post-close finalize failed:', e)
            );
        }
        // hasUserTurn 이 false 면 빈 대화 — finalize 안 함. 다음 진입 때 새 doc 시작.
        // (빈 doc 은 남지만 §10-5 에 따라 1회 1 doc 정책으로 유지. 향후 청소 트랙에서 정리.)
    }
}

async function finalizeAfterClose(sess, endReason) {
    let summary, category, confidence;
    try {
        const res = await callSwanSummary({
            turns:         sess.turns,
            screenPath:    sess.context.screenPath || '',
            consoleErrors: sess.context.consoleErrors || [],
        });
        summary    = res.summary;
        category   = res.category;
        confidence = res.confidence;
    } catch (e) {
        console.warn('[swanFeedback] post-close summary failed:', e);
        summary    = '자동 요약을 만들지 못했어요. 대화 원본을 참고해 주세요.';
        category   = 'other';
        confidence = 0;
    }

    try {
        await finalizeFeedback(_userId, sess.feedbackId, {
            endReason,
            summary,
            category,
            categoryConfidence: confidence,
        });
        showToast(COPY.closeFarewell);
    } catch (e) {
        console.error('[swanFeedback] post-close finalize failed:', e);
        showToast(COPY.summaryFailToast);
    }
}
