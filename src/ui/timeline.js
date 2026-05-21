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
 * - daily 목표 (goalsRepo, period='daily'): timeSlot != null 인 것은 plan 레인 슬롯
 * - Google Calendar events: plan 레인에 회색-아닌 accent 띠로 표시 (origin = 'gcal')
 * - 도트 (dotsRepo): actual 레인에 표시. dot.executionSatisfaction에 따라 색
 *
 * Drop 인터랙션
 * - daily 목표 카드 → plan 레인의 슬롯으로 drop → goalsRepo.placeGoal
 * - plan 슬롯 본문 drag → 시간 이동
 * - plan 슬롯 하단 6px drag → 길이 조절
 *
 * 평가
 * - plan 슬롯 클릭 → quickReview 모달 → 저장 시 dot 생성 + actual 레인에 반영
 * - actual 빈 셀 클릭 → 인라인 입력 → dot 직접 생성 (plannedTask 없는 항목)
 */

import { getDEK } from './lockScreen.js';
import { saveDot, getDotsByDate, deleteDot } from '../data/dotsRepo.js';
// Phase B: 결단 → daily 목표 전환. plan 레인 슬롯의 source 는 이제 goalsRepo.
// 기존 함수명은 placeGoal/unplaceGoal/saveGoal/getDailyGoals 로 매핑.
import {
    getDailyGoals, placeGoal, unplaceGoal, saveGoal,
} from '../data/goalsRepo.js';
import { openQuickReview, showToast } from './quickReview.js';
import { listUpcomingEvents, pushDecisionsToGoogleCalendar } from './app.js';
// Phase E-6 C-1: GCal 이벤트를 daily 목표로 자동 변환 (시간표·목표·리포트 정합)
import { syncGcalEventsToDailyGoals } from '../data/gcalSync.js';

const SLOTS_PER_DAY = 96;
const ROW_HEIGHT = 16; // px per 15min slot

let _userId = null;
let _date = null;
let _decisions = [];   // timeSlot != null 인 것만 plan 레인에 그림
let _dots = [];        // actual 레인
let _gcalEvents = [];  // plan 레인의 외부 일정

// (v111) 72시간 결 — 모바일 시간표 어제 + 오늘 + 내일 한 화면. 데스크탑은 오늘만.
let _decisionsYesterday = [];
let _decisionsTomorrow = [];
let _dotsYesterday = [];
let _dotsTomorrow = [];

function formatDateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

let _onChange = null;  // 데이터 갱신 시 외부에 알리기 (todayView가 결단 패널 다시 그릴 수 있게)

// 모바일 변수 — (v108 Phase 1+2 통합 진입 2026-05-20)
// 사용자 7건 신고 정합: 카드 폭·드롭다운·인라인 평가·드래그 길이·줌·슬라이드 레이어·FAB 폐기
let _mobileScrollPos = 0;
let _mobileLayer = 'both'; // 'plan' | 'both' | 'actual' — 좌·우 슬라이드 3단 토글
let _mobileZoom = 1;       // 0.5x ~ 2x, localStorage 보존
let _activeDropdown = null; // 빈 자리 톡 시 자리잡힌 드롭다운 element

function getMobileRowHeight() {
    return Math.max(8, Math.round(ROW_HEIGHT * _mobileZoom));
}

function loadMobilePrefs() {
    try {
        const z = parseFloat(localStorage.getItem('sanctum.mobileZoom') || '1');
        if (z >= 0.5 && z <= 2) _mobileZoom = z;
        const l = localStorage.getItem('sanctum.mobileLayer');
        if (l === 'plan' || l === 'actual' || l === 'both') _mobileLayer = l;
    } catch (_) { /* 자리 자리잡혀 자연 */ }
}

function saveMobilePrefs() {
    try {
        localStorage.setItem('sanctum.mobileZoom', String(_mobileZoom));
        localStorage.setItem('sanctum.mobileLayer', _mobileLayer);
    } catch (_) {}
}

function mobileSlotToTimeLabel(slot) {
    const h = Math.floor(slot / 4);
    const m = (slot % 4) * 15;
    const period = h < 12 ? '오전' : '오후';
    const displayH = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return `${period} ${displayH}:${String(m).padStart(2, '0')}`;
}

// (v115) 데스크탑 부분 통일 — 72h + 줌 + 어제·오늘·내일 + "×" + 4상태 + 드롭다운
let _desktopZoom = 1; // 0.5x ~ 2x
let _activeDesktopDropdown = null;
function getDesktopRowHeight() {
    return Math.max(8, Math.round(ROW_HEIGHT * _desktopZoom));
}
function loadDesktopPrefs() {
    try {
        const z = parseFloat(localStorage.getItem('sanctum.desktopZoom') || '1');
        if (z >= 0.5 && z <= 2) _desktopZoom = z;
    } catch (_) {}
}
function saveDesktopPrefs() {
    try {
        localStorage.setItem('sanctum.desktopZoom', String(_desktopZoom));
    } catch (_) {}
}

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
export async function refreshTimeline({ userId, date, scrollToNow = false }) {
    _userId = userId;
    _date = date;
    const dek = getDEK();
    if (!dek) return;

    // 하나가 실패해도 나머지는 살아남도록 allSettled. decisions 인덱스가 빠져 있어
    // throw가 나도 도트/캘린더는 그대로 보임.
    // (v111) 72시간 결 — 어제·오늘·내일 자리 한 번에 fetch
    const dateObj = new Date(_date);
    const yest = new Date(dateObj); yest.setDate(yest.getDate() - 1);
    const tom = new Date(dateObj); tom.setDate(tom.getDate() + 1);
    const yestStr = formatDateLocal(yest);
    const tomStr = formatDateLocal(tom);

    const [decisionsR, dotsR, gcalR, dYR, dotsYR, dTR, dotsTR] = await Promise.allSettled([
        getDailyGoals(dek, _userId, _date),
        getDotsByDate(dek, _userId, _date),
        listUpcomingEvents(),
        getDailyGoals(dek, _userId, yestStr),
        getDotsByDate(dek, _userId, yestStr),
        getDailyGoals(dek, _userId, tomStr),
        getDotsByDate(dek, _userId, tomStr),
    ]);
    if (decisionsR.status === 'fulfilled') _decisions = decisionsR.value;
    else console.error('decisions load failed:', decisionsR.reason);
    if (dotsR.status === 'fulfilled') _dots = dotsR.value;
    else console.error('dots load failed:', dotsR.reason);
    if (gcalR.status === 'fulfilled') _gcalEvents = gcalR.value;
    else console.error('gcal load failed:', gcalR.reason);
    _decisionsYesterday = dYR.status === 'fulfilled' ? dYR.value : [];
    _dotsYesterday = dotsYR.status === 'fulfilled' ? dotsYR.value : [];
    _decisionsTomorrow = dTR.status === 'fulfilled' ? dTR.value : [];
    _dotsTomorrow = dotsTR.status === 'fulfilled' ? dotsTR.value : [];

    // Phase E-6 C-2: GCal 이벤트를 daily 목표로 자동 동기화.
    // 새/변경된 이벤트가 있으면 goals 컬렉션에 반영하고, 그 결과를 _decisions 에 다시 반영.
    // 실패해도 시간표 자체는 그려져야 하므로 try/catch 로 감쌈.
    if (_gcalEvents.length > 0) {
        try {
            const sync = await syncGcalEventsToDailyGoals(dek, _userId, _gcalEvents, _date);
            if (sync.created > 0 || sync.updated > 0) {
                _decisions = await getDailyGoals(dek, _userId, _date);
            }
        } catch (e) {
            console.warn('[gcalSync] failed:', e);
        }
    }

    render();

    // (2026-05-20) 저장 후 자동 탭 전환은 사용자 결정으로 제외. 평가 모달은 항상 실제 탭에서
    // 열리므로 자동 전환 효과 거의 없음 — 사용자 자리 그대로 두는 자연 결.

    // 마운트/날짜 변경/사용자 명시 액션에서만 현재 시간으로 이동.
    // 인라인 저장 후 refresh 같은 자동 refresh는 사용자 스크롤 위치를 보존.
    if (scrollToNow) scrollTimelineToNow();
}

/**
 * 시간표 컨테이너의 현재 시간 라인을 상단 근처로 스크롤.
 * isToday일 때만 동작. 그 외 날짜는 09:00 근처로 스크롤(아침에 시작).
 */
export function scrollTimelineToNow() {
    const body = document.getElementById('utl-body');
    if (!body) return;
    let targetSlot;
    if (isToday(_date)) {
        const now = new Date();
        targetSlot = now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
    } else {
        targetSlot = 9 * 4; // 09:00
    }
    // 현재 시간이 상단 안쪽으로 약간 들어오게 -2 슬롯 여유.
    const top = Math.max(0, (targetSlot - 2) * ROW_HEIGHT);
    body.scrollTop = top;
}

// ─── 렌더 ───
function render() {
    renderDesktop();
    renderMobile();
}

