/**
 * timeline.js — 통합 타임라인 컴포넌트 (STEP 1 핵심)
 *
 * 한 화면에 시간축 + 계획 레인(결단/캘린더) + 실제 레인(시계부)을 펼친다.
 * 사용자 신고 4·5·8·9번을 한 번에 해결.
 *
 * 슬롯 모델
 * - timeSlot: 0~95 (15분 단위, 0 = 00:00)
 * - durationSlots: 1~96
 * - 행 높이: 16px (1시간 = 64px)
 *
 * 데이터 소스
 * - 결단 (decisionsRepo): timeSlot != null 인 것은 plan 레인의 슬롯으로 표시
 * - Google Calendar events: plan 레인에 회색-아닌 accent 띠로 표시 (origin = 'gcal')
 * - 도트 (dotsRepo): actual 레인에 표시. dot.executionSatisfaction에 따라 색
 *
 * Drop 인터랙션
 * - 결단 카드 → plan 레인의 슬롯으로 drop → decisionsRepo.placeDecision
 * - plan 슬롯 본문 drag → 시간 이동
 * - plan 슬롯 하단 6px drag → 길이 조절
 *
 * 평가
 * - plan 슬롯 클릭 → quickReview 모달 → 저장 시 dot 생성 + actual 레인에 반영
 * - actual 빈 셀 클릭 → 인라인 입력 → dot 직접 생성 (plannedTask 없는 항목)
 */

import { getDEK } from './lockScreen.js';
import { saveDot, getDotsByDate } from '../data/dotsRepo.js';
import {
    getDecisionsByDate, placeDecision, unplaceDecision, saveDecision,
} from '../data/decisionsRepo.js';
import { openQuickReview, showToast } from './quickReview.js';
import { listUpcomingEvents } from './app.js';

const SLOTS_PER_DAY = 96;
const ROW_HEIGHT = 16; // px per 15min slot

let _userId = null;
let _date = null;
let _decisions = [];   // timeSlot != null 인 것만 plan 레인에 그림
let _dots = [];        // actual 레인
let _gcalEvents = [];  // plan 레인의 외부 일정

let _onChange = null;  // 데이터 갱신 시 외부에 알리기 (todayView가 결단 패널 다시 그릴 수 있게)

/**
 * 타임라인 마운트 (앱 시작 시 1회)
 */
export function initTimeline({ userId, date, onChange }) {
    _userId = userId;
    _date = date;
    _onChange = onChange || null;
    bindGlobalEvents();
}

/**
 * 데이터 다시 로드 + 렌더 (잠금 해제, 날짜 변경, 평가 저장 후 호출)
 */
export async function refreshTimeline({ userId, date }) {
    _userId = userId;
    _date = date;
    const dek = getDEK();
    if (!dek) return;

    try {
        const [decisions, dots, gcal] = await Promise.all([
            getDecisionsByDate(dek, _userId, _date),
            getDotsByDate(dek, _userId, _date),
            listUpcomingEvents(),
        ]);
        _decisions = decisions;
        _dots = dots;
        _gcalEvents = gcal;
    } catch (e) {
        console.error('timeline data load failed:', e);
    }
    render();
}

// ─── 렌더 ───
function render() {
    renderDesktop();
    renderMobile();
}

