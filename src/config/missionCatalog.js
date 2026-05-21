/**
 * missionCatalog.js — 튜토리얼 미션 단일 출처
 *
 * (본인 프로필 재기획 트랙 2026-05-14 S-B)
 * (2026-05-20 Phase 3) 베타 미션 재편 — 사용자 명시:
 *   - 알림 시각 정하기·첫 묵상 일지 = 온보딩에서 자리잡힘 → 미션에서 빠짐
 *   - 첫 실천 평가 후 일일 리포트 보기 신규
 *   - SWAN 말 걸기·감사·기도·테마·24단어·새벽·자기전·친구초대 8건 신규
 *   - streak 3·7·14 진행도(N/M일)·달성률 표시
 *   - 미션 클리어 시 typing breath 결 + SWAN 카피 자리잡기
 *
 * R18 결: 14일은 권장 페이스, 실제 잠금 해제는 미션 클리어로.
 *
 * 명명 규칙 (a) A1: `{module}_{verb}_{n}` — 자기 설명적.
 *   personRepo.js 의 MODULE_FROM_MISSION_ID 와 키 동일하게 유지.
 *
 * 난이도 difficulty (2026-05-15 S-E 추천 카드 트랙):
 *   1 = 가장 가벼움 (메뉴 진입·토글 1번)
 *   2 = 가벼움 (한 줄 입력·1건 열어보기)
 *   3 = 보통 (카드 1장·도트 1개·거래 1건)
 *   4 = 무거움 (분별 흐름·주간 리포트·14일 streak)
 *
 * 신규 필드 (2026-05-20 Phase 3):
 *   - successCopy: SWAN 결 클리어 카피 (타이핑 애니메이션 결로 자리잡힘)
 *   - progressFn: 진행도 자리잡힌 미션 (streak 3·7·14) — 'meditationStreak' 자리잡힌 결
 *
 * 사용처:
 *   - personRepo.markMissionComplete(dek, userId, missionId, opts) 호출
 *   - 사이드바 잠금 가드 (isModuleLocked) — 같은 moduleId 키 사용
 *   - "오늘의 시작" 카드 미션 진행도 블록 — getOpenMissions + 이 카탈로그 join
 *   - "다음 해볼 만한 미션" 추천 카드 — difficulty 오름차순 정렬
 *   - 미션 클리어 모달·카드 — successCopy + typing breath
 */

