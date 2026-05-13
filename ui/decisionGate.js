/**
 * decisionGate.js — 분별의 자리 (B-1 의사결정 시스템 1차)
 *
 * 한 컴포넌트로 두 진입 모드를 다룬다:
 *   - 'free'      : 사용자 능동 호출 (헤더 아이콘 / view-today 카드 / 외부 트리거)
 *   - 'goal-edit' : 목표 수정·폐기 직전 자동 호출 (goals.js)
 *
 * 사용자 결정 후 회로:
 *   savePrecedent(dek, data) → precedentId 확보
 *   ├─ mode='goal-edit' & linkedGoalId 있으면:
 *   │   saveGoal(dek, updatedGoal, { revisionReason, sourcePrecedentId })
 *   │   → GoalVersion 자동 새 스냅샷 박힘 (sourcePrecedentId 평문 + revisionReason 암호)
 *   └─ onDecided 콜백 호출 → 호출측이 화면 갱신
 *
 * 1차 한계 (다음 세션으로 미룸):
 *   - AI 자동 매칭 / 소크라테스 흐름 없음 (수동 선택만)
 *   - linkedDotIds 자동 역참조 없음 (스키마는 있음)
 *   - 메타 원칙 충돌 자동 해결 없음
 */

import { getDEK } from './lockScreen.js';
import { getActivePrinciples } from '../data/principlesRepo.js';
import { savePrecedent, getPrecedentsByPrinciple } from '../data/precedentsRepo.js';
import { saveGoal } from '../data/goalsRepo.js';
import { getActiveVersion } from '../data/goalVersionsRepo.js';
import {
    PRINCIPLE_STRENGTHS,
    PRINCIPLE_CATEGORIES,
    strengthLabel,
    categoryLabel
} from '../config/principleEnums.js';
// (B-2 트랙 2026-05-13) 소크라테스 흐름 — AI는 답을 주지 않고 질문만 던짐
import { callDecisionSocratic } from './aiClient.js';

const SOCRATIC_INTRO_KEY = 'dg-socratic-intro-shown';
const SOCRATIC_MAX_QUESTIONS = 5;

let _state = {
    mode: 'free',
    userId: null,
    onDecided: null,
    // goal-edit 모드 전용
    presetGoal: null,           // 원본 (변경 전)
    pendingGoalChanges: null,   // 적용할 변경 (게이트 통과 시 saveGoal 호출에 쓸 객체)
    // 작업 중 상태
    principles: [],
    selectedPrincipleIds: [],
    relatedPrecedents: [],      // 선택한 원칙들과 연결된 과거 판례 합집합
    attachedPrecedentIds: [],   // 사용자가 첨부한 판례 ids
    // (B-2 트랙 2026-05-13) 소크라테스 흐름 상태
    socraticHistory: [],        // [{ role:'ai'|'user', text, mode, askedAt }]
    socraticQuestionNumber: 0,  // 마지막으로 받은 AI 질문 차례 (1~5)
    socraticLoading: false,
    socraticEnded: false,       // opinion·summary 받은 뒤 또는 사용자가 "이제 결정하기" 누른 뒤
};

let _initialized = false;

export function initDecisionGate() {
    if (_initialized) return;
    renderGateDom();
    bindGateEvents();
    _initialized = true;
}

/**
 * 잠금 해제 후 1회 호출 — 헤더 아이콘 + view-today 카드 바인딩 + 패널 DOM 준비.
 *
 * @param {string} userId
 */
export function mountDecisionGate(userId) {
    initDecisionGate();

    const shortcutWrap = document.getElementById('dg-shortcut-wrap');
    if (shortcutWrap) shortcutWrap.classList.remove('hidden');

    const open = () => openDecisionGate({
        userId,
        mode: 'free',
        onDecided: () => {
            // 자유 모드는 단순 기록 — view 갱신은 호출측에서 별도로 신호 받음
            window.dispatchEvent(new CustomEvent('sanctum:decision-saved'));
        }
    });

    document.getElementById('dg-shortcut-btn')?.addEventListener('click', open);
    document.getElementById('dg-today-card')?.addEventListener('click', open);
}

