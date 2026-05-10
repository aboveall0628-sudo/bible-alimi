/**
 * auditLog.js — 민감 작업 감사 로그 (Zero-Knowledge)
 *
 * 로그인, 잠금 해제, 비밀번호 변경, 백업 다운로드, 마이그레이션 실행 등의 행위를 로깅.
 */

import { db, collection, setDoc, doc, serverTimestamp } from '../data/firebase.js';

/**
 * 액션 로그 기록
 * @param {string} userId
 * @param {string} action - 'unlock', 'migrate', 'backup', 'change_password', 'lockout'
 * @param {Object} details - 추가 메타데이터
 */
export async function logAuditAction(userId, action, details = {}) {
    if (!userId || userId === 'anonymous') return;

    try {
        const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2,8)}`;
        
        // 브라우저 및 디바이스 핑거프린트 수집 (간단 버전)
        const userAgent = navigator.userAgent;
        const deviceFingerprint = btoa(`${navigator.language}-${screen.width}x${screen.height}-${new Date().getTimezoneOffset()}`).substring(0, 16);

        await setDoc(doc(db, 'auditLog', id), {
            id,
            userId,
            action,
            deviceFingerprint,
            userAgent,
            timestamp: serverTimestamp(),
            details
        });
    } catch (e) {
        console.warn('Audit log write failed:', e);
    }
}
