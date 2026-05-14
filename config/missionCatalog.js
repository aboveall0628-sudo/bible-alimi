/**
 * missionCatalog.js — 튜토리얼 미션 단일 출처
 *
 * (본인 프로필 재기획 트랙 2026-05-14 S-B)
 *
 * R18 결: 14일은 권장 페이스, 실제 잠금 해제는 미션 클리어로.
 *
 * 명명 규칙 (a) A1: `{module}_{verb}_{n}` — 자기 설명적.
 *   예) `person_first_dot`, `org_first_dot`, `economy_first_transaction`
 *   personRepo.js 의 MODULE_FROM_MISSION_ID 와 키 동일하게 유지.
 *
 * 경제 합류 정책 (b) B4: 경제 모듈은 처음부터 unlocked.
 *   1.a (#54 경제 재기획) 트랙 끝나면 그때 트리거 자리 박음.
 *   현재 economy_first_transaction 는 카탈로그에만 박혀 있고 후크는 없음 (deferred=true).
 *
 * 잠금 해제 조건 (c) C1: missionProgress 기반만.
 *   Day 14 자동 fallback 없음 — 사용자 페이스로 끝까지.
 *   "튜토리얼성 미션이라 못 깨게 만들 생각 X, '오 이런 기능이?!' 알 수 있게만"
 *   (사용자 명시 2026-05-14)
 *
 * 사용처:
 *   - personRepo.markMissionComplete(dek, userId, missionId, opts) 호출
 *   - 사이드바 잠금 가드 (isModuleLocked) — 같은 moduleId 키 사용
 *   - "오늘의 시작" 카드 미션 진행도 블록 — getOpenMissions + 이 카탈로그 join
 */

export const MISSION_CATALOG = {
    person_first_dot: {
        moduleId: 'persons',
        icon: '📒',
        title: '첫 인물 카드 만들기',
        hint: '도트에 사람 1명 등장시키거나, 인물 카드 1장 만들기',
        unlockCopy: '인물 모듈이 열렸어요',
        trigger: 'savePerson(isSelf=false) | saveDot(linkedPersonIds≠∅)',
        deferred: false,
    },
    org_first_dot: {
        moduleId: 'organizations',
        icon: '🏛',
        title: '첫 조직 카드 만들기',
        hint: '도트에 조직 1곳 등장시키거나, 조직 카드 1장 만들기',
        unlockCopy: '조직 모듈이 열렸어요',
        trigger: 'saveOrganization | saveDot(linkedOrgIds≠∅)',
        deferred: false,
    },
    economy_first_transaction: {
        moduleId: 'economy',
        icon: '💰',
        title: '첫 거래 적기',
        hint: '오늘 들어오거나 나간 돈 한 줄 적기',
        unlockCopy: '경제 모듈이 열렸어요',
        // B4 결정: 경제 모듈은 처음부터 unlocked. 트리거 후크는 1.a 끝난 뒤 박음.
        trigger: '(deferred — 1.a 트랙 후)',
        deferred: true,
    },
    goal_first_save: {
        moduleId: 'goals',
        icon: '🎯',
        title: '첫 목표 박기',
        hint: '오늘·이번 주·이번 달 어디든 목표 1개 박기',
        unlockCopy: '목표 모듈이 열렸어요',
        trigger: 'saveGoal(prev=null)',
        deferred: false,
    },
    decision_first_record: {
        moduleId: 'decisions',
        icon: '📜',
        title: '첫 분별의 자리',
        hint: '결정 1개를 원칙·판례로 기록',
        unlockCopy: '분별의 자리가 열렸어요',
        trigger: 'savePrecedent(isNew)',
        deferred: false,
    },
    report_first_weekly: {
        moduleId: 'reports',
        icon: '📊',
        title: '첫 주간 리포트',
        hint: '한 주 도트 쌓고 주간 리포트 생성',
        unlockCopy: '리포트 모듈이 열렸어요',
        trigger: 'saveWeekReport(첫 호출)',
        deferred: false,
    },
    meditation_first_save: {
        moduleId: 'meditation',
        icon: '⛪',
        title: '첫 묵상 일지',
        hint: '큐티 1회 + 노트 1줄',
        unlockCopy: '묵상 모듈이 열렸어요',
        // 묵상 모듈 자체는 Day 0 부터 활성 — 이 미션은 "묵상 시스템에 노트 발화" 흔적용
        trigger: 'saveMeditationDoc(content·prayer 비어있지 않음)',
        deferred: false,
    },
};

/**
 * moduleId → mission 역 룩업.
 */
export function getMissionByModule(moduleId) {
    return Object.entries(MISSION_CATALOG).find(([_, m]) => m.moduleId === moduleId);
}

/**
 * 카탈로그에 박힌 모든 missionId 배열 (deferred 제외).
 *   사이드바 진행도·"오늘의 시작" 카드에서 deferred 미션은 안 보임.
 */
export function getActiveMissionIds() {
    return Object.entries(MISSION_CATALOG)
        .filter(([_, m]) => !m.deferred)
        .map(([id]) => id);
}