/**
 * 분별의 자리 열기.
 *
 * @param {Object} params
 *   - userId (필수)
 *   - mode: 'free' (기본) | 'goal-edit'
 *   - presetGoal: goal-edit 모드 시 원본 goal 객체
 *   - pendingGoalChanges: goal-edit 모드 시 적용할 변경 객체 (key→value)
 *                          예: { status: 'archived' } or { title: '새 제목' }
 *   - onDecided: (result) => void
 *                result = { precedentId, applied: bool, revisedGoal? }
 */
export async function openDecisionGate(params) {
    initDecisionGate();
    _state.mode = params.mode || 'free';
    _state.userId = params.userId;
    _state.onDecided = params.onDecided || null;
    _state.presetGoal = params.presetGoal || null;
    _state.pendingGoalChanges = params.pendingGoalChanges || null;
    _state.selectedPrincipleIds = [];
    _state.attachedPrecedentIds = [];
    _state.relatedPrecedents = [];
    _state.socraticHistory = [];
    _state.socraticQuestionNumber = 0;
    _state.socraticLoading = false;
    _state.socraticEnded = false;

    const overlay = document.getElementById('dg-overlay');
    if (!overlay) return;

    // 모드에 따라 클래스 분기 — 'goal-edit' 은 풀스크린 모달(강제감), 'free' 는 우측 슬라이드 패널
    overlay.classList.remove('dg-mode-free', 'dg-mode-goal-edit');
    overlay.classList.add(`dg-mode-${_state.mode}`);

    // 헤더 텍스트 모드별
    const titleEl = document.getElementById('dg-title');
    const subEl = document.getElementById('dg-subtitle');
    if (_state.mode === 'goal-edit') {
        titleEl.textContent = '이 변경 앞에 잠시 멈추셨으면 해요';
        subEl.textContent = _buildGoalEditSubtitle();
    } else {
        titleEl.textContent = '분별의 자리';
        subEl.textContent = '지금 어떤 결정 앞에 계신가요? 5분만, 약속과 지난 결정을 같이 봐요.';
    }

    // 입력 초기화
    document.getElementById('dg-situation').value = _buildInitialSituation();
    document.getElementById('dg-decision').value = '';
    document.getElementById('dg-context-note').value = '';
    document.getElementById('dg-prayer-logged').checked = false;

    // 소크라테스 섹션 초기화
    _renderSocraticSection();

    overlay.classList.remove('hidden');
    document.body.classList.add('dg-open');

    // 원칙 로딩 (배경)
    await _loadPrinciplesAndRender();
}

function _buildGoalEditSubtitle() {
    const g = _state.presetGoal;
    const ch = _state.pendingGoalChanges || {};
    if (!g) return '';
    const keys = Object.keys(ch);
    if (keys.length === 0) return `"${g.title || '(이름 없는 목표)'}" 를 한 번 더 들여다봐요.`;
    if (ch.status === 'archived') {
        return `"${g.title || '(이름 없는 목표)'}" 를 보관함으로 옮기시려고 해요.`;
    }
    if (ch.title) {
        return `"${g.title || '(이름 없는 목표)'}" → "${ch.title}" 로 바꾸시려고 해요.`;
    }
    return `"${g.title || '(이름 없는 목표)'}" 의 ${keys.join(', ')} 가 바뀌어요.`;
}

function _buildInitialSituation() {
    if (_state.mode !== 'goal-edit') return '';
    const g = _state.presetGoal;
    const ch = _state.pendingGoalChanges || {};
    if (!g) return '';
    if (ch.status === 'archived') {
        return `목표 "${g.title || '(이름 없는 목표)'}" 를 보관함으로 옮기려는 상황.`;
    }
    if (ch.title) {
        return `목표 제목을 "${g.title}" 에서 "${ch.title}" 로 바꾸려는 상황.`;
    }
    return `목표 "${g.title}" 의 변경 앞.`;
}

