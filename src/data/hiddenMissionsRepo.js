/**
 * hiddenMissionsRepo.js — 히든 미션 응답 저장·잠금해제 체크
 *
 * (히든 미션 트랙 v1 2026-05-15)
 *
 * 데이터 자리:
 *   - selfCard.plaintext.hiddenMissionUnlocked: bool — 잠금해제 상태
 *   - selfCard.plaintext.hiddenMissionsCleared: string[] — ['hm-01', ...]
 *   - selfCard.encrypted.hiddenMissionAnswers: { [missionId]: {...} }
 *
 * 핵심 흐름:
 *   1. checkUnlock — 조건(베타 코호트·14일 100% 클리어·사후 설문 완료) 만족 여부 + 자동 갱신
 *   2. getStatus — 현재 잠금해제·클리어·다음 발현 가능 미션 반환
 *   3. submitMission — 응답 저장(source 메타·익명·공개 동의 자동 박힘) + cleared 추가
 *   4. onMeditationCompleted — 묵상 완료 이벤트 hook (G (3) 결정)
 *
 * 의존성:
 *   - personRepo.getSelfCard·saveSelfCard
 *   - hiddenMissionsCatalog: HIDDEN_MISSIONS·getHiddenMission·getNextHiddenMission
 *   - missionCatalog.getActiveMissionIds (100% 클리어 판정)
 *
 * 미루기:
 *   - cohort 체크: SWAN 트랙 A 의 cohortId 자리잡힌 뒤 활성 (현재는 missionStatus 만 보고 1차 판정)
 *   - 사후 설문 완료 체크: SWAN 트랙 A 의 swanSessions(type=post_survey) 자리잡힌 뒤 활성
 *   - 1차 베타 시점엔 missionStatus 100% 만 보고 unlocked = true. v2 에서 cohort + post_survey 추가.
 */

import { getSelfCard, saveSelfCard } from './personRepo.js';
import {
    HIDDEN_MISSIONS,
    getHiddenMission,
    getNextHiddenMission,
    getActiveHiddenMissionIds,
} from '../config/hiddenMissionsCatalog.js';
import { MISSION_CATALOG, getActiveMissionIds } from '../config/missionCatalog.js';

/**
 * 14일 튜토리얼 미션 100% 클리어 여부.
 *   tutorialState[missionId].completedAt 가 모든 active 미션에 자리잡혀 있어야 true.
 */
function isAllTutorialMissionsClear(selfCard) {
    if (!selfCard) return false;
    const tutorialState = selfCard.tutorialState || {};
    const activeIds = getActiveMissionIds();
    return activeIds.every((id) => !!tutorialState[id]?.completedAt);
}

/**
 * 베타 코호트 식별 — SWAN 트랙 A 진입 후 활성.
 *   현재는 1차 베타 검증 시점이라 selfCard.cohortId 자리 자체가 없을 수 있음.
 *   v2 시점에 cohortId === 'beta_v1' 체크 활성.
 *
 *   1차 베타엔 모든 사용자를 베타 코호트로 본다 (관리자가 직접 등록한 자리만 가입).
 */
function isBetaCohort(selfCard) {
    // v2: return selfCard?.cohortId === 'beta_v1';
    // 1차: 사용자 가입 자체가 베타 코호트. 항상 true.
    return true;
}

/**
 * 사후 설문 완료 여부 — SWAN 트랙 A 의 swanSessions 자리잡힌 뒤 활성.
 *   현재는 자리 자체가 없으니 1차 베타엔 항상 true 로 통과.
 *   v2 시점에 swanSessions where type='post_survey' status='completed' 체크.
 */
async function isPostSurveyComplete(_dek, _userId) {
    // v2: return await checkSwanSession(userId, 'post_survey', 'completed');
    return true;
}

/**
 * 히든 미션 잠금해제 조건 체크 + 자동 갱신.
 *   조건 만족 시 selfCard.hiddenMissionUnlocked = true 저장.
 *   조건 미달 시 false 유지 (강등 안 함 — 한 번 자리잡힌 자리 보존).
 *
 * @returns {Promise<boolean>} 현재 잠금해제 상태
 */
export async function checkUnlock(dek, userId) {
    const self = await getSelfCard(dek, userId);
    if (!self) return false;

    // 이미 잠금해제 상태면 그대로 유지 (자리잡힌 자리 보존)
    if (self.hiddenMissionUnlocked) return true;

    const cohortOk = isBetaCohort(self);
    const missionsOk = isAllTutorialMissionsClear(self);
    const postSurveyOk = await isPostSurveyComplete(dek, userId);

    if (!cohortOk || !missionsOk || !postSurveyOk) return false;

    // 조건 모두 만족 → 잠금해제 자리잡기
    const next = {
        ...self,
        hiddenMissionUnlocked: true,
        hiddenMissionsCleared: self.hiddenMissionsCleared || [],
        hiddenMissionAnswers: self.hiddenMissionAnswers || {},
    };
    await saveSelfCard(dek, userId, next);

    // 잠금해제 직후 ✨ 안내 카드 노출 신호
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('sanctum:hidden-mission-unlocked', {
                detail: { firstMissionId: 'hm-01' }
            }));
        } catch (_) { /* 이벤트 디스패치 실패 무시 */ }
    }
    return true;
}

