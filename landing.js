/**
 * landing.js — 비로그인 첫 진입 랜딩 페이지
 *
 * 역할:
 *   1) 역방향 가드: 이미 Firebase 로그인 세션이 있으면 index.html로 즉시 이동
 *      (랜딩 북마크/직접 URL 입력 케이스 대응)
 *   2) Lucide 아이콘 초기화
 *   3) CTA → index.html?login=true (app.js가 자동 Google 로그인 트리거)
 *   4) 페이드인 트리거 (opacity/translateY)
 *
 * 다크모드는 head 인라인 스크립트에서 페인트 전 적용 (FOUC 방지) — 여기서는 다루지 않음.
 */

(function () {
    'use strict';

    // 1) 역방향 가드 — 이미 로그인된 사용자는 본 앱으로
    try {
        const hasAuthSession = Object.keys(localStorage)
            .some(k => k.startsWith('firebase:authUser:'));
        if (hasAuthSession) {
            location.replace('index.html');
            return;
        }
    } catch (_) { /* localStorage 차단 환경 → 그냥 랜딩 표시 */ }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    onReady(function () {
        // 2) Lucide 아이콘 초기화 (script defer로 로드되어 DOMContentLoaded 시점엔 준비됨)
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        // Phase E-9/M-1: 인앱 브라우저(카카오톡·인스타 등) 가드
        // CTA 클릭 시점에 가드 — 첫 화면은 안내 없이 깔끔히 보여주고, 로그인 시도할 때만 차단.
        var cta = document.getElementById('landing-cta');
        if (cta && window.SanctumInApp && window.SanctumInApp.detect()) {
            cta.addEventListener('click', function (e) {
                e.preventDefault();
                window.SanctumInApp.showGuideModal({
                    // 외부 브라우저에서 열 때 ?login=true까지 함께 보냄 → 자동 로그인 진행
                    targetUrl: location.origin + location.pathname.replace(/landing\.html$/, '') + 'index.html?login=true'
                });
            });
        }

        // 3) CTA는 anchor(href="./index.html?login=true")로 자체 동작.
        //    JS 핸들러로 location.href를 재할당하면 일부 환경에서 더블 navigation이 일어남.
        //    app.js가 ?login=true를 감지해 GIS 준비 직후 Google 로그인 모달을 발사한다.

        // 4) 페이드인 트리거 (CSS의 .is-ready 토글)
        //    requestAnimationFrame 두 번이면 초기 transform/opacity가 확실히 페인트된 뒤 토글
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                const stack = document.getElementById('landing-stack');
                if (stack) stack.classList.add('is-ready');
            });
        });

        // Phase E-9/M-1: service worker 등록 — PWA installable
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('./sw.js').catch(function (e) {
                    console.warn('SW register failed:', e);
                });
            });
        }
    });
})();