async function _loadPrinciplesAndRender() {
    const dek = getDEK();
    if (!dek) {
        document.getElementById('dg-principles-list').innerHTML =
            '<p class="dg-empty">잠시 잠겨 있어요. 잠금을 푼 뒤 다시 열어 주세요.</p>';
        return;
    }
    try {
        _state.principles = await getActivePrinciples(dek, _state.userId);
    } catch (e) {
        console.error('[decisionGate] load principles failed:', e);
        _state.principles = [];
    }
    _renderPrinciplesList();
    _renderPrecedentsList();
}

function _renderPrinciplesList() {
    const root = document.getElementById('dg-principles-list');
    if (!root) return;
    if (_state.principles.length === 0) {
        root.innerHTML = `
            <p class="dg-empty">아직 적어둔 원칙이 없어요. <br>
            먼저 <a href="#" id="dg-goto-principles">나의 원칙</a> 화면에서 한두 개 적어 보세요.</p>
        `;
        return;
    }
    root.innerHTML = _state.principles.map(p => {
        const selected = _state.selectedPrincipleIds.includes(p.id);
        const strength = strengthLabel(p.strength || 'primary');
        const cat = categoryLabel(p.category || 'daily');
        return `
            <button type="button" class="dg-principle-card ${selected ? 'selected' : ''}"
                    data-principle-id="${_escAttr(p.id)}">
                <div class="dg-principle-head">
                    <span class="dg-principle-title">${_escHtml(p.title || '(제목 없음)')}</span>
                    <span class="dg-strength-chip dg-strength-${_escAttr(p.strength || 'primary')}">${_escHtml(strength)}</span>
                </div>
                <div class="dg-principle-meta">
                    <span class="dg-cat-chip">${_escHtml(cat)}</span>
                    ${p.body ? `<span class="dg-principle-body">${_escHtml(p.body).slice(0, 80)}</span>` : ''}
                </div>
            </button>
        `;
    }).join('');
}

async function _renderPrecedentsList() {
    const root = document.getElementById('dg-precedents-list');
    if (!root) return;
    const ids = _state.selectedPrincipleIds;
    if (ids.length === 0) {
        root.innerHTML = '<p class="dg-empty-soft">관련된 약속을 먼저 골라 주세요. 그 약속이 쓰인 지난 결정이 여기에 떠올라요.</p>';
        return;
    }
    const dek = getDEK();
    if (!dek) return;
    // 합집합 — 선택한 원칙들에 연결된 판례 모두 모음 (중복 제거)
    const seen = new Map();
    for (const pid of ids) {
        try {
            const list = await getPrecedentsByPrinciple(dek, _state.userId, pid);
            for (const pr of list) {
                if (!seen.has(pr.id)) seen.set(pr.id, pr);
            }
        } catch (e) {
            console.warn('[decisionGate] precedents load failed:', pid, e?.message || e);
        }
    }
    _state.relatedPrecedents = [...seen.values()].sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));

    if (_state.relatedPrecedents.length === 0) {
        root.innerHTML = '<p class="dg-empty-soft">이 약속이 쓰인 지난 결정은 아직 없어요. 이번 결정이 첫 판례가 돼요.</p>';
        return;
    }
    root.innerHTML = _state.relatedPrecedents.map(pr => {
        const attached = _state.attachedPrecedentIds.includes(pr.id);
        const dateStr = pr.decidedAt ? new Date(pr.decidedAt).toLocaleDateString('ko-KR') : '';
        return `
            <button type="button" class="dg-precedent-card ${attached ? 'attached' : ''}"
                    data-precedent-id="${_escAttr(pr.id)}">
                <div class="dg-precedent-head">
                    <span class="dg-precedent-date">${_escHtml(dateStr)}</span>
                    ${attached ? '<span class="dg-attached-mark">함께 봄</span>' : ''}
                </div>
                <div class="dg-precedent-situation">${_escHtml(pr.situation || '').slice(0, 60)}</div>
                <div class="dg-precedent-decision">→ ${_escHtml(pr.decision || '').slice(0, 80)}</div>
            </button>
        `;
    }).join('');
}