// (베타 슬림 v1 2026-05-18) `slim` 플래그 — true 이면 슬림 모드에서도 노출.
//   false 면 풀 모드 전용 (인물·조직·경제·목표·의사결정 모듈 자리).
//   미션 카드 추가 시 slim 플래그 의무.
export const MISSION_CATALOG = {
    // ─── 풀 모드 전용 (메인 사용자만) ──────────────────────────
    person_first_dot: {
        moduleId: 'persons',
        icon: 'notebook',
        title: '첫 인물 카드 만들기',
        hint: '도트에 사람 1명 등장시키거나, 인물 카드 1장 만들기',
        unlockCopy: '인물 모듈이 열렸어요',
        successCopy: '첫 사람이 자리잡혔어요. 만남이 자리잡힌 결을 잊지 않게 도울게요.',
        trigger: 'savePerson(isSelf=false) | saveDot(linkedPersonIds≠∅)',
        deferred: false,
        slim: false,
        difficulty: 2,
    },
    org_first_dot: {
        moduleId: 'organizations',
        icon: 'building-2',
        title: '첫 조직 카드 만들기',
        hint: '도트에 조직 1곳 등장시키거나, 조직 카드 1장 만들기',
        unlockCopy: '조직 모듈이 열렸어요',
        successCopy: '첫 공동체가 자리잡혔어요. 내가 속한 자리를 같이 봐 갈게요.',
        trigger: 'saveOrganization | saveDot(linkedOrgIds≠∅)',
        deferred: false,
        slim: false,
        difficulty: 3,
    },
    economy_first_transaction: {
        moduleId: 'economy',
        icon: 'wallet',
        title: '첫 거래 적기',
        hint: '오늘 들어오거나 나간 돈 한 줄 적기',
        unlockCopy: '경제 미션이 클리어됐어요',
        successCopy: '첫 거래가 자리잡혔어요. 돈의 결도 묵상 자리예요.',
        trigger: 'saveDot(kind=event, eventType=transaction)',
        deferred: false,
        slim: false,
        difficulty: 3,
    },
    goal_first_save: {
        moduleId: 'goals',
        icon: 'target',
        title: '첫 목표 정하기',
        hint: '오늘·이번 주·이번 달 어디든 목표 1개 적기',
        unlockCopy: '목표 모듈이 열렸어요',
        successCopy: '첫 목표가 자리잡혔어요. 묵상이 일상으로 자연 자리잡힐 거예요.',
        trigger: 'saveGoal(prev=null)',
        deferred: false,
        slim: false,
        difficulty: 3,
    },
    decision_first_record: {
        moduleId: 'decisions',
        icon: 'scroll-text',
        title: '첫 분별의 자리',
        hint: '결정 1개를 원칙·판례로 기록',
        unlockCopy: '분별의 자리가 열렸어요',
        successCopy: '첫 분별이 자리잡혔어요. 결정이 자기 결을 자리잡아 갈 거예요.',
        trigger: 'savePrecedent(isNew)',
        deferred: false,
        slim: false,
        difficulty: 4,
    },

    // ─── 베타·메인 공통 (slim: true) ───────────────────────────
    // ⚙️ 가장 가벼운 자리 (난이도 1)
    settings_explore: {
        moduleId: 'settings',
        icon: 'settings',
        title: '설정 한 번 둘러보기',
        hint: '설정 화면 진입해서 카드들 살펴보기',
        unlockCopy: '설정 자리를 둘러봤어요',
        successCopy: '설정 자리 자연 자리잡혔어요. 취향에 맞게 자유롭게 갈아끼우세요.',
        trigger: 'switchView(settings)',
        deferred: false,
        slim: true,
        difficulty: 1,
    },
    swan_first_chat: {
        moduleId: 'swan',
        icon: 'message-circle',
        title: 'SWAN한테 말 한 번 걸기',
        hint: '우측 아래 풍선 클릭 → SWAN한테 한 마디',
        unlockCopy: 'SWAN과 한 번 자리잡혔어요',
        successCopy: '반가워요. 앞으로도 자유롭게 들러주세요. 짧은 한 마디도 환영이에요.',
        trigger: 'swanFeedback.finalize',
        deferred: false,
        slim: true,
        difficulty: 1,
    },
    gratitude_note: {
        moduleId: 'meditation',
        icon: 'heart',
        title: '감사·회개 기도하기',
        hint: '어제 묵상 질문 아래 감사·회개 기도 체크하기',
        unlockCopy: '감사·회개 기도가 자리잡혔어요',
        successCopy: '묵상 전 감사·회개 기도가 자리잡혔어요. 마음을 비우고 감사를 채우는 귀한 시간이에요.',
        trigger: 'yesterday-prayer-checkbox checked',
        deferred: false,
        slim: true,
        difficulty: 1,
    },
    prayer_section: {
        moduleId: 'meditation',
        icon: 'hand-helping',
        title: '기도 자리잡기',
        hint: '묵상에 기도 섹션 한 번 자리잡기',
        unlockCopy: '기도 자리가 열렸어요',
        successCopy: '기도가 자리잡혔어요. 묵상의 마지막 결은 기도예요.',
        trigger: 'saveMeditationDoc(prayer 비어있지 않음)',
        deferred: false,
        slim: true,
        difficulty: 1,
    },
    theme_change: {
        moduleId: 'settings',
        icon: 'palette',
        title: '테마·폰트 한 번 갈아끼움',
        hint: '다크모드·강조색·시스템 폰트 1번 바꿔보기',
        unlockCopy: '결이 자기한테 맞춰졌어요',
        successCopy: '취향이 자리잡힌 결이 묵상 자리에도 자연 자리잡혀요.',
        trigger: 'theme/accent/font 변경',
        deferred: false,
        slim: true,
        difficulty: 1,
    },
    recovery_code_view: {
        moduleId: 'settings',
        icon: 'key-round',
        title: '24단어 새로 만들기',
        hint: '보안 설정에서 새 24단어 한 번 만들어 종이에 적어두기',
        unlockCopy: '복구 자리가 자기 손 안에 자리잡혔어요',
        successCopy: '새 24단어 자리잡혔어요. 안전한 곳에 보관해 두시면 다음 자리잡힘에서도 든든해요.',
        trigger: 'rotateRecovery',
        deferred: false,
        slim: true,
        difficulty: 1,
    },

    // (2026-05-21 v112 묵상 시점 루프 시작점 트랙) 시점 무관 묵상 1회.
    //   v120 다이어트에서 plan_first_toggle 폐기 — 사용자 노출 자리 자체 X.
    any_meditation: {
        moduleId: 'meditation',
        icon: 'book-open',
        title: '묵상 1회 자리잡기',
        hint: '어느 시점이든 묵상 노트 한 번 자리잡기',
        unlockCopy: '묵상 자리가 자기 결로 자리잡혔어요',
        successCopy: '첫 묵상이 자리잡혔어요. 시점이 어느 자리든 말씀이 가장 자연 자리예요.',
        trigger: 'saveMeditationDoc(any time)',
        deferred: false,
        slim: true,
        difficulty: 1,
    },

    // 📖 묵상 결 (난이도 2)
    first_review_then_daily_report: {
        moduleId: 'reports',
        icon: 'trending-up',
        title: '실천 평가 후 일일 리포트 보기',
        hint: '도트 1개 평가하고 → 그날 일일 리포트 열어보기',
        unlockCopy: '리포트 자리가 열렸어요',
        successCopy: '실천이 평가 자리잡고 리포트가 자리잡았어요. 자기 결이 보이기 시작해요.',
        trigger: 'quickReview saved → daily report opened',
        deferred: false,
        slim: true,
        difficulty: 2,
    },
    past_meditation_revisit: {
        moduleId: 'meditation',
        icon: 'library',
        title: '지난 묵상 다시 보기',
        hint: '"지난 묵상" 화면에서 예전 묵상 1건 열어보기',
        unlockCopy: '지난 묵상 자리를 알게 됐어요',
        successCopy: '지난 자리를 다시 자리잡았어요. 흐름이 자기 자리를 자리잡아 가요.',
        trigger: 'switchView(past) | 묵상 1건 다시 열기',
        deferred: false,
        slim: true,
        difficulty: 2,
    },
    morning_meditation: {
        moduleId: 'meditation',
        icon: 'sunrise',
        title: '새벽 묵상 한 번',
        hint: '아침 5~8시 자리에서 묵상 1번',
        unlockCopy: '새벽 자리가 자리잡혔어요',
        successCopy: '새벽 묵상이 자리잡혔어요. 하루의 첫 결이 말씀이에요.',
        trigger: 'saveMeditationDoc(hour in 5..8)',
        deferred: false,
        slim: true,
        difficulty: 2,
    },
    evening_meditation: {
        moduleId: 'meditation',
        icon: 'moon',
        title: '자기 전 묵상 한 번',
        hint: '밤 9~12시 자리에서 묵상 1번',
        unlockCopy: '자기 전 자리가 자리잡혔어요',
        successCopy: '하루의 마지막 결이 말씀에 자리잡혔어요. 평안 자리예요.',
        trigger: 'saveMeditationDoc(hour in 21..23)',
        deferred: false,
        slim: true,
        difficulty: 2,
    },

    // 🌱 묵상 streak (진행도 자리)
    meditation_streak_3: {
        moduleId: 'meditation',
        icon: 'sprout',
        title: '3일 연속 묵상하기',
        hint: '연속 3일 묵상 노트 1줄 이상',
        unlockCopy: '3일 연속 묵상이 자리잡았어요',
        successCopy: '첫 새싹 자리잡혔어요. 작아 보이지만 가장 어려운 자리예요.',
        trigger: 'meditationStreak >= 3',
        progressFn: 'meditationStreak',  // 동적 진행도 (현재 N / 3)
        progressTarget: 3,
        deferred: false,
        slim: true,
        difficulty: 2,
    },
    meditation_streak_7: {
        moduleId: 'meditation',
        icon: 'leaf',
        title: '7일 연속 묵상하기',
        hint: '한 주 동안 매일 묵상',
        unlockCopy: '한 주 연속 묵상이 자리잡았어요',
        successCopy: '한 주 완주! 묵상이 일상에 자연 자리잡힌 결이에요.',
        trigger: 'meditationStreak >= 7',
        progressFn: 'meditationStreak',
        progressTarget: 7,
        deferred: false,
        slim: true,
        difficulty: 3,
    },
    meditation_streak_14: {
        moduleId: 'meditation',
        icon: 'trees',
        title: '14일 연속 묵상하기',
        hint: '베타 기간 내내 매일 묵상 — 최상위 streak',
        unlockCopy: '14일 연속 묵상 — 깊이 자리잡았어요',
        successCopy: '이 자리까지 자리잡은 사람, 정말 드물어요. 자랑스러워요.',
        trigger: 'meditationStreak >= 14',
        progressFn: 'meditationStreak',
        progressTarget: 14,
        deferred: false,
        slim: true,
        difficulty: 4,
    },

    // 📊 리포트
    report_first_weekly: {
        moduleId: 'reports',
        icon: 'bar-chart-3',
        title: '첫 주간 리포트',
        hint: '한 주 도트 쌓고 주간 리포트 생성',
        unlockCopy: '리포트 모듈이 열렸어요',
        successCopy: '첫 주간 리포트가 자리잡혔어요. 한 주가 자기 결로 자리잡혀 보여요.',
        trigger: 'saveWeekReport(첫 호출)',
        deferred: false,
        slim: true,
        difficulty: 4,
    },

    // 🔗 친구 초대 (네트워크 결)
    invite_first_friend: {
        moduleId: 'referral',
        icon: 'link',
        title: '친구 1명 초대하기',
        hint: '내 추천 링크로 가입자 1명 자리잡기',
        unlockCopy: '첫 친구가 자리잡혔어요',
        successCopy: '첫 친구가 자리잡혔어요. 같이 가는 사람이 자리잡히면 길이 자연 자리잡혀요.',
        trigger: 'referralCount >= 1',
        deferred: false,
        slim: true,
        difficulty: 3,
    },
};

