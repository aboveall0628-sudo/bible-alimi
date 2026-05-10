/**
 * goals.js — 나의 목표 뷰 UI (7계층 트리)
 */

import { getAllGoals, buildGoalTree, PERIODS } from '../data/goalsRepo.js';
import { getDEK } from './lockScreen.js';

const PERIOD_LABELS = {
    '10year': '10년 후 모습',
    '5year': '5년 안에',
    'yearly': '올해',
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
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔒</div><h3>잠시 잠겨있어요</h3><p class="empty-state-desc">비밀번호로 열어주세요.</p></div>';
        return;
    }

    container.innerHTML = '<div class="spinner" style="margin: 40px auto"></div>';
    const goals = await getAllGoals(dek, userId);
    const roots = buildGoalTree(goals);

    if (roots.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <h3>아직 세운 목표가 없어요</h3>
                <p class="empty-state-desc">
                    10년 후 모습부터 오늘 할 일까지 7단계로 그려볼 수 있어요.<br>
                    먼 곳을 먼저 바라보고, 거기서 한 걸음씩 내려와 봐요.
                </p>
                <div class="empty-state-hint">
                    <strong>이렇게 시작해 볼까요?</strong>
                    <ol>
                        <li>10년 뒤 어떤 모습이고 싶나요? 한 줄로 적어 보세요</li>
                        <li>그게 이뤄지려면 5년 안에 무엇이 자라야 할까요?</li>
                        <li>올해 그 방향으로 한 걸음 옮긴다면 어떤 걸음일까요?</li>
                    </ol>
                </div>
                <p style="margin-top:24px;font-size:12px;color:var(--text-secondary)">
                    ※ 목표를 직접 추가하는 기능은 곧 추가될 예정이에요.
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
                    <h4 class="goal-title">${goal.title || '(제목이 비어있어요)'}</h4>
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
