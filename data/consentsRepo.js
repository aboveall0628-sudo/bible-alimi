/**
 * consentsRepo.js — 개인정보처리방침·서비스 약관 동의 기록 CRUD (2026-05-18 v81)
 *
 * 컬렉션: users/{userId}/consents/{consentId}
 *
 * ⚠️ 평문 정책 — encryptionPolicy.js consents 참고.
 *   법적 입증 자료. 분쟁 시 "누가·언제·어떤 버전에 동의했는지" 증명용.
 *
 * 권한:
 *   - 본인: 자기 동의 기록 읽기·생성 (firestore.rules users/{uid} 와일드카드 매처)
 *   - 삭제·수정: 코드에서 호출 안 함 (법적 보존)
 *
 * 약관 버전 갱신 시: 새 도큐먼트 추가 결로 이력 누적.
 */

import {
    db, doc, setDoc, collection,
    query, orderBy, limit, getDocs, serverTimestamp,
} from './firebase.js';

const SUB = 'consents';

function consentId() {
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `consent_${stamp}_${rand}`;
}

function consentDocRef(userId, id) {
    return doc(db, 'users', userId, SUB, id);
}

function consentCollRef(userId) {
    return collection(db, 'users', userId, SUB);
}

// ─── 생성 ─────────────────────────────────────────────────

/**
 * 새 동의 기록 저장. 가입 직후·약관 갱신 시 호출.
 *
 * @param {string} userId
 * @param {Object} payload
 * @param {string} payload.version  - 'v1.1' 등
 * @param {boolean} payload.agreeTerms
 * @param {boolean} payload.agreePrivacy
 * @param {boolean} payload.agreeSensitive
 * @param {boolean} payload.agreeOverseas
 * @param {boolean} payload.agreeAge14
 * @param {string} [payload.userAgent]
 * @returns {Promise<string>} consentId
 */
export async function saveConsent(userId, payload) {
    if (!userId) throw new Error('saveConsent: userId required');
    const id = consentId();
    const record = {
        id,
        userId,
        version: payload.version,
        consentedAt: serverTimestamp(),
        userAgent: payload.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        agreeTerms: !!payload.agreeTerms,
        agreePrivacy: !!payload.agreePrivacy,
        agreeSensitive: !!payload.agreeSensitive,
        agreeOverseas: !!payload.agreeOverseas,
        agreeAge14: !!payload.agreeAge14,
    };
    await setDoc(consentDocRef(userId, id), record);
    return id;
}

// ─── 조회 ─────────────────────────────────────────────────

/**
 * 동의 기록이 1건이라도 있는지 확인 (가입 흐름 안 빠른 가드용).
 * @returns {Promise<boolean>}
 */
export async function hasAnyConsent(userId) {
    if (!userId) return false;
    try {
        const q = query(consentCollRef(userId), limit(1));
        const snap = await getDocs(q);
        return !snap.empty;
    } catch (e) {
        console.warn('[consentsRepo] hasAnyConsent failed:', e?.message || e);
        return false;
    }
}

/**
 * 가장 최근 동의 기록 1건 — 약관 버전 비교용.
 * @returns {Promise<Object|null>}
 */
export async function getLatestConsent(userId) {
    if (!userId) return null;
    try {
        const q = query(consentCollRef(userId), orderBy('consentedAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        return snap.docs[0].data();
    } catch (e) {
        console.warn('[consentsRepo] getLatestConsent failed:', e?.message || e);
        return null;
    }
}