function bindGateEvents() {
    // 원칙 토글
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.dg-principle-card');
        if (!card) return;
        const id = card.dataset.principleId;
        if (!id) return;
        const idx = _state.selectedPrincipleIds.indexOf(id);
        if (idx >= 0) _state.selectedPrincipleIds.splice(idx, 1);
        else _state.selectedPrincipleIds.push(id);
        _renderPrinciplesList();
        _renderPrecedentsList();
    });

    // 판례 첨부 토글
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.dg-precedent-card');
        if (!card) return;
        const id = card.dataset.precedentId;
        if (!id) return;
        const idx = _state.attachedPrecedentIds.indexOf(id);
        if (idx >= 0) _state.attachedPrecedentIds.splice(idx, 1);
        else _state.attachedPrecedentIds.push(id);
        _renderPrecedentsList();
    });

    // 닫기
    document.addEventListener('click', (e) => {
        if (e.target.id === 'dg-cancel-btn' || e.target.id === 'dg-overlay') closeGate();
    });

    // 저장
    document.addEventListener('click', (e) => {
        if (e.target.id === 'dg-save-btn') handleGateSave();
    });

    // ESC 닫기
    document.addEventListener('keydown', (e) => {
        const ov = document.getElementById('dg-overlay');
        if (!ov || ov.classList.contains('hidden')) return;
        if (e.key === 'Escape') {
            closeGate();
            e.preventDefault();
        }
    });

    // 원칙 화면 바로가기
    document.addEventListener('click', (e) => {
        if (e.target.id === 'dg-goto-principles') {
            e.preventDefault();
            closeGate();
            document.getElementById('nav-principles')?.click();
        }
    });

    // (B-2 트랙) 소크라테스 흐름 — 버튼 핸들러
    document.addEventListener('click', (e) => {
        if (e.target.closest('#dg-socratic-start'))       { _socraticAsk('question'); return; }
        if (e.target.closest('#dg-socratic-next'))        { _socraticAdvance(); return; }
        if (e.target.closest('#dg-socratic-opinion'))     { _socraticAdvance('opinion'); return; }
        if (e.target.closest('#dg-socratic-summary'))     { _socraticAdvance('summary'); return; }
        if (e.target.closest('#dg-socratic-end'))         { _socraticEnd(); return; }
        if (e.target.id === 'dg-socratic-intro-close') {
            e.target.closest('.dg-socratic-intro')?.classList.add('hidden');
            try { localStorage.setItem(SOCRATIC_INTRO_KEY, '1'); } catch {}
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
//  (B-2 트랙 2026-05-13) 소크라테스 흐름
//
//  세 모드: 'question' / 'opinion' / 'summary'
//  최대 5개 질문. opinion·summary 받으면 종료 상태.
//  대화는 _state.socraticHistory에 누적되고, 저장 시 precedent.socraticDialogue로 박힘.
//
//  핵심 정책 (시스템 프롬프트와 일치):
//    - AI는 답을 내리지 않습니다. 사용자가 직접 내립니다.
//    - 원칙 1개 이상 골라야 시작 가능 (인용 거리가 있어야 의미 있음).
//    - 첫 호출 시 가명화 안내 한 줄 (그날 1회).
// ═══════════════════════════════════════════════════════════════════

/**
 * 소크라테스 섹션 렌더 — _state.socraticHistory + 현재 상태 기반.
 *
 * 컨트롤 버튼 노출 규칙:
 *   - 시작 전:                 [함께 분별해보기]
 *   - 질문 1~4 받은 후:        [다음 질문] [의견 줘] [정리해 줘] [이제 결정하기]
 *   - 질문 5 받은 후:          [의견 줘] [정리해 줘] [이제 결정하기]  (다음 질문 X)
 *   - opinion/summary 받은 후: [이제 결정하기]
 *   - 로딩 중:                 모든 버튼 비활성
 */
function _renderSocraticSection() {
    const historyEl = document.getElementById('dg-socratic-history');
    if (!historyEl) return;

    historyEl.innerHTML = _state.socraticHistory.map(turn => {
        const cls = turn.role === 'ai' ? 'dg-socratic-turn-ai' : 'dg-socratic-turn-user';
        const label = turn.role === 'ai'
            ? (turn.mode === 'opinion' ? '✍️ 의견' : turn.mode === 'summary' ? '📜 정리' : `질문 ${turn.questionNumber || ''}`)
            : '답';
        return `
            <div class="dg-socratic-turn ${cls}">
                <span class="dg-socratic-turn-label">${_escHtml(label)}</span>
                <div class="dg-socratic-turn-text">${_escHtml(turn.text).replace(/\n/g, '<br>')}</div>
            </div>
        `;
    }).join('');

    // 컨트롤 노출
    const startBtn   = document.getElementById('dg-socratic-start');
    const nextBtn    = document.getElementById('dg-socratic-next');
    const opinionBtn = document.getElementById('dg-socratic-opinion');
    const summaryBtn = document.getElementById('dg-socratic-summary');
    const endBtn     = document.getElementById('dg-socratic-end');
    const inputWrap  = document.getElementById('dg-socratic-input-wrap');
    const loading    = document.getElementById('dg-socratic-loading');

    if (!startBtn) return;

    const started = _state.socraticHistory.length > 0;
    const ended = _state.socraticEnded;
    const lastAiTurn = [..._state.socraticHistory].reverse().find(t => t.role === 'ai');
    const lastWasQuestion = lastAiTurn && lastAiTurn.mode === 'question';

    startBtn.classList.toggle('hidden', started);
    nextBtn.classList.toggle('hidden', !lastWasQuestion || ended || _state.socraticQuestionNumber >= SOCRATIC_MAX_QUESTIONS);
    opinionBtn.classList.toggle('hidden', !started || ended);
    summaryBtn.classList.toggle('hidden', !started || ended);
    endBtn.classList.toggle('hidden', !started);
    inputWrap.classList.toggle('hidden', !lastWasQuestion || ended);
    loading.classList.toggle('hidden', !_state.socraticLoading);

    // 버튼 비활성 (로딩 중)
    [startBtn, nextBtn, opinionBtn, summaryBtn, endBtn].forEach(b => {
        if (b) b.disabled = _state.socraticLoading;
    });
}

/**
 * 사용자가 "다음 질문" / "의견 줘" / "정리해 줘" 누름 — 현재 답변 capture 후 다음 모드 호출.
 */
function _socraticAdvance(mode = 'question') {
    if (_state.socraticLoading || _state.socraticEnded) return;
    const ans = (document.getElementById('dg-socratic-answer')?.value || '').trim();
    if (mode === 'question' && !ans) {
        _toast('한 줄이라도 답을 적어 주세요.');
        document.getElementById('dg-socratic-answer')?.focus();
        return;
    }
    if (ans) {
        _state.socraticHistory.push({ role: 'user', text: ans, askedAt: Date.now() });
        document.getElementById('dg-socratic-answer').value = '';
    }
    _socraticAsk(mode);
}

/**
 * AI 호출 — mode별 callDecisionSocratic.
 * 응답을 history에 push 하고 섹션 다시 렌더.
 */
async function _socraticAsk(mode) {
    if (_state.socraticLoading) return;

    // 원칙 한 개 이상 선택돼야 의미 있음 (인용 거리)
    if (_state.selectedPrincipleIds.length === 0) {
        _toast('먼저 관련된 약속을 한 개라도 골라 주세요.');
        return;
    }

    // 첫 호출 시 안내 한 줄 (그날 한정 localStorage)
    if (mode === 'question' && _state.socraticHistory.length === 0) {
        let shown = '0';
        try { shown = localStorage.getItem(SOCRATIC_INTRO_KEY) || '0'; } catch {}
        if (shown !== '1') {
            document.getElementById('dg-socratic-intro')?.classList.remove('hidden');
        }
    }

    _state.socraticLoading = true;
    _renderSocraticSection();

    // 호출 페이로드 구성
    const selectedPrinciples = _state.principles
        .filter(p => _state.selectedPrincipleIds.includes(p.id))
        .map(p => ({
            title:    p.title || '',
            body:     p.body || '',
            strength: p.strength || 'primary',
            category: p.category || 'daily'
        }));

    const attachedPrecedents = _state.relatedPrecedents
        .filter(pr => _state.attachedPrecedentIds.includes(pr.id))
        .map(pr => ({
            situation:   pr.situation || '',
            decision:    pr.decision || '',
            decidedAt:   pr.decidedAt || null,
            contextNote: pr.contextNote || ''
        }));

    const situation = (document.getElementById('dg-situation')?.value || '').trim();
    const goalContext = (_state.mode === 'goal-edit' && _state.presetGoal)
        ? {
            title:       _state.presetGoal.title || '',
            description: _state.presetGoal.description || ''
          }
        : null;

    // 다음 질문 차례 계산
    const nextQuestionNumber = mode === 'question'
        ? Math.min(_state.socraticQuestionNumber + 1, SOCRATIC_MAX_QUESTIONS)
        : _state.socraticQuestionNumber;

    try {
        const { text, fallback } = await callDecisionSocratic({
            mode,
            questionNumber: nextQuestionNumber,
            situation,
            principles: selectedPrinciples,
            precedents: attachedPrecedents,
            history: _state.socraticHistory.map(t => ({ role: t.role, text: t.text })),
            goalContext,
            context: { persons: [], orgs: [], places: [], amounts: [] }
        });

        if (fallback || !text) {
            _state.socraticLoading = false;
            _renderSocraticSection();
            _toast('AI를 지금 부를 수 없는 상태예요. 잠시 후 다시 시도해 주세요.');
            return;
        }

        _state.socraticHistory.push({
            role: 'ai',
            text,
            mode,
            questionNumber: mode === 'question' ? nextQuestionNumber : null,
            askedAt: Date.now()
        });

        if (mode === 'question') {
            _state.socraticQuestionNumber = nextQuestionNumber;
        } else {
            // opinion / summary 받으면 대화 종료
            _state.socraticEnded = true;
        }

        _state.socraticLoading = false;
        _renderSocraticSection();

        // 답변 textarea로 포커스 (질문 모드일 때만)
        if (mode === 'question' && !_state.socraticEnded) {
            setTimeout(() => document.getElementById('dg-socratic-answer')?.focus(), 50);
        }
    } catch (e) {
        console.error('[decisionGate] socratic call failed:', e);
        _state.socraticLoading = false;
        _renderSocraticSection();
        _toast('잠시 막혔어요. 한 번만 더 시도해 주실래요?');
    }
}

/**
 * "이제 결정하기" — 대화 종료 표시 후 결정 textarea로 포커스 이동.
 */
function _socraticEnd() {
    _state.socraticEnded = true;
    _renderSocraticSection();
    document.getElementById('dg-decision')?.focus();
}

async function handleGateSave() {
    const dek = getDEK();
    if (!dek) { _toast('잠시 잠겨 있어요'); return; }
    const userId = _state.userId;
    if (!userId) { _toast('사용자 정보가 없어요'); return; }

    const situation = (document.getElementById('dg-situation').value || '').trim();
    const decision = (document.getElementById('dg-decision').value || '').trim();
    const contextNote = (document.getElementById('dg-context-note').value || '').trim();
    const prayerLogged = !!document.getElementById('dg-prayer-logged').checked;

    if (!decision) {
        _toast('결정을 한 줄이라도 적어 주세요.');
        document.getElementById('dg-decision')?.focus();
        return;
    }

    const btn = document.getElementById('dg-save-btn');
    btn.textContent = '저장 중...';
    btn.disabled = true;

    try {
        // 1) 판례 저장 — principlesAtTime 시점 스냅샷 자동 박힘
        const precedentData = {
            userId,
            situation,
            decision,
            contextNote,
            linkedPrincipleIds: _state.selectedPrincipleIds.slice(),
            linkedPrecedentIds: _state.attachedPrecedentIds.slice(),
            linkedGoalId: _state.presetGoal?.id || null,
            linkedGoalVersionId: null,    // 아래에서 채움 (목표 변경 직전 활성 버전)
            prayerLogged,
            decidedAt: Date.now(),
            source: 'user',
            // (B-2 트랙 2026-05-13) 소크라테스 대화 — 몇 달 뒤 같은 판례 다시 열어보면 사고 흐름도 함께 보임
            socraticDialogue: _state.socraticHistory.slice()
        };

        // 목표가 연결돼 있으면 현재 활성 GoalVersion id 박기 (R2 추적용)
        if (_state.presetGoal) {
            try {
                const active = await getActiveVersion(dek, userId, _state.presetGoal.id);
                if (active) precedentData.linkedGoalVersionId = active.id;
            } catch (e) {
                console.warn('[decisionGate] active version lookup failed:', e?.message || e);
            }
        }

        const saved = await savePrecedent(dek, precedentData);
        const precedentId = saved.id;

        // 2) goal-edit 모드면 적용된 변경으로 saveGoal 호출
        let revisedGoal = null;
        if (_state.mode === 'goal-edit' && _state.presetGoal && _state.pendingGoalChanges) {
            revisedGoal = { ..._state.presetGoal, ..._state.pendingGoalChanges };
            const revisionReason = decision; // 결정 본문 자체를 reason 으로 박음
            try {
                await saveGoal(dek, revisedGoal, {
                    revisionReason,
                    sourcePrecedentId: precedentId,
                    source: 'self_report'
                });
            } catch (e) {
                console.error('[decisionGate] goal save failed:', e);
                _toast('목표 저장이 잠깐 막혔어요. 판례는 보관됐어요.');
            }
        }

        _toast('🔐 분별의 자리에 보관했어요');
        closeGate();
        if (_state.onDecided) {
            _state.onDecided({ precedentId, applied: !!revisedGoal, revisedGoal });
        }
    } catch (e) {
        console.error('[decisionGate] save failed:', e);
        _toast('저장이 잠깐 막혔어요. 한 번만 더 시도해 주실래요?');
        btn.textContent = '결정 기록하기';
        btn.disabled = false;
    }
}

export function closeGate() {
    const overlay = document.getElementById('dg-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('dg-open');
    const btn = document.getElementById('dg-save-btn');
    if (btn) { btn.textContent = '결정 기록하기'; btn.disabled = false; }
    // 상태 비우기 (다음 호출에서 새로)
    _state.presetGoal = null;
    _state.pendingGoalChanges = null;
}

function renderGateDom() {
    if (document.getElementById('dg-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dg-overlay';
    overlay.className = 'dg-overlay hidden';
    overlay.innerHTML = `
        <div class="dg-panel" role="dialog" aria-modal="true" aria-labelledby="dg-title">
            <header class="dg-head">
                <div class="dg-mode-chip">분별의 자리</div>
                <h2 id="dg-title">분별의 자리</h2>
                <p id="dg-subtitle" class="dg-sub"></p>
                <button id="dg-cancel-btn" class="dg-close-btn" type="button" aria-label="닫기">×</button>
            </header>

            <section class="dg-section">
                <label class="dg-field-label" for="dg-situation">지금 상황 (한두 줄)</label>
                <textarea id="dg-situation" class="dg-textarea" rows="2"
                    placeholder="어떤 자리에서 어떤 선택 앞에 있나요?"></textarea>
            </section>

            <section class="dg-section">
                <h3 class="dg-section-title">관련된 약속</h3>
                <p class="dg-section-desc">이번 결정에 떠오르는 약속들을 골라 주세요. 그 약속의 그 시점 강도가 그대로 박혀요.</p>
                <div id="dg-principles-list" class="dg-principles-list"></div>
            </section>

            <section class="dg-section">
                <h3 class="dg-section-title">지난 비슷한 결정</h3>
                <div id="dg-precedents-list" class="dg-precedents-list"></div>
            </section>

            <!-- (B-2 트랙 2026-05-13) 소크라테스 흐름 — AI는 답을 주지 않고 질문만 -->
            <section class="dg-section dg-socratic-section">
                <h3 class="dg-section-title">함께 분별해보기</h3>
                <p class="dg-section-desc">결정 앞에 호흡 한 번. AI가 답을 주지 않고, 사용자가 적은 약속과 지난 결정을 곁에 두고 질문 하나만 던집니다.</p>

                <div id="dg-socratic-intro" class="dg-socratic-intro hidden">
                    <span>적으신 글은 가명으로 바뀌어 AI에게 갑니다. 결정은 사용자께서 직접 내리세요.</span>
                    <button type="button" id="dg-socratic-intro-close" aria-label="안내 닫기">×</button>
                </div>

                <div id="dg-socratic-history" class="dg-socratic-history"></div>

                <div id="dg-socratic-loading" class="dg-socratic-loading hidden">
                    <span class="dg-socratic-dots"><span></span><span></span><span></span></span>
                    <span class="dg-socratic-loading-text">호흡 한 번 함께 들이쉬는 중...</span>
                </div>

                <div id="dg-socratic-input-wrap" class="dg-socratic-input-wrap hidden">
                    <textarea id="dg-socratic-answer" class="dg-textarea dg-socratic-answer" rows="2"
                        placeholder="떠오르는 결을 한 줄로 적어 주세요. 정답 아니어도 괜찮아요."></textarea>
                </div>

                <div id="dg-socratic-controls" class="dg-socratic-controls">
                    <button type="button" id="dg-socratic-start" class="dg-soft-btn">
                        <span class="dg-soft-btn-icon">🤔</span>
                        <span>함께 분별해보기</span>
                    </button>
                    <button type="button" id="dg-socratic-next" class="dg-soft-btn hidden">다음 질문</button>
                    <button type="button" id="dg-socratic-opinion" class="dg-soft-btn dg-soft-btn-quiet hidden">의견 줘</button>
                    <button type="button" id="dg-socratic-summary" class="dg-soft-btn dg-soft-btn-quiet hidden">정리해 줘</button>
                    <button type="button" id="dg-socratic-end" class="dg-text-btn hidden">이제 결정하기</button>
                </div>
            </section>

            <section class="dg-section">
                <label class="dg-field-label" for="dg-decision">그래서 어떻게 결정하시겠어요?</label>
                <textarea id="dg-decision" class="dg-textarea" rows="3"
                    placeholder="결정을 한 줄로 적어 주세요. 평가가 아니라 '그때 그 결' 그대로."></textarea>
            </section>

            <section class="dg-section">
                <label class="dg-field-label" for="dg-context-note">자유 메모 (선택)</label>
                <textarea id="dg-context-note" class="dg-textarea" rows="2"
                    placeholder="잘했다/못했다 평가 대신, 결정의 결을 묘사해 보세요."></textarea>
            </section>

            <section class="dg-section dg-prayer-row">
                <label class="dg-checkbox-label">
                    <input type="checkbox" id="dg-prayer-logged" />
                    <span>결정 전, 잠시 묵상·기도 시간을 가졌어요</span>
                </label>
                <p class="dg-prayer-hint">결정 앞에서 멈추는 호흡이 떠오르면 잠시 짧은 기도를 권유드려요. 강제는 아니에요.</p>
            </section>

            <footer class="dg-foot">
                <button type="button" id="dg-cancel-btn-2" class="dg-text-btn">다시 생각해볼게요</button>
                <button type="button" id="dg-save-btn" class="dg-primary-btn">결정 기록하기</button>
            </footer>
        </div>
    `;
    document.body.appendChild(overlay);

    // 두 번째 닫기 버튼도 같은 핸들러
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'dg-cancel-btn-2') closeGate();
    });
}

function _escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function _escAttr(s) { return _escHtml(s); }

function _toast(msg) {
    const t = document.createElement('div');
    t.className = 'sanctum-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1400);
}
