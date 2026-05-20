/**
 * meditationStreak.js — 묵상 연속 일수(streak) 계산 + streak 미션 자동 트리거
 *
 * 2026-05-20 Phase 3 신규.
 *
 * 결: meditations 컬렉션 자리에서 본인 사용자의 date 필드 자리잡힌 자리 모아
 *      오늘부터 거꾸로 연속 자리잡힌 일수 자리. 빠진 자리 첫 자리에서 멈춤.
 *
 * meditations 도큐먼트 자리:
 *   - id: meditation_{userId}_{YYYY-MM-DD}
 *   - userId · date 자리는 평문 자리잡혀 있어요 (rules 자리 통과)
 *   - content·prayer 자리는 암호화 자리 — streak 계산에 자리잡지 X (date 자리만 자리잡으면 됨)
 *
 * 호출 자리:
 *   - todayView.saveMeditationDoc 마지막 자리 → updateStreakMissions(dek, userId)
 *   - 미션 카드 진행도 자리에서 getMeditationStreak(userId) 호출
 */

import { db, collection, query, where, getDocs } from './firebase.js';
import { markMissionComplete } from './personRepo.js';

const STREAK_TARGETS = [3, 7, 14];
const STREAK_MISSION_BY_TARGET = {
    3: 'meditation_streak_3',
    7: 'meditation_streak_7',
    14: 'meditation_streak_14',
};

/**
 * 오늘부터 거꾸로 연속 자리잡힌 일수 자리잡기.
 *
 * @param {string} userId
 * @returns {Promise<number>} 연속 일수 (0 자리도 자연 자리잡힘)
 */
export async function getMeditationStreak(userId) {
    if (!userId) return 0;

    try {
        const q = query(collection(db, 'meditations'), where('userId', '==', userId));
        const snap = await getDocs(q);
        const dates = new Set();
        snap.forEach(d => {
            const data = d.data();
            if (data && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
                dates.add(data.date);
            }
        });

        if (dates.size === 0) return 0;

        // 오늘부터 거꾸로 자리잡혀 있는지 자리잡기
        let streak = 0;
        const cursor = new Date();
        cursor.setHours(0, 0, 0, 0);
        for (let i = 0; i < 365; i += 1) {
            const dateStr = _formatDate(cursor);
            if (dates.has(dateStr)) {
                streak += 1;
                cursor.setDate(cursor.getDate() - 1);
            } else {
                // 오늘 자리잡지 못한 자리에서 어제 자리잡혀 있으면 자리잡혀 있는 결로 자리잡기 (오늘 묵상 아직 X)
                if (i === 0) {
                    cursor.setDate(cursor.getDate() - 1);
                    continue;
                }
                break;
            }
        }
        return streak;
    } catch (e) {
        console.warn('[meditationStreak] getStreak failed:', e?.message || e);
        return 0;
    }
}

/**
 * streak 자리잡힌 자리에서 미션 자동 클리어.
 *   3·7·14 자리 자리잡힐 때마다 markMissionComplete(idempotent).
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 */
export async function updateStreakMissions(dek, userId) {
    if (!dek || !userId) return;
    try {
        const streak = await getMeditationStreak(userId);
        for (const target of STREAK_TARGETS) {
            if (streak >= target) {
                const missionId = STREAK_MISSION_BY_TARGET[target];
                try {
                    await markMissionComplete(dek, userId, missionId, {
                        signal: `meditationStreak>=${target}`,
                    });
                } catch (e) {
                    console.warn(`[meditationStreak] mark ${missionId} failed:`, e?.message || e);
                }
            }
        }
    } catch (e) {
        console.warn('[meditationStreak] updateStreakMissions failed:', e?.message || e);
    }
}

function _formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
