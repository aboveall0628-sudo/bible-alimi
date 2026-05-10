# 🔐 Sanctum OS 보안 백서

## 핵심 원칙

> **Firebase, Google, AI 제공자, 미래 운영자 누구도 평문을 못 본다.**
> 모든 민감 데이터는 사용자 디바이스를 떠나기 전에 암호화된다.

이를 **Zero-Knowledge Architecture**라 부른다. 사용자만 자신의 데이터를 읽을 수 있고, 서버는 암호화된 바이트만 본다.

---

## 1. 키 시스템 (2단계)

### 마스터 키
사용자 마스터 비밀번호에서 KDF로 유도. **서버에 절대 전송되지 않음.**

- **1순위**: Argon2id (m=64MB, t=3, p=4) — `hash-wasm` ESM
- **2순위**: PBKDF2-SHA256 600,000 iterations (Web Crypto API)

KDF 파라미터(`algo`, `iterations`)는 vault doc에 저장되어 unlock 시 같은 알고리즘 강제 사용.

### DEK (Data Encryption Key)
- `crypto.getRandomValues()`로 256비트 무작위 생성
- AES-256-GCM 키
- 메모리에만 보관 (잠금 시 폐기)

### Wrapping
- DEK는 **마스터 키로 wrap** → `wrappedDEK_master`
- DEK는 **복구 키로도 wrap** (24단어에서 유도) → `wrappedDEK_recovery`
- 두 wrapped 형태가 `users/{uid}` 문서에 저장됨

비밀번호 변경 시 DEK는 그대로 두고 `wrappedDEK_master`만 새 마스터 키로 다시 wrap → 데이터 재암호화 불필요.

---

## 2. 암호화 (AES-256-GCM)

### crypto/cryptoService.js
```js
encryptPayload(dek, plainObject) → { encryptedPayload, iv, encVersion }
decryptPayload(dek, encryptedPayload, iv, encVersion) → plainObject
```

- IV: 매 레코드마다 12바이트 무작위 (`crypto.getRandomValues`)
- encVersion: 1 (미래 알고리즘 변경 대비)
- 복호화 실패 시 `DECRYPTION_FAILED` 명시적 에러

### 데이터 등급
[config/encryptionPolicy.js](../config/encryptionPolicy.js)에 컬렉션별 명시:

| 컬렉션 | 평문 (인덱싱·쿼리용) | 암호화 (본문·이름) |
|---|---|---|
| dots | date, timeSlot, executionSatisfaction, labelIds | plannedTask, actualTask, reason, notes |
| meditations | date, scriptureRef | content, decisions, prayer |
| principles | category, pinned, active | title, body, triggerKeywords |
| goals | period, parentGoalId, progress, status | title, description, notes, scriptureRef |
| reports | period, stats, drillDownChildIds | aiSummary, keyPatterns, suggestedPrinciples |

평문 메타로 통계·정렬·필터링은 가능하지만, 본문은 절대 평문으로 노출되지 않는다.

---

## 3. Repository 레이어

모든 Firestore 접근은 [data/baseRepo.js](../data/baseRepo.js)를 경유한다.

- `saveRecord(dek, ...)`: 정책에 따라 자동 분리 → 암호화 → setDoc
- `getRecord(dek, ...)`: getDoc → 자동 복호화
- `queryRecords(dek, query)`: getDocs → 일괄 복호화

직접 `setDoc`/`getDoc`을 사용해 암호화를 우회하는 코드는 **금지**.

---

## 4. 자동 잠금

[security/autoLock.js](../security/autoLock.js)의 상태 머신:

- **UNLOCKED → LOCKED**: 15분 무활동 시 (`click`, `keydown`, `scroll`, `touchstart` 추적)
- **UNLOCKED → LOCKED**: 백그라운드 진입 후 3분
- **LOCKED → UNLOCKED**: 비밀번호 입력 또는 24단어 복구

5회 연속 비밀번호 실패 시 30초 lockout (brute force 방지).

---

## 5. 감사 로그

