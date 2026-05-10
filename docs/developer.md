# 🛠 Sanctum OS 개발자 가이드

## 기술 스택
- **프론트**: Vanilla JS (ES Modules) + Pretendard
- **인증**: Firebase Auth (Google OAuth)
- **DB**: Firestore (자동 암복호화 Repository 레이어 경유)
- **암호화**: Web Crypto API (AES-256-GCM, PBKDF2/Argon2id)
- **AI**: Cloud Functions + Gemini API (asia-northeast3)
- **호스팅**: GitHub Pages (sanctumos repo)

## 디렉토리 구조

```
.
├── crypto/
│   ├── cryptoService.js     # AES-GCM encrypt/decrypt + 가명화/역가명화
│   └── keyManager.js         # 마스터 키 유도 (PBKDF2/Argon2id) + DEK wrap
├── data/
│   ├── firebase.js           # Firebase 초기화 + 모든 SDK exports
│   ├── baseRepo.js           # 자동 암복호화 Repository 레이어
│   ├── dotsRepo.js           # 도트 (시간 기록) CRUD
│   ├── decisionsRepo.js      # 결단 CRUD
│   ├── goalsRepo.js          # 목표 7계층 CRUD
│   ├── principlesRepo.js     # 원칙 CRUD
│   └── reportPipeline.js     # 일/주/월/분기/연 리포트 자동 생성
├── config/
│   └── encryptionPolicy.js   # 컬렉션별 평문/암호화 필드 정책
├── security/
│   ├── autoLock.js           # 15분 자동 잠금 머신
│   ├── auditLog.js           # 민감 작업 감사 로그
│   ├── exportBackup.js       # 전체 데이터 JSON 다운로드
│   └── errorHandler.js       # 글로벌 에러 핸들러 + PII redact
├── scripts/
│   ├── diagnose-v1-data.js   # v1 + _legacy_* 데이터 진단
│   └── migrate-v1-to-v2.js   # v1 평문/_legacy_ → v2 암호화 마이그레이션
├── ui/
│   ├── app.js                # 진입점, 부팅 흐름, 네비게이션
│   ├── auth.js               # 온보딩 4단계 wizard + 복구 화면
│   ├── lockScreen.js         # 잠금 화면 + 실시간 타이머
│   ├── todayView.js          # 핀 원칙 + 묵상 노트 + 결단 패널
│   ├── timeline.js           # 통합 타임라인 (24h × 96슬롯, drag&drop)
│   ├── scripture.js          # 4파트 통독 렌더링
│   ├── pastMeditations.js    # 지난 묵상 검색·필터
│   ├── eveningLoop.js        # 저녁 루프 스크롤 7~12단계
│   ├── quickReview.js        # 빠른 평가 모달 v2
│   ├── goals.js              # 목표 7탭 + CRUD
│   ├── principles.js         # 원칙 8카테고리
│   ├── dashboard.js          # 4카드 + 주간 히트맵
│   ├── reports.js            # 5탭 리포트
│   ├── settings.js           # 데이터 복구 + 비밀번호 변경 + 백업
│   ├── aiClient.js           # Cloud Function llmProxy 래퍼 + 캐시
│   ├── themeManager.js       # 라이트/다크 토글
│   └── sensitiveMode.js      # 민감 정보 블러
├── functions/                # Cloud Functions (Gemini AI 프록시)
├── infra/
│   └── cloudFunctionProxy.js # generateLocalFallback (AI 미배포 시)
├── seeds.js                  # 가입 시 시드 데이터 (라벨/원칙/샘플 목표)
├── bibleData.js              # 성경 본문 (window.BIBLE_DATA)
├── index.html                # 앱 셸 (모든 view 마크업)
├── style.css                 # 디자인 토큰 + 모든 컴포넌트 스타일
└── firestore.rules           # Firestore 보안 규칙
```

## 핵심 흐름

