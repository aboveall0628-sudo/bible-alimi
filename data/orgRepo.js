/**
 * orgRepo.js — 조직 카드 CRUD
 *
 * 저장 위치: users/{uid}/organizations/{orgId}
 *
 * type: company | church | team | community | family | other
 * stance: ally | neutral | caution | adversary
 *
 * 영적 안전장치는 personRepo와 동일 (stance 변경 시 기도 게이트, 민감 모드 마스킹).
 */

import { db, doc, deleteDoc } from './firebase.js';
import { saveRecord, getRecord, queryRecords, subPath } from './baseRepo.js';

const SUB = 'organizations';

/**
 * 조직 카드 저장(생성/수정)
 */
export async function saveOrganization(dek, userId, data) {
    if (!data.id) {
        data.id = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return saveRecord(dek, subPath(userId, SUB), data, data.id);
}

/**
 * 단일 조직 조회
 */
export async function getOrganization(dek, userId, orgId) {
    return getRecord(dek, subPath(userId, SUB), orgId);
}

/**
 * 사용자의 모든 조직 (이름 정렬)
 */
export async function getAllOrganizations(dek, userId) {
    const orgs = await queryRecords(dek, subPath(userId, SUB));
    return orgs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * type 별 조회
 */
export async function getOrganizationsByType(dek, userId, type) {
    const all = await getAllOrganizations(dek, userId);
    return all.filter(o => o.type === type);
}

/**
 * 이름으로 검색 (자동완성)
 */
export async function searchOrganizations(dek, userId, keyword) {
    if (!keyword || keyword.length < 1) return [];
    const all = await getAllOrganizations(dek, userId);
    const k = keyword.toLowerCase();
    return all.filter(o => (o.name || '').toLowerCase().includes(k));
}

/**
 * 멤버 인물 추가/제거
 */
export async function addMemberToOrg(dek, userId, orgId, personId) {
    const org = await getOrganization(dek, userId, orgId);
    if (!org) return;
    const members = Array.isArray(org.memberPersonIds) ? org.memberPersonIds : [];
    if (!members.includes(personId)) members.push(personId);
    org.memberPersonIds = members;
    return saveOrganization(dek, userId, org);
}

export async function removeMemberFromOrg(dek, userId, orgId, personId) {
    const org = await getOrganization(dek, userId, orgId);
    if (!org) return;
    const members = Array.isArray(org.memberPersonIds) ? org.memberPersonIds : [];
    org.memberPersonIds = members.filter(id => id !== personId);
    return saveOrganization(dek, userId, org);
}

/**
 * 조직 삭제
 */
export async function deleteOrganization(userId, orgId) {
    await deleteDoc(doc(db, 'users', userId, SUB, orgId));
}

/**
 * stance 변경 + 사유 기록 (v3-①-F 영적 안전장치)
 *
 * personRepo.changeStance와 동일한 시맨틱:
 *   - ally → caution/adversary 같은 부정 변경 시 30초 게이트 통과 후 호출
 *   - stanceHistory에 from/to/reason/prayerDone 누적
 */
export async function changeOrgStance(dek, userId, org, newStance, reason, prayerDone) {
    const history = Array.isArray(org.stanceHistory) ? org.stanceHistory.slice() : [];
    history.push({
        from: org.stance || 'neutral',
        to: newStance,
        changedAt: new Date().toISOString(),
        reason: reason || '',
        prayerDone: !!prayerDone,
    });
    org.stance = newStance;
    org.stanceHistory = history;
    return saveOrganization(dek, userId, org);
}
