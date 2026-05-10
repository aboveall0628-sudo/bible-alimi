/**
 * goalsRepo.js — 7계층 목표 CRUD (자동 암복호화)
 * 
 * 계층: daily → weekly → monthly → quarterly → yearly → 5year → 10year
 */

import { db, doc, deleteDoc, collection, query, where, orderBy } from './firebase.js';
import { saveRecord, queryRecords } from './baseRepo.js';

const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', '5year', '10year'];

/**
 * 목표 저장
 */
export async function saveGoal(dek, goalData) {
    return await saveRecord(dek, 'goals', goalData, goalData.id);
}

/**
 * 사용자의 모든 목표 조회
 */
export async function getAllGoals(dek, userId) {
    const q = query(
        collection(db, 'goals'),
        where('userId', '==', userId),
        orderBy('period', 'asc')
    );
    return await queryRecords(dek, q);
}

/**
 * 특정 기간의 활성 목표 조회 (타임박싱 모달 자동 추천용)
 */
export async function getActiveGoalsByPeriod(dek, userId, period) {
    const q = query(
        collection(db, 'goals'),
        where('userId', '==', userId),
        where('period', '==', period),
        where('status', '==', 'active')
    );
    return await queryRecords(dek, q);
}

/**
 * 특정 목표의 하위 목표 조회
 */
export async function getChildGoals(dek, userId, parentGoalId) {
    const q = query(
        collection(db, 'goals'),
        where('userId', '==', userId),
        where('parentGoalId', '==', parentGoalId)
    );
    return await queryRecords(dek, q);
}

/**
 * 목표를 트리 구조로 변환
 */
export function buildGoalTree(goals) {
    const map = {};
    const roots = [];

    goals.forEach(g => { map[g.id] = { ...g, children: [] }; });
    goals.forEach(g => {
        if (g.parentGoalId && map[g.parentGoalId]) {
            map[g.parentGoalId].children.push(map[g.id]);
        } else {
            roots.push(map[g.id]);
        }
    });

    return roots;
}

/**
 * 목표 삭제
 */
export async function deleteGoal(goalId) {
    await deleteDoc(doc(db, 'goals', goalId));
}

export { PERIODS };
