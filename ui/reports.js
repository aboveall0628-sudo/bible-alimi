/**
 * reports.js — 리포트 뷰 UI
 */

import { getReports } from '../data/reportPipeline.js';
import { getDEK } from './lockScreen.js';

let _userId = null;
let _currentTab = 'day';

const COLLECTION_MAP = {
    day: 'dayReports',
    week: 'weekReports',
    month: 'monthReports',
    quarter: 'quarterReports',
    year: 'yearReports'
};

export async function renderReportsView(userId) {
    _userId = userId;
    const tabs = document.querySelectorAll('.report-tabs .tab-btn');
    tabs.forEach(t => {
        t.addEventListener('click', (e) => {
            tabs.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            _currentTab = e.target.dataset.tab;
            loadReports();
        });
    });

    loadReports();
}

async function loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;

    const dek = getDEK();
    if (!dek) {
        container.innerHTML = '<div class="no-data">잠금 해제가 필요합니다.</div>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner"></div>';
    
    const collectionName = COLLECTION_MAP[_currentTab];
    const reports = await getReports(dek, collectionName, _userId, 10);

    if (reports.length === 0) {
        container.innerHTML = '<div class="no-data">생성된 리포트가 없습니다. 저녁 루프를 완료하면 생성됩니다.</div>';
        return;
    }

    let html = '';
    reports.forEach(r => {
        const stats = r.stats || {};
        html += `
            <div class="report-card card-section">
                <div class="report-header" style="display:flex;justify-content:space-between;margin-bottom:16px;">
                    <h3 style="font-size:16px;font-weight:600;">${r.startDate} ~ ${r.endDate}</h3>
                    <span style="font-size:12px;color:var(--text-secondary)">만족도 ${stats.avgSatisfaction || '-'}</span>
                </div>
                <div class="ai-summary-card" style="margin-bottom:0">
                    <p>${r.aiSummary || 'AI 요약이 없습니다.'}</p>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}
