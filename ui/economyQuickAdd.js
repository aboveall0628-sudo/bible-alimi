/**
 * economyQuickAdd.js — 빠른 거래 입력 모달.
 *
 * 도트 평가 모달의 "💰" 칩, "오늘" 화면의 빠른 추가, 경제 메인 뷰의 [+ 새 거래]
 * 세 군데에서 모두 호출.
 *
 * 사용:
 *   openQuickAdd({
 *       userId,
 *       date: 'YYYY-MM-DD',        // 기본: 오늘
 *       accounts: [...],            // 옵션. 없으면 모달에서 한 번 load
 *       linkedDotId: 'dot_xxx',     // 옵션 — 도트 평가에서 호출 시
 *       linkedPersonIds: [...],     // 옵션
 *       linkedOrgIds: [...],        // 옵션
 *       onSaved: (tx) => void
 *   });
 *
 * 영적 안전장치:
 *   - amountBucket(4버튼) 이 디폴트, exactAmount 는 토글로만 입력
 *   - 헌금·기부 카테고리는 별도 영적 톤 안내
 *   - 거액 거래(100만+) 시 "잠깐 묵상" 안내 (강제 시간 제한 X — 옵션)
 */

import { getDEK } from './lockScreen.js';
import { showToast } from './quickReview.js';
import { openModal } from './modalManager.js';
import { saveTransaction, getAllAccounts } from '../data/economyRepo.js';
import {
    AMOUNT_BUCKETS, INCOME_CATEGORIES, EXPENSE_CATEGORIES, EXPENSE_TYPES,
    isGivingCategory, amountToBucket,
} from '../config/economyBuckets.js';

const OVERLAY_ID = 'economy-quickadd-overlay';

