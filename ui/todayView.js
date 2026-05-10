/**
 * todayView.js — 오늘 화면 컴포넌트
 *
 * 책임:
 * - 핀 원칙 띠 (항상 노출, 핀 원칙 변경 시 갱신)
 * - 묵상 노트 자동 저장 (디바운스 1초, 암호화 후 Firestore)
 * - 결단 패널: 동적 리스트 + 추가/수정/삭제 + 드래그 핸들 (drop은 timeline.js가 처리)
 * - 통합 타임라인 진입점은 별도 파일(Chunk 3에서 timeline.js 신규)
 */

import { db, doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from '../data/firebase.js';
import { readDocument, prepareDocument } from '../crypto/cryptoService.js';
import { getDEK } from './lockScreen.js';
import { showToast } from './quickReview.js';
import {
    getDecisionsByDate, saveDecision, deleteDecision
} from '../data/decisionsRepo.js';

let _userId = null;
let _date = null;
let _decisions = [];

/**
 * 오늘 뷰 초기화 (앱 시작 시 1회)
 */
export function initTodayView({ userId, date }) {
    _userId = userId;
    _date = date;
    bindMeditationAutosave();
    bindDecisionsPanel();
}

/**
 * 날짜 변경 시 호출 — 핀/노트/결단 다시 로드
 */
export async function refreshTodayView({ userId, date }) {
    _userId = userId;
    _date = date;
    const dek = getDEK();
    if (!dek) return;
    await loadPinnedPrinciple(dek);
    await loadMeditationNote(dek);
    await loadDecisions(dek);
}

// ─── 핀 원칙 띠 ───
async function loadPinnedPrinciple(dek) {
    const banner = document.getElementById('pinned-principle-banner');
    const text = document.getElementById('pinned-principle-text');
    if (!banner || !text) return;

    try {
        const q = query(
            collection(db, 'principles'),
            where('userId', '==', _userId),
            where('pinned', '==', true)
        );
        const snap = await getDocs(q);
        if (snap.docs.length === 0) {
            banner.classList.add('hidden');
            return;
        }
        const data = await readDocument(dek, snap.docs[0].data());
        text.textContent = data.title || '';
        banner.classList.remove('hidden');
    } catch (e) {
        console.warn('pinned principle load failed:', e);
        banner.classList.add('hidden');
    }
}

// ─── 묵상 노트 자동 저장 (디바운스 1초) ───
let _saveTimer = null;

function bindMeditationAutosave() {
    const editor = document.getElementById('meditation-note');
    if (!editor) return;

    editor.addEventListener('input', () => {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => saveMeditationNote(editor.innerText), 1000);
    });
}

async function saveMeditationNote(content) {
    const dek = getDEK();
    if (!dek || !_userId || !_date) return;

    const status = document.getElementById('meditation-save-status');
    if (status) status.textContent = '저장 중...';

    try {
        const id = `meditation_${_userId}_${_date}`;
        const meta = { id, userId: _userId, date: _date, createdAt: serverTimestamp() };
        const sensitive = { content };
        const document_ = await prepareDocument(dek, meta, sensitive);
        await setDoc(doc(db, 'meditations', id), document_, { merge: true });

        if (status) {
            status.textContent = '🔐 안전하게 보관됨';
            setTimeout(() => { if (status) status.textContent = ''; }, 1200);
        }
    } catch (e) {
        console.error('meditation save failed:', e);
        if (status) status.textContent = '저장 실패 — 콘솔 확인';
    }
}

async function loadMeditationNote(dek) {
    const editor = document.getElementById('meditation-note');
    if (!editor) return;

    try {
        const id = `meditation_${_userId}_${_date}`;
        const snap = await getDoc(doc(db, 'meditations', id));
        if (snap.exists()) {
            const data = await readDocument(dek, snap.data());
            editor.innerText = data.content || '';
        } else {
            editor.innerText = '';
        }
    } catch (e) {
        console.warn('meditation load failed:', e);
        editor.innerText = '';
    }
}

// ─── 결단 패널 ───
function bindDecisionsPanel() {
    const addBtn = document.getElementById('decision-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addNewDecision);
    }
}

async function loadDecisions(dek) {
    try {
        _decisions = await getDecisionsByDate(dek, _userId, _date);
    } catch (e) {
        console.error('decisions load failed:', e);
        _decisions = [];
    }
    renderDecisions();
}

function renderDecisions() {
    const list = document.getElementById('decisions-list');
    if (!list) return;

    if (_decisions.length === 0) {
        list.innerHTML = `
            <p style="font-size:12px;color:var(--text-secondary);padding:8px;">
                아직 결단이 없어요. [+ 새 결단 추가]를 눌러 시작해 보세요.
            </p>
        `;
        return;
    }

    list.innerHTML = _decisions.map(d => renderDecisionCard(d)).join('');
    bindCardEvents();
}

function renderDecisionCard(d) {
    const placed = d.timeSlot != null;
    const slotLabel = placed
        ? `⏰ ${slotToTime(d.timeSlot)}~${slotToTime(d.timeSlot + (d.durationSlots || 4))}`
        : '미배치';
    return `
        <div class="decision-card ${placed ? 'placed' : ''}" data-id="${d.id}" draggable="true">
            <span class="decision-handle" title="시간축으로 드래그">⋮⋮</span>
            <input type="text" class="decision-text" value="${escapeHtml(d.text || '')}"
                   placeholder="결단 내용을 적어주세요..." data-id="${d.id}" />
            <span class="decision-slot">${slotLabel}</span>
            <button class="decision-action delete-btn" data-id="${d.id}" title="삭제">×</button>
        </div>
    `;
}

function slotToTime(slot) {
    const h = Math.floor(slot / 4);
    const m = (slot % 4) * 15;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function bindCardEvents() {
    const list = document.getElementById('decisions-list');
    if (!list) return;

    // 텍스트 인라인 편집 (blur 시 저장)
    list.querySelectorAll('.decision-text').forEach(input => {
        input.addEventListener('blur', async () => {
            const id = input.dataset.id;
            const decision = _decisions.find(d => d.id === id);
            if (!decision) return;
            const newText = input.value.trim();
            if (newText === decision.text) return;
            decision.text = newText;
            const dek = getDEK();
            if (dek) await saveDecision(dek, decision);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
    });

    // 삭제 버튼
    list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('이 결단을 삭제할까요?')) return;
            await deleteDecision(id);
            _decisions = _decisions.filter(d => d.id !== id);
            renderDecisions();
        });
    });

    // 드래그 시작 — Chunk 3의 통합 타임라인 컴포넌트가 dragover/drop을 처리
    list.querySelectorAll('.decision-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            const id = card.dataset.id;
            e.dataTransfer.setData('application/x-sanctum-decision', id);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    });
}

async function addNewDecision() {
    const dek = getDEK();
    if (!dek) { showToast('잠금 해제가 필요해요'); return; }

    const newDecision = {
        userId: _userId,
        date: _date,
        text: '',
        timeSlot: null,
        durationSlots: 4,
        order: _decisions.length,
    };
    await saveDecision(dek, newDecision);
    _decisions.push(newDecision);
    renderDecisions();

    // 새로 추가된 입력란에 포커스
    setTimeout(() => {
        const inputs = document.querySelectorAll('.decision-text');
        const last = inputs[inputs.length - 1];
        if (last) last.focus();
    }, 50);
}

/** 외부에서 결단 목록 직접 접근 — Chunk 3의 timeline.js가 박힌 결단 렌더에 사용 */
export function getDecisions() { return _decisions; }
export function getDecisionById(id) { return _decisions.find(d => d.id === id); }
