/**
 * principlesRepo.js — 나의 원칙 CRUD (자동 암복호화)
 */

import { db, doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, orderBy, serverTimestamp } from './firebase.js';
import { prepareDocument, readDocument } from '../crypto/cryptoService.js';

export async function savePrinciple(dek, principleData) {
    const id = principleData.id || `principle_${Date.now()}`;

    const meta = {
        id,
        userId: principleData.userId,
        category: principleData.category || 'general',
        pinned: principleData.pinned || false,
        active: principleData.active !== false,
        createdAt: principleData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    const sensitive = {
        title: principleData.title || '',
        body: principleData.body || '',
    };

    const document = await prepareDocument(dek, meta, sensitive);
    await setDoc(doc(db, 'principles', id), document, { merge: true });
    return id;
}

export async function getPrinciples(dek, userId) {
    const q = query(collection(db, 'principles'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const principles = [];
    for (const d of snapshot.docs) {
        try {
            principles.push(await readDocument(dek, d.data()));
        } catch (e) {
            principles.push(d.data());
        }
    }
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
