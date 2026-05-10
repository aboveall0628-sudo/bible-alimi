/**
 * principlesRepo.js — 나의 원칙 CRUD (자동 암복호화)
 */

import { db, doc, deleteDoc, collection, query, where } from './firebase.js';
import { saveRecord, queryRecords } from './baseRepo.js';

export async function savePrinciple(dek, principleData) {
    if (!principleData.category) principleData.category = 'general';
    return await saveRecord(dek, 'principles', principleData, principleData.id);
}

export async function getPrinciples(dek, userId) {
    const q = query(collection(db, 'principles'), where('userId', '==', userId));
    const principles = await queryRecords(dek, q);
    
    // 클라이언트 사이드 정렬 (pinned 먼저, 최신순)
    return principles.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return timeB - timeA;
    });
}

export async function deletePrinciple(id) {
    await deleteDoc(doc(db, 'principles', id));
}