/**
 * 히든 미션 현재 상태 — UI 렌더링용.
 *
 * @returns {Promise<{ unlocked, cleared, answers, nextMission, totalActive }>}
 */
export async function getStatus(dek, userId) {
    const self = await getSelfCard(dek, userId);
    if (!self) {
        return { unlocked: false, cleared: [], answers: {}, nextMission: null, totalActive: 0 };
    }
    const cleared = self.hiddenMissionsCleared || [];
    const next = getNextHiddenMission(cleared);
    return {
        unlocked: !!self.hiddenMissionUnlocked,
        cleared,
        answers: self.hiddenMissionAnswers || {},
        nextMission: next,
        totalActive: getActiveHiddenMissionIds().length,
    };
}

/**
 * 히든 미션 응답 저장.
 *
 * @param {string} missionId — 'hm-01' 등
 * @param {object} payload — {
 *     answers: { q1_xxx: '...', q2_yyy: '...', ... },
 *     anonymousResponse?: boolean,         // 익명 토글 (I 결정)
 *     publicShareConsent?: boolean,        // 공개 동의 (K 결정)
 *     displayName?: 'real'|'nickname'|'anonymous',
 *   }
 * @returns {Promise<{ saved, nextMission }>}
 */
export async function submitMission(dek, userId, missionId, payload) {
    const mission = getHiddenMission(missionId);
    if (!mission) throw new Error(`unknown hidden mission: ${missionId}`);
    if (mission.status !== 'active') {
        throw new Error(`hidden mission not active: ${missionId}`);
    }

    const self = await getSelfCard(dek, userId);
    if (!self) throw new Error('selfCard 없음 — 히든 미션 저장 불가');
    if (!self.hiddenMissionUnlocked) {
        throw new Error('히든 미션 자리 잠겨 있음 — checkUnlock 먼저');
    }

    const cleared = self.hiddenMissionsCleared || [];
    if (cleared.includes(missionId)) {
        // idempotent — 이미 클리어된 미션은 재저장 안 함
        return { saved: false, nextMission: getNextHiddenMission(cleared) };
    }

    const now = new Date().toISOString();
    const answers = self.hiddenMissionAnswers || {};

    // 소스 메타 자동 마킹 (I (1) 결정)
    const entry = {
        answers: payload.answers || {},
        anonymousResponse: !!payload.anonymousResponse,
        publicShareConsent: !!payload.publicShareConsent,
        displayName: payload.displayName || (payload.anonymousResponse ? 'anonymous' : 'real'),
        completedAt: now,
        source: `hidden_mission_${missionId}`,
        rewardClaimed: true,
    };

    const nextCleared = [...cleared, missionId];
    const nextSelf = {
        ...self,
        hiddenMissionsCleared: nextCleared,
        hiddenMissionAnswers: { ...answers, [missionId]: entry },
    };
    await saveSelfCard(dek, userId, nextSelf);

    // 클리어 신호 — UI 갱신 + GA4 이벤트 자리
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('sanctum:hidden-mission-cleared', {
                detail: { missionId, anonymousResponse: entry.anonymousResponse }
            }));
        } catch (_) { /* 무시 */ }
    }

    return { saved: true, nextMission: getNextHiddenMission(nextCleared) };
}

/**
 * 묵상 완료 이벤트 hook (G (3) 결정).
 *   meditation_completed 이벤트 발화 시 호출 → 다음 발현 가능한 미션 있으면 카드 노출 신호.
 *
 * @returns {Promise<{ shouldShow, mission }>}
 */
export async function onMeditationCompleted(dek, userId) {
    // 잠금해제 자동 체크 (조건 새로 만족했을 수도)
    const unlocked = await checkUnlock(dek, userId);
    if (!unlocked) return { shouldShow: false, mission: null };

    const status = await getStatus(dek, userId);
    if (!status.nextMission) return { shouldShow: false, mission: null };

    // 미션 발현 신호 — UI 가 listen 해서 카드 노출
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('sanctum:hidden-mission-available', {
                detail: { missionId: status.nextMission.id }
            }));
        } catch (_) { /* 무시 */ }
    }

    return { shouldShow: true, mission: status.nextMission };
}

/**
 * 활성 히든 미션 카탈로그 메타 — 설정 카드 진입 시 노출용.
 *   잠금 상태에서도 "히든 미션 N개 있어요" 안내 가능 (수 노출만, 본문은 X).
 */
export function getCatalogMeta() {
    const activeIds = getActiveHiddenMissionIds();
    return {
        totalActive: activeIds.length,
        ids: activeIds,
    };
}