function renderDesktop() {
    const body = document.getElementById('utl-body');
    if (!body) return;

    // (v115) 데스크탑 부분 통일 — 72시간 + 줌 + "×" + 4상태 + 드롭다운
    loadDesktopPrefs();
    const desktopRowH = getDesktopRowHeight();
    const ALL_SLOTS = SLOTS_PER_DAY * 3; // 어제 + 오늘 + 내일
    const totalH = ALL_SLOTS * desktopRowH;

    closeDesktopDropdown();
    const prevScroll = body.scrollTop;
    body.innerHTML = '';

    // 헤더 자리잡힙 — 줌 컨트롤
    const header = document.createElement('div');
    header.className = 'utl-desktop-header';
    header.innerHTML = `
        <div class="utl-desktop-controls">
            <button type="button" class="utl-desktop-zoom-btn" data-zoom="out" aria-label="시간축 축소">−</button>
            <span class="utl-desktop-zoom-label">${Math.round(_desktopZoom * 100)}%</span>
            <button type="button" class="utl-desktop-zoom-btn" data-zoom="in" aria-label="시간축 확대">+</button>
        </div>
    `;
    body.appendChild(header);

    header.querySelectorAll('.utl-desktop-zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.zoom === 'in') _desktopZoom = Math.min(2, Math.round((_desktopZoom + 0.25) * 100) / 100);
            else _desktopZoom = Math.max(0.5, Math.round((_desktopZoom - 0.25) * 100) / 100);
            saveDesktopPrefs();
            renderDesktop();
        });
    });

    // 스크롤 영역
    const scrollArea = document.createElement('div');
    scrollArea.className = 'utl-desktop-scroll';

    const axisCol = document.createElement('div');
    axisCol.className = 'utl-axis-col';
    axisCol.style.height = `${totalH}px`;
    const planCol = document.createElement('div');
    planCol.className = 'utl-plan-col';
    planCol.style.height = `${totalH}px`;
    const actualCol = document.createElement('div');
    actualCol.className = 'utl-actual-col';
    actualCol.style.height = `${totalH}px`;

    // 시간 라벨·셀 (72시간) — day=0 어제, 1 오늘, 2 내일
    for (let absSlot = 0; absSlot < ALL_SLOTS; absSlot++) {
        const day = Math.floor(absSlot / SLOTS_PER_DAY);
        const slotInDay = absSlot % SLOTS_PER_DAY;
        const dayKey = day === 0 ? 'yesterday' : day === 1 ? 'today' : 'tomorrow';

        const tick = document.createElement('div');
        tick.className = 'utl-time-tick day-' + dayKey + (slotInDay % 4 === 0 ? '' : slotInDay % 2 === 0 ? ' half' : ' minor');
        tick.style.height = `${desktopRowH}px`;
        if (slotInDay % 4 === 0) {
            tick.textContent = `${String(Math.floor(slotInDay / 4)).padStart(2, '0')}:00`;
        }
        axisCol.appendChild(tick);

        const planCell = document.createElement('div');
        planCell.className = 'utl-cell day-' + dayKey + (slotInDay % 4 === 0 ? ' hour-mark' : slotInDay % 2 === 0 ? ' half-mark' : '');
        planCell.style.height = `${desktopRowH}px`;
        planCell.dataset.absSlot = absSlot;
        planCell.dataset.slot = slotInDay;
        planCell.dataset.day = dayKey;
        planCell.dataset.lane = 'plan';
        planCol.appendChild(planCell);

        const actualCell = document.createElement('div');
        actualCell.className = 'utl-cell day-' + dayKey + (slotInDay % 4 === 0 ? ' hour-mark' : slotInDay % 2 === 0 ? ' half-mark' : '');
        actualCell.style.height = `${desktopRowH}px`;
        actualCell.dataset.absSlot = absSlot;
        actualCell.dataset.slot = slotInDay;
        actualCell.dataset.day = dayKey;
        actualCell.dataset.lane = 'actual';
        actualCol.appendChild(actualCell);
    }

    scrollArea.appendChild(axisCol);
    scrollArea.appendChild(planCol);
    scrollArea.appendChild(actualCol);

    // 날짜 구분선
    for (let day = 0; day < 3; day++) {
        const top = day * SLOTS_PER_DAY * desktopRowH;
        const divider = document.createElement('div');
        divider.className = 'utl-desktop-day-divider';
        divider.style.top = `${top}px`;
        divider.innerHTML = `<span class="utl-desktop-day-label">${day === 0 ? '어제' : day === 1 ? '오늘' : '내일'}</span>`;
        scrollArea.appendChild(divider);
    }

    // 현재 시간 라인 — 오늘 자리 안에서만
    if (isToday(_date)) {
        const now = new Date();
        const nowAbsSlot = SLOTS_PER_DAY + now.getHours() * 4 + now.getMinutes() / 15;
        const line = document.createElement('div');
        line.className = 'utl-now-line';
        line.style.top = `${nowAbsSlot * desktopRowH}px`;
        scrollArea.appendChild(line);
    }

    // 슬롯 자리잡힙 — 어제·오늘·내일
    const renderPlanList = (list, offset, dayKey) => {
        list.forEach(d => {
            if (d.timeSlot == null) return;
            const slotEl = createPlanSlot(d, 'decision', dayKey);
            positionSlot(slotEl, d.timeSlot + offset, d.durationSlots || 4, desktopRowH);
            planCol.appendChild(slotEl);
        });
    };
    renderPlanList(_decisionsYesterday, 0, 'yesterday');
    renderPlanList(_decisions, SLOTS_PER_DAY, 'today');
    renderPlanList(_decisionsTomorrow, SLOTS_PER_DAY * 2, 'tomorrow');

    const renderActualList = (list, offset, dayKey) => {
        list.forEach(dot => {
            if (dot.timeSlot == null) return;
            const slotEl = createActualSlot(dot, dayKey);
            positionSlot(slotEl, dot.timeSlot + offset, dot.durationSlots || 1, desktopRowH);
            actualCol.appendChild(slotEl);
        });
    };
    renderActualList(_dotsYesterday, 0, 'yesterday');
    renderActualList(_dots, SLOTS_PER_DAY, 'today');
    renderActualList(_dotsTomorrow, SLOTS_PER_DAY * 2, 'tomorrow');

    body.appendChild(scrollArea);

    bindCellEvents(planCol, 'plan');
    bindCellEvents(actualCol, 'actual');

    // 스크롤 자리 복원 — 첫 진입이면 오늘 현재 시간 자리
    requestAnimationFrame(() => {
        if (prevScroll > 0) {
            scrollArea.scrollTop = prevScroll;
        } else if (isToday(_date)) {
            const now = new Date();
            const nowAbsSlot = SLOTS_PER_DAY + now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
            scrollArea.scrollTop = Math.max(0, (nowAbsSlot - 4) * desktopRowH);
        } else {
            scrollArea.scrollTop = Math.max(0, (SLOTS_PER_DAY + 9 * 4) * desktopRowH);
        }
    });
}

function closeDesktopDropdown() {
    if (_activeDesktopDropdown) {
        _activeDesktopDropdown.remove();
        _activeDesktopDropdown = null;
    }
    document.removeEventListener('click', closeDesktopDropdownOnOutside);
}
function closeDesktopDropdownOnOutside(e) {
    if (!_activeDesktopDropdown) return;
    if (!_activeDesktopDropdown.contains(e.target)) closeDesktopDropdown();
}

// (v115) 데스크탑 plan 빈 셀 click 시 드롭다운 — 모바일 결 정합
async function openDesktopDropdown(cell, slot, opts = {}) {
    const { targetDate = _date, asNewGoal = false } = opts;
    closeDesktopDropdown();
    const unplaced = asNewGoal ? [] : _decisions.filter(d => d.timeSlot == null);
    const goalsHtml = unplaced.length > 0
        ? unplaced.map(g => {
            const title = g.title ?? g.text ?? '(이름 없음)';
            return `<li class="utl-desktop-dd-item" data-goal-id="${escapeHtml(g.id)}">
                <span class="utl-desktop-dd-icon">◯</span>
                <span class="utl-desktop-dd-text">${escapeHtml(title)}</span>
            </li>`;
        }).join('')
        : '<li class="utl-desktop-dd-empty">자리잡힌 목표가 아직 없어요</li>';

    const dropdown = document.createElement('div');
    dropdown.className = 'utl-desktop-dropdown';
    dropdown.innerHTML = `
        <div class="utl-desktop-dd-header">
            <span class="utl-desktop-dd-time">${slotToTime(slot)}</span>
            <button type="button" class="utl-desktop-dd-close" aria-label="닫기">✕</button>
        </div>
        <ul class="utl-desktop-dd-list">${goalsHtml}</ul>
        <div class="utl-desktop-dd-divider"></div>
        <form class="utl-desktop-dd-form">
            <input type="text" class="utl-desktop-dd-input" placeholder="할 일을 직접 적어 주세요" maxlength="100" autocomplete="off" />
            <button type="submit" class="utl-desktop-dd-submit">추가</button>
        </form>
    `;
    cell.appendChild(dropdown);
    _activeDesktopDropdown = dropdown;

    // 미배치 목표 톡 — 오늘 자리에만 자리잡힙
    dropdown.querySelectorAll('.utl-desktop-dd-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const goalId = item.dataset.goalId;
            const dek = getDEK();
            if (!dek) return;
            const goal = _decisions.find(d => d.id === goalId);
            if (!goal) return;
            closeDesktopDropdown();
            try {
                await placeGoal(dek, goal, slot, 4);
                showToast('시간표에 넣었어요');
                if (_onChange) _onChange();
                await refreshTimeline({ userId: _userId, date: _date });
            } catch (err) {
                console.error('[desktopDropdown.placeGoal]', err);
                showToast('잠깐 막혔어요. 다시 해 볼까요?');
            }
        });
    });

    // 직접 입력 — 새 goal 자리잡힙 (오늘·내일 둘 다)
    const form = dropdown.querySelector('.utl-desktop-dd-form');
    const input = dropdown.querySelector('.utl-desktop-dd-input');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = input.value.trim();
        if (!text) return;
        closeDesktopDropdown();
        const dek = getDEK();
        if (!dek) return;
        try {
            await saveGoal(dek, {
                userId: _userId,
                userDate: targetDate,
                title: text,
                text: text,
                timeSlot: slot,
                durationSlots: 4,
                period: 'daily',
                placedAt: Date.now(),
            });
            showToast('시간표에 넣었어요');
            if (_onChange) _onChange();
            await refreshTimeline({ userId: _userId, date: _date });
        } catch (err) {
            console.error('[desktopDropdown.newGoal]', err);
            showToast('잠깐 막혔어요. 다시 해 볼까요?');
        }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    dropdown.querySelector('.utl-desktop-dd-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDesktopDropdown();
    });

    setTimeout(() => input.focus(), 50);
    setTimeout(() => document.addEventListener('click', closeDesktopDropdownOnOutside), 0);
}

