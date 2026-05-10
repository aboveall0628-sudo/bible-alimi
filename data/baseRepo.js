/**
 * baseRepo.js — 공통 리포지토리 레이어
 * 모든 데이터 접근은 이 레이어를 거치며, POLICY에 따라 자동 암/복호화됩니다.
 */

import { db, doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from './firebase.js';
import { prepareDocument, readDocument } from '../crypto/cryptoService.js';
import { POLICY } from '../config/encryptionPolicy.js';

/**
 * 범용 저장 (자동 암호화)
 * @param {CryptoKey} dek 
 * @param {string} collectionName 
 * @param {Object} data 
 * @param {string} docId (Optional)
 */
export async function saveRecord(dek, collectionName, data, docId = null) {
    const policy = POLICY[collectionName];
    if (!policy) throw new Error(`No encryption policy for ${collectionName}`);

    const id = docId || data.id || `${collectionName}_${Date.now()}`;
    
    const meta = { id, updatedAt: serverTimestamp() };
    const sensitive = {};

    policy.plaintext.forEach(k => {
        if (data[k] !== undefined) meta[k] = data[k];
    });
    // 기본값 설정 (존재하지 않는 경우)
    if (!meta.createdAt && !data.id) meta.createdAt = serverTimestamp();

    policy.encrypted.forEach(k => {
        if (data[k] !== undefined) sensitive[k] = data[k];
    });

    const document = await prepareDocument(dek, meta, sensitive);
    await setDoc(doc(db, collectionName, id), document, { merge: true });
    return id;
}

/**
 * 범용 단건 조회 (자동 복호화)
 */
export async function getRecord(dek, collectionName, docId) {
    const docSnap = await getDoc(doc(db, collectionName, docId));
    if (!docSnap.exists()) return null;
    return readDocument(dek, docSnap.data());
}

/**
 * 범용 목록 조회 (자동 복호화)
 * @param {CryptoKey} dek 
 * @param {Object} firestoreQuery - query(collection(...), where(...))
 */
export async function queryRecords(dek, firestoreQuery) {
    const snapshot = await getDocs(firestoreQuery);
    const results = [];
    for (const docSnap of snapshot.docs) {
        try {
            results.push(await readDocument(dek, docSnap.data()));
        } catch (e) {
            console.warn(`Decrypt failed for ${docSnap.id}`, e);
            // V2.0부터는 실패 시 에러 던지기 (레거시 무시 정책)
            throw e;
        }
    }
    return results;
}