function renderDesktop() {
    const body = document.getElementById('utl-body');
    if (!body) return;

    // 빈 상태: 결단/도트/캘린더 모두 없으면 안내 카드만
    if (_decisions.length === 0 && _dots.length === 0 && _gcalEvents.length === 0) {
        body.innerHTML = `
            <div class="utl-empty-card">
                <h4>오늘 하루를 어떻게 시작해볼까요?</h4>
                <ol>
                    <li>위에서 묵상 한 줄을 적어 보세요</li>
                    <li>오늘의 결단을 한 줄 적어 보세요</li>
                    <li>결단 카드의 ⋮⋮를 잡고 시간표로 끌어 옮겨 보세요</li>
                    <li>지난 시간이 비어있다면 클릭해서 한 줄로 적어둘 수 있어요</li>
                </ol>
            </div>
        `;
        return;
    }

    body.innerHTML = '';

    const axisCol = document.createElement('div');
    axisCol.className = 'utl-axis-col';
    const planCol = document.createElement('div');
    planCol.className = 'utl-plan-col';
    const actualCol = document.createElement('div');
    actualCol.className = 'utl-actual-col';

    for (let i = 0; i < SLOTS_PER_DAY; i++) {
        // 시간축
        const tick = document.createElement('div');
        tick.className = 'utl-time-tick' + (i % 4 === 0 ? '' : i % 2 === 0 ? ' half' : ' minor');
        if (i % 4 === 0) tick.textContent = `${String(Math.floor(i / 4)).padStart(2, '0')}:00`;
        axisCol.appendChild(tick);

        // 계획 셀
        const planCell = document.createElement('div');
        planCell.className = 'utl-cell' + (i % 4 === 0 ? ' hour-mark' : i % 2 === 0 ? ' half-mark' : '');
        planCell.dataset.slot = i;
        planCell.dataset.lane = 'plan';
        planCol.appendChild(planCell);

        // 실제 셀
        const actualCell = document.createElement('div');
        actualCell.className = 'utl-cell' + (i % 4 === 0 ? ' hour-mark' : i % 2 === 0 ? ' half-mark' : '');
        actualCell.dataset.slot = i;
        actualCell.dataset.lane = 'actual';
        actualCol.appendChild(actualCell);
    }

    body.appendChild(axisCol);
    body.appendChild(planCol);
    body.appendChild(actualCol);

    // 현재 시간 라인
    if (isToday(_date)) {
        const now = new Date();
        const nowSlot = now.getHours() * 4 + now.getMinutes() / 15;
        const line = document.createElement('div');
        line.className = 'utl-now-line';
        line.style.top = `${nowSlot * ROW_HEIGHT}px`;
        body.appendChild(line);
    }

    // 박힌 결단 슬롯 그리기 (plan 레인)
    _decisions.forEach(d => {
        if (d.timeSlot == null) return;
        const slotEl = createPlanSlot(d, 'decision');
        positionSlot(slotEl, d.timeSlot, d.durationSlots || 4);
        planCol.appendChild(slotEl);
    });

    // Google Calendar 이벤트 그리기 (plan 레인)
    _gcalEvents.forEach(ev => {
        const range = gcalEventToSlotRange(ev);
        if (!range) return;
        const slotEl = createGcalSlot(ev);
        positionSlot(slotEl, range.start, range.end - range.start);
        planCol.appendChild(slotEl);
    });

    // 도트 그리기 (actual 레인)
    _dots.forEach(dot => {
        if (dot.timeSlot == null) return;
        const slotEl = createActualSlot(dot);
        positionSlot(slotEl, dot.timeSlot, 1);
        actualCol.appendChild(slotEl);
    });

    bindCellEvents(planCol, 'plan');
    bindCellEvents(actualCol, 'actual');
}