// ═══════════════════════════════════════════════════════════════
// (v108 Phase 1+2 통합 2026-05-20) 모바일 시간축 그리드 — Guided Actual UX
// 사용자 7건 신고 정합:
//   1) 카드 폭 꽉 (시간 라벨 좌측 44px, 카드 자리 자연 차지)
//   2) 빈 자리 톡 = 드롭다운 (미배치 목표 + 직접 입력)
//   3) 슬라이드 3단 토글 (좌 = 계획만 / 중앙 = 둘 다 / 우 = 실제만)
//   4) 카드 톡 = 인라인 4상태 평가, 길게 누름 = 모달 (자세히·삭제)
//   5) 카드 하단 모서리 드래그 = 길이 자리잡힙 (15분 스냅)
//   6) 줌 [-][100%][+] 버튼 — ROW_HEIGHT 가변 (localStorage 보존)
//   7) + FAB 자리 폐기 (SWAN 톡 자리와 충돌)
// ═══════════════════════════════════════════════════════════════
function renderMobile() {
    const list = document.getElementById('utl-mobile-list');
    if (!list) return;

    loadMobilePrefs();

    const scrollEl = list.querySelector('.utl-mg-scroll') || list;
    _mobileScrollPos = scrollEl.scrollTop || _mobileScrollPos;

    closeMobileDropdown();

    const rowH = getMobileRowHeight();
    const ALL_SLOTS = SLOTS_PER_DAY * 3; // 72시간 = 288 슬롯 (어제·오늘·내일)
    const totalHeight = ALL_SLOTS * rowH;
    const showPlan = _mobileLayer === 'plan' || _mobileLayer === 'both';
    const showActual = _mobileLayer === 'actual' || _mobileLayer === 'both';

    // ── 데이터 가공 — 72시간 자리. day=0(어제) slot+0, day=1(오늘) slot+96, day=2(내일) slot+192
    const planAll = [];
    const pushPlanList = (arr, offset, dayKey) => {
        arr.filter(d => d.timeSlot != null).forEach(d => {
            planAll.push({
                slot: d.timeSlot + offset,
                duration: Math.max(1, d.durationSlots || 4),
                label: d.title ?? d.text ?? '(이름 없음)',
                id: d.id,
                gcal: !!d.gcalEventId,
                day: dayKey,
            });
        });
    };
    pushPlanList(_decisionsYesterday, 0, 'yesterday');
    pushPlanList(_decisions, SLOTS_PER_DAY, 'today');
    pushPlanList(_decisionsTomorrow, SLOTS_PER_DAY * 2, 'tomorrow');

    const actualAll = [];
    const pushActualList = (arr, offset, dayKey) => {
        arr.filter(d => d.timeSlot != null).forEach(d => {
            actualAll.push({
                slot: d.timeSlot + offset,
                duration: Math.max(1, d.durationSlots || 1),
                label: d.actualTask || d.plannedTask || '(아직 비어있어요)',
                dotClass: dotColorClass(d),
                executed: d.executed,
                fromWorkflow: !!d.linkedWorkflowStepId,
                id: d.id,
                day: dayKey,
            });
        });
    };
    pushActualList(_dotsYesterday, 0, 'yesterday');
    pushActualList(_dots, SLOTS_PER_DAY, 'today');
    pushActualList(_dotsTomorrow, SLOTS_PER_DAY * 2, 'tomorrow');

    // ── 시간 라벨·격자선 — 72시간 자리 ─────────────────────
    let timeAxisHtml = '';
    let gridLinesHtml = '';
    for (let absHour = 0; absHour < 72; absHour++) {
        const top = absHour * 4 * rowH;
        const hourInDay = absHour % 24;
        const period = hourInDay < 12 ? '오전' : '오후';
        const displayH = hourInDay === 0 ? 12 : (hourInDay > 12 ? hourInDay - 12 : hourInDay);
        timeAxisHtml += `<div class="utl-mg-time" style="top:${top}px">${period} ${displayH}시</div>`;
    }
    for (let absHour = 0; absHour <= 72; absHour++) {
        const top = absHour * 4 * rowH;
        gridLinesHtml += `<div class="utl-mg-line" style="top:${top}px"></div>`;
    }

    // ── 날짜 구분선 — 각 날짜 시작 자리에 큰 라벨 ─────────
    const dayLabels = ['어제', '오늘', '내일'];
    let dayDividerHtml = '';
    for (let day = 0; day < 3; day++) {
        const top = day * SLOTS_PER_DAY * rowH;
        dayDividerHtml += `<div class="utl-mg-day-divider" style="top:${top}px">
            <span class="utl-mg-day-label">${dayLabels[day]}</span>
        </div>`;
    }

    // ── 현재 시간 라인 — 오늘 자리 안에서만 ─────────────
    let nowLineHtml = '';
    if (isToday(_date)) {
        const now = new Date();
        const nowAbsSlot = SLOTS_PER_DAY + now.getHours() * 4 + now.getMinutes() / 15;
        const nowTop = nowAbsSlot * rowH;
        nowLineHtml = `<div class="utl-mg-now" style="top:${nowTop}px"></div>`;
    }

    // ── 계획 슬롯 ─────────
    // (v113) 오늘 자리 계획 = "×" 톡 삭제 + 하단 모서리 드래그 길이 자리잡힙 (사용자 신고 v112 #5 정합)
    const planSlotsHtml = showPlan ? planAll.map(p => {
        const top = p.slot * rowH;
        const height = Math.max(rowH, p.duration * rowH - 2);
        const decisionAttr = p.id ? `data-decision-id="${escapeHtml(p.id)}"` : '';
        const gcalCls = p.gcal ? ' gcal-source' : '';
        const isTodayPlan = p.day === 'today';
        return `<div class="utl-mg-slot utl-mg-slot-plan${gcalCls} day-${p.day}" style="top:${top}px; height:${height}px" data-slot="${p.slot}" data-day="${p.day}" data-duration="${p.duration}" ${decisionAttr}>
            <span class="utl-mg-slot-label">${escapeHtml(p.label)}</span>
            ${isTodayPlan ? `
                <button type="button" class="utl-mg-del" aria-label="시간표에서 빼기">×</button>
                <span class="utl-mg-resize" aria-hidden="true"></span>
            ` : ''}
        </div>`;
    }).join('') : '';

    // ── 실제 슬롯 (인라인 4상태 + 리사이즈 + "×" 삭제) ─────
    // (v113) "×" 톡 삭제 자리잡힙 — 길게 누름 안내 X 자리 해소. 오늘 자리만 자리잡힙
    const actualSlotsHtml = showActual ? actualAll.map(a => {
        const top = a.slot * rowH;
        const height = Math.max(rowH, a.duration * rowH - 2);
        const fromWf = a.fromWorkflow ? ' from-workflow' : '';
        const evaluatedCls = a.executed ? ' evaluated' : '';
        const showEval = height >= 44;
        const isTodayActual = a.day === 'today';
        return `<div class="utl-mg-slot utl-mg-slot-actual ${a.dotClass || 'dot-gray'}${fromWf}${evaluatedCls} day-${a.day}"
            style="top:${top}px; height:${height}px"
            data-dot-id="${escapeHtml(a.id)}" data-duration="${a.duration}" data-day="${a.day}">
            <span class="utl-mg-slot-label">${escapeHtml(a.label)}</span>
            ${showEval ? `<div class="utl-mg-quick-eval">
                <button type="button" class="utl-mg-eval-btn" data-eval="done" aria-label="잘 했어요">😀</button>
                <button type="button" class="utl-mg-eval-btn" data-eval="partial" aria-label="조금 했어요">🙂</button>
                <button type="button" class="utl-mg-eval-btn" data-eval="replaced" aria-label="다른 걸 했어요">🔄</button>
                <button type="button" class="utl-mg-eval-btn" data-eval="skipped" aria-label="못 했어요">😣</button>
            </div>` : ''}
            ${isTodayActual ? '<button type="button" class="utl-mg-del" aria-label="삭제">×</button>' : ''}
            ${isTodayActual ? '<span class="utl-mg-resize" aria-hidden="true"></span>' : ''}
        </div>`;
    }).join('') : '';

    // ── 헤더: 레이어(계획/통합/기록) + 줌 ──────────────────
    const layerLabel = _mobileLayer === 'plan' ? '계획' : _mobileLayer === 'actual' ? '기록' : '통합';
    const controlsHtml = `
        <div class="utl-mg-controls">
            <div class="utl-mg-layer-status">
                <span class="utl-mg-layer-dot ${_mobileLayer === 'plan' ? 'on' : ''}"></span>
                <span class="utl-mg-layer-dot ${_mobileLayer === 'both' ? 'on' : ''}"></span>
                <span class="utl-mg-layer-dot ${_mobileLayer === 'actual' ? 'on' : ''}"></span>
                <span class="utl-mg-layer-label">${layerLabel}</span>
            </div>
            <div class="utl-mg-zoom">
                <button type="button" class="utl-mg-zoom-btn" data-zoom="out" aria-label="시간축 축소">−</button>
                <span class="utl-mg-zoom-label">${Math.round(_mobileZoom * 100)}%</span>
                <button type="button" class="utl-mg-zoom-btn" data-zoom="in" aria-label="시간축 확대">+</button>
            </div>
        </div>
        <div class="utl-mg-layer-hint">좌우로 슬라이드하면 화면 바꿔 볼 수 있어요</div>
    `;

    list.innerHTML = `
        ${controlsHtml}
        <div class="utl-mg-scroll">
            <div class="utl-mg-container" style="height:${totalHeight}px">
                ${timeAxisHtml}
                ${gridLinesHtml}
                ${dayDividerHtml}
                ${nowLineHtml}
                ${planSlotsHtml}
                ${actualSlotsHtml}
            </div>
        </div>
    `;

    const scrollArea = list.querySelector('.utl-mg-scroll');
    const container = list.querySelector('.utl-mg-container');

    // ── 줌 자리잡힙 ────────────────────────────────────
    list.querySelectorAll('.utl-mg-zoom-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cur = scrollArea.scrollTop;
            const oldH = getMobileRowHeight();
            if (btn.dataset.zoom === 'in') _mobileZoom = Math.min(2, Math.round((_mobileZoom + 0.25) * 100) / 100);
            else _mobileZoom = Math.max(0.5, Math.round((_mobileZoom - 0.25) * 100) / 100);
            saveMobilePrefs();
            // 스크롤 자리 비례 자리잡힙 — 줌 후에도 보던 자리 자연
            const newH = getMobileRowHeight();
            _mobileScrollPos = Math.round(cur * newH / oldH);
            renderMobile();
        });
    });

    // ── 슬라이드 3단 토글 ───────────────────────────────
    bindMobileLayerSwipe(scrollArea);

    // ── 실제 슬롯: 인라인 4상태 + 리사이즈 + 길게 누름 ─────
    list.querySelectorAll('.utl-mg-slot-actual').forEach(card => bindActualSlot(card));

    // ── 계획 슬롯: 길이 드래그 + 길게 누름 삭제 + 톡 평가 (v112)
    list.querySelectorAll('.utl-mg-slot-plan').forEach(card => bindPlanSlot(card));

    // ── 빈 자리 톡 — 레이어 + 날짜 결로 분기 (v114 사용자 신고 #1 자리)
    // 어제(day=0) = 보기만 / 오늘(day=1) = 기록·계획 자리 / 내일(day=2) = 시간표 자리잡힘(평가 X)
    if (container) {
        container.addEventListener('click', (e) => {
            if (e.target.closest('.utl-mg-slot')) return;
            if (e.target.closest('.utl-mg-dropdown')) return;
            const rect = container.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const absSlot = Math.max(0, Math.min(ALL_SLOTS - 1, Math.floor(y / rowH)));
            const day = Math.floor(absSlot / SLOTS_PER_DAY);
            if (day === 0) {
                showToast('어제는 보기만 가능해요');
                return;
            }
            const slotInDay = absSlot - SLOTS_PER_DAY * day;
            if (day === 2) {
                // 내일 자리 = 시간표 자리잡힘 (평가 X). 드롭다운 자리잡힙 — 새 goal 자리잡힌 자리.
                const dateObj = new Date(_date);
                const tom = new Date(dateObj); tom.setDate(tom.getDate() + 1);
                const tomStr = formatDateLocal(tom);
                openMobileDropdown(container, slotInDay, y, rowH, { targetDate: tomStr, asNewGoal: true });
                return;
            }
            // 오늘 자리
            if (_mobileLayer === 'actual') {
                openQuickReview({
                    timeSlot: slotInDay,
                    cells: [], userId: _userId, date: _date,
                    plannedTask: '',
                    existingDot: null,
                });
            } else {
                openMobileDropdown(container, slotInDay, y, rowH, { targetDate: _date, asNewGoal: false });
            }
        });
    }

    // ── 스크롤 자리 복원 — 오늘 자리잡힌 자리에서 시작 (slot 96 + 현재) ─────
    requestAnimationFrame(() => {
        if (_mobileScrollPos > 0) {
            scrollArea.scrollTop = _mobileScrollPos;
        } else if (isToday(_date)) {
            const now = new Date();
            const nowAbsSlot = SLOTS_PER_DAY + now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
            scrollArea.scrollTop = Math.max(0, (nowAbsSlot - 4) * rowH);
        } else {
            // 다른 날짜 = 오늘 자리잡힌 결로 09:00 자리
            scrollArea.scrollTop = Math.max(0, (SLOTS_PER_DAY + 9 * 4) * rowH);
        }
    });
}

