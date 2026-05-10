/**
 * personRepo.js — 인물 카드 CRUD (자동 암복호화)
 *
 * 저장 위치: users/{uid}/persons/{personId}
 *
 * 4-층 프로파일:
 *   Layer 1 정체성: name, nicknames, avatar, relation, innerCircle
 *   Layer 2 성격(Big Five): O/C/E/A/N (0-100)
 *   Layer 3 능력 스탯: 8 기본 + 사용자 정의 (0-100)
 *   Layer 4 관계: closeness/trust/friendliness/importance (1-5), stance
 *
 * 영적 안전장치:
 *   - stance 변경 시 (특히 ally→caution/adversary) 30초 기도 게이트 강제
 *   - 적대 카드 진입 시 meaningfulVerse 자동 노출
 *   - AI 호출 전 가명화 (P_001 토큰)
 */

import { db, doc, deleteDoc, query, where, orderBy } from './firebase.js';
import { saveRecord, getRecord, queryRecords, subPath, colRef } from './baseRepo.js';

const SUB = 'persons';

/**
 * 인물 카드 저장(생성/수정)
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {Object} data - 인물 카드 필드 일체
 */
export async function savePerson(dek, userId, data) {
    if (!data.id) {
        data.id = `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return saveRecord(dek, subPath(userId, SUB), data, data.id);
}

/**
 * 단일 인물 카드 조회
 */
export async function getPerson(dek, userId, personId) {
    return getRecord(dek, subPath(userId, SUB), personId);
}

/**
 * 사용자의 모든 인물 카드 조회 (정렬: 최근 상호작용 → 이름)
 */
export async function getAllPersons(dek, userId) {
    const persons = await queryRecords(dek, subPath(userId, SUB));
    return persons.sort((a, b) => {
        const ta = a.lastInteractionAt?.toMillis ? a.lastInteractionAt.toMillis() : 0;
        const tb = b.lastInteractionAt?.toMillis ? b.lastInteractionAt.toMillis() : 0;
        if (tb !== ta) return tb - ta;
        return (a.name || '').localeCompare(b.name || '');
    });
}

/**
 * stance 별 필터 조회 (ally/neutral/caution/adversary)
 */
export async function getPersonsByStance(dek, userId, stance) {
    const all = await getAllPersons(dek, userId);
    return all.filter(p => p.stance === stance);
}

/**
 * innerCircle (가족·배우자·소수의 친밀권)만 조회
 */
export async function getInnerCircle(dek, userId) {
    const all = await getAllPersons(dek, userId);
    return all.filter(p => p.innerCircle === true);
}

/**
 * 이름·별명으로 검색 (자동완성용)
 */
export async function searchPersons(dek, userId, keyword) {
    if (!keyword || keyword.length < 1) return [];
    const all = await getAllPersons(dek, userId);
    const k = keyword.toLowerCase();
    return all.filter(p => {
        if ((p.name || '').toLowerCase().includes(k)) return true;
        if (Array.isArray(p.nicknames) && p.nicknames.some(n => n.toLowerCase().includes(k))) return true;
        return false;
    });
}

/**
 * stance 변경 + 사유 기록 (영적 안전장치)
 *
 * ally → caution/adversary 같은 부정 변경 시:
 *   1) 30초 기도 게이트 통과 후에만 호출
 *   2) prayerDone=true 보장
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {Object} person - 기존 카드
 * @param {string} newStance
 * @param {string} reason - 변경 사유 (암호화 저장)
 * @param {boolean} prayerDone
 */
export async function changeStance(dek, userId, person, newStance, reason, prayerDone) {
    const history = Array.isArray(person.stanceHistory) ? person.stanceHistory.slice() : [];
    history.push({
        from: person.stance || 'neutral',
        to: newStance,
        changedAt: new Date().toISOString(),
        reason: reason || '',
        prayerDone: !!prayerDone,
    });
    person.stance = newStance;
    person.stanceHistory = history;
    return savePerson(dek, userId, person);
}

/**
 * 마지막 상호작용 시간 갱신 (interaction 저장 시 호출)
 */
export async function touchLastInteraction(dek, userId, personId) {
    const person = await getPerson(dek, userId, personId);
    if (!person) return;
    person.lastInteractionAt = new Date().toISOString();
    return savePerson(dek, userId, person);
}

/**
 * 인물 카드 삭제
 */
export async function deletePerson(userId, personId) {
    await deleteDoc(doc(db, 'users', userId, SUB, personId));
}

/**
 * fallback 카드(미등록 인물용 기본 프로필) 자동 생성
 *   - "지인 일반", "낯선 사람", "거래처 미상" 등
 */
export async function ensureFallbackCard(dek, userId, kind) {
    const fallbackId = `person_fallback_${kind}`;
    const existing = await getPerson(dek, userId, fallbackId);
    if (existing) return existing;

    const map = {
        'general':   { name: '지인 일반',   relation: 'acquaintance' },
        'stranger':  { name: '낯선 사람',   relation: 'unknown' },
        'vendor':    { name: '거래처 미상', relation: 'client' },
    };
    const meta = map[kind] || map.general;
    const data = {
        id: fallbackId,
        name: meta.name,
        relation: meta.relation,
        innerCircle: false,
        stance: 'neutral',
        isFallback: true,
        nicknames: [],
        bigFive: { O: null, C: null, E: null, A: null, N: null },
        competencies: {},
        relationship: { closeness: null, trust: null, friendliness: null, importance: null },
        stanceHistory: [],
        createdAt: new Date().toISOString(),
    };
    await savePerson(dek, userId, data);
    return data;
}
