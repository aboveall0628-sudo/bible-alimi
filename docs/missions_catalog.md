# 🎯 튜토리얼 미션 카탈로그

**최근 갱신**: 2026-05-14 (S-B 시작 시점)
**단일 출처 (코드)**: [config/missionCatalog.js](../config/missionCatalog.js)
**모듈 매핑**: [data/personRepo.js](../data/personRepo.js) `MODULE_FROM_MISSION_ID`
**기획 트랙**: [본인 프로필 재기획 트랙](../.claude/projects/c--Users-MSI-Desktop----Sanctum-OS/memory/project_self_profile_redesign.md) R18

---

## 🎒 한 줄 설명

> 사이드바 모듈마다 🔒 + 작은 미션 라벨. 미션 클리어 = 그 모듈에서 첫 흔적 박기. 클리어하면 자물쇠 풀림.

사용자 명시 (2026-05-14):
> **"교육 목적의 튜토리얼성 미션이라 '오 이런 기능이?!' 를 알 수 있게만 해주면 됨. 미션 자체를 못 깨게 만들 생각이 없음."**

---

## 📋 7개 미션 표

| 미션 ID | 아이콘 | 사용자에게 보이는 이름 | 클리어 조건 | 트리거 자리 | 상태 |
|---|---|---|---|---|---|
| `person_first_dot` | 📒 | 첫 인물 카드 만들기 | 인물 카드 1장 만들거나, 도트에 사람 1명 등장 | `savePerson(isSelf=false)` + `saveDot(linkedPersonIds≠∅)` | 🟢 S-B 후크 박힘 |
| `org_first_dot` | 🏛 | 첫 조직 카드 만들기 | 조직 카드 1장 만들거나, 도트에 조직 1곳 등장 | `saveOrganization` + `saveDot(linkedOrgIds≠∅)` | 🟢 S-B 후크 박힘 |
| `economy_first_transaction` | 💰 | 첫 거래 적기 | 거래 1건 적기 | (deferred — 1.a 트랙 후) | 🟡 카탈로그만, **B4 deferred** |
| `goal_first_save` | 🎯 | 첫 목표 박기 | 목표 1개 박기 | `saveGoal(prev=null)` | 🟢 S-B 후크 박힘 |
| `decision_first_record` | 📜 | 첫 분별의 자리 | 결정 1개를 원칙·판례로 기록 | `savePrecedent(isNew)` | 🟢 S-B 후크 박힘 |
| `report_first_weekly` | 📊 | 첫 주간 리포트 | 한 주 도트 쌓고 주간 리포트 생성 | `saveWeekReport(첫 호출)` | 🟢 S-B 후크 박힘 |
| `meditation_first_save` | ⛪ | 첫 묵상 일지 | 큐티 1회 + 노트 1줄 | `saveMeditationDoc(내용≠'')` | 🟢 S-B 후크 박힘 |

---

## 🧩 3가지 합의 결정 (2026-05-14)

### (a) 명명 규칙 — A1 `{module}_{verb}_{n}`

자기 설명적 영문 ID. 이미 `personRepo.MODULE_FROM_MISSION_ID` 에 박힌 패턴과 일치.

- 좋은 점: 코드 한 줄만 봐도 어느 모듈의 무슨 미션인지 파악
- `person_first_dot` = 인물 모듈의 첫 도트 (또는 첫 카드) 미션
- 디버깅·로그·GA4 이벤트 키로도 그대로 활용 가능

### (b) 경제 트리거 후크 — B4 (경제는 처음부터 unlocked)

🏠 **5살 비유** — 부엌(본인 프로필) 짓는 중, 거실(경제 모듈)은 다음 달 통째로 리모델링(1.a) 예정.
거실 안내판(미션 트리거)은 거실 리모델링 끝난 뒤 박음. 그동안 거실은 자물쇠 없이 열어둠.

- 경제 모듈은 **처음부터 unlocked** — `isModuleLocked('economy')` 가 항상 false
- `economy_first_transaction` 미션은 카탈로그에 박혀 있지만 `deferred=true`
- 1.a (#54 경제 재기획) 트랙 끝나면 트리거 후크 박고 `deferred` 풀기
- 사용자는 경제 모듈 진입 X 막힘 — "오 이런 기능이?!" 안내만 1.a 후

### (c) 잠금 해제 조건 — C1 missionProgress 기반만

시간(Day 14 자동 fallback) **없음**. 사용자 페이스로 끝까지.

- "튜토리얼성, 못 깨게 만들 생각 X" (사용자 명시) → 부담 없이 그 자리 박혀 있기만
- Day 14 종료 시 `profileVersions.trigger='graduation'` 자동 스냅샷은 별도 자리 (Q합의 b)
- 두 자리 분리: 잠금 해제는 미션, 졸업식 스냅샷은 시간

---

## 🔌 후크 호출 패턴 (코드)

각 repo의 save 함수 끝에 dynamic import + try/catch (실패해도 저장 흐름은 안 끊김):

```js
// (본인 프로필 재기획 트랙 2026-05-14 S-B) 첫 X 박을 때 미션 트리거
try {
    const { markMissionComplete } = await import('./personRepo.js');
    await markMissionComplete(dek, data.userId, 'X_first_Y', {
        signal: 'savePerson',  // 어느 자리에서 클리어됐는지 흔적
        contextDotId: saved.id // 옵션
    });
} catch (e) {
    console.warn('[saveX] mission trigger failed:', e?.message || e);
}
```

- `markMissionComplete` 는 **idempotent** — 이미 클리어된 미션이면 false 반환, 새로 클리어되면 true
- 같은 미션을 두 자리에서 트리거해도 안전 (예: `person_first_dot` 은 savePerson + saveDot 두 자리)
- 실패 시 저장 자체는 막지 않음 (warn 만)

---

## 🚧 미박힌 자리 / 후속 트랙

- 사이드바 🔒 + 미션 라벨 UI 박기 (`isModuleLocked` 가드 + 카탈로그 라벨 join)
- "오늘의 시작" 카드 안 미션 진행도 블록 (예: 4/6) — `getOpenMissions` + 카탈로그 join
- 미션 클리어 토스트/애니메이션 — "🎉 인물 모듈이 열렸어요" 한 줄 + soft accent
- 졸업식 풀스크린 카드 — 모든 active 미션 클리어 시 (Q7 흐름)
- GA4 이벤트 — `mission_unlock` + missionId payload (사용자 동의 후)
- 1.a 트랙 끝나면 `economy_first_transaction` 후크 박고 `deferred=false`
