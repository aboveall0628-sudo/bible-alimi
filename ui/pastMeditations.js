/**
 * pastMeditations.js — 지난 묵상 리스트 뷰
 *
 * meditations 컬렉션에서 사용자의 모든 묵상 노트를 가져와 날짜 역순으로 카드 리스트.
 * 각 카드: 날짜 + 본문 미리보기(앞 두 줄) + 클릭 시 펼치기.
 */

import { db, collection, query, where, orderBy, getDocs } from '../data/firebase.js';
import { readDocument } from '../crypto/cryptoService.js';
import { getDEK } from './lockScreen.js';

export async function renderPastMeditationsView(userId) {
    const container = document.getElementById('past-meditations-list');
    if (!container) return;

    const dek = getDEK();
    if (!dek) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔒</div><h3>잠시 잠겨있어요</h3><p class="empty-state-desc">비밀번호로 열어주세요.</p></div>';
        return;
    }

    container.innerHTML = '<div class="spinner" style="margin: 40px auto"></div>';

    let docs = [];
    try {
        const q = query(
            collection(db, 'meditations'),
            where('userId', '==', userId),
            orderBy('date', 'desc')
        );
        const snap = await getDocs(q);
        docs = snap.docs;
    } catch (e) {
        console.error('past meditations load failed:', e);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">😢</div>
                <h3>묵상 노트를 못 가져왔어요</h3>
                <p class="empty-state-desc">${e?.message || '잠깐 문제가 있었어요. 다시 한 번 해볼까요?'}</p>
            </div>
        `;
        return;
    }

    if (docs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📜</div>
                <h3>아직 적어둔 묵상이 없어요</h3>
                <p class="empty-state-desc">
                    오늘 화면에서 말씀을 곱씹고 한 줄 적어 보세요.<br>
                    1초 뒤 자동으로 안전하게 보관돼요.
                </p>
                <p style="margin-top:24px;font-size:12px;color:var(--text-secondary)">
                    예전에 적은 묵상이 보이지 않는다면,<br>
                    <strong>설정·보안 → 데이터 복구</strong>에서 진단해 볼까요?
                </p>
            </div>
        `;
        return;
    }

    // 복호화 + 카드 렌더
    const items = [];
    for (const d of docs) {
        try {
            const data = await readDocument(dek, d.data());
            items.push({
                id: d.id,
                date: data.date,
                content: data.content || '',
                createdAt: data.createdAt,
            });
        } catch (e) {
            console.warn(`decrypt failed for ${d.id}:`, e);
        }
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>묵상 노트를 못 열었어요</h3>
                <p class="empty-state-desc">
                    잠금 열쇠가 맞지 않거나 데이터가 살짝 흔들린 것 같아요.<br>
                    설정·보안에서 한 번 더 진단해 볼까요?
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="past-card" data-id="${item.id}">
            <div class="past-card-header">
                <span class="past-card-date">${formatDate(item.date)}</span>
                <span class="past-card-day">${dayOfWeek(item.date)}</span>
            </div>
            <div class="past-card-preview">${escapeHtml(preview(item.content))}</div>
        </div>
    `).join('');

    // 카드 클릭 → 펼침
    container.querySelectorAll('.past-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const item = items.find(x => x.id === id);
            if (!item) return;
            const expanded = card.classList.toggle('expanded');
            const preview = card.querySelector('.past-card-preview');
            preview.textContent = expanded ? item.content : preview(item.content);
            card.querySelector('.past-card-preview').textContent = expanded
                ? item.content
                : previewText(item.content);
        });
    });
}

function preview(text) {
    if (!text) return '(아직 비어있어요)';
    const lines = text.split('\n').filter(l => l.trim());
    return lines.slice(0, 2).join('  ').slice(0, 140) + (text.length > 140 ? '...' : '');
}
function previewText(text) { return preview(text); }

function formatDate(dateStr) {
    if (!dateStr) return '?';
    const [y, m, d] = dateStr.split('-');
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}

function dayOfWeek(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + '요일';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