// ── 빈 자리 톡 시 자리잡힌 드롭다운 ───────────────────────
// opts: { targetDate, asNewGoal } — 내일 자리잡힌 자리 (asNewGoal=true)면 새 goal 자리잡힙
function openMobileDropdown(container, slot, yPx, rowH, opts = {}) {
    const { targetDate = _date, asNewGoal = false } = opts;
    closeMobileDropdown();
    // 미배치 목표 — 오늘 자리잡힌 자리만 자리잡힙. 내일 자리에는 자리잡혀 X
    const unplaced = asNewGoal ? [] : _decisions.filter(d => d.timeSlot == null);
    const goalsHtml = unplaced.length > 0
        ? unplaced.map(g => {
            const title = g.title ?? g.text ?? '(이름 없음)';
            return `<li class="utl-mg-dd-item" data-goal-id="${escapeHtml(g.id)}">
                <span class="utl-mg-dd-icon">◯</span>
                <span class="utl-mg-dd-text">${escapeHtml(title)}</span>
            </li>`;
        }).join('')
        : '<li class="utl-mg-dd-empty">자리잡힌 목표가 아직 없어요</li>';

    const dropdown = document.createElement('div');
    dropdown.className = 'utl-mg-dropdown';
    dropdown.style.top = `${Math.min(yPx + 4, container.clientHeight - 280)}px`;
    dropdown.innerHTML = `
        <div class="utl-mg-dd-header">
            <span class="utl-mg-dd-time">${mobileSlotToTimeLabel(slot)}</span>
            <button type="button" class="utl-mg-dd-close" aria-label="자리 닫기">✕</button>
        </div>
        <ul class="utl-mg-dd-list">${goalsHtml}</ul>
        <div class="utl-mg-dd-divider"></div>
        <form class="utl-mg-dd-form">
            <input type="text" class="utl-mg-dd-input" placeholder="할 일을 직접 적어 보세요" maxlength="100" autocomplete="off" />
            <button type="submit" class="utl-mg-dd-submit">추가</button>
        </form>
    `;
    container.appendChild(dropdown);
    _activeDropdown = dropdown;

    // 자리잡힌 목표 톡 = 시간표에 넣기
    // 오늘 자리 = placeGoal (기존 미배치 자리잡힙). 내일 자리 = 새 goal 자리잡힙 (saveGoal)
    dropdown.querySelectorAll('.utl-mg-dd-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const goalId = item.dataset.goalId;
            const dek = getDEK();
            if (!dek) return;
            const goal = _decisions.find(d => d.id === goalId);
            if (!goal) {
                showToast('목표를 찾지 못했어요. 새로고침 후 다시 해 주세요.');
                return;
            }
            closeMobileDropdown();
            try {
                await placeGoal(dek, goal, slot, 4);
                showToast('시간표에 넣었어요');
                if (_onChange) _onChange();
                await refreshTimeline({ userId: _userId, date: _date });
            } catch (e) {
                console.error('[placeGoal]', e);
                showToast('잠깐 막혔어요. 다시 해 볼까요?');
            }
        });
    });

    // 직접 입력 자리잡힙 — 오늘 자리 = quickReview 모달 / 내일 자리 = 새 goal 자리잡힙
    const form = dropdown.querySelector('.utl-mg-dd-form');
    const input = dropdown.querySelector('.utl-mg-dd-input');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = input.value.trim();
        if (!text) return;
        closeMobileDropdown();
        if (asNewGoal) {
            // 내일 자리 — 새 goal 자리잡힙 (date=targetDate). 평가 X.
            const dek = getDEK();
            if (!dek) return;
            try {
                await saveGoal(dek, {
                    userId: _userId,
                    userDate: targetDate,
                    title: text,
                    text: text,
                    timeSlot: slot,
                    durationSlots: 4,
                    period: 'daily',
                    placedAt: Date.now(),
                });
                showToast('시간표에 넣었어요');
                if (_onChange) _onChange();
                await refreshTimeline({ userId: _userId, date: _date });
            } catch (err) {
                console.error('[newGoalDirect]', err);
                showToast('잠깐 막혔어요. 다시 해 볼까요?');
            }
        } else {
            // 오늘 자리 — quickReview 모달 자리잡힙
            openQuickReview({
                timeSlot: slot,
                cells: [], userId: _userId, date: _date,
                plannedTask: text,
                existingDot: null,
            });
        }
    });
    input.addEventListener('click', (e) => e.stopPropagation());

    dropdown.querySelector('.utl-mg-dd-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeMobileDropdown();
    });

    setTimeout(() => input.focus(), 50);
    setTimeout(() => document.addEventListener('click', closeMobileDropdownOnOutside), 0);
}