function renderMobile() {
    const list = document.getElementById('utl-mobile-list');
    if (!list) return;

    // 시간 슬롯 단위로 묶은 카드 리스트 (있는 슬롯만)
    const slotMap = new Map();
    _decisions.forEach(d => {
        if (d.timeSlot == null) return;
        slotMap.set(d.timeSlot, { ...slotMap.get(d.timeSlot), plan: d.text });
    });
    _gcalEvents.forEach(ev => {
        const range = gcalEventToSlotRange(ev);
        if (!range) return;
        const existing = slotMap.get(range.start) || {};
        slotMap.set(range.start, { ...existing, plan: existing.plan || ev.summary || '(일정)' });
    });
    _dots.forEach(dot => {
        if (dot.timeSlot == null) return;
        const existing = slotMap.get(dot.timeSlot) || {};
        slotMap.set(dot.timeSlot, { ...existing, actual: dot.actualTask || dot.plannedTask, dotClass: dotColorClass(dot) });
    });

    if (slotMap.size === 0) {
        list.innerHTML = `
            <div class="utl-empty-card" style="border:none">
                <h4>아직 비어있어요</h4>
                <p>결단을 한 줄 적거나, 빈 시간을 톡 눌러 채워 보세요.</p>
            </div>
        `;
        return;
    }

    const slots = Array.from(slotMap.entries()).sort((a, b) => a[0] - b[0]);
    list.innerHTML = slots.map(([slot, info]) => `
        <div class="utl-mobile-card ${info.dotClass || 'dot-gray'}">
            <span class="utl-mobile-time">${slotToTime(slot)}</span>
            <div class="utl-mobile-body">
                ${info.plan ? `<div class="utl-mobile-plan">${escapeHtml(info.plan)}</div>` : ''}
                ${info.actual ? `<div class="utl-mobile-actual">실제: ${escapeHtml(info.actual)}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// ─── 슬롯 컴포넌트 ───
function createPlanSlot(decision, source) {
    const el = document.createElement('div');
    el.className = `utl-slot ${dotColorClassForDecision(decision)}`;
    el.dataset.decisionId = decision.id;
    el.dataset.source = source;
    el.draggable = true;
    el.innerHTML = `
        <span class="slot-time">${slotToTime(decision.timeSlot)}</span>
        <span class="slot-title">${escapeHtml(decision.text || '(아직 이름이 없어요)')}</span>
        <span class="slot-resize" data-decision-id="${decision.id}"></span>
    `;
    return el;
}

function createGcalSlot(ev) {
    const el = document.createElement('div');
    el.className = 'utl-slot gcal-source';
    el.dataset.gcalId = ev.id;
    el.title = ev.summary || '';
    const range = gcalEventToSlotRange(ev);
    el.innerHTML = `
        <span class="slot-time">${slotToTime(range.start)}~${slotToTime(range.end)}</span>
        <span class="slot-title">📅 ${escapeHtml(ev.summary || '(이름 없는 일정)')}</span>
    `;
    return el;
}

function createActualSlot(dot) {
    const el = document.createElement('div');
    el.className = `utl-slot ${dotColorClass(dot)}`;
    el.dataset.dotId = dot.id;
    el.innerHTML = `
        <span class="slot-time">${slotToTime(dot.timeSlot)}</span>
        <span class="slot-title">${escapeHtml(dot.actualTask || dot.plannedTask || '(아직 평가 전이에요)')}</span>
    `;
    return el;
}

function positionSlot(el, slot, duration) {
    el.style.top = `${slot * ROW_HEIGHT}px`;
    el.style.height = `${Math.max(1, duration) * ROW_HEIGHT - 2}px`;
}

// ─── 색상 매핑 ───
function dotColorClass(dot) {
    if (!dot) return 'dot-gray';
    if (!dot.executed) return 'dot-yellow';
    const sat = dot.executionSatisfaction || 0;
    if (sat >= 4) return 'dot-green';
    if (sat >= 2) return 'dot-orange';
    if (sat >= 1) return 'dot-red';
    if (dot.executed === 'spiritual_high') return 'dot-purple';
    return 'dot-gray';
}

function dotColorClassForDecision(decision) {
    // 박힌 결단의 시간이 지났는데 평가가 없으면 노랑(평가 대기)
    if (!isToday(_date)) return 'dot-gray';
    const now = new Date();
    const nowSlot = now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
    const endSlot = (decision.timeSlot || 0) + (decision.durationSlots || 4);
    if (endSlot < nowSlot) {
        const matched = _dots.find(d => d.timeSlot === decision.timeSlot);
        if (!matched) return 'dot-yellow';
    }
    return 'dot-gray';
}

// ─── Google Calendar event → slot 범위 ───
function gcalEventToSlotRange(ev) {
    try {
        const startStr = ev.start?.dateTime || ev.start?.date;
        const endStr = ev.end?.dateTime || ev.end?.date;
        if (!startStr || !endStr) return null;
        const s = new Date(startStr);
        const e = new Date(endStr);
        const startSlot = Math.floor((s.getHours() * 60 + s.getMinutes()) / 15);
        const endSlot = Math.ceil((e.getHours() * 60 + e.getMinutes()) / 15);
        return { start: startSlot, end: Math.max(startSlot + 1, endSlot) };
    } catch { return null; }
}

// ─── 셀 이벤트 (drop, click) ───
function bindCellEvents(col, lane) {
    col.querySelectorAll('.utl-cell').forEach(cell => {
        // 드래그 인 - 결단 카드를 받기
        cell.addEventListener('dragover', (e) => {
            if (lane !== 'plan') return;
            if (!e.dataTransfer.types.includes('application/x-sanctum-decision') &&
                !e.dataTransfer.types.includes('application/x-sanctum-slot')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drop-target');
        });
        cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
        cell.addEventListener('drop', async (e) => {
            cell.classList.remove('drop-target');
            if (lane !== 'plan') return;
            e.preventDefault();
            const slot = parseInt(cell.dataset.slot);
            const decisionId = e.dataTransfer.getData('application/x-sanctum-decision');
            const slotMoveId = e.dataTransfer.getData('application/x-sanctum-slot');

            const dek = getDEK();
            if (!dek) { showToast('잠시 잠겨있어요. 비밀번호로 열어주세요'); return; }

            try {
                if (decisionId) {
                    // 새로 박기 / 다른 위치에서 옮기기
                    const d = _decisions.find(x => x.id === decisionId);
                    if (d) {
                        await placeDecision(dek, d, slot, d.durationSlots || 4);
                    } else {
                        // 결단 패널의 미배치 카드 — todayView가 보유. saveDecision으로 갱신해야 하는데
                        // 일단 외부 onChange에 위임
                        if (_onChange) await _onChange({ type: 'place', decisionId, slot });
                    }
                } else if (slotMoveId) {
                    const d = _decisions.find(x => x.id === slotMoveId);
                    if (d) await placeDecision(dek, d, slot, d.durationSlots || 4);
                }
                await refreshTimeline({ userId: _userId, date: _date });
                if (_onChange) await _onChange({ type: 'refresh' });
            } catch (err) {
                console.error('drop failed:', err);
                showToast('배치가 잘 안 됐어요. 다시 한 번 해볼까요?');
            }
        });

        // 클릭 — actual 빈 셀이면 인라인 입력 모달
        cell.addEventListener('click', (e) => {
            if (lane !== 'actual') return;
            if (e.target.closest('.utl-slot')) return;
            const slot = parseInt(cell.dataset.slot);
            openInlineActualInput(cell, slot);
        });
    });

    // 슬롯 자체 클릭 → 평가 모달
    col.querySelectorAll('.utl-slot').forEach(slot => {
        // 본문 드래그 시작 (시간 이동)
        slot.addEventListener('dragstart', (e) => {
            const did = slot.dataset.decisionId;
            if (!did) { e.preventDefault(); return; }
            e.dataTransfer.setData('application/x-sanctum-slot', did);
            e.dataTransfer.effectAllowed = 'move';
        });

        slot.addEventListener('click', (e) => {
            // resize 핸들 클릭은 무시 (mousedown으로 처리)
            if (e.target.classList.contains('slot-resize')) return;
            const decisionId = slot.dataset.decisionId;
            const dotId = slot.dataset.dotId;
            const gcalId = slot.dataset.gcalId;

            if (decisionId) {
                const d = _decisions.find(x => x.id === decisionId);
                if (d) openEvalForDecision(d);
            } else if (dotId) {
                const dot = _dots.find(x => x.id === dotId);
                if (dot) openEvalForDot(dot);
            } else if (gcalId) {
                const ev = _gcalEvents.find(x => x.id === gcalId);
                if (ev) openEvalForGcalEvent(ev);
            }
        });

        // 가장자리 리사이즈
        const resizeHandle = slot.querySelector('.slot-resize');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const did = resizeHandle.dataset.decisionId;
                if (!did) return;
                startResize(did, e.clientY, slot);
            });
        }
    });
}

