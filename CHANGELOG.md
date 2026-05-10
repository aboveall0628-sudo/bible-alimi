# CHANGELOG

## v2.1 — STEP 1~4 (2026-05-10)

영적 거울로서의 v2.1 빌드. 통합 타임라인 + 7계층 목표 + 카테고리 원칙 + 자동 데이터 복구 + 토스 어체 통일 + AI 분석 기반.

### STEP 0 — Zero-Knowledge 보안 척추 + v1 데이터 마이그레이션
- AES-256-GCM 암복호화 (`crypto/cryptoService.js`)
- 마스터 키 PBKDF2 600K / Argon2id 64MB (`crypto/keyManager.js`)
- 24단어 복구 코드 (BIP39 스타일 한글 단어 사전)
- DEK wrap (master + recovery 두 사본)
- 자동 잠금 15분 + 5회 실패 시 30초 lockout
- 감사 로그 (auditLog)
- v1 평문 + `_legacy_*` 백업 자동 진단·마이그레이션
- 데이터 등급 정책 (`config/encryptionPolicy.js`)
- Repository 레이어 (`data/baseRepo.js`) 자동 암복호화
- Firestore 보안 규칙 (userId 매칭)
- Firebase Auth Google 연동 (signInWithCredential)
- vault doc 키 email→uid 1회 자동 이전
- 부팅 흐름 안전장치 (`#boot-status` 표시기, main hidden 시작)

### STEP 1 — UX 통합 재구성

#### 단계 A: 통합 타임라인
- 시간대 모드(아침/낮/저녁) 폐기 — `timeOfDayMode.js` 삭제
- 토요일 회고 → 저녁 루프에 통합 — `saturdayReview.js` 삭제
- 디자인 토큰 라이트/다크 + 도트 6색 팔레트
- 사이드바 정리 (부제 제거, 다크모드 토글 작동)
- **통합 타임라인 (`ui/timeline.js`)** — 24h × 96슬롯 grid
  - 시간축 + 계획 레인 + 실제 레인 (CSS Grid 3열)
  - 결단 카드 drag&drop으로 슬롯 박기
  - 슬롯 본문 드래그 = 시간 이동, 가장자리 = 길이 조절
  - 슬롯 클릭 → 빠른 평가 모달
  - 실제 레인 빈 칸 클릭 → 인라인 한 줄 입력
  - Google Calendar 일정 자동 표시
  - 빈 상태 4단계 가이드
  - 모바일 768px 이하: 시간순 카드 세로 스크롤
- 결단 패널 (`ui/todayView.js`) — 동적 리스트 + 인라인 편집 + 드래그 핸들
- 묵상 노트 자동 저장 (1초 디바운스, AES-GCM 암호화)
- 핀 원칙 띠 항상 노출
- 성경 4파트 통독 렌더링 (`ui/scripture.js`) — 본문 → 묵상 노트 옮기기 버튼
- 빠른 평가 모달 v2 — 4 큰 버튼(😀🙂🔄😣) + 만족도 슬라이더 + 단축키 1~9 + 자세히 토글
- 저녁 통합 루프 스크롤 방식 (단계 wizard 폐기)
  - 한 페이지 세로 스크롤, sticky 인디케이터, IntersectionObserver 자동 강조
  - 동적 7~12단계 (토요일 → +주간 회고, 월말 → +월간, 분기말 → +분기, 12월말 → +연간+5/10년)
- 지난 묵상 뷰 + 검색·날짜 필터 (`ui/pastMeditations.js`)
- 대시보드 4카드 + **주간 히트맵** (7일 × 24시간)
- 토스 어체 12개 파일 통일 (명령형 X, 따뜻한 톤)
- 데이터 복구 정상화 (memos → meditations 변환, _legacy_dots → dots 재암호화)

### STEP 2 — 누락 기능 + AI

#### B-A: 나의 목표 7계층
- 상단 탭: 10년 / 5년 / 올해 / 분기 / 월 / 주 / 오늘
- 카드 인라인 편집 + 1초 디바운스 자동 저장
- 카운트 뱃지, 빈 상태 기간별 가이드

#### B-A: 나의 원칙 8 카테고리
- 전체 / 영적 / 관계 / 일·소명 / 돈 / 건강 / 의사결정 / 기타
- 카드 안 카테고리 select (변경 시 즉시 저장)
- 핀 토글 → 오늘 화면 띠 후보

#### B-C: AI 분석 (`ui/aiClient.js`)
- 가명화 (사람·금액·장소 → 마스킹 토큰) + 역가명화
- IndexedDB 캐시 24h
- Cloud Function 미배포 시 자동 fallback
- 저녁 루프 회고 단계에서 비동기 호출

#### B-D: Cloud Functions
- `functions/src/llmProxy.ts` — Gemini 2.5 Flash/Pro
- onCall(v2) + asia-northeast3 + Firebase Secrets
- 시스템 프롬프트별 영적 톤 강제
- task/model 화이트리스트
- 배포 가이드 (`docs/cloud-functions-deploy.md`)

### STEP 3 — 폴리싱 + 온보딩

- 시드 데이터 보강 (5축 라벨 영적·중립적 단어, userId 기반 docId)
- 온보딩 4단계 wizard (비번 → 24단어 → 샘플 목표 선택 → 환영)
- 모바일 폴리싱 (사이드바 백드롭, 터치 영역 44×44px)

### STEP 4 — 미래 슬롯 + 운영 + 문서

- 미래 슬롯 예약 (`linkedPersonIds`, `linkedOrgIds`, `linkedTransactionIds`)
- `firestore.rules` RESERVED 주석
- 글로벌 에러 핸들러 + PII redact (`security/errorHandler.js`)
- 문서 패키지: user-guide / developer / security / future-modules / cloud-functions-deploy
- 사용자 신고 1~15번 처리 매트릭스
- CHANGELOG 정리

---

## v2.0 — 초기 빌드 (이전)

- 사용자 신고 15건이 발생한 v2.0 초기 빌드 (이후 v2.1에서 모두 처리)
- 부분적 보안 모듈, UI 골격만 있는 상태

---

## v1.x — 이전 버전 (단일 페이지)

- 평문 저장 + 단일 사용자 가정 (`memos`, `dots` 컬렉션)
- v2.1의 데이터 복구 흐름으로 자동 마이그레이션 가능