function closeMobileDropdown() {
    if (_activeDropdown) {
        _activeDropdown.remove();
        _activeDropdown = null;
    }
    document.removeEventListener('click', closeMobileDropdownOnOutside);
}

function closeMobileDropdownOnOutside(e) {
    if (!_activeDropdown) return;
    if (!_activeDropdown.contains(e.target)) closeMobileDropdown();
}

// ── 슬라이드 3단 토글 (좌 = 계획만 / 중앙 = 둘 다 / 우 = 실제만) ─────
let _swStartX = null;
let _swStartY = null;
function bindMobileLayerSwipe(el) {
    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        _swStartX = e.touches[0].clientX;
        _swStartY = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
        if (_swStartX == null) return;
        const endX = e.changedTouches[0]?.clientX ?? _swStartX;
        const endY = e.changedTouches[0]?.clientY ?? _swStartY;
        const dx = endX - _swStartX;
        const dy = endY - _swStartY;
        _swStartX = null;
        _swStartY = null;
        if (Math.abs(dy) > Math.abs(dx)) return;
        if (Math.abs(dx) < 80) return;
        // 사용자 결정: 좌 슬라이드 = '계획만' / 우 슬라이드 = '실제만' / 가운데 = 둘 다
        // 자연 자리잡힙: plan ← both ← actual (우 슬라이드는 actual → both → plan 순)
        const order = ['actual', 'both', 'plan']; // 우 슬라이드 방향
        const cur = order.indexOf(_mobileLayer);
        if (dx > 0) {
            _mobileLayer = order[Math.min(2, cur + 1)];
        } else {
            _mobileLayer = order[Math.max(0, cur - 1)];
        }
        saveMobilePrefs();
        renderMobile();
    });
}

// ── 실제 슬롯: 4상태 평가 + 리사이즈 + 길게 누름 모달 ────
// ── 계획 슬롯 바인딩 (v112) ─────────────────────────
// 톡 = 평가 진입, 길게 누름 = 시간표에서 빼기, 핸들 드래그 = 길이 자리잡힘
// 오늘 자리만 자리잡힙. 어제·내일 자리 = 안내 토스트.
function bindPlanSlot(card) {
    const decisionId = card.dataset.decisionId;
    const day = card.dataset.day;
    const absSlot = parseInt(card.dataset.slot ?? '', 10);
    const slotInDay = absSlot - SLOTS_PER_DAY;

    // 어제·내일 자리 = 안내만 (자리잡힘·삭제·드래그 X)
    if (day !== 'today') {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            showToast(day === 'yesterday' ? '어제는 보기만 가능해요' : '내일은 보기만 가능해요');
        });
        return;
    }

    const findDecision = () => {
        let d = decisionId ? _decisions.find(g => g.id === decisionId) : null;
        if (!d && !Number.isNaN(slotInDay)) {
            d = _decisions.find(g => g.timeSlot === slotInDay);
        }
        return d;
    };

    // 리사이즈 핸들 — 길이 드래그 (15분 스냅)
    const handle = card.querySelector('.utl-mg-resize');
    if (handle) {
        let startY = 0, startDur = 0, curDur = 0;

        const onMove = (e) => {
            const rowH = getMobileRowHeight();
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            const dy = y - startY;
            curDur = Math.max(1, startDur + Math.round(dy / rowH));
            card.style.height = `${Math.max(rowH, curDur * rowH - 2)}px`;
        };
        const onEnd = async () => {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            if (curDur === startDur || curDur < 1) return;
            const decision = findDecision();
            if (!decision) return;
            const dek = getDEK();
            if (!dek) return;
            try {
                await saveGoal(dek, { ...decision, durationSlots: curDur }, { skipVersioning: true });
                if (_onChange) _onChange();
                await refreshTimeline({ userId: _userId, date: _date });
            } catch (e) {
                console.error('[planSlot.resize]', e);
                showToast('잠깐 막혔어요. 다시 해 볼까요?');
                await refreshTimeline({ userId: _userId, date: _date });
            }
        };
        handle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            startY = e.touches[0].clientY;
            startDur = parseInt(card.dataset.duration, 10) || 4;
            curDur = startDur;
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd);
        }, { passive: false });
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            startY = e.clientY;
            startDur = parseInt(card.dataset.duration, 10) || 4;
            curDur = startDur;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
        });
    }

    // "×" 톡 = 시간표에서 빼기 (사용자 신고 v112 #5 — 길게 누름 안내 X 자리 해소)
    const delBtn = card.querySelector('.utl-mg-del');
    if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('이 계획을 시간표에서 뺄까요?')) return;
            const decision = findDecision();
            if (!decision) return;
            const dek = getDEK();
            if (!dek) return;
            try {
                await unplaceGoal(dek, decision);
                showToast('시간표에서 뺐어요');
                if (_onChange) _onChange();
                await refreshTimeline({ userId: _userId, date: _date });
            } catch (e) {
                console.error('[planSlot.unplace]', e);
                showToast('잠깐 막혔어요. 다시 해 볼까요?');
            }
        });
    }

    // 톡 = 평가 진입
    card.addEventListener('click', (e) => {
        if (e.target.closest('.utl-mg-resize')) return;
        if (e.target.closest('.utl-mg-del')) return;
        e.stopPropagation();
        const decision = findDecision();
        if (!decision) {
            openQuickReview({
                timeSlot: Number.isNaN(slotInDay) ? null : slotInDay,
                cells: [], userId: _userId, date: _date,
                plannedTask: '',
                existingDot: null,
            });
            return;
        }
        const existing = _dots.find(d => d.timeSlot === decision.timeSlot);
        openQuickReview({
            timeSlot: decision.timeSlot,
            cells: [], userId: _userId, date: _date,
            plannedTask: existing?.plannedTask || decision.title || decision.text || '',
            decisionId: decision.id,
            existingDot: existing || null,
        });
    });
}

function bindActualSlot(card) {
    const dotId = card.dataset.dotId;
    const dot = _dots.find(d => d.id === dotId);
    if (!dot) return;

    // 4상태 빠른 평가 자리
    card.querySelectorAll('.utl-mg-eval-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await quickEvalDot(dot, btn.dataset.eval);
        });
        btn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    });

    // 리사이즈 핸들 — 카드 하단 모서리 드래그 (길이 자리)
    const handle = card.querySelector('.utl-mg-resize');
    if (handle) bindResizeHandle(handle, card, dot);

    // "×" 톡 삭제 (v113) — 사용자 신고 v112 #5 자리 (길게 누름 안내 X 자리 해소)
    const delBtn = card.querySelector('.utl-mg-del');
    if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('삭제할까요?')) return;
            const dek = getDEK();
            if (!dek) return;
            try {
                await deleteDot(dot.id);
                showToast('지웠어요');
                if (_onChange) _onChange();
                await refreshTimeline({ userId: _userId, date: _date });
            } catch (e) {
                console.error('[actualSlot.delete]', e);
                showToast('잠깐 막혔어요. 다시 해 볼까요?');
            }
        });
    }

    // 길게 누름 = 모달 (자세히·삭제)
    let pressTimer = null;
    let didLongPress = false;
    let dragging = false;
    const onPressStart = (e) => {
        if (e.target.closest('.utl-mg-eval-btn') || e.target.closest('.utl-mg-resize') || e.target.closest('.utl-mg-del')) return;
        didLongPress = false;
        dragging = false;
        pressTimer = setTimeout(() => {
            didLongPress = true;
            openQuickReview({
                timeSlot: dot.timeSlot,
                cells: [], userId: _userId, date: _date,
                plannedTask: dot.plannedTask || '',
                existingDot: dot,
            });
        }, 500);
    };
    const onPressEnd = () => clearTimeout(pressTimer);
    const onPressMove = () => { clearTimeout(pressTimer); dragging = true; };
    card.addEventListener('touchstart', onPressStart, { passive: true });
    card.addEventListener('touchend', onPressEnd);
    card.addEventListener('touchcancel', onPressEnd);
    card.addEventListener('touchmove', onPressMove, { passive: true });
    card.addEventListener('click', (e) => {
        if (e.target.closest('.utl-mg-eval-btn') || e.target.closest('.utl-mg-resize') || e.target.closest('.utl-mg-del')) return;
        e.stopPropagation();
        // 짧은 톡 — 4상태 자리잡혀 자연 자리. 추가 동작 X.
        // 만약 4상태 자리잡힘 X (카드 자리 너무 짧음) → 모달 자연 자리잡힙
        if (didLongPress || dragging) return;
        const has4state = !!card.querySelector('.utl-mg-quick-eval');
        if (!has4state) {
            openQuickReview({
                timeSlot: dot.timeSlot,
                cells: [], userId: _userId, date: _date,
                plannedTask: dot.plannedTask || '',
                existingDot: dot,
            });
        }
    });
}

