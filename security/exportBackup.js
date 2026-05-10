/**
 * exportBackup.js — 전체 데이터 추출 및 암호화 JSON 내보내기
 */

import { db, collection, getDocs, query, where } from '../data/firebase.js';
import { readDocument } from '../crypto/cryptoService.js';
import { logAuditAction } from './auditLog.js';

const COLLECTIONS_TO_EXPORT = [
    'dots', 'goals', 'principles', 'meditations',
    'dayReports', 'weekReports', 'monthReports', 'quarterReports', 'yearReports'
];

/**
 * 모든 사용자 데이터를 평문(복호화) 상태로 메모리에 올린 뒤,
 * 다시 하나의 JSON으로 묶어 브라우저로 다운로드합니다.
 * @param {CryptoKey} dek 
 * @param {string} userId 
 */
export async function exportAllData(dek, userId) {
    if (!dek || !userId) throw new Error('UnAuthorized');

    const exportData = {
        metadata: {
            userId,
            exportedAt: new Date().toISOString(),
            version: '2.0'
        },
        collections: {}
    };

    for (const col of COLLECTIONS_TO_EXPORT) {
        exportData.collections[col] = [];
        try {
            const q = query(collection(db, col), where('userId', '==', userId));
            const snap = await getDocs(q);
            
            for (const d of snap.docs) {
                try {
                    const decrypted = await readDocument(dek, d.data());
                    exportData.collections[col].push(decrypted);
                } catch (e) {
                    console.warn(`Failed to decrypt ${col}/${d.id} during export`);
                    exportData.collections[col].push({ ...d.data(), _decrypt_failed: true });
                }
            }
        } catch (e) {
            console.error(`Export failed for collection: ${col}`, e);
        }
    }

    // 파일 다운로드
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const node = document.createElement('a');
    node.setAttribute("href", dataStr);
    node.setAttribute("download", `SanctumOS_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(node);
    node.click();
    node.remove();

    await logAuditAction(userId, 'backup_exported');
}