export async function openQuickAdd(opts = {}) {
    const {
        userId,
        date,
        accounts: providedAccounts,
        linkedDotId = null,
        linkedPersonIds = [],
        linkedOrgIds = [],
        onSaved,
    } = opts;

    if (!userId) { showToast('사용자 정보가 없어요.'); return; }
    const dek = getDEK();
    if (!dek) { showToast('잠겨 있어요. 비밀번호로 먼저 열어 주실래요?'); return; }

    const today = date || new Date().toISOString().slice(0, 10);
    let accounts = providedAccounts;
    if (!accounts) {
        try { accounts = await getAllAccounts(dek, userId); }
        catch (e) { accounts = []; }
    }

    const overlay = ensureOverlay();
    overlay.innerHTML = `
        <div class="modal-card econ-quickadd-card">
            <header class="modal-head">
                <h3>새 거래</h3>
                <button class="modal-close" aria-label="닫기">×</button>
            </header>
            <div class="modal-body">
                <div class="econ-qa-row">
                    <label>날짜</label>
                    <input id="ec-qa-date" type="date" value="${today}" />
                </div>

                <div class="econ-qa-row">
                    <label>방향</label>
                    <div class="econ-qa-dir">
                        <button type="button" class="econ-qa-dir-btn active" data-dir="expense">
                            나감 (지출)
                        </button>
                        <button type="button" class="econ-qa-dir-btn" data-dir="income">
                            들어옴 (수입)
                        </button>
                    </div>
                </div>

                <div class="econ-qa-row">
                    <label>금액 <span class="econ-qa-hint">(자물쇠 안에 저장돼요)</span></label>
                    <input id="ec-qa-exact" type="number" inputmode="numeric" placeholder="예: 12000" autofocus />
                </div>

                <div class="econ-qa-row">
                    <label>크기 <span class="econ-qa-hint">(금액 적으면 자동, 직접 골라도 OK)</span></label>
                    <div class="econ-qa-buckets" id="ec-qa-buckets">
                        ${AMOUNT_BUCKETS.map(b => `
                            <button type="button" class="econ-qa-bucket-btn" data-id="${b.id}">
                                ${b.icon} ${b.label}<br><span class="econ-qa-bucket-desc">${b.desc}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="econ-qa-row">
                    <label>종류</label>
                    <div class="econ-qa-cats" id="ec-qa-cats"></div>
                </div>

                <div class="econ-qa-row econ-qa-extype-row hidden" id="ec-qa-extype-row">
                    <label>성질</label>
                    <div class="econ-qa-extype">
                        ${EXPENSE_TYPES.map((t, i) => `
                            <button type="button" class="econ-qa-extype-btn ${i === 0 ? 'active' : ''}" data-id="${t.id}">${t.label}</button>
                        `).join('')}
                    </div>
                </div>

                <div class="econ-qa-row">
                    <label>메모 (선택)</label>
                    <input id="ec-qa-desc" type="text" placeholder="예: 회사 앞 김밥" maxlength="120" />
                </div>

                ${accounts.length > 1 ? `
                    <div class="econ-qa-row">
                        <label>통장</label>
                        <select id="ec-qa-account">
                            ${accounts.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('')}
                        </select>
                    </div>
                ` : ''}

                <div id="ec-qa-giving-note" class="econ-qa-giving-note hidden">
                    🙏 헌금·기부 거래예요. 정확한 금액과 상관없이, 마음에 머무르게 두세요.
                </div>

                <div id="ec-qa-huge-note" class="econ-qa-huge-note hidden">
                    💭 거액 거래예요. 잠깐 묵상하고 결단하셨나요? (의무 아니에요)
                </div>
            </div>
            <footer class="modal-foot">
                <span style="flex:1"></span>
                <button class="modal-cancel text-btn">취소</button>
                <button id="ec-qa-save" class="primary-btn">저장</button>
            </footer>
        </div>
    `;

    const handle = openModal({ overlay, initialFocus: '#ec-qa-exact', label: 'econ-quickadd' });
    overlay.querySelector('.modal-close')?.addEventListener('click', () => handle.close());
    overlay.querySelector('.modal-cancel')?.addEventListener('click', () => handle.close());

    // 상태
    let state = {
        direction: 'expense',
        amountBucket: null,
        category: null,
        expenseType: 'variable',
    };

    // expense 일 때만 성질(고정/변동) 행 표시
    function updateExpenseTypeVisibility() {
        const row = overlay.querySelector('#ec-qa-extype-row');
        if (!row) return;
        row.classList.toggle('hidden', state.direction !== 'expense');
    }
    updateExpenseTypeVisibility();

    // 카테고리 렌더 (direction 별)
    const catsWrap = overlay.querySelector('#ec-qa-cats');
    function renderCats() {
        const cats = state.direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        catsWrap.innerHTML = cats.map(c => `
            <button type="button" class="econ-qa-cat-btn ${state.category === c.id ? 'active' : ''}" data-id="${c.id}">
                ${escapeHTML(c.label)}
            </button>
        `).join('');
        catsWrap.querySelectorAll('.econ-qa-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.category = btn.dataset.id;
                catsWrap.querySelectorAll('.econ-qa-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateGivingNote();
            });
        });
    }
    renderCats();

    // 방향 토글
    overlay.querySelectorAll('.econ-qa-dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.direction = btn.dataset.dir;
            state.category = null;
            overlay.querySelectorAll('.econ-qa-dir-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCats();
            updateGivingNote();
            updateExpenseTypeVisibility();
        });
    });

    // bucket 선택
    overlay.querySelectorAll('.econ-qa-bucket-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.amountBucket = btn.dataset.id;
            overlay.querySelectorAll('.econ-qa-bucket-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateHugeNote();
        });
    });

    // 성질(고정/변동) 토글 — expense 일 때만 노출됨
    overlay.querySelectorAll('.econ-qa-extype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.expenseType = btn.dataset.id;
            overlay.querySelectorAll('.econ-qa-extype-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 금액 입력 시 bucket 자동 계산 (디폴트 노출이 됐으므로 핵심 입력)
    overlay.querySelector('#ec-qa-exact')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        if (!isNaN(v) && v > 0) {
            const newBucket = amountToBucket(v);
            state.amountBucket = newBucket;
            overlay.querySelectorAll('.econ-qa-bucket-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.id === newBucket);
            });
            updateHugeNote();
        }
    });

    function updateGivingNote() {
        const note = overlay.querySelector('#ec-qa-giving-note');
        if (note) note.classList.toggle('hidden', !state.category || !isGivingCategory(state.category));
    }
    function updateHugeNote() {
        const note = overlay.querySelector('#ec-qa-huge-note');
        if (note) note.classList.toggle('hidden', state.amountBucket !== 'huge');
    }

    // 저장
    overlay.querySelector('#ec-qa-save')?.addEventListener('click', async () => {
        if (!state.amountBucket) { showToast('크기를 골라 주실래요? (소액/중액/고액/거액)'); return; }
        if (!state.category) { showToast('종류를 골라 주실래요?'); return; }

        const exactStr = overlay.querySelector('#ec-qa-exact')?.value.trim() || '';
        const data = {
            date: overlay.querySelector('#ec-qa-date').value,
            direction: state.direction,
            amountBucket: state.amountBucket,
            category: state.category,
            description: overlay.querySelector('#ec-qa-desc').value.trim(),
        };
        if (exactStr) data.exactAmount = Number(exactStr);
        if (state.direction === 'expense') data.expenseType = state.expenseType;
        if (accounts.length === 1) data.accountId = accounts[0].id;
        else if (accounts.length > 1) data.accountId = overlay.querySelector('#ec-qa-account').value;
        if (linkedDotId) data.linkedDotId = linkedDotId;
        if (linkedPersonIds && linkedPersonIds.length) data.linkedPersonIds = linkedPersonIds;
        if (linkedOrgIds && linkedOrgIds.length) data.linkedOrgIds = linkedOrgIds;

        try {
            const id = await saveTransaction(dek, userId, data);
            showToast(state.direction === 'income' ? '수입을 적었어요' : '지출을 적었어요');
            handle.close();
            const tx = { id, ...data };
            if (typeof onSaved === 'function') onSaved(tx);
            // 모든 거래 표시 영역 자동 동기화
            window.dispatchEvent(new CustomEvent('sanctum:economy-changed', { detail: { type: 'create', tx }}));
        } catch (e) {
            console.error('[economy] save tx failed:', e);
            showToast('저장이 잠깐 막혔어요. 한 번만 더 시도해 주실래요?');
        }
    });
}

function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.className = 'modal-overlay hidden';
    document.body.appendChild(el);
    return el;
}

function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