function bindResizeHandle(handle, card, dot) {
    let startY = 0;
    let startDur = 0;
    let curDur = 0;
    const rowH = getMobileRowHeight();

    const onMove = (e) => {
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const dy = y - startY;
        curDur = Math.max(1, startDur + Math.round(dy / rowH));
        card.style.height = `${Math.max(rowH, curDur * rowH - 2)}px`;
    };
    const onEnd = async () => {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        if (curDur === startDur || curDur < 1) return;
        const dek = getDEK();
        if (!dek) return;
        try {
            await saveDot(dek, { ...dot, durationSlots: curDur });
            if (_onChange) _onChange();
            await refreshTimeline({ userId: _userId, date: _date });
        } catch (e) {
            showToast('잠깐 막혔어요. 다시 해 볼까요?');
            await refreshTimeline({ userId: _userId, date: _date }); // 자리 원래대로
        }
    };
    handle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        startY = e.touches[0].clientY;
        startDur = parseInt(card.dataset.duration, 10) || 1;
        curDur = startDur;
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
    }, { passive: false });
    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startY = e.clientY;
        startDur = parseInt(card.dataset.duration, 10) || 1;
        curDur = startDur;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    });
}

// 인라인 4상태 빠른 평가 자리 — 한 톡에 자리잡힙
async function quickEvalDot(dot, evalKey) {
    const dek = getDEK();
    if (!dek) return;
    const MAP = {
        done:     { executed: 'done',     sat: 5 },
        partial:  { executed: 'partial',  sat: 3 },
        replaced: { executed: 'replaced', sat: 3 },
        skipped:  { executed: 'skipped',  sat: 1 },
    };
    const m = MAP[evalKey];
    if (!m) return;
    try {
        await saveDot(dek, {
            ...dot,
            executed: m.executed,
            executionSatisfaction: m.sat,
        });
        if (_onChange) _onChange();
        await refreshTimeline({ userId: _userId, date: _date });
    } catch (e) {
        showToast('잠깐 막혔어요. 다시 해 볼까요?');
    }
}

