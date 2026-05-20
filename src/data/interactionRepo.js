/**
 * interactionRepo.js — 상호작용 로그 CRUD
 *
 * 저장 위치: users/{uid}/interactions/{interactionId}
 *
 * dot에 인물·조직이 연결될 때 자동 생성되거나, 사용자가 회의·만남 후
 * 직접 작성. 인물 카드 상세 페이지의 타임라인이 이 컬렉션을 소비.
 *
 * 가명화: AI 호출 전에 personIds[]/orgIds[]가 P_001/O_001로 변환됨.
 */

import { db, doc, deleteDoc, query, where, orderBy } from './firebase.js';
import { saveRecord, getRecord, queryRecords, colRef, subPath } from './baseRepo.js';
import { touchLastInteraction } from './personRepo.js';

const SUB = 'interactions';

/**
 * 상호작용 저장
 */
export async function saveInteraction(dek, userId, data) {
    if (!data.id) {
        data.id = `inter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.date) data.date = new Date().toISOString().split('T')[0];

    const id = await saveRecord(dek, subPath(userId, SUB), data, data.id);

    // 연결된 인물들의 lastInteractionAt 갱신
    if (Array.isArray(data.personIds)) {
        for (const pid of data.personIds) {
            try { await touchLastInteraction(dek, userId, pid); }
            catch (e) { console.warn('touchLastInteraction failed:', e); }
        }
    }
    return id;
}

/**
 * 단일 조회
 */
export async function getInteraction(dek, userId, interactionId) {
    return getRecord(dek, subPath(userId, SUB), interactionId);
}

/**
 * 특정 인물의 상호작용 히스토리 (타임라인 표시용, 최신순)
 *
 * 주의: personIds가 encrypted 필드라 Firestore에서 직접 where 못 함.
 * 모두 가져와서 클라이언트 측에서 필터링 (단일 사용자 데이터라 OK).
 */
export async function getInteractionsForPerson(dek, userId, personId) {
    const all = await queryRecords(dek, subPath(userId, SUB));
    return all
        .filter(i => Array.isArray(i.personIds) && i.personIds.includes(personId))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * 특정 조직의 상호작용 히스토리
 */
export async function getInteractionsForOrg(dek, userId, orgId) {
    const all = await queryRecords(dek, subPath(userId, SUB));
    return all
        .filter(i => Array.isArray(i.orgIds) && i.orgIds.includes(orgId))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * 특정 도트에 연결된 상호작용
 */
export async function getInteractionsForDot(dek, userId, dotId) {
    // dotId는 plaintext라 Firestore에서 직접 where 가능
    const q = query(colRef(subPath(userId, SUB)), where('dotId', '==', dotId));
    return queryRecords(dek, q);
}

/**
 * 최근 N일 상호작용 (대시보드/리포트용)
 */
export async function getRecentInteractions(dek, userId, daysBack = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const q = query(
        colRef(subPath(userId, SUB)),
        where('date', '>=', cutoffStr),
        orderBy('date', 'desc')
    );
    return queryRecords(dek, q);
}

export async function deleteInteraction(userId, interactionId) {
    await deleteDoc(doc(db, 'users', userId, SUB, interactionId));
}
