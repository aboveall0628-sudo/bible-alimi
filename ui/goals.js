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
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <h3>아직 세운 목표가 없어요</h3>
                <p class="empty-state-desc">
                    10년 비전부터 오늘 할 일까지 7계층으로 세워볼 수 있어요.<br>
                    먼 곳을 먼저 보고, 거기서 한 걸음씩 가까이 내려와요.
                </p>
                <div class="empty-state-hint">
                    <strong>이렇게 시작해보세요</strong>
                    <ol>
                        <li>10년 후 어떤 모습이 되고 싶나요? 한 줄로 적어보세요</li>
                        <li>그게 이뤄지려면 5년 안에 무엇이 자라야 할까요?</li>
                        <li>올해 그 방향으로 어떤 한 걸음을 옮길 수 있을까요?</li>
                    </ol>
                </div>
                <p style="margin-top:24px;font-size:12px;color:var(--text-secondary)">
                    ※ 목표 추가 기능은 다음 단계에서 활성화됩니다.
                </p>
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
