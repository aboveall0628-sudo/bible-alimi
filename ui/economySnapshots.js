/**
 * economySnapshots.js — 월별 cashflow + netWorth 스냅샷 생성 헬퍼.
 *
 * 호출:
 *   - 경제 통계 탭의 "이 달 가계부 요약 만들기" 버튼
 *   - (별도 회차) 월말 토요일 저녁 회고 단계
 *
 * 영적 안전장치:
 *   - cashflow 의 평문 필드는 비율(savingsRate, passiveRatio)만
 *   - 절대값 합산(totalsExact)은 모두 자물쇠 안
 *   - AI 인사이트(aiInsights) 는 llmProxy 배포 후 별도 회차에서
 */

import { amountToBucket } from '../config/economyBuckets.js';
import {
    getTransactionsByDateRange,
    getAllAssets, getAllLiabilities,
    saveCashflowSnapshot, saveNetWorthSnapshot,
} from '../data/economyRepo.js';

/**
 * 특정 월의 가계부 요약 + 순자산 스냅샷 두 장 한 번에 생성.
 *
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {string} month - "YYYY-MM"
 * @param {Object} cache - { assets, liabilities, ... } 이미 로드된 경우 재사용
 * @returns {Promise<{txCount, savingsRate, passiveRatio, netWorthBucket, cashflowId, netWorthId}>}
 */
export async function runMonthlySnapshot(dek, userId, month, cache = {}) {
    const fromStr = `${month}-01`;
    const toStr   = `${month}-31`;

    // 1) 한 달치 거래 fetch
    const txs = await getTransactionsByDateRange(dek, userId, fromStr, toStr);

    // 2) 합계 계산 (exactAmount 가 있는 거래만 정확 합산)
    let incomeTotal = 0;
    let expenseTotal = 0;
    let passiveIncome = 0;     // interest, business, gift-received 는 수동수입으로 간주
    const breakdown = {};      // category → exactSum
    for (const t of txs) {
        const amt = Number(t.exactAmount) || 0;
        if (t.direction === 'income') {
            incomeTotal += amt;
            if (['interest', 'gift-received', 'business'].includes(t.category)) {
                passiveIncome += amt;
            }
        } else {
            expenseTotal += amt;
        }
        breakdown[t.category] = (breakdown[t.category] || 0) + amt;
    }

    const savingsRate = incomeTotal > 0 ? (incomeTotal - expenseTotal) / incomeTotal : 0;
    const passiveRatio = incomeTotal > 0 ? passiveIncome / incomeTotal : 0;

    // 3) cashflowSnapshots 저장
    const cashflowId = await saveCashflowSnapshot(dek, userId, {
        month,
        savingsRate: Number(savingsRate.toFixed(4)),
        passiveRatio: Number(passiveRatio.toFixed(4)),
        totalsExact: {
            income: incomeTotal,
            expense: expenseTotal,
            net: incomeTotal - expenseTotal,
            passive: passiveIncome,
        },
        breakdownExact: breakdown,
        aiInsights: '', // 미구현. llmProxy 배포 후.
    });

    // 4) 순자산 계산 — 현재 cache 의 자산/부채 사용 (월말 시점 가정)
    const assets = cache.assets || await getAllAssets(dek, userId);
    const liabilities = cache.liabilities || await getAllLiabilities(dek, userId);

    let assetTotal = 0;
    let liabilityTotal = 0;
    const assetBreakdown = {}; // categoryId → exactSum
    for (const a of assets) {
        const v = Number(a.exactValue) || 0;
        assetTotal += v;
        const k = a.categoryId || '_uncategorized';
        assetBreakdown[k] = (assetBreakdown[k] || 0) + v;
    }
    for (const l of liabilities) {
        liabilityTotal += Number(l.exactPrincipal) || 0;
    }
    const netWorth = assetTotal - liabilityTotal;
    const netWorthBucket = amountToBucket(netWorth);

    // 5) netWorthSnapshots 저장
    const netWorthId = await saveNetWorthSnapshot(dek, userId, {
        month,
        netWorthBucket,
        totalsExact: { asset: assetTotal, liability: liabilityTotal, net: netWorth },
        breakdownExact: { byCategory: assetBreakdown },
    });

    return {
        txCount: txs.length,
        savingsRate,
        passiveRatio,
        netWorthBucket,
        cashflowId,
        netWorthId,
    };
}
