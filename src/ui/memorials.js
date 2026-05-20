/**
 * memorials.js — 추모비 (지나간 목표) 목록 모달
 *
 * 1차 (HC#1):
 *   - 사용자의 추모비 카드 목록 표시
 *   - 각 카드: 목표 제목·기간·도트 통계·사용자 노트
 *   - representativeDots·aiNarrativeSummary·contributions 는 다음 트랙
 *
 * 진입점: ui/goals.js 의 "지나간 목표 N개" 버튼.
 * 향후: 개편 회고 리포트 안 섹션으로 흡수 검토.
 */

import { getDEK } from './lockScreen.js';
import { getMemorialsByUser } from '../data/memorialsRepo.js';
import { showToast } from './quickReview.js';

const OVERLAY_ID = 'memorials-overlay';

export async function openMemorialsModal(userId) {
    const dek = getDEK();
    if (!dek) { showToast('잠시 잠겨 있어요. 비밀번호로 열어 주실래요?'); return; }

    const overlay = ensureOverlay();
    overlay.innerHTML = `
        <div class="modal-card memorials-card">
            <header class="modal-head">
                <h3>🪦 지나간 목표</h3>
                <button class="modal-close" aria-label="닫기">×</button>
            </header>
            <div class="modal-body">
                <p class="memorials-hint">
                    그만두기로 결정한 목표들의 흔적이에요.
                    "포기"가 아니라 정직한 마무리 — 같은 길을 다시 가지 않도록 돌아보는 자리.
                </p>
                <div id="memorials-list">
                    <div class="spinner" style="margin: 40px auto"></div>
                </div>
            </div>
        </div>
    `;

    overlay.classList.remove('hidden');
    overlay.querySelector('.modal-close')?.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });

    try {
        const memorials = await getMemorialsByUser(dek, userId);
        renderList(memorials);
    } catch (e) {
        console.error('memorials load failed:', e);
        document.getElementById('memorials-list').innerHTML =
            '<p class="empty-hint">추모비를 불러오는 게 잠깐 막혔어요. 잠시 후 다시 열어 주실래요?</p>';
    }
}

function renderList(memorials) {
    const root = document.getElementById('memorials-list');
    if (!root) return;
    if (memorials.length === 0) {
        root.innerHTML = `
            <p class="empty-hint">
                아직 그만둔 목표가 없어요. 살아있는 목표들도 잘 가꿔지길 바라요.
            </p>
        `;
        return;
    }
    root.innerHTML = memorials.map(renderMemorialCard).join('');
}

function renderMemorialCard(m) {
    const title = (m.goalSnapshot?.title || '(이름 없는 목표)');
    const duration = m.duration || {};
    const dotStats = m.dotStats || {};
    const total = dotStats.totalSlots || 0;
    const done = dotStats.doneCount || 0;
    const matchRate = dotStats.matchRate || 0;
    const note = m.userNote || '';
    return `
        <div class="memorial-card" data-id="${escapeHtml(m.id)}">
            <div class="memorial-title">${escapeHtml(title)}</div>
            <div class="memorial-meta">
                <span>📅 ${escapeHtml(duration.startDate || '')} ~ ${escapeHtml(duration.endDate || '')}</span>
                <span>· ${duration.daysElapsed || 0}일 함께함</span>
            </div>
            ${total > 0 ? `
                <div class="memorial-stats">
                    🍃 도트 ${total}개 · 완료 ${done} · 함께한 비율 ${matchRate}%
                </div>
            ` : `
                <div class="memorial-stats memorial-stats-empty">
                    🍃 시간표에 박힌 도트가 없었어요
                </div>
            `}
            ${note ? `<div class="memorial-note">"${escapeHtml(note)}"</div>` : ''}
        </div>
    `;
}

function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'modal-overlay hidden';
        document.body.appendChild(overlay);
    }
    return overlay;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
