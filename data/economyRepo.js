/**
 * economyRepo.js — 경제 모듈 CRUD (자동 암복호화)
 *
 * 7개 컬렉션 (모두 users/{uid}/<col>/ 서브컬렉션):
 *   - accounts            계좌 카드
 *   - assetCategories     자산 분류 라벨
 *   - assets              자산 항목 (가진 것)
 *   - liabilities         부채 항목 (빚)
 *   - transactions        거래 영수증 ★ 가장 많이 쌓임
 *   - cashflowSnapshots   월별 현금흐름 요약
 *   - netWorthSnapshots   월별 순자산 요약
 *
 * 영적 안전장치:
 *   - bucket(평문) / exact(암호화) 패턴으로 절대값 본인만
 *   - giving 카테고리는 별도 식별 (영적 시각 강조)
 *   - 통계는 디폴트 숨김 (UI 레벨)
 */

import { db, doc, deleteDoc, query, where } from './firebase.js';
import { saveRecord, getRecord, queryRecords, subPath, colRef } from './baseRepo.js';
import { amountToBucket } from '../config/economyBuckets.js';

// ═══════════════════════════════════════════════════
//  ACCOUNTS — 통장/계좌 카드
// ═══════════════════════════════════════════════════

const ACCOUNTS = 'accounts';

