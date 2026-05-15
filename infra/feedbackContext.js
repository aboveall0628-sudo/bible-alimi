/**
 * feedbackContext.js — SWAN 피드백 자동 라벨 9종 수집 (CS AI 트랙 §9 2단계)
 *
 * 2026-05-15 신규.
 *
 * 풍선 클릭 시점에 자동으로 부착할 메타 데이터를 모읍니다.
 *
 * 라벨 9종:
 *   1. userId       (호출 측에서 전달)
 *   2. nickname     (호출 측에서 전달 — selfCard.name)
 *   3. createdAt    (Firestore serverTimestamp — 호출 측 처리)
 *   4. screenPath   (현재 화면 키워드 추출)
 *   5. moduleName   (간이 추정 — 향후 더 정교화)
 *   6. viewport     (`${innerWidth}x${innerHeight}`)
 *   7. userAgent    (브라우저 + OS 간략)
 *   8. consoleErrors (직전 5초 console.error/warn 큐)
 *   9. (turns·summary·category 등은 대화 중 누적)
 */

// ─── 콘솔 에러 큐 (직전 5초만 유지) ───────────────────────────

const ERROR_WINDOW_MS = 5000;
const errorQueue = [];

let installed = false;

/**
 * 콘솔 에러·경고 인터셉터 설치. app.js 부트스트랩 시 한 번만 호출.
 * 기존 console.error/warn 호출은 그대로 동작 — wrap 만 추가.
 */
export function installConsoleErrorCapture() {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const origError = console.error.bind(console);
    const origWarn  = console.warn.bind(console);

    console.error = (...args) => {
        try {
            errorQueue.push({
                level: 'error',
                at:    Date.now(),
                text:  args.map(formatArg).join(' '),
            });
            pruneOld();
        } catch (e) { /* 인터셉터 자체 실패 무시 */ }
        return origError(...args);
    };

    console.warn = (...args) => {
        try {
            errorQueue.push({
                level: 'warn',
                at:    Date.now(),
                text:  args.map(formatArg).join(' '),
            });
            pruneOld();
        } catch (e) { /* 무시 */ }
        return origWarn(...args);
    };

    // window.onerror 미잡힘 케이스 (Uncaught)
    window.addEventListener('error', (ev) => {
        try {
            errorQueue.push({
                level: 'uncaught',
                at:    Date.now(),
                text:  `${ev.message} @ ${ev.filename}:${ev.lineno}`,
            });
            pruneOld();
        } catch (e) { /* 무시 */ }
    });

    window.addEventListener('unhandledrejection', (ev) => {
        try {
            errorQueue.push({
                level: 'unhandled_rejection',
                at:    Date.now(),
                text:  String(ev.reason),
            });
            pruneOld();
        } catch (e) { /* 무시 */ }
    });
}

function formatArg(a) {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    try { return JSON.stringify(a).slice(0, 200); } catch { return String(a); }
}

function pruneOld() {
    const cutoff = Date.now() - ERROR_WINDOW_MS;
    while (errorQueue.length > 0 && errorQueue[0].at < cutoff) {
        errorQueue.shift();
    }
    // 너무 많아지지 않도록 상한
    while (errorQueue.length > 50) errorQueue.shift();
}

function snapshotErrors() {
    pruneOld();
    return errorQueue.map(e => ({
        level: e.level,
        text:  e.text.slice(0, 300),  // 1건당 300자 컷
    }));
}

// ─── 화면 경로 추정 ───────────────────────────────────────────

/**
 * 현재 활성 뷰 추정. ui/app.js 가 navigation 시 data-view 속성 또는
 * window.location.hash 를 쓰는 패턴 가정. 둘 다 fallback 으로.
 */
function detectScreenPath() {
    if (typeof window === 'undefined') return '';

    // 1순위: 활성 nav 버튼 data-view (있으면)
    const active = document.querySelector('.nav-item.active, .sidebar-item.active, [data-view].active');
    if (active && active.dataset?.view) return active.dataset.view;

    // 2순위: hash
    if (window.location.hash) {
        return window.location.hash.replace(/^#/, '').split('?')[0] || '';
    }

    // 3순위: query string ?view=
    const params = new URLSearchParams(window.location.search);
    if (params.get('view')) return params.get('view');

    // 4순위: pathname 마지막 세그먼트
    const path = window.location.pathname || '';
    const last = path.split('/').filter(Boolean).pop();
    return last || 'unknown';
}

/**
 * 모듈 파일 추정 — screenPath 기반 매핑.
 * 향후 정교화 가능. 1차는 휴리스틱.
 */
function guessModuleName(screenPath) {
    const map = {
        'today':            'ui/todayView.js',
        'view-today':       'ui/todayView.js',
        'dashboard':        'ui/dashboard.js',
        'scripture':        'ui/scripture.js',
        'meditation':       'ui/scripture.js',
        'goals':            'ui/goals.js',
        'reports':          'ui/reports.js',
        'principles':       'ui/principles.js',
        'persons':          'ui/personCard.js',
        'organizations':    'ui/orgCard.js',
        'decision-gate':    'ui/decisionGate.js',
        'memorials':        'ui/memorials.js',
        'workflows':        'ui/workflows.js',
        'economy':          'ui/economy.js',
        'settings':         'ui/settings.js',
        'self-profile':     'ui/selfProfile.js',
    };
    return map[screenPath] || '';
}

// ─── 환경 정보 ───────────────────────────────────────────────

function detectViewport() {
    if (typeof window === 'undefined') return '';
    return `${window.innerWidth}x${window.innerHeight}`;
}

function detectUserAgent() {
    if (typeof navigator === 'undefined') return '';
    const ua = navigator.userAgent || '';
    // 간략 추출 — Chrome 120 / macOS 14 같은 형식
    const browser =
        /Edg\/(\d+)/.exec(ua)     ? `Edge ${RegExp.$1}`     :
        /Chrome\/(\d+)/.exec(ua)  ? `Chrome ${RegExp.$1}`   :
        /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}`  :
        /Safari\/(\d+)/.exec(ua) && !/Chrome/.test(ua) ? 'Safari' :
        'Other';
    const os =
        /Mac OS X (\d+[._]\d+)/.exec(ua) ? `macOS ${RegExp.$1.replace('_', '.')}` :
        /Windows NT (\d+\.\d+)/.exec(ua) ? `Windows ${RegExp.$1}` :
        /Android (\d+)/.exec(ua)         ? `Android ${RegExp.$1}` :
        /iPhone OS (\d+_\d+)/.exec(ua)   ? `iOS ${RegExp.$1.replace('_', '.')}` :
        /Linux/.test(ua)                 ? 'Linux' :
        'Other';
    return `${browser} / ${os}`;
}

// ─── 외부 노출 API ───────────────────────────────────────────

/**
 * 풍선 클릭 시점에 호출 — 한 묶음 메타 데이터 반환.
 * 호출 측(feedbacksRepo.startFeedback)에 context 인자로 그대로 전달.
 */
export function collectFeedbackContext() {
    const screenPath = detectScreenPath();
    return {
        screenPath,
        moduleName:    guessModuleName(screenPath),
        viewport:      detectViewport(),
        userAgent:     detectUserAgent(),
        consoleErrors: snapshotErrors(),
    };
}
