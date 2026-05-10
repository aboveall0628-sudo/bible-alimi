/**
 * saturdayReview.js — 토요일 계층 회고 루프
 *
 * 토요일 종류에 따라 레이어 자동 구성:
 *   평범한 토: 일+주
 *   월말 토: 일+주+월
 *   분기말 토: 일+주+월+분기
 *   12월말 토: 일+주+월+분기+연 + 5년/10년 점검
 *
 * 각 레이어는 동일 5단계: 데이터→가설→묵상→결단→계획
 */

import { getDEK } from './lockScreen.js';
import { getReport, getReports } from '../data/reportPipeline.js';
import { generateLocalFallback } from '../infra/cloudFunctionProxy.js';

const LAYER_CONFIG = {
    day:     { icon: '📖', title: '오늘 회고', collection: 'dayReports' },
    week:    { icon: '📅', title: '이번 주 회고', collection: 'weekReports' },
    month:   { icon: '🗓', title: '이번 달 회고', collection: 'monthReports' },
    quarter: { icon: '📊', title: '이번 분기 회고', collection: 'quarterReports' },
    year:    { icon: '🎯', title: '올해 회고', collection: 'yearReports' },
};

/**
 * 토요일 종류 판별 → 필요한 레이어 결정
 */
export function determineLayers(date = new Date()) {
    const layers = ['day', 'week'];

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // 다음 날이 다음 달이면 → 월말
    if (nextDay.getMonth() !== date.getMonth()) {
        layers.push('month');
    }

    // 분기 체크 (3,6,9,12월 말)
    const month = date.getMonth() + 1;
    if ([3, 6, 9, 12].includes(month) && nextDay.getMonth() !== date.getMonth()) {
        layers.push('quarter');
    }

    // 연말 체크 (12월 말)
    if (month === 12 && nextDay.getMonth() !== date.getMonth()) {
        layers.push('year');
    }

    return layers;
}

let _currentLayer = 0;
let _layers = [];
let _userId = null;

/**
 * 토요일 회고 진입
 */
export function openSaturdayReview(userId) {
    _userId = userId;
    const today = new Date();

    // 토요일 아닌 경우에도 수동 접근 가능
    _layers = determineLayers(today);
    _currentLayer = 0;

    const container = document.getElementById('saturday-review-container');
    if (!container) return;
    container.classList.remove('hidden');

    renderLayerNav();
    renderCurrentLayer();
}

function renderLayerNav() {
    const nav = document.getElementById('saturday-layer-nav');
    if (!nav) return;

    nav.innerHTML = _layers.map((l, i) => {
        const config = LAYER_CONFIG[l];
        return `
            <button class="layer-tab ${i === _currentLayer ? 'active' : ''}" data-idx="${i}">
                ${config.icon} ${config.title}
            </button>
        `;
    }).join('');

    nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.layer-tab');
        if (!btn) return;
        _currentLayer = parseInt(btn.dataset.idx);
        renderLayerNav();
        renderCurrentLayer();
    });
}

async function renderCurrentLayer() {
    const body = document.getElementById('saturday-layer-body');
    if (!body) return;

    const layerKey = _layers[_currentLayer];
    const config = LAYER_CONFIG[layerKey];
    const dek = getDEK();

    body.style.opacity = '0';
    setTimeout(async () => {
        let reportHtml = '<p>리포트가 아직 없어요.</p>';

        if (dek) {
            const reports = await getReports(dek, config.collection, _userId, 1);
            if (reports.length > 0) {
                const r = reports[0];
                const stats = r.stats || {};
                const fallback = generateLocalFallback(stats);
                const summary = r.aiSummary || fallback.aiSummary;

                reportHtml = `
                    <div class="review-stats-grid">
                        <div class="stat-item"><span class="stat-num">${stats.totalSlots || 0}</span><span class="stat-label">전체</span></div>
                        <div class="stat-item"><span class="stat-num">${stats.doneCount || 0}</span><span class="stat-label">완료</span></div>
                        <div class="stat-item"><span class="stat-num">${stats.avgSatisfaction || '-'}</span><span class="stat-label">만족도</span></div>
                    </div>
                    <div class="ai-summary-card"><p>${summary}</p></div>
                    <div class="review-actions">
                        <textarea class="pray-textarea" rows="3" placeholder="이 기간에 대해 기도하며 떠오른 것을 적어보세요..."></textarea>
                        <input type="text" class="qr-text-input" placeholder="다음 ${config.title}를 위한 결단 한 줄" />
                    </div>
                `;
            }
        }

        body.innerHTML = `
            <div class="layer-header">
                <h3>${config.icon} ${config.title}</h3>
            </div>
            <div class="layer-content">${reportHtml}</div>
        `;

        body.style.transition = 'opacity 200ms ease-out';
        body.style.opacity = '1';
    }, 200);
}

export function closeSaturdayReview() {
    const container = document.getElementById('saturday-review-container');
    if (container) container.classList.add('hidden');
}
