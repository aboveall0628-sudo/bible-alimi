/**
 * errorHandler.js — 글로벌 에러 핸들러 + PII redact
 *
 * 목적
 * - 처리 안 된 에러가 사용자에게 그대로 노출되는 걸 막고 따뜻한 메시지로 안내
 * - 콘솔 로그에서 이메일/전화번호/긴 토큰 같은 민감 정보를 자동 마스킹
 * - 추후 Sentry 같은 외부 추적 도구 연결 시 단일 진입점이 됨
 *
 * Sanctum OS 정체성: AI는 가설, 결단은 사용자 → 에러도 사용자 탓하지 않음
 */

const PII_PATTERNS = [
    { name: 'email',    re: /[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, mask: '[email]' },
    { name: 'phone',    re: /(?:\+?\d{1,3}[ -]?)?(?:\(\d{2,4}\)|\d{2,4})[ -]?\d{3,4}[ -]?\d{4}/g, mask: '[phone]' },
    { name: 'token',    re: /[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{32,}/g, mask: '[token]' },
    { name: 'apikey',   re: /AIza[0-9A-Za-z_-]{35}/g, mask: '[apikey]' },
];

/**
 * 문자열에서 PII 마스킹
 */
export function redact(text) {
    if (typeof text !== 'string') {
        try { text = JSON.stringify(text); } catch { return String(text); }
    }
    let out = text;
    PII_PATTERNS.forEach(p => { out = out.replace(p.re, p.mask); });
    return out;
}

/**
 * 콘솔에 안전하게 로그 (PII 자동 redact)
 */
export function safeLog(level, ...args) {
    const masked = args.map(a => typeof a === 'string' ? redact(a) : a);
    console[level](...masked);
}

/**
 * 사용자 친화적 에러 토스트
 */
function showFriendlyToast(message) {
    // 토스트 컴포넌트 동적 import (quickReview에 있음)
    import('../ui/quickReview.js').then(m => {
        if (m.showToast) m.showToast(message);
    }).catch(() => {
        // fallback: alert (마지막 수단)
        console.warn('[error toast]', message);
    });
}

/**
 * 글로벌 에러 핸들러 초기화 (앱 시작 시 1회)
 */
export function initGlobalErrorHandler() {
    // 처리 안 된 일반 에러
    window.addEventListener('error', (e) => {
        const msg = e.error?.message || e.message || '';
        // 이미 사용자에게 알려진 에러는 토스트 띄우지 않음
        if (isExpectedError(msg)) return;
        console.error('[global error]', redact(msg));
    });

    // 처리 안 된 Promise rejection
    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason?.message || e.reason || '';
        const msg = typeof reason === 'string' ? reason : JSON.stringify(reason);
        if (isExpectedError(msg)) return;
        console.error('[unhandled rejection]', redact(msg));
        // permission-denied 같은 흔한 케이스만 사용자 알림
        if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
            showFriendlyToast('권한이 잠시 막혀있어요. 한 번 새로고침해 볼까요?');
        }
    });

    // console.error를 wrapping해 PII redact (선택 — 너무 invasive하면 비활성화 가능)
    if (typeof window !== 'undefined' && !window.__sanctumConsoleWrapped) {
        const origError = console.error.bind(console);
        console.error = (...args) => {
            origError(...args.map(a => typeof a === 'string' ? redact(a) : a));
        };
        window.__sanctumConsoleWrapped = true;
    }
}

/**
 * 흔하게 예상되는 에러 (사용자에게 다시 알릴 필요 없음)
 */
function isExpectedError(msg) {
    if (!msg) return true;
    const expected = [
        'WRONG_PASSWORD',
        'WRONG_RECOVERY_CODE',
        'DECRYPTION_FAILED',
        'LEGACY_DATA_NOT_MIGRATED',
        'ResizeObserver loop',
        'Failed to load resource: the server responded with a status of 404', // favicon 등
    ];
    return expected.some(e => msg.includes(e));
}
