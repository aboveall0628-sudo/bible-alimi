/**
 * reminderGenerator.js — 자동 알람 4종 생성기 (Phase E-7/D-2)
 *
 * 호출 시점: 앱 첫 로드 (잠금 해제 직후, dek 준비된 시점)
 *           날짜가 바뀌었거나, 새 dek 으로 진입했을 때 1회.
 *
 * 모든 함수가 idempotent — saveReminderIfAbsent 가 같은 id 면 skip.
 *
 * 4종 자동 알람:
 *   1) weekly-review     — 토요일이고 이번 주 weekReport 가 아직 없으면
 *   2) yesterday-unrated — 어제 도트 중 평가 안 끝난 게 있으면
 *   3) stale-goal        — daily 목표 중 N일+ 미배치 + status='active'
 *   4) principle-unused  — 핀 원칙이 이번 주 도트에 한 번도 안 박혔으면
 */

import { saveReminderIfAbsent, makeReminderId } from './remindersRepo.js';
import { getDotsByDate, getDotsByDateRange } from './dotsRepo.js';
import { getDailyGoals } from './goalsRepo.js';
import { getPrinciples } from './principlesRepo.js';
import { getAllPersons } from './personRepo.js';
import { getAllOrganizations } from './orgRepo.js';
import { getWeekReport } from '../reports/weekReportRepo.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_GOAL_DAYS_THRESHOLD = 3;   // daily 목표 미배치 N일+ 이면 알람
const EMPTY_CARD_DAYS_THRESHOLD = 3;    // 인물/조직 카드 생성 후 N일+ 미완 시 알람

/**
 * 4종 자동 알람 모두 시도. 각각 try/catch — 하나 실패해도 나머지는 동작.
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {Promise<{ generated: { weekly:number, yesterday:number, stale:number, principle:number } }>}
 */
export async function generateAllAutoReminders(dek, userId, today) {
    const result = { weekly: 0, yesterday: 0, stale: 0, principle: 0, emptyCard: 0 };

    try {
        if (await generateWeeklyReviewReminder(dek, userId, today)) result.weekly = 1;
    } catch (e) { console.warn('[reminderGen] weekly-review failed:', e); }

    try {
        if (await generateYesterdayUnratedReminder(dek, userId, today)) result.yesterday = 1;
    } catch (e) { console.warn('[reminderGen] yesterday-unrated failed:', e); }

    try {
        result.stale = await generateStaleGoalReminders(dek, userId, today);
    } catch (e) { console.warn('[reminderGen] stale-goal failed:', e); }

    try {
        result.principle = await generatePrincipleUnusedReminders(dek, userId, today);
    } catch (e) { console.warn('[reminderGen] principle-unused failed:', e); }

    try {
        result.emptyCard = await generateEmptyCardReminders(dek, userId, today);
    } catch (e) { console.warn('[reminderGen] empty-card failed:', e); }

    return { generated: result };
}

/**
 * ① 토요일이고 이번 주 weekReport 가 아직 없으면 알람 생성.
 * 컨텍스트 ID: yearWeek (같은 주에 한 번)
 */
export async function generateWeeklyReviewReminder(dek, userId, today) {
    const d = new Date(today + 'T00:00:00');
    if (d.getDay() !== 6) return false;   // 토요일(6)만

    const yearWeek = isoYearWeek(today);
    const existingReport = await getWeekReport(dek, userId, yearWeek).catch(() => null);
    if (existingReport && existingReport.aiSummary) return false;   // 이미 만들었으면 알람 X

    const id = makeReminderId(userId, 'weekly-review', yearWeek);
    const res = await saveReminderIfAbsent(dek, {
        id,
        userId,
        type:       'weekly-review',
        title:      '이번 주 회고가 기다리고 있어요',
        body:       '토요일이에요. 한 주의 결을 한 번 그려 보고, 묵상에서 다시 만나 보세요.',
        targetView: 'today',
        dueDate:    today,
    });
    return res.created;
}

/**
 * ② 어제 도트 중 평가 안 끝난 게 있으면 알람.
 * 미평가 = executionSatisfaction 이 null/undefined 인 도트.
 * 컨텍스트 ID: yesterday date (그 어제에 한 번)
 */
