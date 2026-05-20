/**
 * recoveryMemosRepo.js — 회복의 자리 메모 CRUD + 약속 어김 패턴 감지
 * (B-5 트랙 Phase 1 알 단계, 2026-05-14)
 *
 * 🕊️ 가이드 별 (사용자 명시):
 *   "양치기 소년 = 정죄 X / 회복으로 이끄는 게임 ✓"
 *   "약속 어김은 죄가 아니라 *증상* — 상처·약한 자존감·산만함·장애 등"
 *   "자기 들보 먼저 (마 7:1~5), 타인 자동 감지 X"
 *   "무조건 귀여워야 함, 아무런 해 끼치지 않게"
 *   "신뢰도 점수 박지 X — 회복 여정 시각화로"
 *
 * 데이터 모델:
 *   RecoveryMemo {
 *     id, userId, createdAt,
 *     patternKey,     // 'broken_promise_3' 등 패턴 식별자
 *     tone,           // 'cute' | 'calm' (저장 시점 사용자 모드)
 *     source,         // 'user_initiated' | 'pattern_triggered' | 'reminder'
 *     content,        // 자기 인식 메모 (암호화)
 *     prayerNote?,    // 같은 자리 기도 메모
 *     linkedDotIds?,  // 감지된 도트들
 *     linkedScriptureId?
 *   }
 *
 * 박지 말 것:
 *   - "신뢰도 점수" 표시·계산
 *   - "거짓말 N회" 통계
 *   - 타인 자동 감지
 *   - 평균값 비교
 *   - 정죄 톤 카피
 */

import { db, doc, deleteDoc } from './firebase.js';
import { saveRecord, getRecord, queryRecords, subPath } from './baseRepo.js';

const SUB = 'recoveryMemos';

// ═══════════════════════════════════════════════════
//  CRUD
// ═══════════════════════════════════════════════════

export async function saveRecoveryMemo(dek, userId, data) {
    if (!data.id) {
        data.id = `rcv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!data.createdAt) data.createdAt = new Date().toISOString();
    if (!data.source) data.source = 'user_initiated';
    if (!data.tone) data.tone = 'calm';
    return saveRecord(dek, subPath(userId, SUB), data, data.id);
}

export async function getRecoveryMemo(dek, userId, id) {
    return getRecord(dek, subPath(userId, SUB), id);
}

export async function getAllRecoveryMemos(dek, userId) {
    const all = await queryRecords(dek, subPath(userId, SUB));
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function deleteRecoveryMemo(userId, id) {
    await deleteDoc(doc(db, 'users', userId, SUB, id));
}

// ═══════════════════════════════════════════════════
//  약속 어김 패턴 감지 (자기 자신만)
// ═══════════════════════════════════════════════════

/**
 * 최근 도트들 중 plannedTask ≠ actualTask 반복 횟수 감지.
 *
 * 정책 (사용자 합의):
 *   - 자기 자신만 (마 7:1~5 들보 먼저)
 *   - 단순 카운트 — N회 카운트 (1차)
 *   - threshold N >= 3 면 감지 시그널 반환
 *   - **자동 호출 X** — 호출 측에서 명시적으로 호출 (이번 Phase 1.a)
 *
 * "정말 어김" 판단 기준:
 *   - plannedTask 가 있고 (계획이 있었음)
 *   - actualTask 가 있고 (실제 행동 기록됨)
 *   - 둘이 다름 (간단 비교 — 향후 정교화 가능)
 *   - executed === 'skipped' 또는 'replaced' 가 강한 신호
 *
 * @param {Object[]} dots — 사용자 도트 배열 (시간순 또는 무관)
 * @param {Object} opts
 *   - threshold: number = 3 (감지 시작 임계)
 *   - lookbackDays: number = 14 (며칠 안 도트만 본다)
 * @returns {{ detected: boolean, count: number, patternKey: string, linkedDotIds: string[], reason: string }}
 */
export function detectBrokenPromisePattern(dots, opts = {}) {
    const { threshold = 3, lookbackDays = 14 } = opts;
    if (!Array.isArray(dots) || dots.length === 0) {
        return { detected: false, count: 0, patternKey: null, linkedDotIds: [], reason: 'no_dots' };
    }

    // 최근 lookbackDays 안 도트만
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const recent = dots.filter(d => d.date && d.date >= cutoffStr);

    // 어김 판단 — 약하게: skipped/replaced 강한 신호. 그 외 plannedTask ≠ actualTask 도 1점.
    const broken = recent.filter(d => {
        if (d.executed === 'skipped' || d.executed === 'replaced') return true;
        const planned = (d.plannedTask || '').trim();
        const actual = (d.actualTask || '').trim();
        return planned.length > 0 && actual.length > 0 && planned !== actual;
    });

    const count = broken.length;
    const detected = count >= threshold;
    return {
        detected,
        count,
        patternKey: detected ? `broken_promise_${count}` : null,
        linkedDotIds: broken.map(d => d.id).filter(Boolean),
        reason: detected ? `${count} broken in last ${lookbackDays}d` : `${count}/${threshold} below threshold`
    };
}

// ═══════════════════════════════════════════════════
//  사용자 모드 (settings/spiritualLock.recoveryTone)
// ═══════════════════════════════════════════════════

/**
 * 사용자 회복 톤 모드 읽기. 호출 측에서 spiritualLockSettings 도큐먼트 따로 가져옴.
 * 디폴트 'calm'. 'off' 면 모달 자동 노출 안 함.
 */
export function normalizeRecoveryTone(raw) {
    if (raw === 'cute' || raw === 'calm' || raw === 'off') return raw;
    return 'calm';
}