// ─── 슬롯 컴포넌트 ───
// (v115) day 인자 자리잡힙 — 어제·내일 자리 = 흐릿 + 자리잡힘·드래그 X
function createPlanSlot(decision, source, dayKey = 'today') {
    const el = document.createElement('div');
    const gcalCls = decision.gcalEventId ? ' gcal-source' : '';
    const dayCls = ` day-${dayKey}`;
    el.className = `utl-slot ${dotColorClassForDecision(decision)}${gcalCls}${dayCls}`;
    el.dataset.decisionId = decision.id;
    el.dataset.source = source;
    el.dataset.day = dayKey;
    if (decision.gcalEventId) el.dataset.gcalId = decision.gcalEventId;
    el.draggable = (dayKey === 'today'); // 오늘 자리만 드래그
    const dur = decision.durationSlots || 4;
    const endSlot = (decision.timeSlot || 0) + dur;
    const titleText = decision.title ?? decision.text ?? '(아직 이름이 없어요)';
    const titleDisplay = decision.gcalEventId ? `📅 ${titleText}` : titleText;
    const interactive = dayKey === 'today';
    el.innerHTML = `
        ${interactive ? '<button class="slot-delete" type="button" title="시간표에서 빼기" aria-label="시간표에서 빼기">×</button>' : ''}
        <span class="slot-time">${slotToTime(decision.timeSlot)}~${slotToTime(endSlot)}</span>
        <span class="slot-title">${escapeHtml(titleDisplay)}</span>
        ${interactive ? `<span class="slot-resize" data-decision-id="${decision.id}" title="아래로 끌어 시간 늘리기"></span>` : ''}
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

// (v115) day 인자 + 인라인 4상태 평가 자리잡힙
function createActualSlot(dot, dayKey = 'today') {
    const el = document.createElement('div');
    const fromWf = dot.linkedWorkflowStepId ? ' from-workflow' : '';
    const evaluatedCls = dot.executed ? ' evaluated' : '';
    el.className = `utl-slot ${dotColorClass(dot)}${fromWf}${evaluatedCls} day-${dayKey}`;
    el.dataset.dotId = dot.id;
    el.dataset.day = dayKey;
    const dur = dot.durationSlots || 1;
    const endSlot = dot.timeSlot + dur;
    const timeLabel = dur > 1
        ? `${slotToTime(dot.timeSlot)}~${slotToTime(endSlot)}`
        : slotToTime(dot.timeSlot);
    const interactive = dayKey === 'today';
    const showEval = interactive && (dur * getDesktopRowHeight()) >= 56; // 너무 짧으면 4상태 자리잡힘 X
    el.innerHTML = `
        ${interactive ? '<button class="slot-delete" type="button" title="이 기록 지우기" aria-label="이 기록 지우기">×</button>' : ''}
        <span class="slot-time">${timeLabel}</span>
        <span class="slot-title">${escapeHtml(dot.actualTask || dot.plannedTask || '(아직 평가 전이에요)')}</span>
        ${showEval ? `<div class="slot-quick-eval">
            <button type="button" class="slot-eval-btn" data-eval="done" title="잘 했어요">😀</button>
            <button type="button" class="slot-eval-btn" data-eval="partial" title="조금 했어요">🙂</button>
            <button type="button" class="slot-eval-btn" data-eval="replaced" title="다른 걸 했어요">🔄</button>
            <button type="button" class="slot-eval-btn" data-eval="skipped" title="못 했어요">😣</button>
        </div>` : ''}
        ${interactive ? `<span class="slot-resize actual-resize" data-dot-id="${dot.id}" title="아래로 끌어 시간 늘리기"></span>` : ''}
    `;
    return el;
}

// (v115) rowH 인자 자리잡힙 — 데스크탑 줌 결로 자리잡힐 자리. 자리잡혀 X면 ROW_HEIGHT default.
function positionSlot(el, slot, duration, rowH = ROW_HEIGHT) {
    el.style.top = `${slot * rowH}px`;
    el.style.height = `${Math.max(1, duration) * rowH - 2}px`;
}

// ─── 자동 스크롤 (드래그/리사이즈 중 화면 가장자리 시 스크롤) ───
// 마우스가 viewport 상하단 60px 안에 들어오면 그 거리에 비례해서 window를 스크롤.
let _autoScrollDir = 0;     // -1=위, 0=정지, 1=아래
let _autoScrollRAF = null;
const SCROLL_EDGE_PX = 60;
const SCROLL_MAX_SPEED = 14;  // 한 프레임 최대 픽셀

function updateAutoScrollFromEvent(e) {
    const vh = window.innerHeight;
    if (e.clientY < SCROLL_EDGE_PX) {
        const ratio = (SCROLL_EDGE_PX - e.clientY) / SCROLL_EDGE_PX;
        _autoScrollDir = -Math.min(SCROLL_MAX_SPEED, Math.max(2, ratio * SCROLL_MAX_SPEED));
    } else if (e.clientY > vh - SCROLL_EDGE_PX) {
        const ratio = (e.clientY - (vh - SCROLL_EDGE_PX)) / SCROLL_EDGE_PX;
        _autoScrollDir = Math.min(SCROLL_MAX_SPEED, Math.max(2, ratio * SCROLL_MAX_SPEED));
    } else {
        _autoScrollDir = 0;
    }
}
function startAutoScroll() {
    if (_autoScrollRAF) return;
    const step = () => {
        if (_autoScrollDir !== 0) {
            // window.scrollBy는 main 컨테이너가 스크롤 가능한 경우에도 동작.
            // body/html이 안 되면 가장 가까운 스크롤 부모를 찾아 fallback.
            const before = window.scrollY;
            window.scrollBy(0, _autoScrollDir);
            if (window.scrollY === before) {
                // window가 안 스크롤된다 — main-content가 자체 스크롤일 수 있음
                const main = document.getElementById('main-content');
                if (main) main.scrollTop += _autoScrollDir;
            }
        }
        _autoScrollRAF = requestAnimationFrame(step);
    };
    _autoScrollRAF = requestAnimationFrame(step);
}
function stopAutoScroll() {
    if (_autoScrollRAF) cancelAnimationFrame(_autoScrollRAF);
    _autoScrollRAF = null;
    _autoScrollDir = 0;
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

// ─── 셀 이벤트 (drop, mousedown-drag, click) ───
function bindCellEvents(col, lane) {
    col.querySelectorAll('.utl-cell').forEach(cell => {
        // 드래그 인 - 결단 카드 / 워크플로우 스텝을 받기 (plan 레인만)
        cell.addEventListener('dragover', (e) => {
            if (lane !== 'plan') return;
            const types = e.dataTransfer.types;
            if (!types.includes('application/x-sanctum-decision') &&
                !types.includes('application/x-sanctum-slot') &&
                !types.includes('application/x-sanctum-workflow-step')) return;
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
            const workflowStepRaw = e.dataTransfer.getData('application/x-sanctum-workflow-step');

            const dek = getDEK();
            if (!dek) { showToast('잠시 잠겨 있어요. 비밀번호로 열어 주실래요?'); return; }

            try {
                if (workflowStepRaw) {
                    // 워크플로우 스텝 드롭 — 도트 즉시 생성 (워크플로우 트랙 STEP 2)
                    let payload = null;
                    try { payload = JSON.parse(workflowStepRaw); } catch {}
                    if (payload?.workflowId && payload?.stepId) {
                        const { createDotFromStep } = await import('./workflows.js');
                        await createDotFromStep({
                            workflowId: payload.workflowId,
                            stepId: payload.stepId,
                            parentGoalId: payload.parentGoalId || null,
                            slot,
                            date: _date
                        });
                        // createDotFromStep 내부에서 onDotCreated 콜백으로 timeline 갱신됨.
                        // 추가로 refresh 한 번 더 → 동기화 안정성.
                        await refreshTimeline({ userId: _userId, date: _date });
                        if (_onChange) await _onChange({ type: 'refresh' });
                        return;
                    }
                }
                if (decisionId) {
                    let d = _decisions.find(x => x.id === decisionId);
                    if (!d) {
                        const all = await getDailyGoals(dek, _userId);
                        d = all.find(x => x.id === decisionId);
                    }
                    if (d) {
                        await placeGoal(dek, d, slot, d.durationSlots || 4);
                    } else {
                        showToast('이 목표를 찾지 못했어요. 한 번만 더 옮겨 주실래요?');
                    }
                } else if (slotMoveId) {
                    let d = _decisions.find(x => x.id === slotMoveId);
                    if (!d) {
                        const all = await getDailyGoals(dek, _userId);
                        d = all.find(x => x.id === slotMoveId);
                    }
                    if (d) await placeGoal(dek, d, slot, d.durationSlots || 4);
                }
                await refreshTimeline({ userId: _userId, date: _date });
                if (_onChange) await _onChange({ type: 'refresh' });
            } catch (err) {
                console.error('drop failed:', err);
                showToast('옮기는 중에 잠깐 막혔어요. 한 번만 더 시도해 주실래요?');
            }
        });

        // actual 레인 빈 셀: mousedown → 드래그로 시간 범위 선택 → 인라인 입력
        cell.addEventListener('mousedown', (e) => {
            if (lane !== 'actual') return;
            if (e.button !== 0) return;
            if (e.target.closest('.utl-slot')) return;
            e.preventDefault();
            const slot = parseInt(cell.dataset.slot);
            startActualCreateDrag(col, cell, slot);
        });

        // (v115) plan 레인 빈 셀 click → 드롭다운 (모바일 결 정합) — 오늘 자리만
        cell.addEventListener('click', (e) => {
            if (lane !== 'plan') return;
            if (e.target.closest('.utl-slot')) return;
            const day = cell.dataset.day;
            if (day === 'yesterday') {
                showToast('어제는 보기만 가능해요');
                return;
            }
            const slot = parseInt(cell.dataset.slot);
            if (day === 'tomorrow') {
                const dateObj = new Date(_date);
                const tom = new Date(dateObj); tom.setDate(tom.getDate() + 1);
                const tomStr = formatDateLocal(tom);
                openDesktopDropdown(cell, slot, { targetDate: tomStr, asNewGoal: true });
            } else {
                openDesktopDropdown(cell, slot, { targetDate: _date, asNewGoal: false });
            }
        });
    });

    // 슬롯 자체 — 클릭/리사이즈/삭제/드래그-이동
    col.querySelectorAll('.utl-slot').forEach(slot => {
        // 본문 드래그 시작 (시간 이동) — plan 레인의 결단 슬롯만
        slot.addEventListener('dragstart', (e) => {
            const did = slot.dataset.decisionId;
            if (!did) { e.preventDefault(); return; }
            e.dataTransfer.setData('application/x-sanctum-slot', did);
            e.dataTransfer.effectAllowed = 'move';
            slot.classList.add('dragging');
        });
        slot.addEventListener('dragend', () => {
            slot.classList.remove('dragging');
        });

        // (v115) 인라인 4상태 평가 버튼 — actual 슬롯 자리잡힙
        slot.querySelectorAll('.slot-eval-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const dotId = slot.dataset.dotId;
                const dot = _dots.find(x => x.id === dotId);
                if (!dot) return;
                await quickEvalDot(dot, btn.dataset.eval);
            });
        });

        slot.addEventListener('click', (e) => {
            // 리사이즈 핸들 / 삭제 버튼 / 4상태 버튼 클릭은 자체 핸들러가 처리
            if (e.target.closest('.slot-resize')) return;
            if (e.target.closest('.slot-delete')) return;
            if (e.target.closest('.slot-eval-btn')) return;

            const decisionId = slot.dataset.decisionId;
            const dotId = slot.dataset.dotId;
            const gcalId = slot.dataset.gcalId;

            // 계획 레인(결단/캘린더)에선 평가 모달을 띄우지 않음.
            // 평가는 실제 레인의 도트에 대해서만.
            if (decisionId) {
                showToast('평가는 아래 [실제] 레인에서 해 주세요. 계획은 의도를 적는 곳이에요.');
            } else if (gcalId) {
                showToast('이 일정에 대한 평가는 [실제] 레인에서 같은 시간에 도트를 만들어 해 주세요.');
            } else if (dotId) {
                const dot = _dots.find(x => x.id === dotId);
                if (dot) openEvalForDot(dot);
            }
        });

        // 가장자리 리사이즈 — 결단/도트 둘 다 지원
        const resizeHandle = slot.querySelector('.slot-resize');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const decisionId = resizeHandle.dataset.decisionId;
                const dotId = resizeHandle.dataset.dotId;
                if (decisionId) startResize('decision', decisionId, e.clientY, slot);
                else if (dotId)  startResize('dot', dotId, e.clientY, slot);
            });
        }

        // X 버튼 — 계획=시간표에서 빼기(unplace), 실제=완전 삭제
        const deleteBtn = slot.querySelector('.slot-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const decisionId = slot.dataset.decisionId;
                const dotId = slot.dataset.dotId;
                const dek = getDEK();
                if (!dek) { showToast('잠시 잠겨 있어요.'); return; }
                try {
                    if (decisionId) {
                        const d = _decisions.find(x => x.id === decisionId);
                        if (!d) return;
                        await unplaceGoal(dek, d);
                        showToast('시간표에서 빼냈어요. 목표 카드로 다시 돌아갔어요.');
                    } else if (dotId) {
                        if (!confirm('이 시간 기록을 지울까요?')) return;
                        await deleteDot(dotId);
                    } else {
                        return;
                    }
                    await refreshTimeline({ userId: _userId, date: _date });
                    if (_onChange) await _onChange({ type: 'refresh' });
                } catch (err) {
                    console.error('slot delete failed:', err);
                    showToast('지우는 중에 잠깐 막혔어요.');
                }
            });
        }
    });
}

// ─── 실제 레인 드래그-생성 ───
// 빈 actual 셀에서 mousedown → mousemove로 길이 늘림 → mouseup → 인라인 입력 → 저장 → 평가 모달
function startActualCreateDrag(col, _startCell, startSlot) {
    closeAllInlinePanels(); // 새 드래그 시작 시 기존 인라인 패널 정리
    let endSlot = startSlot;

    const ghost = document.createElement('div');
    ghost.className = 'utl-slot utl-ghost';
    ghost.innerHTML = `<span class="slot-time">${slotToTime(startSlot)}</span>`;
    positionSlot(ghost, startSlot, 1);
    col.appendChild(ghost);

    const updateGhost = () => {
        const min = Math.min(startSlot, endSlot);
        const max = Math.max(startSlot, endSlot);
        const duration = max - min + 1;
        positionSlot(ghost, min, duration);
        const timeEl = ghost.querySelector('.slot-time');
        if (timeEl) {
            timeEl.textContent = duration > 1
                ? `${slotToTime(min)}~${slotToTime(min + duration)} (${duration * 15}분)`
                : slotToTime(min);
        }
    };

    startAutoScroll();

    const onMove = (ev) => {
        updateAutoScrollFromEvent(ev);
        // ghost는 pointer-events:none 이므로 hit-test에 안 잡힘 (CSS 참조).
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetCell = target?.closest('.utl-cell[data-lane="actual"]');
        if (!targetCell) return;
        endSlot = parseInt(targetCell.dataset.slot);
        updateGhost();
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        stopAutoScroll();
        ghost.remove();
        const min = Math.min(startSlot, endSlot);
        const max = Math.max(startSlot, endSlot);
        const duration = max - min + 1;
        openInlineActualInput(col, min, duration);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ─── 평가 모달 진입점 ───
// 사용자 정책: "계획에 평가는 일어날 수 없다" — 결단/캘린더 슬롯 클릭은 평가 모달 안 띄움.
// 도트(실제 레인)만 평가 가능.
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

// ─── 인라인 평가 패널 (옵션 A) ───
// 빈 셀에서 드래그하면 그 범위 전체에 펼쳐진 인라인 패널이 뜬다.
// [텍스트] 😀 🙂 🔄 😣 [저장] 한 줄.
//  - 텍스트만 적고 [저장] → 기본 'done', 만족도 3 으로 도트 저장
//  - 4개 상태 버튼 중 하나 클릭 → 그 상태로 즉시 저장
//  - 평가 모달 자동 오픈은 하지 않음 (자세한 평가는 도트 슬롯 클릭 시)
//  - 외부 클릭 / ESC → 닫기. 새 드래그 시작 시 자동 정리.
const STATUS_BUTTONS = [
    { key: 'done',     emoji: '😀', label: '잘 했어요',     sat: 4 },
    { key: 'partial',  emoji: '🙂', label: '조금 했어요',   sat: 3 },
    { key: 'replaced', emoji: '🔄', label: '다른 걸 했어요', sat: 3 },
    { key: 'skipped',  emoji: '😣', label: '못 했어요',     sat: 1 },
];

function closeAllInlinePanels() {
    document.querySelectorAll('.utl-inline-panel').forEach(el => el.remove());
}

function openInlineActualInput(col, slot, duration = 1) {
    if (!col) return;
    // 누적 방지: 기존 인라인 패널은 모두 정리
    closeAllInlinePanels();

    const endSlot = slot + duration;
    const timeLabel = duration > 1
        ? `${slotToTime(slot)}~${slotToTime(endSlot)} · ${duration * 15}분`
        : slotToTime(slot);

    // 드래그 범위 전체에 펼쳐진 패널을 actualCol 위에 absolute로 띄움
    const panel = document.createElement('div');
    panel.className = 'utl-inline-panel';
    panel.style.top = `${slot * ROW_HEIGHT}px`;
    panel.style.height = `${Math.max(2, duration) * ROW_HEIGHT - 2}px`;
    panel.innerHTML = `
        <div class="utl-inline-row">
            <span class="utl-inline-time">${timeLabel}</span>
            <input type="text" class="utl-inline-text" placeholder="이 시간에 뭐 했어요?" autocomplete="off" />
            <div class="utl-inline-status" role="group" aria-label="상태">
                ${STATUS_BUTTONS.map(b => `
                    <button type="button" class="utl-inline-status-btn" data-status="${b.key}" data-sat="${b.sat}" title="${b.label}">${b.emoji}</button>
                `).join('')}
            </div>
            <button type="button" class="utl-inline-save">저장</button>
        </div>
    `;
    col.appendChild(panel);

    const input = panel.querySelector('.utl-inline-text');
    input.focus();

    let _saved = false;
    const saveWith = async (status, sat) => {
        if (_saved) return;
        // 텍스트 없이도 이모지만 누르면 저장 OK — 빠르게 도트 한 칸 찍는 흐름 허용.
        // 텍스트 빈 도트는 화면에서 '(이름 없는 시간)' 으로 표시되고 나중에 도트 다시 클릭하면
        // 모달에서 채울 수 있음.
        const text = input.value.trim();
        _saved = true;
        const dek = getDEK();
        if (!dek) { showToast('잠시 잠겨 있어요. 비밀번호로 열어 주실래요?'); _saved = false; return; }
        try {
            // Phase E-1: 같은 시간대에 daily 목표가 박혀 있으면 자동 연결 + plannedTask 도 그 목표 텍스트로.
            const linkedGoal = findGoalCoveringSlot(slot);
            const dot = {
                userId: _userId,
                date: _date,
                timeSlot: slot,
                durationSlots: duration,
                executed: status,
                executionSatisfaction: sat,
                outcomeSatisfaction: sat,
                actualTask: text,
                plannedTask: (linkedGoal?.title || linkedGoal?.text || ''),
                linkedGoalId: linkedGoal?.id || null,
                reason: '',
                labelIds: [],
                // 정직성 인프라: 타임라인 인라인에서 사용자가 직접 찍은 도트.
                source: 'self_report',
            };
            await saveDot(dek, dot);
            panel.remove();
            // Optimistic — 같은 id의 기존 도트 교체 후 즉시 렌더.
            _dots = _dots.filter(d => d.id !== dot.id);
            _dots.push(dot);
            render();
            refreshTimeline({ userId: _userId, date: _date }).catch(e =>
                console.warn('post-save refresh failed:', e)
            );
            showToast('🔐 보관했어요. 자세히 평가하려면 도트를 다시 눌러 주세요.');
        } catch (e) {
            console.error('actual save failed:', e);
            showToast('저장이 잠깐 막혔어요. 한 번만 더 시도해 주실래요?');
            _saved = false;
        }
    };

    // 상태 버튼 클릭 → 그 상태로 저장
    panel.querySelectorAll('.utl-inline-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const status = btn.dataset.status;
            const sat = parseInt(btn.dataset.sat);
            saveWith(status, sat);
        });
    });

    // 기본 저장 = 'done', sat=3 (보통)
    panel.querySelector('.utl-inline-save').addEventListener('click', () => saveWith('done', 3));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveWith('done', 3); }
        if (e.key === 'Escape') { e.preventDefault(); panel.remove(); }
    });

    // 외부 클릭 시 닫기 — 패널 바깥을 누르면 정리. 단 자기 자신 안 클릭은 무시.
    // panel이 외부 경로(ESC/저장/closeAllInlinePanels)로 사라져도 다음 클릭에서 자동 정리.
    const onOutside = (ev) => {
        if (!panel.isConnected) {
            document.removeEventListener('mousedown', onOutside, true);
            return;
        }
        if (!panel.contains(ev.target)) {
            panel.remove();
            document.removeEventListener('mousedown', onOutside, true);
        }
    };
    // mousedown 캡처 단계로 잡아야 다른 핸들러보다 먼저 동작
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
}

// ─── 슬롯 리사이즈 (가장자리 드래그로 15분 단위 길이 조절) ───
// kind: 'decision' | 'dot'. 둘 다 같은 인터랙션이지만 저장 대상이 다름.
function startResize(kind, id, startY, slotEl) {
    let item = null;
    if (kind === 'decision') item = _decisions.find(x => x.id === id);
    else if (kind === 'dot')  item = _dots.find(x => x.id === id);
    if (!item) return;
    const startDuration = item.durationSlots || (kind === 'dot' ? 1 : 4);
    const startSlot = item.timeSlot || 0;
    slotEl.classList.add('resizing');
    startAutoScroll();

    const onMove = (e) => {
        updateAutoScrollFromEvent(e);
        const dy = e.clientY - startY;
        const dSlots = Math.round(dy / ROW_HEIGHT);
        const newDuration = Math.max(1, Math.min(SLOTS_PER_DAY - startSlot, startDuration + dSlots));
        slotEl.style.height = `${newDuration * ROW_HEIGHT - 2}px`;
        slotEl.dataset.tempDuration = String(newDuration);
        const titleEl = slotEl.querySelector('.slot-time');
        if (titleEl) {
            titleEl.textContent = `${slotToTime(startSlot)}~${slotToTime(startSlot + newDuration)} (${newDuration * 15}분)`;
        }
    };
    const onUp = async () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        stopAutoScroll();
        slotEl.classList.remove('resizing');
        const newDuration = parseInt(slotEl.dataset.tempDuration || '0');
        if (newDuration > 0 && newDuration !== startDuration) {
            item.durationSlots = newDuration;
            const dek = getDEK();
            if (!dek) return;
            if (kind === 'decision') {
                // 'decision' kind 는 daily 목표를 가리킴 (변수명만 호환 유지)
                await saveGoal(dek, item);
            } else {
                await saveDot(dek, item);
            }
            await refreshTimeline({ userId: _userId, date: _date });
            if (_onChange) await _onChange({ type: 'refresh' });
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
        showToast('일정을 새로 가져왔어요');
    });
    const push = document.getElementById('gcal-push-btn');
    if (push) push.addEventListener('click', async () => {
        // (2026-05-13 #39) in-flight 락 — 중복 클릭/핸들러 누적으로 일정 2개씩 생기는 회귀 차단
        if (push.dataset.inFlight === '1') return;
        push.dataset.inFlight = '1';
        const placed = _decisions.filter(d => d.timeSlot != null);
        if (placed.length === 0) {
            showToast('시간표에 옮겨둔 목표가 아직 없어요. 목표 카드의 ⋮⋮를 잡고 시간표로 옮겨 보실래요?');
            push.dataset.inFlight = '';
            return;
        }
        // 같은 목표가 _decisions 안에 중복 들어있는 경우(레이스/캐시 갱신) 안전 디듀프
        const seen = new Set();
        const unique = placed.filter(d => {
            const k = d.id || `${d.title}@${d.timeSlot}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        push.disabled = true;
        const orig = push.textContent;
        push.textContent = '📤 캘린더에 옮기는 중...';
        // 무한 진행 보호 — 30초 후 강제 복원
        const safetyTimer = setTimeout(() => {
            push.disabled = false;
            push.textContent = orig;
            push.dataset.inFlight = '';
        }, 30000);
        try {
            const r = await pushDecisionsToGoogleCalendar(unique);
            if (r.reason === 'no-token') {
                showToast('Google 계정과 먼저 연결해 주실래요?');
            } else {
                const parts = [];
                if (r.created) parts.push(`새로 ${r.created}개`);
                if (r.updated) parts.push(`갱신 ${r.updated}개`);
                if (r.failed) parts.push(`못 옮긴 항목 ${r.failed}개`);
                showToast(parts.length ? `📤 ${parts.join(', ')} 옮겼어요` : '새로 옮길 변경 사항이 없었어요');
                await refreshTimeline({ userId: _userId, date: _date });
            }
        } catch (e) {
            console.error('gcal push error:', e);
            showToast('옮기는 중에 잠깐 막혔어요. 한 번만 더 시도해 주실래요?');
        } finally {
            clearTimeout(safetyTimer);
            push.disabled = false;
            push.textContent = orig;
            push.dataset.inFlight = '';
        }
    });
}

// (B-4 정리) 외부 dead export unplaceDecisionFromTimeline 제거.
// 시간표 plan 슬롯의 X 버튼이 unplaceGoal 을 직접 호출.

// ─── Phase E-1: 도트 ↔ daily 목표 자동 연결 ───
// actual 슬롯이 어떤 daily 목표 범위 안에 들어있다면 그 목표를 반환.
// 같은 시간대를 여러 목표가 덮으면 가장 먼저 매치된 것 사용 (실무상 거의 안 겹침).
function findGoalCoveringSlot(slot) {
    return _decisions.find(g => {
        if (g.timeSlot == null) return false;
        const start = g.timeSlot;
        const end = start + (g.durationSlots || 4);
        return slot >= start && slot < end;
    }) || null;
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
