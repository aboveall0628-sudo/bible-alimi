/**
 * dashboard.js — 대시보드 뷰 UI
 *
 * 카드 구성:
 * - 🌟 오늘의 발견 (성장 지표 — 영적 톤)
 * - 📖 통독 진도 (4파트, bibleProgress 컬렉션 + scripture.js의 진도 계산)
 * - 🙏 묵상 충실도 (최근 7일 묵상 노트 작성률)
 * - 💚 감사 도트 (최근 7일 spiritual_high)
 * - (고급 — 디폴트 숨김) 일치율 / 평균 만족도 / 실행 분포
 */

import { db, collection, query, where, getDocs, limit } from '../data/firebase.js';
import { getDotsByDateRange, computeDotStats } from '../data/dotsRepo.js';
import { getDEK } from './lockScreen.js';

export async function renderDashboardView(userId) {
    const container = document.getElementById('dashboard-cards');
    if (!container) return;

    const dek = getDEK();
    if (!dek) {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">잠시 잠겨있어요. 비밀번호로 열어주세요.</div>';
        return;
    }

    container.innerHTML = '<div class="spinner" style="grid-column: 1/-1; margin: 40px auto"></div>';

    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const past7 = new Date();
    past7.setDate(today.getDate() - 6);
    const startDate = past7.toISOString().split('T')[0];

    const [dots, bibleProgress, meditationCount] = await Promise.all([
        getDotsByDateRange(dek, userId, startDate, endDate).catch(() => []),
        getBibleProgress(userId).catch(() => []),
        countMeditations(userId, startDate, endDate).catch(() => 0),
    ]);

    const stats = computeDotStats(dots);
    const bible = computeBibleProgress(bibleProgress);
    const meditationRate = Math.round((meditationCount / 7) * 100);

    container.innerHTML = `
        <div class="dash-card">
            <h3>🌟 오늘의 발견</h3>
            <div class="dash-value">${stats.doneCount + stats.partialCount}<span style="font-size:14px;color:var(--text-secondary)"> / ${stats.totalSlots}</span></div>
            <p class="dash-desc">최근 7일 시간 흔적</p>
        </div>

        <div class="dash-card">
            <h3>📖 통독 진도</h3>
            <div class="dash-value highlight">${bible.percent}%</div>
            <p class="dash-desc">${bible.detail}</p>
        </div>

        <div class="dash-card">
            <h3>🙏 묵상 충실도</h3>
            <div class="dash-value">${meditationCount}<span style="font-size:14px;color:var(--text-secondary)"> / 7일</span></div>
            <p class="dash-desc">${meditationRate}% — 매일 한 줄 묵상을 이어가요</p>
        </div>

        <div class="dash-card">
            <h3>💚 감사한 시간</h3>
            <div class="dash-value">${stats.doneCount}</div>
            <p class="dash-desc">계획대로 살아낸 슬롯 수</p>
        </div>

        <div class="dash-card" style="grid-column: 1/-1; cursor: pointer; opacity: 0.85" id="dash-advanced-toggle">
            <h3>📊 자세한 지표 펼치기 ▾</h3>
            <p class="dash-desc">일치율, 평균 만족도, 실행 분포 등 (디폴트 숨김 — 율법적 비교 방지)</p>
        </div>

        <div id="dash-advanced" class="hidden" style="grid-column: 1/-1; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-4)">
            <div class="dash-card">
                <h3>일치율</h3>
                <div class="dash-value">${stats.matchRate}%</div>
                <p class="dash-desc">계획 대비 완료</p>
            </div>
            <div class="dash-card">
                <h3>평균 만족도</h3>
                <div class="dash-value">${stats.avgSatisfaction} <span style="font-size:14px;color:var(--text-secondary)">/ 5</span></div>
                <p class="dash-desc">${stats.totalSlots}개 슬롯</p>
            </div>
            <div class="dash-card">
                <h3>실행 분포</h3>
                <p class="dash-desc" style="margin-top:0; font-size: 13px">
                    완료 ${stats.doneCount} · 부분 ${stats.partialCount}<br>
                    대체 ${stats.replacedCount} · 못함 ${stats.skippedCount}
                </p>
            </div>
        </div>
    `;

    // 고급 지표 펼치기 토글
    const toggle = document.getElementById('dash-advanced-toggle');
    const advanced = document.getElementById('dash-advanced');
    if (toggle && advanced) {
        toggle.addEventListener('click', () => {
            advanced.classList.toggle('hidden');
            const h3 = toggle.querySelector('h3');
            if (h3) h3.textContent = advanced.classList.contains('hidden')
                ? '📊 자세한 지표 펼치기 ▾'
                : '📊 자세한 지표 접기 ▴';
        });
    }
}

// ─── 통독 진도 ───
async function getBibleProgress(userId) {
    try {
        const q = query(
            collection(db, 'bibleProgress'),
            where('userId', '==', userId),
            limit(2000)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data());
    } catch (e) {
        console.warn('bibleProgress query failed:', e);
        return [];
    }
}

function computeBibleProgress(records) {
    if (!records || records.length === 0) {
        return { percent: 0, detail: '아직 기록이 없어요. 오늘부터 한 장씩 시작해 보세요.' };
    }
    // 4파트 각각의 완독 비율 평균. completed=true인 것 카운트.
    const partTotals = { 1: 281, 2: 410, 3: 249, 4: 260 }; // scripture.js의 4파트 챕터 수 합계
    const completedByPart = { 1: 0, 2: 0, 3: 0, 4: 0 };

    records.forEach(r => {
        if (r.completed && r.partId && completedByPart[r.partId] !== undefined) {
            completedByPart[r.partId]++;
        }
    });

    const partPercents = [1, 2, 3, 4].map(p => Math.round((completedByPart[p] / partTotals[p]) * 100));
    const overall = Math.round(partPercents.reduce((a, b) => a + b, 0) / 4);
    return {
        percent: overall,
        detail: `시가 ${partPercents[0]}% · 모세+대선지 ${partPercents[1]}% · 역사+소선지 ${partPercents[2]}% · 신약 ${partPercents[3]}%`,
    };
}

// ─── 묵상 작성 횟수 ───
async function countMeditations(userId, startDate, endDate) {
    try {
        const q = query(
            collection(db, 'meditations'),
            where('userId', '==', userId),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
        );
        const snap = await getDocs(q);
        return snap.docs.length;
    } catch (e) {
        console.warn('meditations count failed:', e);
        return 0;
    }
}