// ─── 평가 모달 진입점 ───
function openEvalForDecision(decision) {
    openQuickReview({
        timeSlot: decision.timeSlot,
        cells: [decision.timeSlot],
        userId: _userId,
        date: _date,
        plannedTask: decision.text,
        decisionId: decision.id,
    });
}

function openEvalForDot(dot) {
    openQuickReview({
        timeSlot: dot.timeSlot,
        cells: [dot.timeSlot],
        userId: _userId,
        date: _date,
        plannedTask: dot.plannedTask || '',
        existingDot: dot,
    });
}

function openEvalForGcalEvent(ev) {
    const range = gcalEventToSlotRange(ev);
    openQuickReview({
        timeSlot: range?.start ?? 0,
        cells: [range?.start ?? 0],
        userId: _userId,
        date: _date,
        plannedTask: ev.summary || '',
    });
}

// ─── 인라인 actual 입력 ───
function openInlineActualInput(cell, slot) {
    if (cell.querySelector('.inline-input-row')) return;
    cell.innerHTML = `
        <div class="inline-input-row">
            <input type="text" placeholder="${slotToTime(slot)} — 이 시간에 뭐 했어요?" />
            <button>저장</button>
        </div>
    `;
    const input = cell.querySelector('input');
    const btn = cell.querySelector('button');
    input.focus();

    const save = async () => {
        const text = input.value.trim();
        if (!text) { render(); return; }
        const dek = getDEK();
        if (!dek) { showToast('잠시 잠겨있어요. 비밀번호로 열어주세요'); return; }
        try {
            await saveDot(dek, {
                userId: _userId,
                date: _date,
                timeSlot: slot,
                executed: 'done',
                executionSatisfaction: 3,
                outcomeSatisfaction: 3,
                actualTask: text,
                plannedTask: '',
                reason: '',
                labelIds: [],
            });
            await refreshTimeline({ userId: _userId, date: _date });
            showToast('🔐 안전하게 보관됨');
        } catch (e) {
            console.error('actual save failed:', e);
            showToast('저장이 잘 안 됐어요. 다시 한 번 해볼까요?');
        }
    };

    btn.addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') render();
    });
    input.addEventListener('blur', () => setTimeout(() => render(), 200));
}

