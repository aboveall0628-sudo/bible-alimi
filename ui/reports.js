/**
 * reports.js — 리포트 뷰 UI
 *
 * Phase E-5-A: day 탭은 새 dayReport spec(reports/dayReportRepo) 으로 표시.
 *   ## 사실 (aiSummary) / 관찰(observations) / 묵상 질문(questionsForMeditation)
 *   stats 는 새 객체 구조 (dotStats / satisfactionDistribution / alignment 등).
 * 나머지 탭(week/month/quarter/year)은 옛 data/reportPipeline 그대로 — weekly 흐름
 * 구축 전엔 옛 빈 리포트가 있을 수 있어 호환 유지.
 */

import { listDayReports } from '../reports/dayReportRepo.js';
import { getReports } from '../data/reportPipeline.js';
import { getDEK } from './lockScreen.js';

let _userId = null;
let _currentTab = 'day';

const OLD_COLLECTION_MAP = {
    week: 'weekReports',
    month: 'monthReports',
    quarter: 'quarterReports',
    year: 'yearReports',
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

    try {
        if (_currentTab === 'day') {
            const reports = await listDayReports(dek, _userId, 30);
            container.innerHTML = renderDayList(reports);
        } else {
            // 옛 흐름 (week/month/quarter/year) — 아직 새 spec 구축 전이라 호환 유지
            const reports = await getReports(dek, OLD_COLLECTION_MAP[_currentTab], _userId, 10);
            container.innerHTML = renderOldList(reports);
        }
        if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();
    } catch (e) {
        console.error('reports load failed:', e);
        container.innerHTML = '<div class="no-data">리포트를 불러오는 중에 잠깐 막혔어요.</div>';
    }
}

// ─── day 탭 (새 spec) ────────────────────────────────────
function renderDayList(reports) {
    if (!reports || reports.length === 0) {
        return `
            <div class="no-data">
                아직 만든 일간 리포트가 없어요. 오늘 화면 하단의 [오늘 리포트 만들기]를 눌러 보세요.
            </div>
        `;
    }
    return reports.map(renderDayCard).join('');
}

function renderDayCard(r) {
    const stats     = r.stats || {};
    const dotStats  = stats.dotStats || {};
    const satDist   = stats.satisfactionDistribution || {};
    const align     = stats.alignment || {};
    const totalDots = dotStats.totalDots ?? 0;
    const doneCount = dotStats.doneCount ?? 0;
    const avgSat    = satDist.avg;
    const matchPct  = (align.decisionExecutionRate != null)
        ? Math.round(align.decisionExecutionRate * 100) : null;

    const observation = (r.observations || [])[0] || null;
    const questions   = r.questionsForMeditation || [];

    const summaryBlock = r.aiSummary
        ? `<div class="report-summary"><p>${escapeHtml(r.aiSummary)}</p></div>`
        : `<div class="report-summary report-summary-empty">
               이 날은 아직 AI 산문이 채워지지 않았어요. 오늘 화면 하단의 [오늘 리포트 만들기]에서 다시 만들 수 있어요.
           </div>`;

    const obsBlock = observation
        ? `<div class="report-observation">
               <span class="report-section-label"><i data-lucide="eye" class="report-section-icon"></i> 관찰</span>
               <p>${escapeHtml(observation)}</p>
           </div>`
        : '';

    const qBlock = questions.length > 0
        ? `<div class="report-questions">
               <span class="report-section-label"><i data-lucide="message-circle-question" class="report-section-icon"></i> 묵상에 가져갈 질문</span>
               <ul>${questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul>
           </div>`
        : '';

    const statsRow = `
        <div class="report-stats-row">
            <span class="report-stat"><strong>${doneCount}</strong>/${totalDots} <small>완료</small></span>
            ${avgSat != null ? `<span class="report-stat"><strong>${avgSat}</strong> <small>만족도</small></span>` : ''}
            ${matchPct != null ? `<span class="report-stat"><strong>${matchPct}%</strong> <small>결단 실행률</small></span>` : ''}
        </div>
    `;

    return `
        <article class="report-card card-section">
            <header class="report-card-header">
                <h3>${escapeHtml(r.startDate || '')}</h3>
            </header>
            ${statsRow}
            ${summaryBlock}
            ${obsBlock}
            ${qBlock}
            <div class="report-card-foot">여기까지가 데이터예요. 다음은 묵상 안에서.</div>
        </article>
    `;
}

// ─── 옛 탭 (week/month/quarter/year) — weekly 구축 전 호환 ───
function renderOldList(reports) {
    if (!reports || reports.length === 0) {
        return `<div class="no-data">아직 이 단계의 리포트가 없어요. 곧 만들어질 예정이에요.</div>`;
    }
    return reports.map(r => {
        const stats = r.stats || {};
        return `
            <article class="report-card card-section">
                <header class="report-card-header">
                    <h3>${escapeHtml(r.startDate || '')} ~ ${escapeHtml(r.endDate || '')}</h3>
                    <span class="report-card-meta">만족도 ${stats.avgSatisfaction ?? '-'}</span>
                </header>
                <div class="report-summary">
                    <p>${escapeHtml(r.aiSummary || 'AI 요약이 아직 채워지지 않았어요.')}</p>
                </div>
            </article>
        `;
    }).join('');
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
