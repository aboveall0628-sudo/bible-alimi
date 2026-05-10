/**
 * diagnose-v1-data.js — V1 옛 컬렉션 진단
 *
 * v1은 식별자 형식이 일관되지 않을 수 있어(이메일/UID/가짜 ID 등)
 * acceptedIds 배열에 매칭할 모든 후보를 받습니다.
 */

import { db, getDocs, collection } from '../data/firebase.js';

const LEGACY_COLLECTIONS = [
    'dots', 'meditations', 'principles', 'goals',
    'bibleProgress', 'notes', 'timeboxes'
];

/**
 * @param {string|string[]} acceptedIds - 본인 데이터로 인정할 userId 후보(들)
 * @returns {Object} { [collection]: { count, latest, sample, docs } }
 */
export async function diagnoseV1Data(acceptedIds) {
    const idSet = new Set(Array.isArray(acceptedIds) ? acceptedIds : [acceptedIds]);
    const report = {};

    for (const col of LEGACY_COLLECTIONS) {
        try {
            const snap = await getDocs(collection(db, col));
            const userDocs = snap.docs.filter(d => {
                const uid = d.data().userId;
                return uid && idSet.has(uid);
            });

            if (userDocs.length > 0) {
                const sorted = userDocs.slice().sort((a, b) => {
                    const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
                    const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
                    return tb - ta;
                });
                const latestDoc = sorted[0];

                report[col] = {
                    count: userDocs.length,
                    latest: latestDoc.data().createdAt?.toDate
                        ? latestDoc.data().createdAt.toDate().toLocaleString()
                        : '알 수 없음',
                    sample: userDocs[0].data(),
                    docs: userDocs,
                };
            }
        } catch (e) {
            console.error(`컬렉션 [${col}] 진단 실패:`, e);
        }
    }
    return report;
}

export { LEGACY_COLLECTIONS };