[security/auditLog.js](../security/auditLog.js): `auditLog` 컬렉션에 다음 행위 기록:
- `unlock_success`
- `lockout_triggered`
- `change_password`
- `backup_exported`
- `migrate_complete`

각 로그: userId + action + deviceFingerprint(SHA256) + userAgent + timestamp.

---

## 6. Firestore 보안 규칙

[firestore.rules](../firestore.rules):
```
match /users/{uid} { allow read, write: if request.auth.uid == uid; }
match /{collection}/{docId} {
    allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
}
```

모든 사용자 데이터는 **본인의 Firebase Auth UID와 일치하는 userId 필드**가 있을 때만 접근 가능.

배포: `firebase deploy --only firestore:rules`

---

## 7. AI 호출 보안 (Cloud Function 프록시)

[functions/src/llmProxy.ts](../functions/src/llmProxy.ts):

1. **인증 확인**: `request.auth` 없으면 `unauthenticated` 거절
2. **task 화이트리스트**: 정의된 작업만 (`dayReport`, `briefing` 등)
3. **model 화이트리스트**: `gemini-2.5-flash`, `gemini-2.5-pro`만
4. **API 키**: Firebase Secrets에만 저장, 클라이언트는 절대 못 봄

[ui/aiClient.js](../ui/aiClient.js)의 가명화:
- `pseudonymize(text, { persons, amounts })` → `P_001`, `[고액]` 등 마스킹 토큰
- AI 응답 후 `depseudonymize(text, mapping)`로 클라이언트에서만 원래 이름 복원
- AI 제공자는 **마스킹된 텍스트만 봄**

캐싱 (IndexedDB 24h): 같은 task + 같은 마스킹 페이로드면 재호출 안 함 → 비용 절감 + 일관성.

---

## 8. PII 보호 (런타임)

[security/errorHandler.js](../security/errorHandler.js):
- 글로벌 에러 핸들러가 `console.error` 호출 시 자동 redact
- 패턴: 이메일, 전화번호, JWT 토큰, Google API 키
- 사용자 친화적 토스트로 변환 후 노출

---

## 9. 백업

[security/exportBackup.js](../security/exportBackup.js):
- 사용자가 [📥 전체 데이터 받기] 클릭 시
- 모든 컬렉션을 DEK로 복호화 → 평문 JSON 객체 → 브라우저 다운로드
- 서버에 평문 저장 안 됨, 사용자 디바이스에만

---

## 10. 위협 모델 & 대응

| 위협 | 대응 |
|---|---|
| Firebase 운영자가 평문 보려 함 | 모든 본문은 AES-GCM 암호화, 키는 클라이언트만 보유 |
| 다른 사용자가 내 데이터 접근 시도 | Firestore Rules: userId 매칭 강제 |
| brute force 비밀번호 추측 | PBKDF2 600K iter / Argon2id 64MB + 5회 lockout |
| AI 제공자가 사용자 이름 학습 | 가명화 후 전송, AI는 마스킹 토큰만 봄 |
| Git에 API 키 커밋 | Firebase Secrets로 분리, 코드에는 absent |
| XSS로 DEK 탈취 | DEK는 메모리에만, 자동 잠금 + extractable=false 옵션 |
| 사용자 비밀번호 분실 | 24단어 복구 코드 (BIP39 스타일) — 사용자가 안전하게 보관 |

---

## 11. 알려진 한계

- 24단어 복구 코드 사전이 현재 128단어 (실제 BIP39는 2048개) → 약 168bit 엔트로피이지만 충분히 안전
- 비밀번호 분실 + 복구 코드 분실 시 → **데이터 영구 소실** (의도된 동작)
- DEK는 메모리에 평문으로 존재 → DevTools/메모리 dump로 추출 가능 (자동 잠금으로 노출 시간 최소화)

---

## 12. 책임

- 사용자: 비밀번호와 24단어 복구 코드 안전하게 보관, 정기 백업
- 개발자: Repository 레이어 우회 금지, 새 컬렉션 추가 시 정책 등록
- AI: 마스킹된 데이터만 보고, 결단은 사용자가 내림
