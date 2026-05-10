/**
 * eveningLoop.js — 저녁 통합 루프 (동적 7~12 단계)
 *
 * 매일 기본 7단계:
 *   1) 시간 정직하게 보기   2) 도트 평가   3) 데이 리포트
 *   4) 회고 읽기            5) 말씀과 기도  6) 내일의 결단
 *   7) 내일 타임박싱
 *
 * 날짜 자동 감지로 추가:
 *   - 토요일 → 주간 회고 (8단계)
 *   - 매월 마지막 토요일 → 주간+월간 (9단계)
 *   - 분기 마지막 토요일(3/6/9/12월) → 주간+월간+분기 (10단계)
 *   - 12월 마지막 토요일 → 주간+월간+분기+연간+5/10년 점검 (12단계)
 *
 * 추가 단계는 동일 5단계 미니 흐름:
 *   데이터 보기 → AI 가설 → 묵상 → 결단 → 다음 기간 계획
 *   (AI 가설은 STEP 2의 Cloud Function 연동 — 현재는 generateLocalFallback 사용)
 */

import { getDEK } from './lockScreen.js';
import { getDotsByDate, computeDotStats } from '../data/dotsRepo.js';
import { checkAndGenerateDayReport, getReport, getReports } from '../data/reportPipeline.js';
import { generateLocalFallback } from '../infra/cloudFunctionProxy.js';

// 매일 기본 7단계
const DAILY_STEPS = [
    { id: 'fill', title: '시간 정직하게 보기', icon: '⏰', desc: '오늘 빈 시간에 뭘 했는지 채워주세요.' },
    { id: 'evaluate', title: '도트 평가', icon: '📊', desc: '각 시간대를 간단히 평가해주세요.' },
    { id: 'report', title: '데이 리포트', icon: '📈', desc: '오늘 하루를 정리하고 있어요...' },
    { id: 'reflect', title: '회고 읽기', icon: '🔍', desc: 'AI가 발견한 패턴을 살펴보세요.' },
    { id: 'pray', title: '말씀과 기도', icon: '🙏', desc: '오늘 말씀과 함께 기도로 가져가세요.' },
    { id: 'decide', title: '내일의 결단', icon: '✍️', desc: '내일 무엇에 순종할 것인가?' },
    { id: 'plan', title: '내일 타임박싱', icon: '📅', desc: '결단을 시간에 배치해보세요.' },
];

// 추가 (계층 회고) 단계 정의 — saturdayReview에서 흡수
const LAYER_CONFIGS = {
    week:    { id: 'review-week',    title: '이번 주 회고',  icon: '📅', collection: 'weekReports' },
    month:   { id: 'review-month',   title: '이번 달 회고',  icon: '🗓', collection: 'monthReports' },
    quarter: { id: 'review-quarter', title: '이번 분기 회고', icon: '📊', collection: 'quarterReports' },
    year:    { id: 'review-year',    title: '올해 회고',     icon: '🎯', collection: 'yearReports' },
    decade:  { id: 'review-decade',  title: '5년/10년 점검', icon: '🌌', collection: 'yearReports' },
};

let _currentStep = 0;
let _userId = null;
let _dateStr = null;
let _steps = DAILY_STEPS;

/**
 * 진입점 — 날짜에 따라 동적으로 단계 구성
 */
export function openEveningLoop(userId, dateStr) {
    _userId = userId;
    _dateStr = dateStr;
    _currentStep = 0;
    _steps = buildDynamicSteps(new Date(dateStr + 'T00:00:00'));

    const container = document.getElementById('evening-loop-container');
    if (!container) return;
    container.classList.remove('hidden');

    renderStepIndicator();
    renderCurrentStep();
}

/**
 * 날짜 분석 → 추가 단계 생성
 */
export function buildDynamicSteps(date) {
    const steps = [...DAILY_STEPS];
    const layers = determineLayers(date);

    if (layers.includes('week'))    steps.push({ ...LAYER_CONFIGS.week,    bonus: true });
    if (layers.includes('month'))   steps.push({ ...LAYER_CONFIGS.month,   bonus: true });
    if (layers.includes('quarter')) steps.push({ ...LAYER_CONFIGS.quarter, bonus: true });
    if (layers.includes('year'))    steps.push({ ...LAYER_CONFIGS.year,    bonus: true });
    if (layers.includes('decade'))  steps.push({ ...LAYER_CONFIGS.decade,  bonus: true });

    return steps;
}

/**
 * 토요일 종류 판별
 *   평일 → []
 *   토 → ['week']
 *   월말 토 → ['week','month']
 *   분기말 토 (3/6/9/12) → +['quarter']
 *   12월말 토 → +['year', 'decade']
 */
