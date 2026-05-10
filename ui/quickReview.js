/**
 * quickReview.js — 3초 평가 모달 v2
 *
 * 기본 모드: 4큰버튼 + 만족도 슬라이더 1개 + 라벨 칩
 * "자세히" 토글: 실제 작업, 결과 만족도, 한 줄 이유
 * 키보드 단축키: 1~4 상태, 5~9 만족도, Enter 저장
 */

import { saveDot } from '../data/dotsRepo.js';
import { getDEK } from './lockScreen.js';

let _currentSlot = null;
let _currentCells = [];
let _currentUserId = null;
let _currentDate = null;
let _onSaved = null;

const STATUS_OPTIONS = [
    { key: 'done', emoji: '😀', label: '완료', shortcut: '1' },
    { key: 'partial', emoji: '🙂', label: '부분', shortcut: '2' },
    { key: 'replaced', emoji: '🔄', label: '대체', shortcut: '3' },
    { key: 'skipped', emoji: '😣', label: '못함', shortcut: '4' },
];

/**
 * 모달 초기화 (앱 시작 시 1회)
 */
export function initQuickReview({ onSaved }) {
    _onSaved = onSaved;
    renderModal();
    bindEvents();
}

/**
 * 모달 열기
 */
export function openQuickReview({ timeSlot, cells, userId, date, plannedTask }) {
    _currentSlot = timeSlot;
    _currentCells = cells;
    _currentUserId = userId;
    _currentDate = date;

    // 초기화
    const modal = document.getElementById('qr-modal');
    modal.classList.remove('hidden');

    document.getElementById('qr-planned-task').textContent = plannedTask || '(계획 없음)';
    document.getElementById('qr-actual-input').value = plannedTask || '';
    document.getElementById('qr-reason-input').value = '';
    document.getElementById('qr-satisfaction').value = '3';
    document.getElementById('qr-sat-value').textContent = '3';
    document.getElementById('qr-outcome-sat').value = '3';

    // 상태 버튼 초기화
    document.querySelectorAll('.qr-status-btn').forEach(btn => btn.classList.remove('selected'));

    // 라벨 칩 초기화
    document.querySelectorAll('.qr-label-chip').forEach(chip => chip.classList.remove('selected'));

    // 상세 접기
    document.getElementById('qr-detail-section').classList.add('hidden');
    document.getElementById('qr-detail-toggle').textContent = '자세히 평가 ▼';

    // 포커스
    setTimeout(() => document.querySelector('.qr-status-btn')?.focus(), 100);
}

