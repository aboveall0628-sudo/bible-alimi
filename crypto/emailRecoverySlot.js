/**
 * emailRecoverySlot.js — 이메일 복구용 추가 DEK 슬롯 (Phase 2 / 트랙 2)
 *
 * 키 체계 확장:
 *   masterKey   (비밀번호 PBKDF2)        → wrap → wrappedDEK_master
 *   recoveryKey (24단어 PBKDF2)          → wrap → wrappedDEK_recovery
 *   emailSlotKey (무작위 256비트, 1회용) → wrap → wrappedDEK_email   ← 본 모듈
 *
 * 설계 Y (E2EE 유지형):
 *   - 클라이언트가 emailSlotKey를 무작위 생성하고 DEK를 wrap.
 *   - emailSlotKey 자체는 Cloud Function(Phase 3)에 전달되어 Firebase Secrets KMS 키로
 *     한 번 더 wrap된 뒤 Firestore에 wrappedEmailSlotKey로 보관됨. 원본 raw 키는 즉시 폐기.
 *   - 복구 시 사용자가 이메일 인증 통과 → Cloud Function이 60초 동안만 KMS unwrap해
 *     emailSlotKey를 응답 → 클라이언트가 그 키로 wrappedDEK_email을 풀어 DEK 복원.
 *   - 서버는 평문 DEK를 절대 갖지 않음.
 *
 * Phase 2 (이 모듈만) 단독으로는 등록 행위까지 가지 않습니다.
 * Phase 3에서 Cloud Function 4개 (request/verify/redeem/rotate)가 도입되어야
 * createEmailSlot 결과가 의미를 가집니다.
 */

import { toBase64, fromBase64 } from './keyManager.js';

/**
 * 새 이메일 복구 슬롯 생성
 *
 * @param {CryptoKey} dek - 현재 데이터 암복호화에 사용 중인 DEK
 * @returns {Promise<{
 *   emailSlotKeyRaw: string,      // base64 — Cloud Function에 전달 후 즉시 폐기
 *   wrappedDEK_email: string,     // base64 — Firestore users 문서에 보관
 *   wrappedDEK_email_iv: string,  // base64 — 위와 짝
 * }>}
 *
 * 호출자(Phase 3 흐름) 약속:
 *   1) 반환된 emailSlotKeyRaw를 Cloud Function에 전송 → KMS wrap 응답 받음
 *   2) wrappedDEK_email, wrappedDEK_email_iv, wrappedEmailSlotKey(서버 응답)를
 *      users/{uid} 문서에 함께 저장
 *   3) emailSlotKeyRaw 변수는 메모리에서 즉시 폐기 (참조 제거)
 */
export async function createEmailSlot(dek) {
    const emailSlotKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const emailSlotKey = await crypto.subtle.importKey(
        'raw',
        emailSlotKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['wrapKey', 'unwrapKey']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.wrapKey('raw', dek, emailSlotKey, {
        name: 'AES-GCM',
        iv: iv,
    });

    return {
        emailSlotKeyRaw: toBase64(emailSlotKeyBytes),
        wrappedDEK_email: toBase64(new Uint8Array(wrapped)),
        wrappedDEK_email_iv: toBase64(iv),
    };
}

/**
 * 이메일 슬롯 키로 DEK 복원 (Phase 3 복구 흐름에서 호출)
 *
 * @param {string} emailSlotKeyRawBase64 - Cloud Function이 60초 권한으로 돌려준 키
 * @param {string} wrappedDEKBase64      - users 문서의 wrappedDEK_email
 * @param {string} ivBase64              - users 문서의 wrappedDEK_email_iv
 * @returns {Promise<CryptoKey>} 복원된 DEK
 * @throws {Error} 'WRONG_EMAIL_SLOT_KEY' 슬롯 키와 wrappedDEK가 짝이 맞지 않을 때
 */
export async function unwrapDEKWithEmailSlot(emailSlotKeyRawBase64, wrappedDEKBase64, ivBase64) {
    const emailSlotKeyBytes = fromBase64(emailSlotKeyRawBase64);
    const emailSlotKey = await crypto.subtle.importKey(
        'raw',
        emailSlotKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['wrapKey', 'unwrapKey']
    );

    try {
        const wrappedBuf = fromBase64(wrappedDEKBase64);
        const iv = fromBase64(ivBase64);
        return await crypto.subtle.unwrapKey(
            'raw',
            wrappedBuf,
            emailSlotKey,
            { name: 'AES-GCM', iv: iv },
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    } catch (e) {
        throw new Error('WRONG_EMAIL_SLOT_KEY');
    }
}

/**
 * 사용자 문서에 이메일 복구가 등록되어 있는지 판단
 *
 * Phase 2 정책: wrappedDEK_email 필드가 존재하지 않으면 미등록.
 * 별도 enabled 플래그 없이 필드 존재 여부 자체가 등록 상태.
 *
 * @param {Object|null} userDocData - users/{uid} 문서 데이터
 * @returns {boolean}
 */
export function isEmailRecoveryRegistered(userDocData) {
    if (!userDocData) return false;
    return !!(userDocData.wrappedDEK_email && userDocData.wrappedDEK_email_iv);
}