export function determineLayers(date = new Date()) {
    if (date.getDay() !== 6) return []; // 토요일 아님

    const layers = ['week'];
    const nextSat = new Date(date);
    nextSat.setDate(nextSat.getDate() + 7);
    const isLastSatOfMonth = nextSat.getMonth() !== date.getMonth();
    if (!isLastSatOfMonth) return layers;

    layers.push('month');
    const month = date.getMonth() + 1;
    if ([3, 6, 9, 12].includes(month)) layers.push('quarter');
    if (month === 12) {
        layers.push('year');
        layers.push('decade');
    }
    return layers;
}

function renderStepIndicator() {
    const indicator = document.getElementById('evening-step-indicator');
    if (!indicator) return;

    indicator.innerHTML = _steps.map((s, i) => `
        <div class="step-dot ${i === _currentStep ? 'active' : ''} ${i < _currentStep ? 'done' : ''} ${s.bonus ? 'bonus' : ''}"
             title="${s.title}" data-step="${i}">
            <span>${i < _currentStep ? '✓' : (i + 1)}</span>
        </div>
        ${i < _steps.length - 1 ? '<div class="step-line"></div>' : ''}
    `).join('');

    // 인디케이터 클릭 → 이전 단계로 이동 가능
    indicator.querySelectorAll('.step-dot').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.step);
            if (idx <= _currentStep) {
                _currentStep = idx;
                renderStepIndicator();
                renderCurrentStep();
            }
        });
    });
}

async function renderCurrentStep() {
    const body = document.getElementById('evening-step-body');
    if (!body) return;

    const step = _steps[_currentStep];
    body.style.opacity = '0';
    body.innerHTML = '';

    setTimeout(async () => {
        body.innerHTML = `
            <div class="step-header">
                <span class="step-icon">${step.icon}</span>
                <h3>${step.title}</h3>
                <p class="step-desc">${step.desc || ''}</p>
            </div>
            <div id="step-content" class="step-content"></div>
            <div class="step-nav">
                <button id="step-prev" class="text-btn" ${_currentStep === 0 ? 'disabled' : ''}>← 이전</button>
                <span style="font-size:12px;color:var(--text-secondary)">
                    ${_currentStep + 1} / ${_steps.length}${step.bonus ? ' (특별 회고)' : ''}
                </span>
                <button id="step-next" class="primary-btn">
                    ${_currentStep === _steps.length - 1 ? '✅ 완료' : '다음 →'}
                </button>
            </div>
        `;

        await loadStepContent(step);

        body.style.transition = 'opacity 200ms ease-out';
        body.style.opacity = '1';

        document.getElementById('step-prev')?.addEventListener('click', prevStep);
        document.getElementById('step-next')?.addEventListener('click', nextStep);

        // 키보드 → 다음 단계
        const onKey = (e) => {
            if (e.key === 'ArrowRight') nextStep();
            if (e.key === 'ArrowLeft') prevStep();
        };
        document.addEventListener('keydown', onKey, { once: true });
    }, 200);
}

