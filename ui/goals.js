/**
 * goals.js — 나의 목표 뷰 UI (7계층 트리)
 */

import { getAllGoals, buildGoalTree, PERIODS } from '../data/goalsRepo.js';
import { getDEK } from './lockScreen.js';

const PERIOD_LABELS = {
    '10year': '10년 비전',
    '5year': '5년 방향',
    'yearly': '올해 목표',
    'quarterly': '이번 분기',
    'monthly': '이번 달',
    'weekly': '이번 주',
    'daily': '오늘'
};

export async function renderGoalsView(userId) {
    const container = document.getElementById('goals-container');
    if (!container) return;

    const dek = getDEK();
    if (!dek) {
        container.innerHTML = '<div class="no-data">잠금 해제가 필요합니다.</div>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner"></div>';
    const goals = await getAllGoals(dek, userId);
    const roots = buildGoalTree(goals);

    if (roots.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                설정된 목표가 없습니다.<br>
                <button class="text-btn" onclick="alert('목표 추가 기능 준비 중')">10년 비전 세우기</button>
            </div>
        `;
        return;
    }

    let html = '<div class="goal-tree">';
    roots.forEach(root => { html += renderGoalNode(root, 0); });
    html += '</div>';

    container.innerHTML = html;
}

function renderGoalNode(goal, depth) {
    const hasChildren = goal.children && goal.children.length > 0;
    const paddingLeft = depth * 24;
    
    let html = `
        <div class="goal-node" style="margin-left: ${paddingLeft}px">
            <div class="goal-card">
                <div class="goal-badge period-${goal.period}">${PERIOD_LABELS[goal.period] || goal.period}</div>
                <div class="goal-content">
                    <h4 class="goal-title">${goal.title || '(제목 없음)'}</h4>
                    ${goal.description ? `<p class="goal-desc">${goal.description}</p>` : ''}
                </div>
            </div>
    `;

    if (hasChildren) {
        goal.children.forEach(child => {
            html += renderGoalNode(child, depth + 1);
        });
    }

    html += '</div>';
    return html;
}
