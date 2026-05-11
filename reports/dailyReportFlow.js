/**
 * dailyReportFlow.js — 일간 리포트 생성 공용 함수
 *
 * 사용자가 "리포트 받기" 버튼을 누른 시점에 트리거.
 * 저녁 회고('오늘 리포트' 단계)와 오늘 화면('오늘의 리포트' 카드) 양쪽에서 호출.
 *
 * 흐름
 *   1) 이미 AI 응답이 채워져 있으면 기존 리포트 반환 (재생성 X)
 *   2) 도트 0개면 'no-dots' 상태로 반환
 *   3) aggregateDailyStats → callDailyReport → saveDayReport
 */

import { getDotsByDate } from '../data/dotsRepo.js';
import { db, doc, getDoc } from '../data/firebase.js';
import { readDocument } from '../crypto/cryptoService.js';
import { aggregateDailyStats } from './dailyAggregator.js';
import { getDayReport, saveDayReport } from './dayReportRepo.js';
import { callDailyReport } from '../ui/aiClient.js';

/**
 * 그날의 묵상 노트(content/decisions/prayer) fetch.
 * 가드레일 아래 동기-행동 연결 관찰용 (docs/reports-spec.md §1.5).
 *
 * meditations 컬렉션 doc ID 규약: `meditation_${userId}_${date}` (todayView.js와 동일).
 */
async function getMeditationForDate(dek, userId, date) {
    const id = `meditation_${userId}_${date}`;
    try {
        const snap = await getDoc(doc(db, 'meditations', id));
        if (!snap.exists()) return null;
        const data = await readDocument(dek, snap.data());
        // 빈 본문이면 굳이 LLM에 보내지 않음 (token 절약 + AI 혼란 방지)
        const hasContent = (data.content && data.content.trim().length > 0)
                        || (Array.isArray(data.decisions) && data.decisions.length > 0)
                        || (data.prayer && data.prayer.trim && data.prayer.trim().length > 0);
        if (!hasContent) return null;
        return {
            content:   data.content   || null,
            decisions: data.decisions || null,
            prayer:    data.prayer    || null,
        };
    } catch (e) {
        console.warn('[dailyReportFlow] meditation load failed:', e);
        return null;
    }
}

/**
 * 일간 리포트 생성 (또는 기존 반환)
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<{
 *   status: 'created'|'existed'|'no-dots',
 *   report: Object|null,
 *   fallback: boolean
 * }>}
 */
export async function generateDailyReport(dek, userId, date) {
    // 1) 이미 차있으면 그대로
    const existing = await getDayReport(dek, userId, date);
    if (existing && existing.aiSummary) {
        return { status: 'existed', report: existing, fallback: false };
    }

    // 2) 도트 0개면 의미 있는 리포트 못 만듦
    const dots = await getDotsByDate(dek, userId, date);
    if (dots.length === 0) {
        return { status: 'no-dots', report: null, fallback: false };
    }

    // 3) 집계 + 묵상 노트 fetch → AI 호출 → 저장
    const [stats, meditation] = await Promise.all([
        aggregateDailyStats(dek, userId, date),
        getMeditationForDate(dek, userId, date),
    ]);
    const aiResult = await callDailyReport(stats, {
        persons: [], orgs: [], places: [], amounts: [],
    }, meditation);

    await saveDayReport(dek, userId, date, stats, {
        aiSummary:              aiResult.aiSummary,
        observation:            aiResult.observation,
        questionsForMeditation: aiResult.questionsForMeditation,
    });

    const saved = await getDayReport(dek, userId, date);
    return { status: 'created', report: saved, fallback: aiResult.fallback };
}
