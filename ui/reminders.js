/**
 * reminders.js — 우측 상단 알람 종 아이콘 + dropdown 패널 (Phase E-7/D-3)
 *
 * 책임:
 * - 종 아이콘 빨간 뱃지 (미읽음 카운트)
 * - 패널 열고 닫기, 알람 리스트 렌더, 체크박스 [읽음] 처리
 * - 수동 메모 추가 입력
 * - 알람 클릭 시 targetView 로 라우팅 (today/reports)
 *
 * 외부에서 호출:
 *   initRemindersUI(userId)  — 잠금 해제 후 1회 호출 (이벤트 바인딩 + 첫 로드)
 *   refreshRemindersUI()     — 새 알람 만들어진 후 호출 (뱃지·리스트 갱신)
 */

import { getDEK } from './lockScreen.js';
import { showToast } from './quickReview.js';
import {
    listReminders, saveReminder, markReminderRead, deleteReminder, countUnreadReminders,
} from '../data/remindersRepo.js';

let _userId = null;
let _bound = false;

const TYPE_LABEL = {
    'weekly-review':     '토 주간 회고',
    'yesterday-unrated': '어제 평가',
    'stale-goal':        '묵힌 목표',
    'principle-unused':  '핀 원칙',
    'manual':            '메모',
};

const TYPE_ICON = {
    'weekly-review':     'calendar-check',
    'yesterday-unrated': 'check-square',
    'stale-goal':        'archive',
    'principle-unused':  'pin',
    'manual':            'pencil',
};

/**
 * 초기화 — 잠금 해제 후 한 번 호출.
 * 패널을 보이게 하고 이벤트 바인딩, 첫 데이터 로드.
 */
export async function initRemindersUI(userId) {
    _userId = userId;
    const wrap = document.getElementById('reminder-bell-wrap');
    if (wrap) wrap.classList.remove('hidden');

    if (!_bound) bindEvents();
    _bound = true;

    await refreshRemindersUI();
}

/**
 * 외부에서 호출 — 새 알람이 만들어진 후 뱃지·리스트 갱신.
 */
export async function refreshRemindersUI() {
    if (!_userId) return;
    const dek = getDEK();
    if (!dek) return;

    try {
        const [unread, items] = await Promise.all([
            countUnreadReminders(dek, _userId),
            listReminders(dek, _userId, 50),
        ]);
        renderBadge(unread);
        renderList(items);
        if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();
    } catch (e) {
        console.warn('[reminders] refresh failed:', e);
    }
}

function bindEvents() {
    const btn   = document.getElementById('reminder-bell-btn');
    const panel = document.getElementById('reminder-panel');
    const close = document.getElementById('reminder-close-btn');
    const addBtn = document.getElementById('reminder-manual-add-btn');
    const addInput = document.getElementById('reminder-manual-text');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        panel?.classList.toggle('hidden');
    });
    close?.addEventListener('click', () => panel?.classList.add('hidden'));

    // 패널 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (!panel || panel.classList.contains('hidden')) return;
        if (panel.contains(e.target) || btn?.contains(e.target)) return;
        panel.classList.add('hidden');
    });

    // 수동 메모 추가
    addBtn?.addEventListener('click', () => addManualReminder(addInput));
    addInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addManualReminder(addInput);
    });
}

async function addManualReminder(inputEl) {
    if (!inputEl) return;
    const text = (inputEl.value || '').trim();
    if (!text) return;
    const dek = getDEK();
    if (!dek || !_userId) return;

    try {
        await saveReminder(dek, {
            userId:     _userId,
            type:       'manual',
            title:      text,
            targetView: null,
            read:       false,
        });
        inputEl.value = '';
        await refreshRemindersUI();
    } catch (e) {
        console.error('[reminders] manual add failed:', e);
        showToast('메모 저장이 잠깐 막혔어요');
    }
}

function renderBadge(count) {
    const badge = document.getElementById('reminder-bell-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderList(items) {
    const ul = document.getElementById('reminder-list');
    if (!ul) return;

    if (!items || items.length === 0) {
        ul.innerHTML = `<li class="reminder-empty">아직 알람이 없어요.</li>`;
        return;
    }

    ul.innerHTML = items.map(r => {
        const label = TYPE_LABEL[r.type] || r.type;
        const icon  = TYPE_ICON[r.type]  || 'bell';
        const readCls = r.read ? ' reminder-read' : '';
        return `
            <li class="reminder-item${readCls}" data-id="${escapeAttr(r.id)}" data-target="${escapeAttr(r.targetView || '')}">
                <label class="reminder-check">
                    <input type="checkbox" ${r.read ? 'checked' : ''} data-action="toggle-read" />
                </label>
                <div class="reminder-body">
                    <div class="reminder-type"><i data-lucide="${icon}" class="reminder-type-icon"></i> ${escapeHtml(label)}</div>
                    <div class="reminder-title">${escapeHtml(r.title || '')}</div>
                    ${r.body ? `<div class="reminder-text">${escapeHtml(r.body)}</div>` : ''}
                </div>
                <div class="reminder-actions">
                    ${r.targetView ? `<button class="reminder-go-btn" data-action="go" title="해당 화면으로 이동">→</button>` : ''}
                    <button class="reminder-delete-btn" data-action="delete" title="삭제">×</button>
                </div>
            </li>
        `;
    }).join('');

    // 액션 바인딩
    ul.querySelectorAll('.reminder-item').forEach(li => {
        const id = li.dataset.id;
        const target = li.dataset.target;

        li.querySelector('input[data-action="toggle-read"]')?.addEventListener('change', async (e) => {
            if (e.target.checked) {
                await markReminderRead(getDEK(), id);
                await refreshRemindersUI();
            }
            // 체크 해제는 일단 안 다룸 (간단 모델). 다시 안 읽음 처리 X.
        });

        li.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteReminder(id);
            await refreshRemindersUI();
        });

        li.querySelector('[data-action="go"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToTarget(target);
        });
    });
}

function navigateToTarget(targetView) {
    if (!targetView) return;
    // 기존 사이드바 네비게이션 이벤트 재사용
    const navMap = {
        today: 'nav-today',
        reports: 'nav-reports',
        persons: 'nav-persons',
        organizations: 'nav-organizations',
    };
    const btnId = navMap[targetView];
    if (btnId) document.getElementById(btnId)?.click();
    document.getElementById('reminder-panel')?.classList.add('hidden');
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, '&#96;');
}
