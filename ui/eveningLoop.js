/**
 * eveningLoop.js — 저녁 통합 루프 (스크롤 방식)
 *
 * 한 페이지에 모든 단계가 세로로 펼쳐지고, 사용자가 자연스럽게 스크롤하며 진행.
 * 단계 wizard 폐기. 인디케이터는 sticky로 상단 고정 + 클릭 시 부드러운 anchor 스크롤.
 *
 * 매일 7단계 + 날짜에 따라 추가 회고 (토/월말/분기말/연말)
 */

import { getDEK } from './lockScreen.js';
import { getDotsByDate, computeDotStats } from '../data/dotsRepo.js';
import { checkAndGenerateDayReport, getReport, getReports } from '../data/reportPipeline.js';
import { generateLocalFallback } from '../infra/cloudFunctionProxy.js';
import { saveDecision } from '../data/decisionsRepo.js';
import { showToast } from './quickReview.js';
import { callLLM } from './aiClient.js';

const DAILY_STEPS = [
    { id: 'fill',     title: '시간 정직하게 보기',  icon: '⏰', desc: '오늘 빈 시간에 무엇을 했는지 떠올려 봐요.' },
    { id: 'evaluate', title: '도트 평가',         icon: '📊', desc: '각 시간을 한마디로 짧게 마음에 새겨요.' },
    { id: 'report',   title: '오늘의 리포트',      icon: '📈', desc: '오늘 하루를 정리해 볼게요.' },
    { id: 'reflect',  title: '회고 읽기',         icon: '🔍', desc: '내가 발견한 패턴을 천천히 살펴봐요.' },
    { id: 'pray',     title: '말씀과 기도',        icon: '🙏', desc: '오늘 받은 말씀을 기도로 가져가요.' },
    { id: 'decide',   title: '내일의 결단',        icon: '✍️', desc: '내일은 어디에 순종할까요?' },
    { id: 'plan',     title: '내일 시간 잡기',     icon: '📅', desc: '내 결단을 시간 위에 놓아 봐요.' },
];

const LAYER_CONFIGS = {
    week:    { id: 'review-week',    title: '이번 주 회고',  icon: '📅', collection: 'weekReports' },
    month:   { id: 'review-month',   title: '이번 달 회고',  icon: '🗓', collection: 'monthReports' },
    quarter: { id: 'review-quarter', title: '이번 분기 회고', icon: '📊', collection: 'quarterReports' },
    year:    { id: 'review-year',    title: '올해 회고',     icon: '🎯', collection: 'yearReports' },
    decade:  { id: 'review-decade',  title: '5년·10년 점검', icon: '🌌', collection: 'yearReports' },
};

let _userId = null;
let _dateStr = null;
let _steps = DAILY_STEPS;

/**
 * 진입점 — openEveningLoop(userId, dateStr)
 * 한 번에 모든 섹션을 그려 사용자가 자유 스크롤하며 진행
 */
export function openEveningLoop(userId, dateStr) {
    _userId = userId;
    _dateStr = dateStr;
    _steps = buildDynamicSteps(new Date(dateStr + 'T00:00:00'));

    const container = document.getElementById('evening-loop-container');
    if (!container) return;
    container.classList.remove('hidden');

    renderEveningPage();
    // 각 섹션의 비동기 컨텐츠 로드 (병렬)
    _steps.forEach(s => loadSectionContent(s).catch(e => console.warn(`[eveningLoop] ${s.id} 로드 실패:`, e)));
}

