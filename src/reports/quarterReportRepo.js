/**
 * quarterReportRepo.js — 분기 리포트 Firestore CRUD
 *
 * Reports 모듈 STEP 3 (Phase E-9/R-3) — 2026-05-13
 * config/encryptionPolicy.js의 quarterReports 정책 기준.
 *
 * reportId: `${userId}_${yearQuarter}` (예: `uid_2026-Q2`)
 *
 * encrypted: aiSummary, hypotheses, decisionFlow, principleValidation,
 *            questionsForMeditation, userNotes
 */

import {
    db, collection, query, where, limit, serverTimestamp,
} from '../data/firebase.js';
import { saveRecord, getRecord, queryRecords } from '../data/baseRepo.js';

const COLLECTION = 'quarterReports';

export async function saveQuarterReport(dek, userId, quarterStart, quarterEnd, stats, aiSections = {}) {
    const yearQuarter = stats?.yearQuarter;
    if (!yearQuarter) throw new Error('saveQuarterReport: stats.yearQuarter 누락');

    const reportId = `${userId}_${yearQuarter}`;

    const data = {
        id:                     reportId,
        userId,
        period:                 'quarter',
        startDate:              quarterStart,
        endDate:                quarterEnd,
        stats,
        aiSummary:              aiSections.aiSummary              ?? null,
        hypotheses:             aiSections.hypotheses             ?? [],
        decisionFlow:           aiSections.decisionFlow           ?? null,
        principleValidation:    aiSections.principleValidation    ?? [],
        questionsForMeditation: aiSections.questionsForMeditation ?? [],
        userNotes:              '',
        drillDownChildIds:      [],
        createdAt:              serverTimestamp(),
    };

    await saveRecord(dek, COLLECTION, data, reportId);
    return reportId;
}

export async function getQuarterReport(dek, userId, yearQuarter) {
    const reportId = `${userId}_${yearQuarter}`;
    return getRecord(dek, COLLECTION, reportId);
}

/**
 * 최근 N개 분기 리포트 — composite index 회피 (userId 단일 where + 클라이언트 정렬)
 */
export async function listQuarterReports(dek, userId, limitCount = 8) {
    const q = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        limit(50),
    );
    const all = await queryRecords(dek, q);
    return all
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
        .slice(0, limitCount);
}

export async function quarterReportExists(dek, userId, yearQuarter) {
    return (await getQuarterReport(dek, userId, yearQuarter)) !== null;
}
