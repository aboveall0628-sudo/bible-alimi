/**
 * dotsRepo.js — 도트 CRUD (자동 암복호화)
 *
 * 도트 = 타임박스 한 칸의 실행+평가 데이터.
 * 메타 필드(date, timeSlot, satisfaction 등)는 평문, 텍스트 필드는 암호화.
 */

import { db, doc, deleteDoc, collection, query, where } from './firebase.js';
import { saveRecord, getRecord, queryRecords } from './baseRepo.js';

/**
 * 도트 저장 (신규/수정)
 * @param {CryptoKey} dek
 * @param {Object} dotData - 전체 도트 데이터
 */
export async function saveDot(dek, dotData) {
    const docId = `${dotData.userId}_${dotData.date}_${dotData.timeSlot}`;
    dotData.id = docId;
    return await saveRecord(dek, 'dots', dotData, docId);
}

/**
 * 특정 날짜의 모든 도트 조회.
 * orderBy를 빼고 client-side sort — composite index 없이도 동작하도록.
 * (Firestore는 equality 2개만으론 자동 단일필드 인덱스로 처리 가능)
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {string} date - "2026-05-10"
 * @returns {Object[]}
 */
export async function getDotsByDate(dek, userId, date) {
    const q = query(
        collection(db, 'dots'),
        where('userId', '==', userId),
        where('date', '==', date)
    );
    const dots = await queryRecords(dek, q);
    return dots.sort((a, b) => (a.timeSlot ?? 0) - (b.timeSlot ?? 0));
}

/**
 * 특정 도트 1개 조회
 */
export async function getDot(dek, docId) {
    return await getRecord(dek, 'dots', docId);
}

/**
 * 날짜 범위의 도트 조회 (리포트 집계용)
 *
 * Firestore 규칙: where(userId==) + where(date 범위) 조합도 composite index
 * (userId, date) 필요. 인덱스 미배포 환경에서 throw 발생.
 *
 * 89bd651 의 countMeditations 와 동일 패턴 — userId 만으로 fetch 후 클라이언트
 * 에서 date 필터링 + 정렬. 단일 사용자라 도트 총량이 폭증할 가능성 작음.
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {string} startDate - inclusive
 * @param {string} endDate   - inclusive
 * @returns {Object[]} (date asc, timeSlot asc)
 */
export async function getDotsByDateRange(dek, userId, startDate, endDate) {
    const q = query(
        collection(db, 'dots'),
        where('userId', '==', userId)
    );
    const all = await queryRecords(dek, q);
    return all
        .filter(d => d.date && d.date >= startDate && d.date <= endDate)
        .sort((a, b) => {
            const dc = (a.date || '').localeCompare(b.date || '');
            if (dc) return dc;
            return (a.timeSlot ?? 0) - (b.timeSlot ?? 0);
        });
}

/**
 * 도트 삭제 (시계부에서 X 버튼)
 */
export async function deleteDot(id) {
    await deleteDoc(doc(db, 'dots', id));
}

/**
 * 사용자의 모든 도트 조회 (인물/조직 카드 통계 집계용).
 *
 * linkedPersonIds / linkedOrgIds 가 encrypted 필드라 Firestore 쿼리로 직접
 * 필터링할 수 없다 → 클라이언트가 전체를 받아 복호화 후 메모리 집계.
 * 도트 수가 매우 많아지면 페이지네이션 보강이 필요할 수 있다.
 */
export async function getAllDots(dek, userId) {
    const q = query(
        collection(db, 'dots'),
        where('userId', '==', userId)
    );
    const dots = await queryRecords(dek, q);
    return dots.sort((a, b) => {
        const dc = (a.date || '').localeCompare(b.date || '');
        if (dc) return dc;
        return (a.timeSlot ?? 0) - (b.timeSlot ?? 0);
    });
}

/**
 * 도트 통계 계산 (리포트용, 복호화 불필요 — 메타 필드만)
 */
export function computeDotStats(dots) {
    const total = dots.length;
    if (total === 0) return {
        totalSlots: 0, doneCount: 0, partialCount: 0,
        replacedCount: 0, skippedCount: 0,
        avgSatisfaction: 0, topLabelIds: [], matchRate: 0,
    };

    const counts = { done: 0, partial: 0, replaced: 0, skipped: 0 };
    let satSum = 0;
    const labelCount = {};

    dots.forEach(d => {
        counts[d.executed] = (counts[d.executed] || 0) + 1;
        satSum += d.executionSatisfaction || 0;
        (d.labelIds || []).forEach(lid => {
            labelCount[lid] = (labelCount[lid] || 0) + 1;
        });
    });

    const topLabels = Object.entries(labelCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([labelId, count]) => ({ labelId, count }));

    return {
        totalSlots: total,
        doneCount: counts.done,
        partialCount: counts.partial,
        replacedCount: counts.replaced,
        skippedCount: counts.skipped,
        avgSatisfaction: +(satSum / total).toFixed(1),
        topLabelIds: topLabels,
        matchRate: total > 0 ? Math.round((counts.done / total) * 100) : 0,
    };
}