export async function generateYesterdayUnratedReminder(dek, userId, today) {
    const yesterday = shiftDate(today, -1);
    const dots = await getDotsByDate(dek, userId, yesterday).catch(() => []);
    if (dots.length === 0) return false;

    const unrated = dots.filter(d => typeof d.executionSatisfaction !== 'number');
    if (unrated.length === 0) return false;

    const id = makeReminderId(userId, 'yesterday-unrated', yesterday);
    const res = await saveReminderIfAbsent(dek, {
        id,
        userId,
        type:       'yesterday-unrated',
        title:      `어제 평가가 ${unrated.length}개 남았어요`,
        body:       '어제의 결을 정리하기 전에 평가가 채워지면 좋아요.',
        targetView: 'today',
        targetParams: { date: yesterday },
        dueDate:    today,
    });
    return res.created;
}

/**
 * ③ stale 목표 — N일+ 묵힌 미배치 daily 목표.
 * 한 목표당 한 알람 (goalId 컨텍스트). 사용자가 알람 [읽음] 처리하면 더는 안 뜸.
 */
export async function generateStaleGoalReminders(dek, userId, today) {
    const goals = await getDailyGoals(dek, userId).catch(() => []);
    const todayMs = new Date(today + 'T00:00:00').getTime();

    let created = 0;
    for (const g of goals) {
        if (g.timeSlot != null) continue;          // 이미 박힌 목표 skip
        if (g.status && g.status !== 'active') continue;

        const createdMs = toMillis(g.createdAt);
        if (createdMs == null) continue;
        const ageDays = Math.floor((todayMs - createdMs) / MS_PER_DAY);
        if (ageDays < STALE_GOAL_DAYS_THRESHOLD) continue;

        const id = makeReminderId(userId, 'stale-goal', g.id);
        const title = (g.title || '(제목 없는 목표)').slice(0, 60);
        const res = await saveReminderIfAbsent(dek, {
            id,
            userId,
            type:       'stale-goal',
            title:      `"${title}" — ${ageDays}일째 시간표에 안 들어갔어요`,
            body:       '오늘 시간표에 옮길지, 아니면 지금은 내려놓을지 한 번 봐 주세요.',
            targetView: 'today',
            targetParams: { goalId: g.id },
            dueDate:    today,
        });
        if (res.created) created++;
    }
    return created;
}

/**
 * ④ 핀 원칙이 이번 주(과거 7일) 도트에 한 번도 안 박혔으면 알람.
 * 컨텍스트 ID: ${principleId}_${yearWeek} (주별·원칙별 한 번)
 */
export async function generatePrincipleUnusedReminders(dek, userId, today) {
    const principles = await getPrinciples(dek, userId).catch(() => []);
    const pinned = principles.filter(p => p.pinned === true);
    if (pinned.length === 0) return 0;

    const weekStart = shiftDate(today, -6);
    const dots = await getDotsByDateRange(dek, userId, weekStart, today).catch(() => []);

    const appliedSet = new Set();
    for (const d of dots) {
        for (const pid of (d.linkedPrincipleIds || [])) appliedSet.add(pid);
    }

    const yearWeek = isoYearWeek(today);
    let created = 0;
    for (const p of pinned) {
        if (appliedSet.has(p.id)) continue;        // 이번 주 한 번이라도 적용됐으면 skip

        const id = makeReminderId(userId, 'principle-unused', `${p.id}_${yearWeek}`);
        const title = (p.title || '(제목 없는 원칙)').slice(0, 60);
        const res = await saveReminderIfAbsent(dek, {
            id,
            userId,
            type:       'principle-unused',
            title:      `핀 원칙 "${title}" — 이번 주 도트에 한 번도 안 박혔어요`,
            body:       '잊고 있었거나, 이번 주에 맞지 않았거나. 묵상에서 한 번 만나 보세요.',
            targetView: 'today',
            targetParams: { principleId: p.id },
            dueDate:    today,
        });
        if (res.created) created++;
    }
    return created;
}

