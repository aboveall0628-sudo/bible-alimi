/**
 * quarterlyReportFlow.js — 분기 리포트 생성 공용 함수 (Phase E-9/R-3)
 *
 * 흐름 (월간/주간과 동일):
 *   1) aggregateQuarterlyStats → yearQuarter 결정
 *   2) 기존 리포트 있고 force=false 면 그대로 반환
 *   3) totalDots 0이면 'no-dots'
 *   4) enrichStatsForLLM (personId → name)
 *   5) callQuarterlyReport (AI)
 *   6) saveQuarterReport
 */

import { aggregateQuarterlyStats } from './quarterlyAggregator.js';
import { getQuarterReport, saveQuarterReport } from './quarterReportRepo.js';
import { callQuarterlyReport } from '../ui/aiClient.js';
import { getAllPersons } from '../data/personRepo.js';

async function enrichStatsForLLM(dek, userId, stats) {
    const personItems = stats.personNetwork?.items || [];
    if (personItems.length === 0) {
        return { statsForLLM: stats, personNames: [] };
    }
    const allPersons = await getAllPersons(dek, userId).catch(() => []);
    const personNameById = new Map(allPersons.map(p => [p.id, p.name || '(이름 미지정)']));
    const personsForLLM = personItems.map(({ personId, ...rest }) => ({
        name: personNameById.get(personId) || '(알 수 없는 인물)',
        ...rest,
    }));
    const statsForLLM = {
        ...stats,
        personNetwork: { ...stats.personNetwork, items: personsForLLM },
    };
    const personNames = personsForLLM.map(p => p.name).filter(n => n && !n.startsWith('('));
    return { statsForLLM, personNames };
}

/**
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {string} quarterStart - 'YYYY-MM-DD'
 * @param {string} quarterEnd   - 'YYYY-MM-DD' (포함)
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false]
 * @returns {Promise<{ status: 'created'|'existed'|'no-dots', report: Object|null, fallback: boolean }>}
 */
export async function generateQuarterlyReport(dek, userId, quarterStart, quarterEnd, opts = {}) {
    const rawStats = await aggregateQuarterlyStats(dek, userId, quarterStart, quarterEnd);
    const yearQuarter = rawStats.yearQuarter;

    const existing = await getQuarterReport(dek, userId, yearQuarter);
    if (!opts.force && existing && existing.aiSummary) {
        return { status: 'existed', report: existing, fallback: false };
    }

    if (rawStats.totalDots === 0) {
        return { status: 'no-dots', report: null, fallback: false };
    }

    const { statsForLLM, personNames } = await enrichStatsForLLM(dek, userId, rawStats);

    const aiResult = await callQuarterlyReport(statsForLLM, {
        persons: personNames,
        orgs:    [],
        places:  [],
        amounts: [],
    }, null, { force: !!opts.force });

    await saveQuarterReport(dek, userId, quarterStart, quarterEnd, rawStats, {
        aiSummary:              aiResult.aiSummary,
        hypotheses:             aiResult.hypotheses,
        decisionFlow:           aiResult.decisionFlow,
        principleValidation:    aiResult.principleValidation,
        questionsForMeditation: aiResult.questionsForMeditation,
    });

    const saved = await getQuarterReport(dek, userId, yearQuarter);
    return { status: 'created', report: saved, fallback: aiResult.fallback };
}
