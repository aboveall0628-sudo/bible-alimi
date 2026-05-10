/**
 * dashboard.js — 대시보드 뷰 UI
 */

import { getDotsByDateRange, computeDotStats } from '../data/dotsRepo.js';
import { getDEK } from './lockScreen.js';

export async function renderDashboardView(userId) {
    const container = document.getElementById('dashboard-cards');
    if (!container) return;

    const dek = getDEK();
    if (!dek) {
        container.innerHTML = '<div class="no-data" style="grid-column: 1/-1">잠금 해제가 필요합니다.</div>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner" style="grid-column: 1/-1"></div>';

    // 최근 7일 데이터 집계
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const past7 = new Date();
    past7.setDate(today.getDate() - 6);
    const startDate = past7.toISOString().split('T')[0];

    const dots = await getDotsByDateRange(dek, userId, startDate, endDate);
    const stats = computeDotStats(dots);

    container.innerHTML = `
        <div class="dash-card">
            <h3>일치율 (최근 7일)</h3>
            <div class="dash-value highlight">${stats.matchRate}%</div>
            <p class="dash-desc">계획 대비 실제 완료율</p>
        </div>
        <div class="dash-card">
            <h3>평균 만족도</h3>
            <div class="dash-value">${stats.avgSatisfaction} <span style="font-size:16px;color:var(--text-secondary)">/ 5.0</span></div>
            <p class="dash-desc">총 ${stats.totalSlots}개 타임박스</p>
        </div>
        <div class="dash-card">
            <h3>많이 느낀 감정</h3>
            <div class="dash-labels">
                ${stats.topLabelIds.map(l => `<span class="qr-label-chip selected">${l.labelId} (${l.count})</span>`).join('') || '<span class="qr-label-chip">없음</span>'}
            </div>
        </div>
        <div class="dash-card">
            <h3>실행 분포</h3>
            <p class="dash-desc" style="margin-top:0">
                완료: ${stats.doneCount} | 부분: ${stats.partialCount} | 대체: ${stats.replacedCount} | 못함: ${stats.skippedCount}
            </p>
        </div>
    `;
}
