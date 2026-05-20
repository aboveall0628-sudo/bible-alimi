/**
 * cryptoService.js — AES-256-GCM 암복호화 + 가명화/역가명화
 *
 * 모든 민감 데이터는 이 모듈을 거쳐 Firestore에 저장/로드됩니다.
 * encVersion 필드로 향후 알고리즘 변경에 대비합니다.
 */

import { toBase64, fromBase64 } from './keyManager.js';

const CURRENT_ENC_VERSION = 1;

/**
 * 평문 객체 → 암호화된 페이로드
 * @param {CryptoKey} dek - Data Encryption Key
 * @param {Object} plainObject - 암호화할 필드 객체
 * @returns {{ encryptedPayload: string, iv: string, encVersion: number }}
 */
export async function encryptPayload(dek, plainObject) {
    const enc = new TextEncoder();
    const plainText = JSON.stringify(plainObject);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        dek,
        enc.encode(plainText)
    );

    return {
        encryptedPayload: toBase64(new Uint8Array(cipherBuffer)),
        iv: toBase64(iv),
        encVersion: CURRENT_ENC_VERSION,
    };
}

/**
 * 암호화된 페이로드 → 평문 객체
 * @param {CryptoKey} dek
 * @param {string} encryptedPayloadBase64
 * @param {string} ivBase64
 * @param {number} encVersion
 * @returns {Object} 복호화된 필드 객체
 */
export async function decryptPayload(dek, encryptedPayloadBase64, ivBase64, encVersion) {
    if (encVersion !== CURRENT_ENC_VERSION) {
        console.warn(`Unknown encryption version: ${encVersion}`);
    }

    try {
        const cipherBuf = fromBase64(encryptedPayloadBase64);
        const iv = fromBase64(ivBase64);

        const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            dek,
            cipherBuf
        );

        const dec = new TextDecoder();
        return JSON.parse(dec.decode(plainBuffer));
    } catch (e) {
        throw new Error('DECRYPTION_FAILED');
    }
}

/**
 * Firestore 문서를 "메타(평문) + 암호화 페이로드" 형태로 준비
 * @param {CryptoKey} dek
 * @param {Object} metaFields - 평문으로 저장할 필드 (date, timeSlot, labelIds 등)
 * @param {Object} sensitiveFields - 암호화할 필드 (plannedTask, notes 등)
 * @returns {Object} Firestore에 저장할 완성된 문서
 */
export async function prepareDocument(dek, metaFields, sensitiveFields) {
    const encrypted = await encryptPayload(dek, sensitiveFields);
    return {
        ...metaFields,
        encryptedPayload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        encVersion: encrypted.encVersion,
    };
}

/**
 * Firestore 문서에서 암호화 필드 복호화 후 병합
 *
 * 정책 (옵션 A — v1/v2 양방향 호환):
 *  - v2 문서(encryptedPayload + iv 보유) → 자물쇠 풀어서 sensitive 병합
 *  - v1 문서(평문, encryptedPayload 없음) → 그대로 반환 + 한 번만 사용자 알림
 *
 * v1 도큐먼트는 모든 필드가 평문으로 한 객체에 있으니 spread 만으로 충분.
 * 호출하는 repo 코드는 어느 쪽이든 동일한 모양의 객체를 받음 → 깨지지 않음.
 */
export async function readDocument(dek, firestoreDoc) {
    const { encryptedPayload, iv, encVersion, ...metaFields } = firestoreDoc;

    if (!encryptedPayload || !iv) {
        // v1 옛 형식 — 평문 그대로 반환.
        // 한 세션에 한 번만 사용자 알림 이벤트 발생 (listener 는 ui/app.js).
        if (typeof window !== 'undefined' && !window.__sanctumLegacyDataSeen) {
            window.__sanctumLegacyDataSeen = true;
            try {
                window.dispatchEvent(new CustomEvent('sanctum:legacy-data-seen', {
                    detail: { docId: firestoreDoc.id || firestoreDoc.userId || null },
                }));
            } catch (_) {}
        }
        console.warn('[crypto] v1 legacy plaintext doc — passing through:', firestoreDoc.id || '(no id)');
        return { ...firestoreDoc };
    }

    const sensitiveFields = await decryptPayload(dek, encryptedPayload, iv, encVersion);
    return { ...metaFields, ...sensitiveFields };
}

// ───────── 가명화 (Pseudonymization) ─────────

/**
 * 텍스트 내 민감 정보를 가명으로 치환
 *
 * v3-①-F: orgs와 places 추가 가명화 — AI 호출 전 모든 식별자를 토큰으로.
 *   P_001 = 인물, O_001 = 조직, L_001 = 장소
 *   금액은 [고액]/[중액]/[소액] bucket으로
 *
 * 길이가 긴 토큰부터 치환해야 부분 일치 오작동 방지(예: 'P_001A' 같은 경우 차단).
 *
 * @param {string} text - 원본 텍스트
 * @param {Object} context - { persons:string[], orgs:string[], places:string[], amounts:number[] }
 * @returns {{ safeText: string, mapping: Object }}
 */
export function pseudonymize(text, context = {}) {
    const mapping = {
        persons: {},   // 원래이름 → P_001
        orgs:    {},   // 원래조직 → O_001
        places:  {},   // 원래장소 → L_001
        amounts: {},   // 원래금액 → 상/중/하
        reverse: {},   // 토큰 → 원래값
    };

    let safeText = text;

    // 긴 문자열부터 치환해야 부분 일치를 막을 수 있음
    const replaceLongestFirst = (items, prefix, bucketMap) => {
        const list = (items || [])
            .filter(s => s && String(s).length >= 1)
            .map(s => String(s))
            .sort((a, b) => b.length - a.length);
        let counter = 1;
        list.forEach(value => {
            if (bucketMap[value]) return; // 중복 회피
            const alias = `${prefix}_${String(counter).padStart(3, '0')}`;
            bucketMap[value] = alias;
            mapping.reverse[alias] = value;
            safeText = safeText.split(value).join(alias);
            counter++;
        });
    };

    replaceLongestFirst(context.persons, 'P', mapping.persons);
    replaceLongestFirst(context.orgs,    'O', mapping.orgs);
    replaceLongestFirst(context.places,  'L', mapping.places);

    // 금액 → 상대값 bucket
    if (context.amounts) {
        context.amounts.forEach(amount => {
            const bucket = amount > 1000000 ? '고액' : amount > 100000 ? '중액' : '소액';
            const amountStr = String(amount);
            if (safeText.includes(amountStr)) {
                mapping.amounts[amountStr] = bucket;
                safeText = safeText.split(amountStr).join(`[${bucket}]`);
            }
        });
    }

    return { safeText, mapping };
}

/**
 * AI 응답에서 가명을 원래 이름으로 복원
 * @param {string} text - AI 응답 텍스트
 * @param {Object} mapping - pseudonymize에서 반환된 매핑
 * @returns {string}
 */
export function depseudonymize(text, mapping) {
    if (!mapping || !mapping.reverse) return text;

    let result = text;
    Object.entries(mapping.reverse).forEach(([alias, original]) => {
        result = result.split(alias).join(original);
    });
    return result;
}

export { CURRENT_ENC_VERSION };