async function loadStepContent(step) {
    const content = document.getElementById('step-content');
    if (!content) return;
    const dek = getDEK();

    // 일일 7단계 + 추가 회고 단계 분기
    if (step.id.startsWith('review-')) {
        await loadLayerReview(step, content);
        return;
    }

    switch (step.id) {
        case 'fill':
            content.innerHTML = `
                <p class="step-hint">아래 시간표(오늘 화면 통합 타임라인)에서 빈 칸을 채워주세요.</p>
                <p class="step-hint">한 줄로 적으면 돼요. 정확하지 않아도 괜찮습니다.</p>
                <p style="margin-top:24px;font-size:13px;color:var(--text-secondary)">
                    오늘 화면으로 잠시 돌아갔다가 다시 와도 진행 상태가 유지돼요.
                </p>
            `;
            break;

        case 'evaluate':
            if (!dek) { content.innerHTML = '<p>잠금 상태입니다.</p>'; return; }
            try {
                const dots = await getDotsByDate(dek, _userId, _dateStr);
                const unevaluated = dots.filter(d => !d.executed);
                content.innerHTML = `
                    <p>평가 대기: <strong>${unevaluated.length}개</strong> / 전체 ${dots.length}개</p>
                    <p class="step-hint">통합 타임라인의 각 슬롯을 클릭해 평가하세요. 1~4 단축키로 3초 안에.</p>
                `;
            } catch (e) {
                content.innerHTML = `<p style="color:var(--dot-red)">도트 로드 실패: ${e.message}</p>`;
            }
            break;

        case 'report':
            content.innerHTML = '<div class="spinner"></div><p>리포트를 만들고 있어요...</p>';
            if (dek) {
                try {
                    const reportId = await checkAndGenerateDayReport(dek, _userId);
                    content.innerHTML = reportId
                        ? '<p style="color:var(--dot-green)">✅ 오늘의 리포트가 생성되었어요!</p>'
                        : '<p>이미 리포트가 있거나 평가 데이터가 부족해요.</p>';
                } catch (e) {
                    content.innerHTML = `<p style="color:var(--dot-red)">생성 실패: ${e.message}</p>`;
                }
            }
            break;

        case 'reflect': {
            if (!dek) return;
            const report = await getReport(dek, 'dayReports', `${_userId}_${_dateStr}`);
            if (report) {
                const stats = report.stats || {};
                const fallback = generateLocalFallback(stats);
                content.innerHTML = `
                    <div class="report-stats-mini">
                        <span>완료 ${stats.doneCount || 0}/${stats.totalSlots || 0}</span>
                        <span>만족도 ${stats.avgSatisfaction || '-'}</span>
                        <span>일치율 ${stats.matchRate || 0}%</span>
                    </div>
                    <div class="ai-summary-card">
                        <p>${report.aiSummary || fallback.aiSummary}</p>
                    </div>
                    <p class="step-hint" style="margin-top:16px">
                        ※ AI 패턴 분석은 STEP 2 (Gemini 연동)에서 활성화됩니다.
                    </p>
                `;
            } else {
                content.innerHTML = '<p>리포트가 아직 없어요. 도트 평가를 마저 하시고 다시 와주세요.</p>';
            }
            break;
        }

        case 'pray':
            content.innerHTML = `
                <p class="step-hint">오늘 말씀에서 받은 감동과 위의 패턴을 기도로 가져가보세요.</p>
                <textarea class="pray-textarea" placeholder="기도하며 떠오른 생각을 적어보세요..."></textarea>
            `;
            break;

        case 'decide':
            content.innerHTML = `
                <p class="step-hint">내일 무엇에 순종할 것인가? 한 줄~세 줄.</p>
                <div class="step-decide-list">
                    <input type="text" placeholder="결단 1" />
                    <input type="text" placeholder="결단 2 (선택)" />
                    <input type="text" placeholder="결단 3 (선택)" />
                </div>
                <p class="step-hint" style="margin-top:12px">
                    저장된 결단은 내일 오늘 화면의 결단 패널에 자동으로 나타나요.
                </p>
            `;
            break;

        case 'plan':
            content.innerHTML = `
                <p class="step-hint">위 결단을 내일 시간표에 배치해보세요.</p>
                <p class="step-hint">Google Calendar 일정도 함께 통합 타임라인에 표시됩니다.</p>
            `;
            break;
    }
}

/** 추가 회고 단계 (week/month/quarter/year/decade) — saturdayReview 흡수 */
async function loadLayerReview(step, content) {
    const dek = getDEK();
    if (!dek) { content.innerHTML = '<p>잠금 상태입니다.</p>'; return; }

    try {
        const reports = await getReports(dek, step.collection, _userId, 1);
        if (reports.length === 0) {
            content.innerHTML = `
                <p>${step.title} 리포트가 아직 없어요.</p>
                <p class="step-hint">자동 생성은 STEP 2에서 cron으로 활성화됩니다.</p>
            `;
            return;
        }

        const r = reports[0];
        const stats = r.stats || {};
        const fallback = generateLocalFallback(stats);
        content.innerHTML = `
            <div class="report-stats-mini">
                <span>전체 ${stats.totalSlots || 0}</span>
                <span>완료 ${stats.doneCount || 0}</span>
                <span>만족도 ${stats.avgSatisfaction || '-'}</span>
            </div>
            <div class="ai-summary-card">
                <p>${r.aiSummary || fallback.aiSummary}</p>
            </div>
            <textarea class="pray-textarea" rows="3"
                      placeholder="이 기간에 대해 기도하며 떠오른 것을 적어보세요..."></textarea>
            <input type="text" class="qr-text-input" style="margin-top:8px"
                   placeholder="다음 ${step.title}을(를) 위한 결단 한 줄" />
        `;
    } catch (e) {
        content.innerHTML = `<p style="color:var(--dot-red)">조회 실패: ${e.message}</p>`;
    }
}

function nextStep() {
    if (_currentStep < _steps.length - 1) {
        _currentStep++;
        renderStepIndicator();
        renderCurrentStep();
    } else {
        finishLoop();
    }
}

function prevStep() {
    if (_currentStep > 0) {
        _currentStep--;
        renderStepIndicator();
        renderCurrentStep();
    }
}

function finishLoop() {
    const body = document.getElementById('evening-step-body');
    if (!body) return;
    body.innerHTML = `
        <div class="step-header" style="padding:60px 20px">
            <span class="step-icon">🌙</span>
            <h3>수고하셨어요</h3>
            <p class="step-desc">오늘을 하나님 앞에서 정직하게 마주하셨네요.</p>
            <p style="margin-top:24px;font-size:13px;color:var(--text-secondary)">
                내일 오전 다시 만나요.
            </p>
        </div>
    `;
}

export function closeEveningLoop() {
    const container = document.getElementById('evening-loop-container');
    if (container) container.classList.add('hidden');
}

// computeDotStats를 외부에서도 쓸 수 있게 re-export (호환성)
export { computeDotStats };
