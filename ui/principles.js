/**
 * principles.js — 나의 원칙 뷰 UI (노션 스타일)
 */

import { getPrinciples, savePrinciple, deletePrinciple } from '../data/principlesRepo.js';
import { getDEK } from './lockScreen.js';

let _userId = null;

export async function renderPrinciplesView(userId) {
    _userId = userId;
    const container = document.getElementById('principles-container');
    if (!container) return;

    const dek = getDEK();
    if (!dek) {
        container.innerHTML = '<div class="no-data">잠금 해제가 필요합니다.</div>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner"></div>';
    const principles = await getPrinciples(dek, userId);

    let html = `
        <div class="principles-toolbar">
            <button id="add-principle-btn" class="primary-btn">+ 새 원칙 추가</button>
        </div>
        <div class="principles-list">
    `;

    if (principles.length === 0) {
        html += '<div class="no-data">등록된 원칙이 없어요.</div>';
    } else {
        principles.forEach(p => {
            html += `
                <div class="principle-card" data-id="${p.id}">
                    <div class="principle-header">
                        <input type="text" class="principle-title-input" value="${p.title}" placeholder="원칙 제목" />
                        <div class="principle-actions">
                            <button class="icon-btn pin-btn ${p.pinned ? 'active' : ''}" title="상단 고정">📌</button>
                            <button class="icon-btn delete-btn" title="삭제">🗑</button>
                        </div>
                    </div>
                    <textarea class="principle-body-input" rows="3" placeholder="이 원칙을 어떻게 삶에 적용할 것인가? 노션처럼 자유롭게 적어보세요.">${p.body || ''}</textarea>
                </div>
            `;
        });
    }
    
    html += '</div>';
    container.innerHTML = html;

    bindEvents(container);
}

function bindEvents(container) {
    const dek = getDEK();

    container.querySelector('#add-principle-btn')?.addEventListener('click', async () => {
        await savePrinciple(dek, { userId: _userId, title: '', body: '', pinned: false });
        renderPrinciplesView(_userId);
    });

    container.querySelectorAll('.principle-card').forEach(card => {
        let saveTimeout;
        const id = card.dataset.id;
        const titleInput = card.querySelector('.principle-title-input');
        const bodyInput = card.querySelector('.principle-body-input');
        const pinBtn = card.querySelector('.pin-btn');

        const triggerSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                savePrinciple(dek, {
                    id, userId: _userId,
                    title: titleInput.value,
                    body: bodyInput.value,
                    pinned: pinBtn.classList.contains('active')
                });
            }, 1000); // 1초 디바운스 자동 저장
        };

        titleInput.addEventListener('input', triggerSave);
        bodyInput.addEventListener('input', triggerSave);

        pinBtn.addEventListener('click', () => {
            pinBtn.classList.toggle('active');
            triggerSave();
            // 핀 변경 시 전체 다시 그리기 (정렬을 위해)
            setTimeout(() => renderPrinciplesView(_userId), 1100);
        });

        card.querySelector('.delete-btn').addEventListener('click', async () => {
            if (confirm('이 원칙을 삭제하시겠습니까?')) {
                await deletePrinciple(id);
                renderPrinciplesView(_userId);
            }
        });
    });
}
