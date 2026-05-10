/**
 * eveningLoop.js — 저녁 통합 루프 (7단계 wizard)
 *
 * 1) 시간 정직하게 보기 — 빈 슬롯 일괄 채움
 * 2) 도트 평가 — 빠른 평가, 계획대로 한 슬롯 일괄 ✅
 * 3) 데이 리포트 생성 (백그라운드)
 * 4) 회고 읽기 — 통계 + AI 요약 + 인과 가설
 * 5) 말씀과 기도로 가져가기
 * 6) 내일의 결단 정리
 * 7) 내일 타임박싱 가배치
 *
 * 모든 단계는 동일 5단계 패턴: 데이터→가설→묵상→결단→계획
 */

import { getDEK } from './lockScreen.js';
import { getDotsByDate, computeDotStats } from '../data/dotsRepo.js';
import { checkAndGenerateDayReport, getReport } from '../data/reportPipeline.js';
import { generateLocalFallback } from '../infra/cloudFunctionProxy.js';

const STEPS = [
    { id: 'fill', title: '시간 정직하게 보기', icon: '⏰', desc: '오늘 빈 시간에 뭘 했는지 채워주세요.' },
    { id: 'evaluate', title: '도트 평가', icon: '📊', desc: '각 시간대를 간단히 평가해주세요.' },
    { id: 'report', title: '데이 리포트', icon: '📈', desc: '오늘 하루를 정리하고 있어요...' },
    { id: 'reflect', title: '회고 읽기', icon: '🔍', desc: 'AI가 발견한 패턴을 살펴보세요.' },
    { id: 'pray', title: '말씀과 기도', icon: '🙏', desc: '오늘 말씀과 함께 기도로 가져가세요.' },
    { id: 'decide', title: '내일의 결단', icon: '✍️', desc: '내일 무엇에 순종할 것인가?' },
    { id: 'plan', title: '내일 타임박싱', icon: '📅', desc: '결단을 시간에 배치해보세요.' },
];

let _currentStep = 0;
let _userId = null;
let _dateStr = null;

/**
 * 저녁 루프 진입
 */
export function openEveningLoop(userId, dateStr) {
    _userId = userId;
    _dateStr = dateStr;
    _currentStep = 0;

    const container = document.getElementById('evening-loop-container');
    if (!container) return;

    container.classList.remove('hidden');
    renderStepIndicator();
    renderCurrentStep();
}

function renderStepIndicator() {
    const indicator = document.getElementById('evening-step-indicator');
    if (!indicator) return;

    indicator.innerHTML = STEPS.map((s, i) => `
        <div class="step-dot ${i === _currentStep ? 'active' : ''} ${i < _currentStep ? 'done' : ''}"
             title="${s.title}">
            <span>${i < _currentStep ? '✓' : (i + 1)}</span>
        </div>
    `).join('<div class="step-line"></div>');
}

async function renderCurrentStep() {
    const body = document.getElementById('evening-step-body');
    if (!body) return;

    const step = STEPS[_currentStep];
    body.style.opacity = '0';

    setTimeout(async () => {
        body.innerHTML = `
            <div class="step-header">
                <span class="step-icon">${step.icon}</span>
                <h3>${step.title}</h3>
                <p class="step-desc">${step.desc}</p>
            </div>
            <div id="step-content" class="step-content"></div>
            <div class="step-nav">
                <button id="step-prev" class="text-btn" ${_currentStep === 0 ? 'disabled' : ''}>← 이전</button>
                <button id="step-next" class="primary-btn">
                    ${_currentStep === STEPS.length - 1 ? '완료' : '다음 →'}
                </button>
            </div>
        `;

        await loadStepContent(step.id);

        body.style.transition = 'opacity 200ms ease-out';
        body.style.opacity = '1';

        document.getElementById('step-prev')?.addEventListener('click', prevStep);
        document.getElementById('step-next')?.addEventListener('click', nextStep);
    }, 200);
}

async function loadStepContent(stepId) {
    const content = document.getElementById('step-content');
    if (!content) return;
    const dek = getDEK();

    switch (stepId) {
        case 'fill':
            content.innerHTML = `
                <p class="step-hint">아래 시간표에서 빈 칸을 채워주세요.</p>
                <p class="step-hint">각 칸에 한 줄로 적으면 돼요.</p>
            `;
            break;

        case 'evaluate':
            if (!dek) { content.innerHTML = '<p>잠금 상태입니다.</p>'; return; }
            const dots = await getDotsByDate(dek, _userId, _dateStr);
            const unevaluated = dots.filter(d => !d.executed);
            content.innerHTML = `
                <p>평가 대기: <strong>${unevaluated.length}개</strong></p>
                <button id="batch-done-btn" class="primary-btn" style="width:100%;margin-top:12px;">
                    계획대로 한 것 모두 ✅ 완료 처리
                </button>
            `;
            break;

        case 'report':
            content.innerHTML = '<div class="loading-spinner"></div><p>리포트를 만들고 있어요...</p>';
            if (dek) {
                const reportId = await checkAndGenerateDayReport(dek, _userId);
                if (reportId) {
                    content.innerHTML = '<p>✅ 오늘의 리포트가 생성되었어요!</p>';
                } else {
                    content.innerHTML = '<p>이미 리포트가 있거나, 평가 데이터가 없어요.</p>';
                }
            }
            break;

        case 'reflect':
            if (!dek) return;
            const report = await getReport(dek, 'dayReports', `${_userId}_${_dateStr}`);
            if (report) {
                const stats = report.stats;
                const fallback = generateLocalFallback(stats);
                content.innerHTML = `
                    <div class="report-stats-mini">
                        <span>완료 ${stats.doneCount}/${stats.totalSlots}</span>
                        <span>만족도 ${stats.avgSatisfaction}</span>
                    </div>
                    <div class="ai-summary-card">
                        <p>${report.aiSummary || fallback.aiSummary}</p>
                    </div>
                `;
            } else {
                content.innerHTML = '<p>리포트가 아직 없어요.</p>';
            }
            break;

        case 'pray':
            content.innerHTML = `
                <div class="pray-section">
                    <p class="pray-prompt">오늘 말씀에서 받은 감동과 위의 패턴을 기도로 가져가보세요.</p>
                    <textarea id="pray-note" class="pray-textarea" rows="4"
                              placeholder="기도하며 떠오른 생각을 적어보세요..."></textarea>
                </div>
            `;
            break;

        case 'decide':
            content.innerHTML = `
                <div class="decide-section">
                    <p>내일 무엇에 순종할 것인가?</p>
                    <input type="text" id="decide-1" class="qr-text-input" placeholder="결단 1" />
                    <input type="text" id="decide-2" class="qr-text-input" placeholder="결단 2 (선택)" />
                    <input type="text" id="decide-3" class="qr-text-input" placeholder="결단 3 (선택)" />
                </div>
            `;
            break;

        case 'plan':
            content.innerHTML = `
                <p class="step-hint">위 결단을 내일 시간표에 배치해보세요.</p>
                <p class="step-hint">Google Calendar 일정도 함께 표시됩니다.</p>
            `;
            break;
    }
}

function nextStep() {
    if (_currentStep < STEPS.length - 1) {
        _currentStep++;
        renderStepIndicator();
        renderCurrentStep();
    } else {
        closeEveningLoop();
    }
}

function prevStep() {
    if (_currentStep > 0) {
        _currentStep--;
        renderStepIndicator();
        renderCurrentStep();
    }
}

function closeEveningLoop() {
    const container = document.getElementById('evening-loop-container');
    if (container) container.classList.add('hidden');
}

export { STEPS, closeEveningLoop };