/**
 * ⑤ 인물/조직 카드가 만들어진 지 N일이 지났는데 핵심 필드가 비어있으면 알람.
 *   - 인물: 이름·관계·메모 중 비어있는 게 있으면 (관계는 'unknown'/'acquaintance' 기본도 비어있다고 간주)
 *   - 조직: 이름·종류·메모 중 비어있는 게 있으면
 *   - stub으로 자동 생성된 카드(quickReview에서 inline 추가)는 대개 비어 있으므로 가장 자주 잡힘
 * 컨텍스트 id: 카드 id (한 카드당 한 번만 — 사용자가 채우면 더 이상 안 뜸)
 */
export async function generateEmptyCardReminders(dek, userId, today) {
    let created = 0;
    const todayMs = toMillis(today);

    // ── 인물 ──
    try {
        const persons = await getAllPersons(dek, userId);
        for (const p of (persons || [])) {
            if (p.isFallback) continue;
            const createdMs = toMillis(p.createdAt);
            if (!createdMs) continue;
            const ageDays = Math.floor((todayMs - createdMs) / MS_PER_DAY);
            if (ageDays < EMPTY_CARD_DAYS_THRESHOLD) continue;

            const missing = describeMissingPersonFields(p);
            if (missing.length === 0) continue;

            const id = makeReminderId(userId, 'empty-card-person', p.id);
            const display = (p.name || '').trim() || (Array.isArray(p.nicknames) && p.nicknames[0]) || '이름 없는 인물';
            const res = await saveReminderIfAbsent(dek, {
                id, userId,
                type:       'empty-card-person',
                title:      `${display}님 카드를 마저 채워볼까요?`,
                body:       `${ageDays}일째 빈 곳이 있어요 — ${missing.join(', ')}.`,
                targetView: 'persons',
                targetParams: { personId: p.id },
                dueDate:    today,
            });
            if (res.created) created++;
        }
    } catch (e) { console.warn('[reminderGen] empty-card-person scan failed:', e); }

    // ── 조직 ──
    try {
        const orgs = await getAllOrganizations(dek, userId);
        for (const o of (orgs || [])) {
            const createdMs = toMillis(o.createdAt);
            if (!createdMs) continue;
            const ageDays = Math.floor((todayMs - createdMs) / MS_PER_DAY);
            if (ageDays < EMPTY_CARD_DAYS_THRESHOLD) continue;

            const missing = describeMissingOrgFields(o);
            if (missing.length === 0) continue;

            const id = makeReminderId(userId, 'empty-card-org', o.id);
            const display = (o.name || '').trim() || '이름 없는 조직';
            const res = await saveReminderIfAbsent(dek, {
                id, userId,
                type:       'empty-card-org',
                title:      `${display} 카드를 마저 채워볼까요?`,
                body:       `${ageDays}일째 빈 곳이 있어요 — ${missing.join(', ')}.`,
                targetView: 'organizations',
                targetParams: { orgId: o.id },
                dueDate:    today,
            });
            if (res.created) created++;
        }
    } catch (e) { console.warn('[reminderGen] empty-card-org scan failed:', e); }

    return created;
}

function describeMissingPersonFields(p) {
    const missing = [];
    if (!(p.name || '').trim()) missing.push('이름');
    if (!Array.isArray(p.nicknames) || p.nicknames.length === 0) missing.push('별명');
    // relation은 'acquaintance'(지인) 같은 기본값일 수 있는데, 'unknown'만 진짜 미설정으로 봄
    if (!p.relation || p.relation === 'unknown') missing.push('관계');
    if (!(p.notes || '').trim()) missing.push('메모');
    return missing;
}

function describeMissingOrgFields(o) {
    const missing = [];
    if (!(o.name || '').trim()) missing.push('이름');
    if (!o.type || o.type === 'other') missing.push('종류');
    if (!(o.notes || '').trim()) missing.push('메모');
    return missing;
}

// ─── 헬퍼 ───
function shiftDate(dateStr, deltaDays) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMillis(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') {
        const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v;
        const ms = Date.parse(s);
        return isNaN(ms) ? null : ms;
    }
    return null;
}

function isoYearWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
