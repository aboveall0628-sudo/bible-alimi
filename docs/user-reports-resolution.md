# 📋 사용자 신고 1~15번 처리 매트릭스

v2.0 빌드에서 발생한 15건의 사용자 신고가 v2.1에서 어떻게 해결됐는지 정리한 표.

| # | 신고 | STEP | 처리 방법 | 커밋 |
|---|---|---|---|---|
| 1 | 사이드바 명칭 정리 ("Sanctum OS"만, 부제 제거) | 1-A | index.html 사이드바 로고 단순화 | [`18799fe`](https://github.com/aboveall0628-sudo/sanctumos/commit/18799fe) |
| 2 | 나의 목표 7계층이 비어있음 | 1-A, 5, 2-A | goals.js 빈 상태 안내 → 7계층 탭 + CRUD | [`66fb6a9`](https://github.com/aboveall0628-sudo/sanctumos/commit/66fb6a9), [`15ce89b`](https://github.com/aboveall0628-sudo/sanctumos/commit/15ce89b) |
| 3 | 오늘 말씀 미로드 | 1-A | scripture.js 신규 (4파트 통독), bibleData 정상 로드 | [`266764a`](https://github.com/aboveall0628-sudo/sanctumos/commit/266764a) |
| 4 | 결단/계획/시계부 분산 → 통합 | 1-A | timeline.js (24h × 96슬롯 grid, drag&drop) | [`9d4d9f6`](https://github.com/aboveall0628-sudo/sanctumos/commit/9d4d9f6) |
| 5 | Google Calendar 연동 안 됨 | 1-A | listUpcomingEvents 분리, 통합 타임라인이 events 소비 | [`9d4d9f6`](https://github.com/aboveall0628-sudo/sanctumos/commit/9d4d9f6) |
| 6 | 다크모드 토글 작동 안 됨 | 1-A | themeManager.js 호출, localStorage + prefers-color-scheme | [`18799fe`](https://github.com/aboveall0628-sudo/sanctumos/commit/18799fe) |
| 7 | 빈 상태 안내 부족 | 1-A, 5 | 모든 뷰에 .empty-state 컴포넌트 + 영적 톤 가이드 | [`66fb6a9`](https://github.com/aboveall0628-sudo/sanctumos/commit/66fb6a9) |
| 8 | 시계부 인라인 입력 | 1-A | 통합 타임라인 실제 레인 빈 칸 클릭 → 인라인 입력 | [`9d4d9f6`](https://github.com/aboveall0628-sudo/sanctumos/commit/9d4d9f6) |
| 9 | 시간대 모드 폐기 + 통합 타임라인 | 1-A | timeOfDayMode.js 삭제, 통합 타임라인으로 일원화 | [`18799fe`](https://github.com/aboveall0628-sudo/sanctumos/commit/18799fe), [`9d4d9f6`](https://github.com/aboveall0628-sudo/sanctumos/commit/9d4d9f6) |
| 10 | 저녁 통합 루프 깨짐 | 1-A, 6 | eveningLoop.js 스크롤 방식 재구조 (sticky 인디케이터 + IntersectionObserver) | [`c83ceff`](https://github.com/aboveall0628-sudo/sanctumos/commit/c83ceff), [`c1d4485`](https://github.com/aboveall0628-sudo/sanctumos/commit/c1d4485) |
| 11 | 토요일 회고 메뉴 → 저녁 루프 흡수 + 동적 7~12단계 | 1-A | saturdayReview.js 삭제, eveningLoop의 buildDynamicSteps + determineLayers | [`c83ceff`](https://github.com/aboveall0628-sudo/sanctumos/commit/c83ceff) |
| 12 | 대시보드 통독률 사라짐 | 5 | dashboard.js: 통독 진도 카드 복원 + 주간 히트맵 + 묵상 충실도 | [`66fb6a9`](https://github.com/aboveall0628-sudo/sanctumos/commit/66fb6a9), [`0a7d34a`](https://github.com/aboveall0628-sudo/sanctumos/commit/0a7d34a) |
| 13 | 지난 묵상 5/9, 5/10 데이터 복구 + 검색 | 5.5, 2-B | memos → meditations 마이그레이션, 검색·날짜 필터 도구바 | [`667ce0c`](https://github.com/aboveall0628-sudo/sanctumos/commit/667ce0c), [`0a7d34a`](https://github.com/aboveall0628-sudo/sanctumos/commit/0a7d34a) |
| 14 | 나의 원칙 8개 카테고리 분류 | 2-A | principles.js: 전체/영적/관계/일·소명/돈/건강/의사결정/기타 8탭 | [`15ce89b`](https://github.com/aboveall0628-sudo/sanctumos/commit/15ce89b) |
| 15 | 모바일 사용성 (사이드바, 터치 영역) | 3 | 백드롭 + 자동 닫힘 + 44×44px 보장 | [`758edcd`](https://github.com/aboveall0628-sudo/sanctumos/commit/758edcd) |

---

## 영적 톤 점검 (전체 빌드)

| 점검 항목 | 결과 | 근거 |
|---|---|---|
| 명령형 어조 제거 | ✅ | 모든 UI 텍스트 "~해요/할까요?"로 통일 ([`93bf1c3`](https://github.com/aboveall0628-sudo/sanctumos/commit/93bf1c3)) |
| 비교 지표 디폴트 숨김 | ✅ | 대시보드 자세한 지표는 토글로만 노출 ([`66fb6a9`](https://github.com/aboveall0628-sudo/sanctumos/commit/66fb6a9)) |
| 기술 용어 사용자 노출 X | ✅ | DEK/payload/마이그레이션 등 모두 친화 라벨로 ([`667ce0c`](https://github.com/aboveall0628-sudo/sanctumos/commit/667ce0c), [`93bf1c3`](https://github.com/aboveall0628-sudo/sanctumos/commit/93bf1c3)) |
| 핀 원칙 띠 항상 노출 | ✅ | todayView.js의 loadPinnedPrinciple ([`266764a`](https://github.com/aboveall0628-sudo/sanctumos/commit/266764a)) |
| AI는 가설, 결단은 사용자 | ✅ | llmProxy.ts 시스템 프롬프트 명시 ([`cd5d8a3`](https://github.com/aboveall0628-sudo/sanctumos/commit/cd5d8a3)) |
| 인물 라벨링 금지 (미래) | ✅ | docs/future-modules.md ❌ 금지 사항 명시 |
| 율법적 비교 방지 | ✅ | dashboard "비교에 휘말리지 않도록" 안내 + 토글 |

---

## 사용자 손이 필요한 잔여 작업

배포 안 해도 앱은 정상 작동. 더 풍부한 기능을 원하면:

1. **Firestore 보안 규칙 배포**: `firebase deploy --only firestore:rules`
2. **Cloud Functions Gemini 활성화**: [docs/cloud-functions-deploy.md](cloud-functions-deploy.md)
3. **데이터 복구**: 설정·보안 → 진단 시작 → 데이터 옮기기 (한 번)

---

## 향후 (v2.x ~ v3)

[docs/future-modules.md](future-modules.md) 참조:
- 인물 모듈 (persons / interactions)
- 경제 모듈 (transactions / accounts)
- 영적 안전장치 코드 리뷰 통과 후 활성화
