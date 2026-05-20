/**
 * fcmRegister.js — Swan 관리자 전용 FCM 토큰 등록
 *
 * 2026-05-20 신규. Phase 1 (1차 베타 직전).
 *
 * Swan 관리자 로그인 + 권한 허용 시 호출 → getToken → adminTokens/{SWAN_UID}/tokens/{tokenId} 저장.
 * 새 피드백 도착 시 Cloud Function feedbackNotify 가 이 토큰 대상으로 푸시 발송.
 *
 * iOS 16.4+ 자리:
 *   - PWA standalone 모드 (홈 화면 추가 필수)
 *   - Notification API 사용 가능
 *   - VAPID 키로 자리잡힘
 *   - 자세한 안내는 ui/iosPushHint.js
 *
 * 호출 자리:
 *   - 부팅 후 자동: registerSwanAdminPushIfPermitted(userId)
 *   - 사용자 클릭: requestSwanAdminPushPermission(userId) (설정 카드 [알림 켜기])
 */

import {
    getMessaging, getToken, onMessage, isSupported
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-messaging.js";
import { db, doc, setDoc, serverTimestamp } from "../data/firebase.js";
import { isSwanAdmin, SWAN_ADMIN_UID } from "../config/adminConfig.js";

// Firebase Cloud Messaging Web Push 인증서 (VAPID public key).
// 2026-05-20 Swan Firebase Console biblealimi 자리에서 생성.
// 평문 안전 — 클라이언트 공개용 자리.
const VAPID_KEY = 'BFsF1_GwcFudD0jqy4Tp0lPxhWCEiCXGA8gvWz7M1ROFHESpOmiIK5e7-Z7_ttnWgx63hpmstlIsK_M9jSVTJuk';

const TOKEN_STORAGE_KEY = 'sanctum.fcm.tokenId.v1';

let _messaging = null;
let _registered = false;

async function ensureMessaging() {
    if (_messaging) return _messaging;
    try {
        const supported = await isSupported();
        if (!supported) {
            console.log('[fcm] not supported in this browser');
            return null;
        }
        _messaging = getMessaging();
        return _messaging;
    } catch (e) {
        console.warn('[fcm] messaging init failed:', e);
        return null;
    }
}

/**
 * 권한 이미 granted 상태면 자동으로 토큰 등록 진입.
 * 부팅 직후 호출하기 좋은 결.
 */
export async function registerSwanAdminPushIfPermitted(currentUserId) {
    if (_registered) return 'already';
    if (!isSwanAdmin(currentUserId)) return 'not_admin';
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'granted') return 'no_permission';
    return await _doRegister(currentUserId);
}

/**
 * 사용자 클릭 트리거에서 권한 요청 후 등록 진입.
 * 설정 카드 [알림 켜기] 버튼 자리.
 */
export async function requestSwanAdminPushPermission(currentUserId) {
    if (!isSwanAdmin(currentUserId)) return 'not_admin';
    if (typeof Notification === 'undefined') return 'unsupported';

    if (Notification.permission === 'granted') {
        return await _doRegister(currentUserId);
    }
    if (Notification.permission === 'denied') {
        return 'denied';
    }

    const result = await Notification.requestPermission();
    if (result === 'granted') {
        return await _doRegister(currentUserId);
    }
    return result;
}

async function _doRegister(currentUserId) {
    const messaging = await ensureMessaging();
    if (!messaging) return 'unsupported';

    if (!('serviceWorker' in navigator)) return 'no_sw';

    let swReg = null;
    try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
    } catch (e) {
        console.warn('[fcm] sw register failed:', e);
        return 'sw_failed';
    }

    let token = null;
    try {
        token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swReg,
        });
    } catch (e) {
        console.warn('[fcm] getToken failed:', e);
        return 'token_failed';
    }
    if (!token) {
        console.warn('[fcm] no token returned');
        return 'no_token';
    }

    const tokenId = `tk_${_hash(token).slice(0, 20)}`;
    const ref = doc(db, 'adminTokens', SWAN_ADMIN_UID, 'tokens', tokenId);
    try {
        await setDoc(ref, {
            token,
            userAgent: (navigator.userAgent || '').slice(0, 200),
            platform: (navigator.platform || '').slice(0, 40),
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
        });
        try { localStorage.setItem(TOKEN_STORAGE_KEY, tokenId); } catch (_) { /* ignore */ }
        console.log('[fcm] token registered:', tokenId);
    } catch (e) {
        console.warn('[fcm] firestore save failed:', e);
        return 'save_failed';
    }

    onMessage(messaging, (payload) => {
        console.log('[fcm] foreground message:', payload);
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        const title = (payload && payload.notification && payload.notification.title) || '새 피드백';
        const body = (payload && payload.notification && payload.notification.body) || '';
        try {
            new Notification(title, {
                body,
                icon: '/assets/favicon-32.png',
            });
        } catch (_) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) reg.showNotification(title, { body, icon: '/assets/favicon-32.png' });
            }).catch(() => {});
        }
    });

    _registered = true;
    return 'granted';
}

function _hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36) + s.slice(-8);
}

export function isPushRegistered() {
    return _registered;
}

export function getPushPermissionState() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
}