function renderModal() {
    if (document.getElementById('qr-modal')) return;

    const labelAxes = {
        spiritual: ['평안함', '감사함', '메마름', '갈등함'],
        energy: ['활력', '보통', '피로', '소진'],
        cognitive: ['집중', '산만', '창의적', '루틴적'],
    };

    const modal = document.createElement('div');
    modal.id = 'qr-modal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
        <div class="modal-content qr-modal-content">
            <div class="qr-header">
                <h3>빠른 평가</h3>
                <span id="qr-planned-task" class="qr-planned-label"></span>
            </div>

            <div class="qr-status-row">
                ${STATUS_OPTIONS.map(s => `
                    <button class="qr-status-btn" data-status="${s.key}" title="${s.shortcut}키">
                        <span class="qr-status-emoji">${s.emoji}</span>
                        <span class="qr-status-text">${s.label}</span>
                    </button>
                `).join('')}
            </div>

            <div class="qr-slider-row">
                <label>만족도</label>
                <input type="range" id="qr-satisfaction" min="1" max="5" value="3" class="neon-slider-light" />
                <span id="qr-sat-value" class="qr-sat-display">3</span>
            </div>

            <div class="qr-labels-row">
                ${Object.entries(labelAxes).map(([axis, labels]) =>
                    labels.map(l => `<button class="qr-label-chip" data-label="${l}">${l}</button>`).join('')
                ).join('')}
            </div>

            <button id="qr-detail-toggle" class="qr-toggle-btn">자세히 평가 ▼</button>

            <div id="qr-detail-section" class="qr-detail hidden">
                <div class="qr-field">
                    <label>실제로 한 일</label>
                    <input type="text" id="qr-actual-input" class="qr-text-input" placeholder="실제로 뭘 했나요?" />
                </div>
                <div class="qr-slider-row">
                    <label>결과 만족도</label>
                    <input type="range" id="qr-outcome-sat" min="1" max="5" value="3" class="neon-slider-dark" />
                </div>
                <div class="qr-field">
                    <label>한 줄 이유</label>
                    <input type="text" id="qr-reason-input" class="qr-text-input" placeholder="왜 그랬을까?" />
                </div>
            </div>

            <div class="qr-actions">
                <button id="qr-cancel-btn" class="text-btn">닫기</button>
                <button id="qr-save-btn" class="primary-btn">기록하기</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function bindEvents() {
    // 상태 버튼
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.qr-status-btn');
        if (btn) {
            document.querySelectorAll('.qr-status-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        }
    });

    // 라벨 칩 토글
    document.addEventListener('click', (e) => {
        const chip = e.target.closest('.qr-label-chip');
        if (chip) chip.classList.toggle('selected');
    });

    // 만족도 슬라이더
    document.addEventListener('input', (e) => {
        if (e.target.id === 'qr-satisfaction') {
            document.getElementById('qr-sat-value').textContent = e.target.value;
        }
    });

    // 자세히 토글
    document.addEventListener('click', (e) => {
        if (e.target.id === 'qr-detail-toggle') {
            const section = document.getElementById('qr-detail-section');
            const isHidden = section.classList.toggle('hidden');
            e.target.textContent = isHidden ? '자세히 평가 ▼' : '접기 ▲';
        }
    });

    // 저장
    document.addEventListener('click', (e) => {
        if (e.target.id === 'qr-save-btn') handleSave();
        if (e.target.id === 'qr-cancel-btn') closeModal();
    });

    // 모달 배경 클릭 닫기
    document.addEventListener('click', (e) => {
        if (e.target.id === 'qr-modal') closeModal();
    });

    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('qr-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key >= '1' && e.key <= '4') {
            const idx = parseInt(e.key) - 1;
            const btns = document.querySelectorAll('.qr-status-btn');
            btns.forEach(b => b.classList.remove('selected'));
            btns[idx]?.classList.add('selected');
            e.preventDefault();
        }
        if (e.key >= '5' && e.key <= '9') {
            const val = parseInt(e.key) - 4; // 5→1, 6→2, ..., 9→5
            document.getElementById('qr-satisfaction').value = val;
            document.getElementById('qr-sat-value').textContent = val;
            e.preventDefault();
        }
        if (e.key === 'Enter') {
            handleSave();
            e.preventDefault();
        }
        if (e.key === 'Escape') {
            closeModal();
            e.preventDefault();
        }
    });
}

async function handleSave() {
    const dek = getDEK();
    if (!dek) return;

    const statusBtn = document.querySelector('.qr-status-btn.selected');
    const executed = statusBtn?.dataset.status || 'done';
    const satisfaction = parseInt(document.getElementById('qr-satisfaction').value);
    const outcomeSat = parseInt(document.getElementById('qr-outcome-sat').value);
    const actualTask = document.getElementById('qr-actual-input').value;
    const reason = document.getElementById('qr-reason-input').value;

    const labels = [];
    document.querySelectorAll('.qr-label-chip.selected').forEach(c => {
        labels.push(c.dataset.label);
    });

    const btn = document.getElementById('qr-save-btn');
    btn.textContent = '저장 중...';
    btn.disabled = true;

    try {
        await saveDot(dek, {
            userId: _currentUserId,
            date: _currentDate,
            timeSlot: _currentSlot,
            executed,
            executionSatisfaction: satisfaction,
            outcomeSatisfaction: outcomeSat,
            plannedTask: document.getElementById('qr-planned-task').textContent,
            actualTask: actualTask || document.getElementById('qr-planned-task').textContent,
            reason,
            labelIds: labels,
        });

        // 토스트
        showToast('🔐 안전하게 보관됨');
        closeModal();
        if (_onSaved) _onSaved();
    } catch (e) {
        console.error('Save dot error:', e);
        btn.textContent = '기록하기';
        btn.disabled = false;
    }
}

function closeModal() {
    const modal = document.getElementById('qr-modal');
    if (modal) modal.classList.add('hidden');
    const btn = document.getElementById('qr-save-btn');
    if (btn) { btn.textContent = '기록하기'; btn.disabled = false; }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'sanctum-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 1000);
}

export { showToast };