### 1. 부팅 (app.js)
```
init()
  ├─ initGlobalErrorHandler()
  ├─ initLockScreen({ onUnlock, onLock, startHidden: true })
  ├─ initAuth({ onSetupComplete: (dek, opts) → setUnlocked(dek) })
  ├─ initAutoLock(15)
  ├─ initQuickReview/initSensitiveMode/initThemeManager
  ├─ setupGoogleAuth() → gapiLoaded/gisLoaded
  └─ loadBibleData() (preload)

loadUserProfile()
  ├─ gapi token으로 userinfo 가져오기 → currentUserEmail
  ├─ signInWithCredential(auth, GoogleAuthProvider.credential(null, accessToken))
  │   → currentUserId = userCred.user.uid
  ├─ migrateVaultKeyIfNeeded(email, uid) (1회 자동 이전)
  └─ checkBootState()
       ├─ vault doc 있으면 → showLockScreen()
       └─ 없으면 → showSetupScreen() (4단계 wizard)
```

### 2. 잠금 해제 (lockScreen.js)
```
사용자 비번 입력
  → sanctum:unlock-attempt 이벤트
  → app.js: unlockVault(pwd, salt, wrapped, iv, kdfParams)
  → setUnlocked(dek)
       ├─ _dek = dek (메모리에만)
       ├─ startTimerTick() (1s 인터벌)
       ├─ hideLockScreen()
       └─ onVaultUnlocked(dek) → 시드 + todayView + timeline + scripture
```

### 3. 데이터 read/write
모든 Firestore 작업은 `data/baseRepo.js` 경유:
- `saveRecord(dek, collection, data, docId)` — 정책에 따라 자동 암호화
- `getRecord(dek, collection, docId)` — 자동 복호화
- `queryRecords(dek, query)` — 일괄 복호화

## Repository 정책 (config/encryptionPolicy.js)
- `plaintext`: Firestore 인덱싱·쿼리·통계용 (date, timeSlot, satisfaction 등)
- `encrypted`: 본문·이름·내용 (encryptedPayload 필드 안에 AES-GCM)

새 컬렉션 추가 시 반드시 정책 등록.

## 보안 검증 체크리스트
- [ ] Firestore 콘솔에서 도트 1건 펼쳐 봤을 때 `encryptedPayload`만 보임 (평문 X)
- [ ] `firestore.rules`가 deploy되어 다른 사용자 접근 차단
- [ ] `firebase functions:secrets:list`에 GEMINI_API_KEY 있음 (코드/Git에 X)
- [ ] 클라이언트 호출 전 `pseudonymize()` 통과 (사람·금액 마스킹)
- [ ] 모든 외부 API는 Cloud Function 경유 (직접 호출 금지)

## 배포

### 정적 자원
GitHub Pages 자동 배포 (main 브랜치 push 시 1~2분).

### Cloud Functions
[docs/cloud-functions-deploy.md](cloud-functions-deploy.md) 참조.

### Firestore Rules
```powershell
firebase deploy --only firestore:rules
```

## 코드 컨벤션
- 모든 사용자 노출 텍스트는 **토스 어체** (`~해요/~돼요/~할까요?`)
- 명령형 금지 (`~하세요` X → `~해 보세요` O)
- 기술 용어 (DEK, payload, vault) 사용자에게 노출 X
- 콘솔 로그는 영문/한글 자유, 단 PII는 자동 redact
- 디자인 토큰만 사용 (색상 hex 직접 X → `var(--accent)` O)

## 관련 문서
- [user-guide.md](user-guide.md) — 사용자 매뉴얼
- [security.md](security.md) — 보안 백서
- [future-modules.md](future-modules.md) — 인물·경제 모듈 영적 안전장치
- [cloud-functions-deploy.md](cloud-functions-deploy.md) — Cloud Functions 배포
- [../CHANGELOG.md](../CHANGELOG.md) — 버전 기록