// ─── 슬롯 리사이즈 (가장자리 드래그로 길이 조절) ───
function startResize(decisionId, startY, slotEl) {
    const decision = _decisions.find(x => x.id === decisionId);
    if (!decision) return;
    const startDuration = decision.durationSlots || 4;

    const onMove = (e) => {
        const dy = e.clientY - startY;
        const dSlots = Math.round(dy / ROW_HEIGHT);
        const newDuration = Math.max(1, startDuration + dSlots);
        slotEl.style.height = `${newDuration * ROW_HEIGHT - 2}px`;
        slotEl.dataset.tempDuration = String(newDuration);
    };
    const onUp = async () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const newDuration = parseInt(slotEl.dataset.tempDuration || '0');
        if (newDuration > 0 && newDuration !== startDuration) {
            decision.durationSlots = newDuration;
            const dek = getDEK();
            if (dek) await saveDecision(dek, decision);
            await refreshTimeline({ userId: _userId, date: _date });
        }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ─── 글로벌 이벤트 (툴바 버튼) ───
function bindGlobalEvents() {
    const sync = document.getElementById('sync-btn');
    if (sync) sync.addEventListener('click', async () => {
        await refreshTimeline({ userId: _userId, date: _date });
        showToast('일정 다시 가져왔어요');
    });
    // 캘린더에 옮기기는 다음 단계에서 활성화 — 일단 안내만
    const push = document.getElementById('gcal-push-btn');
    if (push) push.addEventListener('click', () => {
        showToast('이 기능은 곧 추가될 예정이에요');
    });
}

/** 외부에서 슬롯에서 결단을 빼고 싶을 때 */
export async function unplaceDecisionFromTimeline(decisionId) {
    const d = _decisions.find(x => x.id === decisionId);
    if (!d) return;
    const dek = getDEK();
    if (!dek) return;
    await unplaceDecision(dek, d);
    await refreshTimeline({ userId: _userId, date: _date });
}

// ─── 유틸 ───
function slotToTime(slot) {
    const h = Math.floor(slot / 4);
    const m = (slot % 4) * 15;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isToday(dateStr) {
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return dateStr === today;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