export async function saveAccount(dek, userId, data) {
    if (!data.id) {
        data.id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    return saveRecord(dek, subPath(userId, ACCOUNTS), data, data.id);
}

export async function getAllAccounts(dek, userId) {
    const list = await queryRecords(dek, subPath(userId, ACCOUNTS));
    return list.sort((a, b) => {
        // primary 먼저, 그 다음 createdAt
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

export async function deleteAccount(userId, accountId) {
    await deleteDoc(doc(db, 'users', userId, ACCOUNTS, accountId));
}

// ═══════════════════════════════════════════════════
//  ASSET CATEGORIES — 자산 분류 라벨
// ═══════════════════════════════════════════════════

const ASSET_CATS = 'assetCategories';

export async function saveAssetCategory(dek, userId, data) {
    if (!data.id) {
        data.id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    if (!data.kind) data.kind = 'asset';
    return saveRecord(dek, subPath(userId, ASSET_CATS), data, data.id);
}

export async function getAllAssetCategories(dek, userId) {
    return queryRecords(dek, subPath(userId, ASSET_CATS));
}

export async function deleteAssetCategory(userId, categoryId) {
    await deleteDoc(doc(db, 'users', userId, ASSET_CATS, categoryId));
}

// ═══════════════════════════════════════════════════
//  ASSETS — 가진 것 (자산 항목)
// ═══════════════════════════════════════════════════

const ASSETS = 'assets';

export async function saveAsset(dek, userId, data) {
    if (!data.id) {
        data.id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    // bucket 자동 계산 (exactValue 가 있으면)
    if (data.exactValue != null && !data.currentValueBucket) {
        data.currentValueBucket = amountToBucket(data.exactValue);
    }
    if (data.exactValue != null) data.lastValuationAt = new Date().toISOString();
    return saveRecord(dek, subPath(userId, ASSETS), data, data.id);
}

export async function getAllAssets(dek, userId) {
    return queryRecords(dek, subPath(userId, ASSETS));
}

export async function getAssetsByCategory(dek, userId, categoryId) {
    const all = await getAllAssets(dek, userId);
    return all.filter(a => a.categoryId === categoryId);
}

export async function deleteAsset(userId, assetId) {
    await deleteDoc(doc(db, 'users', userId, ASSETS, assetId));
}

// ═══════════════════════════════════════════════════
//  LIABILITIES — 빚
// ═══════════════════════════════════════════════════

const LIABILITIES = 'liabilities';

export async function saveLiability(dek, userId, data) {
    if (!data.id) {
        data.id = `liab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    if (data.exactPrincipal != null && !data.principalBucket) {
        data.principalBucket = amountToBucket(data.exactPrincipal);
    }
    return saveRecord(dek, subPath(userId, LIABILITIES), data, data.id);
}

export async function getAllLiabilities(dek, userId) {
    return queryRecords(dek, subPath(userId, LIABILITIES));
}

export async function deleteLiability(userId, liabilityId) {
    await deleteDoc(doc(db, 'users', userId, LIABILITIES, liabilityId));
}

// ═══════════════════════════════════════════════════
//  TRANSACTIONS — 거래 영수증 ★
// ═══════════════════════════════════════════════════

const TRANSACTIONS = 'transactions';

/**
 * 거래 저장.
 * data: { date, direction, exactAmount?, amountBucket?, category, subCategory?,
 *         description?, accountId?, linkedDotId?, linkedPersonIds?, linkedOrgIds?,
 *         linkedAssetId?, linkedLiabilityId?, incomeType?, expenseType? }
 *
 * amountBucket 미지정 + exactAmount 있으면 자동 계산.
 * exactAmount 미지정 + amountBucket 만 있으면 OK (빠른 입력 시).
 */
export async function saveTransaction(dek, userId, data) {
    if (!data.id) {
        data.id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    if (!data.date) data.date = new Date().toISOString().slice(0, 10);
    if (!data.direction) data.direction = 'expense';
    if (data.exactAmount != null && !data.amountBucket) {
        data.amountBucket = amountToBucket(data.exactAmount);
    }
    if (!data.amountBucket) data.amountBucket = 'small'; // 안전망
    return saveRecord(dek, subPath(userId, TRANSACTIONS), data, data.id);
}

export async function getTransaction(dek, userId, txId) {
    return getRecord(dek, subPath(userId, TRANSACTIONS), txId);
}

/**
 * 특정 날짜의 거래 (오늘 화면용).
 * Firestore composite index 회피 — 전체 fetch 후 클라이언트 필터.
 */
export async function getTransactionsByDate(dek, userId, date) {
    const all = await queryRecords(dek, subPath(userId, TRANSACTIONS));
    return all
        .filter(t => t.date === date)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * 날짜 범위 거래 (월간 스냅샷 / 통계용).
 */
export async function getTransactionsByDateRange(dek, userId, fromDate, toDate) {
    const all = await queryRecords(dek, subPath(userId, TRANSACTIONS));
    return all
        .filter(t => t.date >= fromDate && t.date <= toDate)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export async function getAllTransactions(dek, userId) {
    const all = await queryRecords(dek, subPath(userId, TRANSACTIONS));
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function deleteTransaction(userId, txId) {
    await deleteDoc(doc(db, 'users', userId, TRANSACTIONS, txId));
}

// ═══════════════════════════════════════════════════
//  SNAPSHOTS — 월별 cashflow + netWorth
// ═══════════════════════════════════════════════════

const CASHFLOW = 'cashflowSnapshots';
const NETWORTH = 'netWorthSnapshots';

/**
 * 월 문자열 형식: "YYYY-MM"
 */
export function monthKey(dateOrStr) {
    const s = typeof dateOrStr === 'string' ? dateOrStr : dateOrStr.toISOString().slice(0, 7);
    return s.slice(0, 7);
}

export async function saveCashflowSnapshot(dek, userId, data) {
    const id = `cf_${data.month}`;
    data.id = id;
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    return saveRecord(dek, subPath(userId, CASHFLOW), data, id);
}

export async function getCashflowSnapshot(dek, userId, month) {
    return getRecord(dek, subPath(userId, CASHFLOW), `cf_${month}`);
}

export async function getAllCashflowSnapshots(dek, userId) {
    const list = await queryRecords(dek, subPath(userId, CASHFLOW));
    return list.sort((a, b) => (a.month || '').localeCompare(b.month || ''));
}

export async function saveNetWorthSnapshot(dek, userId, data) {
    const id = `nw_${data.month}`;
    data.id = id;
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    return saveRecord(dek, subPath(userId, NETWORTH), data, id);
}

export async function getNetWorthSnapshot(dek, userId, month) {
    return getRecord(dek, subPath(userId, NETWORTH), `nw_${month}`);
}

export async function getAllNetWorthSnapshots(dek, userId) {
    const list = await queryRecords(dek, subPath(userId, NETWORTH));
    return list.sort((a, b) => (a.month || '').localeCompare(b.month || ''));
}

// ═══════════════════════════════════════════════════
//  유틸: 빈 상태 감지 (마법사 노출 결정용)
// ═══════════════════════════════════════════════════

export async function isEconomyEmpty(dek, userId) {
    const accts = await getAllAccounts(dek, userId);
    return accts.length === 0;
}
