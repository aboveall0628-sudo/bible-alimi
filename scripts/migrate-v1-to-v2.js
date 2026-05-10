/**
 * migrate-v1-to-v2.js — 데이터 무손실 마이그레이션 (Zero-Knowledge 전환)
 *
 * v1 식별자(이메일 등)로 저장된 레코드를 현재 Firebase Auth UID 기준으로 재기록.
 * 원본은 _legacy_<col>/<id>로 보존(롤백용).
 */

import { db, doc, setDoc } from '../data/firebase.js';
import { encryptPayload } from '../crypto/cryptoService.js';
import { POLICY } from '../config/encryptionPolicy.js';

/**
 * v1 컬렉션명 → v2 컬렉션명/정책 매핑
 */
function resolveTarget(collectionName) {
    if (POLICY[collectionName]) return { target: collectionName, policy: POLICY[collectionName] };
    if (collectionName === 'timeboxes') return { target: 'dots', policy: POLICY.dots };
    if (collectionName === 'notes') return { target: 'meditations', policy: POLICY.meditations };
    return null;
}

/**
 * v1 필드 → v2 sensitive 필드 명시적 매핑
 */
function mapSensitive(collectionName, raw, encryptedKeys) {
    const sensitive = {};
    if (collectionName === 'timeboxes') {
        if (raw.title !== undefined) sensitive.plannedTask = raw.title;
        if (raw.actual !== undefined) sensitive.actualTask = raw.actual;
        if (raw.reason !== undefined) sensitive.reason = raw.reason;
        if (raw.notes !== undefined) sensitive.notes = raw.notes;
    } else if (collectionName === 'notes') {
        if (raw.content !== undefined) sensitive.content = raw.content;
        if (raw.text !== undefined && sensitive.content === undefined) sensitive.content = raw.text;
        if (raw.decisions !== undefined) sensitive.decisions = raw.decisions;
        if (raw.prayer !== undefined) sensitive.prayer = raw.prayer;
    } else {
        encryptedKeys.forEach(k => {
            if (raw[k] !== undefined) sensitive[k] = raw[k];
        });
    }
    return sensitive;
}

/**
 * 한 컬렉션 마이그레이션
 * @param {CryptoKey} dek
 * @param {string} currentUserId - 현재 Firebase Auth UID (v2 userId 필드로 기록됨)
 * @param {string} collectionName
 * @param {Array} docs - Firestore 문서 스냅샷 배열
 * @param {Function} onProgress
 */
export async function migrateCollection(dek, currentUserId, collectionName, docs, onProgress) {
    const resolved = resolveTarget(collectionName);
    if (!resolved) return 0;
    const { target, policy } = resolved;

    let success = 0;
    const total = docs.length;

    for (const d of docs) {
        const raw = d.data();

        // 이미 v2 포맷이면 userId만 정규화하고 통과
        if (raw.encryptedPayload && raw.iv && raw.encVersion) {
            if (raw.userId !== currentUserId) {
                try {
                    await setDoc(doc(db, target, d.id), { ...raw, userId: currentUserId }, { merge: true });
                } catch (e) { console.warn(`v2 doc userId 갱신 실패: ${d.id}`, e); }
            }
            success++;
            if (onProgress) onProgress(success, total);
            continue;
        }

        try {
            // 1. 원본을 _legacy_<col>로 백업 — 보안 규칙 통과를 위해 userId 정규화
            await setDoc(doc(db, `_legacy_${collectionName}`, d.id), {
                ...raw,
                userId: currentUserId,
                _archivedAt: Date.now(),
                _originalUserId: raw.userId || null,
            });

            // 2. 평문 메타 분리 + userId 정규화
            const meta = { id: d.id, userId: currentUserId };
            policy.plaintext.forEach(k => {
                if (k === 'id' || k === 'userId') return;
                if (raw[k] !== undefined) meta[k] = raw[k];
            });

            // 3. 암호화 필드 매핑
            const sensitive = mapSensitive(collectionName, raw, policy.encrypted);

            // 4. 암호화
            const encrypted = await encryptPayload(dek, sensitive);
            const v2Doc = { ...meta, ...encrypted };

            // 5. 저장
            await setDoc(doc(db, target, d.id), v2Doc);

            success++;
            if (onProgress) onProgress(success, total);
        } catch (e) {
            console.error(`문서 [${d.id}] 마이그레이션 실패:`, e);
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
