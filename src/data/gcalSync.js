/**
 * gcalSync.js — Google Calendar 이벤트 ↔ daily 목표 양방향 정합
 *
 * Phase E-6 (2026-05-11)
 * 현재는 정방향(GCal → daily goal)만 처리. 역방향(goal → GCal push)은
 * ui/app.js#pushDecisionsToGoogleCalendar 가 담당.
 *
 * 왜 필요한가:
 *   - 시간표에 GCal 이벤트가 별도 레이어로만 보였음 → goals 컬렉션엔 안 들어옴
 *   - 결과: 사용자가 만든 daily 목표가 시간표에 안 들어가고 "미배치"로 놀게 됨
 *   - 해결: GCal 이벤트가 들어오면 같은 시간 슬롯의 daily 목표로 자동 생성·갱신
 *
 * 중복 방지: goal.gcalEventId 로 매칭. 이미 있으면 timeSlot/title 만 갱신.
 *
 * dedup 한계:
 *   사용자가 옛 수동 목표("면담")를 미배치 상태로 두고, GCal 에 같은 일정이 있으면
 *   자동 변환으로 별도 목표("면담" + gcalEventId)가 새로 생김. 제목 매칭 dedup 은
 *   오탐 위험 있어 하지 않음. 사용자가 수동 정리 권장.
 */

import { getDailyGoals, saveGoal } from './goalsRepo.js';

const SLOTS_PER_HOUR = 4;

/**
 * GCal 이벤트 배열을 daily 목표 컬렉션과 정합.
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {Array} gcalEvents - listUpcomingEvents() 출력 그대로
 * @param {string} date      - 'YYYY-MM-DD' (이 날의 timeline 기준)
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
export async function syncGcalEventsToDailyGoals(dek, userId, gcalEvents, date) {
    if (!Array.isArray(gcalEvents) || gcalEvents.length === 0) {
        return { created: 0, updated: 0, skipped: 0 };
    }

    const existingGoals = await getDailyGoals(dek, userId).catch(() => []);
    const byGcalId = new Map();
    for (const g of existingGoals) {
        if (g.gcalEventId) byGcalId.set(g.gcalEventId, g);
    }

    let created = 0, updated = 0, skipped = 0;

    for (const ev of gcalEvents) {
        const range = gcalEventToSlotRange(ev);
        if (!range) { skipped++; continue; }   // 종일 / 잘못된 시간 이벤트
        if (!ev.id) { skipped++; continue; }   // 식별자 없는 이벤트는 매칭 불가

        const timeSlot      = range.start;
        const durationSlots = Math.max(1, range.end - range.start);
        const title         = (ev.summary || '(이름 없는 일정)').trim();

        const existing = byGcalId.get(ev.id);
        if (existing) {
            // 시간·제목이 바뀌었으면 갱신만. 그 외 사용자 편집(라벨 등)은 보존.
            const titleChanged = (existing.title || existing.text || '') !== title;
            const slotChanged  = existing.timeSlot !== timeSlot
                              || existing.durationSlots !== durationSlots;
            if (titleChanged || slotChanged) {
                existing.title         = title;
                existing.timeSlot      = timeSlot;
                existing.durationSlots = durationSlots;
                existing.placedAt      = existing.placedAt || Date.now();
                await saveGoal(dek, existing);
                updated++;
            } else {
                skipped++;
            }
            continue;
        }

        // 새 daily 목표 생성
        const newGoal = {
            id:            `${Date.now()}_gcal_${ev.id.slice(0, 8)}`,
            userId,
            period:        'daily',
            title,
            timeSlot,
            durationSlots,
            startDate:     date,
            placedAt:      Date.now(),
            createdAt:     Date.now(),
            status:        'active',
            order:         0,
            gcalEventId:   ev.id,
        };
        await saveGoal(dek, newGoal);
        created++;
    }

    return { created, updated, skipped };
}

/**
 * GCal 이벤트의 start/end → 15분 슬롯 범위.
 * ui/timeline.js#gcalEventToSlotRange 와 동일 로직 (서로 독립 유지를 위해 복제).
 * 종일 이벤트(dateTime 없음)는 null 반환.
 */
function gcalEventToSlotRange(ev) {
    try {
        const startStr = ev.start?.dateTime;
        const endStr   = ev.end?.dateTime;
        if (!startStr || !endStr) return null;   // 종일 이벤트는 skip
        const s = new Date(startStr);
        const e = new Date(endStr);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
        const startSlot = Math.floor((s.getHours() * 60 + s.getMinutes()) / 15);
        const endSlot   = Math.ceil((e.getHours() * 60 + e.getMinutes()) / 15);
        return { start: startSlot, end: Math.max(startSlot + 1, endSlot) };
    } catch { return null; }
}