/**
 * moduleId → mission 역 룩업.
 */
export function getMissionByModule(moduleId) {
    return Object.entries(MISSION_CATALOG).find(([_, m]) => m.moduleId === moduleId);
}

/**
 * 카탈로그 안 모든 missionId 배열 (deferred 제외).
 *   사이드바 진행도·"오늘의 시작" 카드에서 deferred 미션은 안 보임.
 *
 * (베타 슬림 v1 2026-05-18) opts.slim === true 면 slim:true 미션만 노출.
 *   인자 없으면 현재 tier 자동 감지 (isSlimMode()).
 */
export function getActiveMissionIds(opts) {
    let useSlim = false;
    if (opts && typeof opts.slim === 'boolean') {
        useSlim = opts.slim;
    } else {
        try {
            const html = document.documentElement;
            useSlim = html.getAttribute('data-tier') === 'slim';
        } catch (_) { useSlim = false; }
    }
    return Object.entries(MISSION_CATALOG)
        .filter(([_, m]) => !m.deferred)
        .filter(([_, m]) => useSlim ? m.slim === true : true)
        .map(([id]) => id);
}

/**
 * 추천 미션 정렬 — difficulty 오름차순, 같은 난이도면 카탈로그 정의 순서.
 *   "다음 해볼 만한 미션" 카드/풋터에서 사용.
 *
 * @param {string[]} completedMissionIds - 이미 클리어된 missionId 배열
 * @param {number} limit - 상위 몇 개 (기본 3)
 * @returns {Array<{missionId:string, mission:object}>}
 */
export function getRecommendedMissions(completedMissionIds, limit = 3) {
    const completedSet = new Set(completedMissionIds || []);
    const order = Object.keys(MISSION_CATALOG);
    return Object.entries(MISSION_CATALOG)
        .filter(([id, m]) => !m.deferred && !completedSet.has(id))
        .map(([id, m]) => ({ missionId: id, mission: m }))
        .sort((a, b) => {
            const da = a.mission.difficulty ?? 99;
            const db = b.mission.difficulty ?? 99;
            if (da !== db) return da - db;
            return order.indexOf(a.missionId) - order.indexOf(b.missionId);
        })
        .slice(0, limit);
}
