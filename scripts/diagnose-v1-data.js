/**
 * diagnose-v1-data.js — v1/legacy 데이터 진단
 *
 * 두 가지 소스를 같이 스캔:
 * 1) v1 평문 컬렉션 (memos, dots, principles, goals, bibleProgress, notes, timeboxes)
 * 2) 마이그레이션 백업 (_legacy_dots, _legacy_principles, _legacy_meditations 등)
 *
 * 식별자(acceptedIds) 매칭:
 * - userId 필드가 있고 매칭되면 → 본인 데이터로 인정
 * - userId 필드가 아예 없는 컬렉션(예: memos는 단일 사용자 가정으로 만들어짐)
 *   → assumeOwnerless=true 옵션으로 모두 본인 것으로 흡수
 *
 * 백업(_legacy_*)은 _originalUserId로 원래 식별자 추적.
 */

import { db, getDocs, collection } from '../data/firebase.js';

const V1_COLLECTIONS = [
    'dots', 'meditations', 'memos', 'principles', 'goals',
    'bibleProgress', 'notes', 'timeboxes',
];

const LEGACY_COLLECTIONS = [
    '_legacy_dots', '_legacy_meditations', '_legacy_memos',
    '_legacy_principles', '_legacy_goals', '_legacy_timeboxes',
    '_legacy_notes', '_legacy_bibleProgress',
];

/**
 * @param {string|string[]} acceptedIds 본인 데이터 매칭 후보(이메일/UID)
 * @param {Object} opts { includeLegacy=false, assumeOwnerless=true }
 * @returns {Object} { [collection]: { count, latest, sample, docs, ownerless } }
 */
export async function diagnoseV1Data(acceptedIds, opts = {}) {
    const { includeLegacy = true, assumeOwnerless = true } = opts;
    const idSet = new Set(Array.isArray(acceptedIds) ? acceptedIds : [acceptedIds]);
    const targets = [...V1_COLLECTIONS, ...(includeLegacy ? LEGACY_COLLECTIONS : [])];
    const report = {};

    for (const col of targets) {
        try {
            const snap = await getDocs(collection(db, col));
            if (snap.docs.length === 0) continue;

            // userId 필드가 있는 문서가 하나라도 있나 검사
            const hasUserId = snap.docs.some(d => d.data().userId !== undefined);

            let userDocs;
            let ownerless = false;
            if (hasUserId) {
                // userId 매칭 또는 _originalUserId 매칭(legacy)
                userDocs = snap.docs.filter(d => {
                    const data = d.data();
                    if (data.userId && idSet.has(data.userId)) return true;
                    if (data._originalUserId && idSet.has(data._originalUserId)) return true;
                    return false;
                });
            } else if (assumeOwnerless) {
                // userId가 아예 없는 컬렉션은 단일 사용자 데이터로 가정
                userDocs = snap.docs;
                ownerless = true;
            } else {
                userDocs = [];
            }

            if (userDocs.length === 0) continue;

            const sorted = userDocs.slice().sort((a, b) => {
                const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
                const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
                return tb - ta;
            });
            const latestDoc = sorted[0];

            report[col] = {
                count: userDocs.length,
                ownerless,
                latest: latestDoc.data().createdAt?.toDate
                    ? latestDoc.data().createdAt.toDate().toLocaleString()
                    : (latestDoc.data().date || '알 수 없음'),
                sample: userDocs[0].data(),
                docs: userDocs,
            };
        } catch (e) {
            console.warn(`컬렉션 [${col}] 진단 실패:`, e?.message || e);
        }
    }
    return report;
}

export { V1_COLLECTIONS, LEGACY_COLLECTIONS };
