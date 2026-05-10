/**
 * migrate-v1-to-v2.js — v1 평문 + _legacy_ 백업 → v2 암호화
 *
 * 두 종류 입력 처리:
 * 1) v1 평문 컬렉션 (memos, dots, principles 등)
 * 2) 마이그레이션 백업 (_legacy_dots 등) — userId가 v1 식별자거나 현재 UID일 수 있음
 *    이 경우 평문 본문이 살아있으니 현재 DEK로 다시 암호화 (옛 DEK 분실 케이스 복구)
 *
 * 모든 산출물은 userId를 현재 Firebase Auth UID로 정규화하여 저장.
 * 원본은 _legacy_<col>로 한 번 더 백업 (이미 _legacy_*인 경우는 백업 생략).
 */

import { db, doc, setDoc } from '../data/firebase.js';
import { encryptPayload } from '../crypto/cryptoService.js';
import { POLICY } from '../config/encryptionPolicy.js';

/**
 * 원본 컬렉션명 → v2 타겟 컬렉션 + 사용할 정책 매핑
 */
function resolveTarget(collectionName) {
    // _legacy_* 는 원래 컬렉션명으로 환원
    const stripped = collectionName.startsWith('_legacy_')
        ? collectionName.replace('_legacy_', '')
        : collectionName;

    if (POLICY[stripped]) return { target: stripped, policy: POLICY[stripped] };
    if (stripped === 'timeboxes' || stripped === 'dots') return { target: 'dots', policy: POLICY.dots };
    if (stripped === 'memos' || stripped === 'notes') return { target: 'meditations', policy: POLICY.meditations };
    return null;
}

/**
 * v1 필드 → v2 sensitive 필드 매핑.
 * 각 v1 빌드의 필드명이 약간씩 달라서 명시적으로 처리.
 */
function mapSensitive(originalCollection, raw, encryptedKeys) {
    const sensitive = {};
    const stripped = originalCollection.replace('_legacy_', '');

    if (stripped === 'timeboxes') {
        if (raw.title !== undefined) sensitive.plannedTask = raw.title;
        if (raw.actual !== undefined) sensitive.actualTask = raw.actual;
        if (raw.reason !== undefined) sensitive.reason = raw.reason;
        if (raw.notes !== undefined) sensitive.notes = raw.notes;
    } else if (stripped === 'dots') {
        // _legacy_dots: 평문 백업 그대로
        ['plannedTask', 'actualTask', 'reason', 'notes'].forEach(k => {
            if (raw[k] !== undefined) sensitive[k] = raw[k];
        });
        // labels 배열 → labelIds 평문(이건 plaintext 정책에 들어가있어서 별도 처리 안 함)
    } else if (stripped === 'memos' || stripped === 'notes') {
        // memos는 v1 빌드의 묵상 노트. content 필드에 평문 HTML 또는 텍스트.
        if (raw.content !== undefined) sensitive.content = stripHtml(raw.content);
        if (raw.text !== undefined && sensitive.content === undefined) sensitive.content = stripHtml(raw.text);
        if (raw.decisions !== undefined) sensitive.decisions = raw.decisions;
        if (raw.prayer !== undefined) sensitive.prayer = raw.prayer;
    } else {
        // 기본: 정책의 encrypted 필드 그대로 복사
        encryptedKeys.forEach(k => {
            if (raw[k] !== undefined) sensitive[k] = raw[k];
        });
    }
    return sensitive;
}

/**
 * HTML 태그 제거 (memos 컬렉션이 <div><br>를 그대로 저장한 상태 → 평문 텍스트로)
 */
function stripHtml(html) {
    if (typeof html !== 'string') return html;
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<\/?div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * 한 컬렉션 마이그레이션 (v1 평문 또는 _legacy_ 백업 모두 동일 처리)
 *
 * @param {CryptoKey} dek - 현재 DEK
 * @param {string} currentUserId - 현재 Firebase Auth UID
 * @param {string} collectionName - 원본 컬렉션명
 * @param {Array} docs - Firestore 문서 스냅샷 배열
 * @param {Function} onProgress - (success, total)
 */
export async function migrateCollection(dek, currentUserId, collectionName, docs, onProgress) {
    const resolved = resolveTarget(collectionName);
    if (!resolved) return 0;
    const { target, policy } = resolved;
    const isLegacy = collectionName.startsWith('_legacy_');

    let success = 0;
    const total = docs.length;

    for (const d of docs) {
        const raw = d.data();

        // 이미 v2 포맷이고 userId가 정규화되어 있으면 통과 (단, _legacy_가 아닐 때만)
        if (!isLegacy && raw.encryptedPayload && raw.iv && raw.encVersion && raw.userId === currentUserId) {
            success++;
            if (onProgress) onProgress(success, total);
            continue;
        }

        try {
            // 1) v1 원본인 경우만 _legacy_*에 백업. (이미 _legacy_*면 백업 생략)
            if (!isLegacy) {
                const legacyId = `_legacy_${collectionName}`;
                await setDoc(doc(db, legacyId, d.id), {
                    ...raw,
                    userId: currentUserId,
                    _archivedAt: Date.now(),
                    _originalUserId: raw.userId || null,
                });
            }

            // 2) 평문 메타 분리
            const meta = { id: d.id, userId: currentUserId };
            policy.plaintext.forEach(k => {
                if (k === 'id' || k === 'userId') return;
                if (raw[k] !== undefined) meta[k] = raw[k];
            });

            // 3) 암호화 필드 매핑
            const sensitive = mapSensitive(collectionName, raw, policy.encrypted);

            // 4) 암호화 + 저장
            const encrypted = await encryptPayload(dek, sensitive);
            const v2Doc = { ...meta, ...encrypted };

            // memos에서 옮긴 경우 ID를 새로 만들어서 meditation_<uid>_<date> 형태로
            const finalId = (collectionName === 'memos' || collectionName === '_legacy_memos')
                ? `meditation_${currentUserId}_${meta.date || d.id}`
                : d.id;
            v2Doc.id = finalId;

            await setDoc(doc(db, target, finalId), v2Doc, { merge: true });

            success++;
            if (onProgress) onProgress(success, total);
        } catch (e) {
            console.error(`문서 [${d.id}] 마이그레이션 실패 (${collectionName}):`, e);
        }
    }

    return success;
}

/**
 * 진단 결과 전체 JSON 스냅샷 다운로드 (마이그레이션 전 안전장치)
 */
export function downloadJsonSnapshot(reportData) {
    const exportObj = {};
    for (const [col, info] of Object.entries(reportData)) {
        exportObj[col] = info.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const node = document.createElement('a');
    node.setAttribute('href', dataStr);
    node.setAttribute('download', `sanctumos_v1_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(node);
    node.click();
    node.remove();
}

export { stripHtml };
