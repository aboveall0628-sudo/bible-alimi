# 트랙 2 Phase 3 배포 가이드

**작성일**: 2026-05-13
**상태**: 코드 작성 완료 (commit 66a552a) — 본인 자격 발급 + 배포만 남음

---

## 0. 큰 그림

```
지금 상태:
  [코드] ✅ 다 작성됨
  [자격] ❌ Gmail App Password 미발급
  [자격] ❌ SLOT_KMS_KEY 미발급
  [배포] ❌ Cloud Functions 미배포

해야 할 일:
  ① Gmail App Password 발급           (5분)
  ② SLOT_KMS_KEY 32바이트 생성        (1분)
  ③ Firebase Secrets에 3개 등록        (3분)
  ④ firebase deploy --only functions   (3~5분)
  ⑤ 등록 시연                          (실제 자기 자신에 등록해보기)
```

---

## 1. Gmail App Password 발급

복구 안내 메일을 보내려면 운영자 Gmail 계정의 SMTP 자격이 필요해요.

1. https://myaccount.google.com/apppasswords 접속 (본인 Google 계정으로 로그인된 상태)
2. **2단계 인증이 켜져 있어야 함** — 안 되어 있으면 "보안 → 2단계 인증" 먼저 활성화
3. 앱 이름 입력: `Sanctum OS Recovery` (아무 이름이어도 OK)
4. **16자리 비밀번호 표시됨** — 공백 포함 표시되지만 입력 시 공백은 빼고 16자리만 사용
5. 이 비밀번호는 한 번만 표시됨. 메모장이나 비밀번호 매니저에 임시 저장

⚠️ 이 비밀번호는 Sanctum OS 사용자 비밀번호가 아니라 **"Sanctum OS가 본인 Gmail로 메일을 보낼 때 쓰는 자격"** 입니다. 사용자에겐 노출되지 않아요.

---

## 2. SLOT_KMS_KEY 생성

운영자 금고 안의 마스터 키. emailSlotKey를 한 번 더 wrap할 때 사용.

PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

또는 Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

출력 예시 (44자 base64, 끝에 `=` 있음):
```
3kZxLpQ9wT8mY2rV6nE5cB1aD4fH7gJ0sU=
```

⚠️ **이 키를 잃어버리면 이메일 복구가 영구히 작동하지 않습니다.** 별도 안전한 곳에 백업 (1Password 등). 한 번 등록되면 클라이언트의 wrappedDEK_email은 이 키 없이는 절대 복호화 못 함.

---

## 3. Firebase Secrets 등록

`functions/` 디렉토리에서 실행:

```bash
cd functions
firebase functions:secrets:set GMAIL_USER
# 프롬프트: 본인 Gmail 주소 입력 (예: aboveall0628@gmail.com)

firebase functions:secrets:set GMAIL_APP_PASSWORD
# 프롬프트: 위에서 발급한 16자리 비밀번호 입력 (공백 빼고)

firebase functions:secrets:set SLOT_KMS_KEY
# 프롬프트: 위에서 만든 base64 키 입력
```

각각 등록되면 "Secret SLOT_KMS_KEY (version 1) created" 같은 메시지 표시.

확인:
```bash
firebase functions:secrets:access GMAIL_USER
# 값이 출력되면 OK
```

---

## 4. 배포

```bash
cd functions
npm run build
firebase deploy --only functions
```

처음 배포 시 새 함수 5개가 만들어지면서 3~5분 걸립니다. 출력에:

```
✔ functions[emailRecoveryRegister(asia-northeast3)] Successful create operation.
✔ functions[emailRecoveryRequest(asia-northeast3)] Successful create operation.
✔ functions[emailRecoveryVerify(asia-northeast3)] Successful create operation.
✔ functions[emailRecoveryRedeemSeed(asia-northeast3)] Successful create operation.
✔ functions[emailRecoveryRotateSeed(asia-northeast3)] Successful create operation.
```

같은 다섯 줄이 나오면 성공.

### Node 20 deprecated 경고
배포 시 "Node.js 20 will be decommissioned 2026-10-30" 경고가 뜰 수 있어요. 메모리의 `project_status.md` 경고와 같은 건. 별도 트랙(Node 22 업그레이드)에서 처리 예정.

---

## 5. 시연 시나리오

배포 직후 본인 계정으로 직접 시험:

### 시나리오 A — 등록 (이미 가입된 경우)
1. 앱 새로고침 후 비밀번호로 로그인
2. **설정 → 이메일 복구** 카드
3. 상태가 "○ 아직 등록되지 않았어요" 인지 확인
4. **이메일 복구 등록하기** 클릭
5. "이메일 복구 등록 완료 ✓" 토스트
6. 카드 상태가 "✓ 등록됨 — 비상 시 aboveall0628@gmail.com 으로 복구할 수 있어요"로 변경
7. 버튼 라벨이 "슬롯 키 회전 (재등록)"으로 변경

### 시나리오 B — 복구 시연 (위험 — 새 계정으로 테스트 권장)
1. 등록 완료 상태에서 로그아웃
2. Google 로그인 → 잠금 화면
3. **"비밀번호를 잊었어요"** 클릭
4. 방법 선택에서 **"📧 이메일로 복구"**
5. 등록한 이메일 입력 → "코드 보내기"
6. Gmail 받은편지함에서 "[Sanctum OS] 복구 코드 안내" 메일 확인
7. 6자리 코드 입력 → "확인하고 열기"
8. 로그인됨 + 백그라운드에서 슬롯 키 자동 회전

⚠️ **본인 메인 계정으로 시연하는 건 신중히.** 시연 중 흐름이 깨지면 데이터 접근에 영향 갈 수 있어요. 가능하면 별도 Google 계정으로 새로 가입해서 시연하는 게 안전.

---

## 6. 트러블슈팅

| 증상 | 원인 / 대응 |
|------|-------------|
| 등록 시 "internal" 오류 | Secrets 미등록 또는 잘못된 값. `firebase functions:secrets:access` 로 확인 |
| "SLOT_KMS_KEY 길이가 32바이트가 아니에요" | base64 디코딩 후 32바이트여야 함. 다시 생성 |
| 메일이 안 옴 | Gmail App Password 오타 / 2단계 인증 꺼짐 / Gmail 발송량 한도 |
| "토큰을 찾을 수 없어요" | 60초 만료 — 코드 입력에 너무 오래 걸림. 새 코드 요청 |
| "이미 사용된 토큰" | 1회 사용 후 재시도 — 새 코드 요청부터 다시 |
| 한 번 등록한 후 카드 상태가 "확인 중..." 에서 안 바뀜 | Firestore 권한 문제. users 문서 읽기 가능한지 확인 |

---

## 7. 보안 디테일 (참고)

- 서버는 평문 DEK를 **절대** 갖지 않음. emailSlotKey를 60초만 응답으로 노출.
- emailSlotKey는 노출 즉시 한 번만 사용 (Firestore 트랜잭션으로 `used: true` 마킹)
- 복구 직후 클라이언트가 자동으로 새 슬롯 키로 회전 → 노출된 키 폐기
- Rate limit으로 브루트포스 방어
- 코드 SHA-256(salt|code) 해시로만 Firestore에 저장 → DB가 털려도 코드 평문 안 나옴

---

## 8. 종료 후 메모리 갱신할 것

배포 + 시연 성공하면:
- `memory/project_separate_tracks.md`의 Phase 3 항목 "배포 완료" 표시 갱신
- `memory/project_status.md`의 0번 항목 "Phase 4 마이그레이션 강요"로 이동