/**
 * 날짜 분석 → 추가 단계 결정
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

export function determineLayers(date = new Date()) {
    if (date.getDay() !== 6) return [];
    const layers = ['week'];
    const nextSat = new Date(date);
    nextSat.setDate(nextSat.getDate() + 7);
    const isLastSatOfMonth = nextSat.getMonth() !== date.getMonth();
    if (!isLastSatOfMonth) return layers;
    layers.push('month');
    const month = date.getMonth() + 1;
    if ([3, 6, 9, 12].includes(month)) layers.push('quarter');
    if (month === 12) { layers.push('year'); layers.push('decade'); }
    return layers;
}

// ─── 페이지 전체 렌더 ───
function renderEveningPage() {
    const indicator = document.getElementById('evening-step-indicator');
    const body = document.getElementById('evening-step-body');
    if (!indicator || !body) return;

    // 상단 sticky 인디케이터 — 점 + 단계명, 클릭 시 해당 섹션으로 스크롤
    indicator.innerHTML = _steps.map((s, i) => `
        <a href="#el-${s.id}" class="el-indicator-dot ${s.bonus ? 'bonus' : ''}" data-step="${s.id}">
            <span class="el-indicator-num">${i + 1}</span>
            <span class="el-indicator-title">${s.icon} ${s.title}</span>
        </a>
    `).join('');

    // 진행률(스크롤 위치 기반)에 따라 인디케이터 강조
    indicator.classList.add('el-sticky-indicator');

    // 본문: 각 섹션 카드를 세로로
    body.innerHTML = _steps.map((s) => `
        <section class="el-section" id="el-${s.id}" data-step="${s.id}">
            <div class="el-section-header">
                <span class="el-section-icon">${s.icon}</span>
                <h2 class="el-section-title">${s.title}</h2>
                ${s.bonus ? '<span class="el-section-bonus">특별 회고</span>' : ''}
            </div>
            <p class="el-section-desc">${s.desc || ''}</p>
            <div class="el-section-body" data-step-body="${s.id}">
                <div class="el-section-loading">잠깐만요, 가져오는 중이에요...</div>
            </div>
        </section>
    `).join('') + `
        <section class="el-section el-section-finish">
            <div class="el-section-header">
                <span class="el-section-icon">🌙</span>
                <h2 class="el-section-title">수고하셨어요</h2>
            </div>
            <p class="el-section-desc">
                오늘을 정직하게 마주해 주셨네요.<br>
                내일 오전, 다시 만나요.
            </p>
            <div style="text-align:center; margin-top: 24px">
                <button id="el-close-btn" class="primary-btn">오늘 화면으로 돌아가기</button>
            </div>
        </section>
    `;

    // 인디케이터 클릭 → 부드러운 스크롤
    indicator.querySelectorAll('.el-indicator-dot').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const id = el.dataset.step;
            const target = document.getElementById(`el-${id}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // 닫기 버튼
    document.getElementById('el-close-btn')?.addEventListener('click', closeEveningLoop);

    // 스크롤 추적 (현재 보고 있는 섹션 인디케이터 강조)
    setupScrollTracking();
}

function setupScrollTracking() {
    const sections = document.querySelectorAll('.el-section');
    const dots = document.querySelectorAll('.el-indicator-dot');
    if (sections.length === 0 || dots.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.dataset.step || entry.target.id.replace('el-', '');
                dots.forEach(d => d.classList.toggle('active', d.dataset.step === id));
            }
        });
    }, { rootMargin: '-30% 0px -50% 0px', threshold: 0 });

    sections.forEach(s => observer.observe(s));
}

// ─── 각 섹션 컨텐츠 로드 (비동기, 독립) ───
async function loadSectionContent(step) {
    const body = document.querySelector(`[data-step-body="${step.id}"]`);
    if (!body) return;
    const dek = getDEK();

    if (step.id.startsWith('review-')) {
        await renderLayerReview(step, body);
        return;
    }

    switch (step.id) {
        case 'fill':
            body.innerHTML = `
                <div class="el-tip">
                    오늘 화면 위 시간표로 잠시 돌아가서 빈 칸을 채워 봐요.<br>
                    한 줄로 적으면 되고, 정확하지 않아도 괜찮아요.
                </div>
                <button id="el-jump-today" class="text-btn">→ 오늘 화면으로 잠깐 다녀오기</button>
            `;
            body.querySelector('#el-jump-today')?.addEventListener('click', () => {
                document.getElementById('nav-today')?.click();
            });
            break;

        case 'evaluate': {
            if (!dek) { body.innerHTML = '<p>잠시 잠겨있어요. 비밀번호로 열어주세요.</p>'; return; }
            try {
                const dots = await getDotsByDate(dek, _userId, _dateStr);
                const unevaluated = dots.filter(d => !d.executed || d.executed === 'pending');
                body.innerHTML = `
                    <div class="el-stat-row">
                        <div class="el-stat"><span class="el-stat-num">${unevaluated.length}</span><span class="el-stat-lbl">아직 평가 전</span></div>
                        <div class="el-stat"><span class="el-stat-num">${dots.length}</span><span class="el-stat-lbl">전체 슬롯</span></div>
                    </div>
                    <p class="el-tip">
                        오늘 화면의 시간표에서 슬롯을 톡 누르면 3초 안에 평가할 수 있어요.<br>
                        키보드 1~4를 누르면 더 빠르게 끝나요.
                    </p>
                `;
            } catch (e) {
                body.innerHTML = `<p style="color:var(--dot-red)">잠깐 문제가 있었어요. 다시 한 번 해볼까요?</p>`;
            }
            break;
        }

        case 'report':
            body.innerHTML = '<div class="spinner" style="margin: 0 auto"></div><p style="text-align:center">오늘 리포트를 만드는 중이에요...</p>';
            if (dek) {
                try {
                    const reportId = await checkAndGenerateDayReport(dek, _userId);
                    body.innerHTML = reportId
                        ? '<p style="color:var(--dot-green); text-align:center">✅ 오늘 리포트가 만들어졌어요!</p>'
                        : '<p style="text-align:center">이미 오늘 리포트가 있거나, 아직 평가가 부족해요.</p>';
                } catch (e) {
                    body.innerHTML = `<p style="color:var(--dot-red)">생성이 잘 안 됐어요: ${e?.message || e}</p>`;
                }
            }
            break;

        case 'reflect': {
            if (!dek) return;
            const report = await getReport(dek, 'dayReports', `${_userId}_${_dateStr}`);
            if (!report) {
                body.innerHTML = '<p>아직 리포트가 없어요. 평가를 마저 하시고 위에서 다시 만들어 볼까요?</p>';
                return;
            }
            const stats = report.stats || {};

            // 일단 통계만 먼저 그리고, AI 요약은 비동기 채움 (Cloud Function 미배포 시 fallback)
            body.innerHTML = `
                <div class="el-stat-row">
                    <div class="el-stat"><span class="el-stat-num">${stats.doneCount || 0}<small>/${stats.totalSlots || 0}</small></span><span class="el-stat-lbl">완료</span></div>
                    <div class="el-stat"><span class="el-stat-num">${stats.avgSatisfaction || '-'}</span><span class="el-stat-lbl">만족도</span></div>
                    <div class="el-stat"><span class="el-stat-num">${stats.matchRate || 0}<small>%</small></span><span class="el-stat-lbl">계획 일치율</span></div>
                </div>
                <div class="ai-summary-card">
                    <p id="reflect-ai-text">잠깐만요, 패턴을 살펴보고 있어요...</p>
                    <p id="reflect-ai-tag" style="font-size:11px;color:var(--text-secondary);margin-top:8px"></p>
                </div>
                <p class="el-tip">
                    숫자는 비교가 아니라 거울이에요. 잘잘못 가리기보다는, 어떤 결이 보이는지만 살펴봐요.
                </p>
            `;

            // 이미 저장된 aiSummary가 있으면 우선 사용, 없으면 AI 호출 시도
            (async () => {
                let text = report.aiSummary;
                let isFallback = false;
                if (!text) {
                    const result = await callLLM('dayReport', {
                        date: _dateStr,
                        stats,
                        context: { persons: [], amounts: [] },
                    }, { stats });
                    text = result.text;
                    isFallback = result.fallback;
                }
                const aiEl = document.getElementById('reflect-ai-text');
                const tagEl = document.getElementById('reflect-ai-tag');
                if (aiEl) aiEl.textContent = text;
                if (tagEl) tagEl.textContent = isFallback
                    ? '※ 지금은 간단 요약만 보여드려요. AI 분석은 곧 활성화될 예정이에요.'
                    : '🌟 AI가 살펴본 오늘의 결';
            })();
            break;
        }

        case 'pray':
            body.innerHTML = `
                <p class="el-tip">오늘 말씀에서 받은 마음, 위에서 본 패턴을 기도로 가져가 봐요.</p>
                <textarea class="pray-textarea" data-step="pray"
                          placeholder="기도하다 떠오른 생각을 한 줄씩 적어 봐요..."></textarea>
            `;
            break;

        case 'decide':
            body.innerHTML = `
                <p class="el-tip">내일은 어디에 순종할까요? 한 줄도 좋고 세 줄도 좋아요.</p>
                <div class="step-decide-list">
                    <input type="text" data-decide-idx="0" placeholder="결단 1" />
                    <input type="text" data-decide-idx="1" placeholder="결단 2 (안 적어도 돼요)" />
                    <input type="text" data-decide-idx="2" placeholder="결단 3 (안 적어도 돼요)" />
                </div>
                <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center">
                    <button id="el-decide-save" class="primary-btn">내일 결단으로 저장</button>
                    <span id="el-decide-status" style="font-size:12px;color:var(--text-secondary)"></span>
                </div>
                <p class="el-tip" style="margin-top: 16px">
                    저장한 결단은 내일 오늘 화면의 결단 패널에 자동으로 떠요.
                </p>
            `;
            body.querySelector('#el-decide-save')?.addEventListener('click', () => saveTomorrowDecisions(body));
            break;

        case 'plan':
            body.innerHTML = `
                <p class="el-tip">결단을 내일 시간표에 미리 놓아둘 수 있어요.</p>
                <p class="el-tip">내일 오전 오늘 화면에서, 결단 카드의 ⋮⋮ 핸들을 시간표로 끌어 옮기면 돼요.</p>
                <p class="el-tip">Google 캘린더 일정도 함께 보여요.</p>
            `;
            break;
    }
}

async function renderLayerReview(step, body) {
    const dek = getDEK();
    if (!dek) { body.innerHTML = '<p>잠시 잠겨있어요. 비밀번호로 열어주세요.</p>'; return; }

    try {
        const reports = await getReports(dek, step.collection, _userId, 1);
        if (reports.length === 0) {
            body.innerHTML = `
                <p>${step.title} 리포트가 아직 없어요.</p>
                <p class="el-tip">자동 생성은 다음 단계에서 활성화될 예정이에요.</p>
            `;
            return;
        }
        const r = reports[0];
        const stats = r.stats || {};
        const fallback = generateLocalFallback(stats);
        body.innerHTML = `
            <div class="el-stat-row">
                <div class="el-stat"><span class="el-stat-num">${stats.totalSlots || 0}</span><span class="el-stat-lbl">전체</span></div>
                <div class="el-stat"><span class="el-stat-num">${stats.doneCount || 0}</span><span class="el-stat-lbl">완료</span></div>
                <div class="el-stat"><span class="el-stat-num">${stats.avgSatisfaction || '-'}</span><span class="el-stat-lbl">만족도</span></div>
            </div>
            <div class="ai-summary-card">
                <p>${r.aiSummary || fallback.aiSummary}</p>
            </div>
            <textarea class="pray-textarea" rows="3"
                      placeholder="이 기간을 기도로 정리하며 떠오른 것을 적어 봐요..."></textarea>
            <input type="text" class="qr-text-input" style="margin-top:8px"
                   placeholder="다음 ${step.title}을(를) 위한 결단 한 줄" />
        `;
    } catch (e) {
        body.innerHTML = `<p style="color:var(--dot-red)">못 가져왔어요: ${e?.message || e}</p>`;
    }
}

// ─── 내일의 결단 저장 ───
async function saveTomorrowDecisions(body) {
    const dek = getDEK();
    if (!dek) { showToast('잠시 잠겨 있어요. 비밀번호로 열어 주실래요?'); return; }

    const inputs = body.querySelectorAll('input[data-decide-idx]');
    const status = body.querySelector('#el-decide-status');

    // 내일 날짜 계산
    const today = new Date(_dateStr + 'T00:00:00');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    let saved = 0;
    for (const input of inputs) {
        const text = input.value.trim();
        if (!text) continue;
        try {
            await saveDecision(dek, {
                userId: _userId,
                date: tomorrowStr,
                text,
                timeSlot: null,
                durationSlots: 4,
                order: saved,
            });
            saved++;
        } catch (e) {
            console.warn('decide save failed:', e);
        }
    }

    if (status) {
        if (saved > 0) {
            status.textContent = `✅ 내일(${tomorrowStr}) 결단 ${saved}개 저장했어요`;
            status.style.color = 'var(--dot-green)';
            inputs.forEach(i => i.value = '');
        } else {
            status.textContent = '한 줄이라도 적어 볼까요?';
            status.style.color = 'var(--text-secondary)';
        }
    }
}

export function closeEveningLoop() {
    const container = document.getElementById('evening-loop-container');
    if (container) container.classList.add('hidden');
    document.getElementById('nav-today')?.click();
}

export { computeDotStats };
