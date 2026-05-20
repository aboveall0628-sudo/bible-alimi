// firebase-messaging-sw.js — FCM background message handler
// 2026-05-20 신규. 사용자 피드백 도착 알림 (Swan 관리자 전용).
//
// 이 SW 는 FCM SDK 가 getToken() 호출 시 자동 등록해요. 별도 register 필요 없어요.
// 경로는 루트(/firebase-messaging-sw.js)에 자리잡혀야 FCM 이 자동으로 찾아요.

importScripts('https://www.gstatic.com/firebasejs/10.11.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBz_-F3Gp7bK2DvWBGfwjf6jevSnFaHess",
    authDomain: "biblealimi.firebaseapp.com",
    projectId: "biblealimi",
    storageBucket: "biblealimi.firebasestorage.app",
    messagingSenderId: "407329001149",
    appId: "1:407329001149:web:ba286301f3d0ad5d55f1d4",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const title = (payload && payload.notification && payload.notification.title) || '새 피드백';
    const body = (payload && payload.notification && payload.notification.body) || '';
    const link = (payload && payload.fcmOptions && payload.fcmOptions.link) ||
                 (payload && payload.data && payload.data.link) ||
                 '/?view=feedback-admin';

    self.registration.showNotification(title, {
        body,
        icon: '/assets/favicon-32.png',
        badge: '/assets/favicon-16.png',
        data: { url: link },
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil((async () => {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of allClients) {
            if (c.url.includes('sanctumos') || c.url.includes('localhost')) {
                try {
                    await c.focus();
                    if ('postMessage' in c) c.postMessage({ type: 'sanctum-notif-click', url });
                    return;
                } catch (_) { /* ignore */ }
            }
        }
        if (self.clients.openWindow) await self.clients.openWindow(url);
    })());
});
