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

        // 3) CTA — app.js가 ?login=true를 감지해 자동 Google 로그인 모달 발사
        const cta = document.getElementById('landing-cta');
        if (cta) {
            cta.addEventListener('click', function () {
                location.href = 'index.html?login=true';
            });
        }

        // 4) 페이드인 트리거 (CSS의 .is-ready 토글)
        //    requestAnimationFrame 두 번이면 초기 transform/opacity가 확실히 페인트된 뒤 토글
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                const stack = document.getElementById('landing-stack');
                if (stack) stack.classList.add('is-ready');
            });
        });
    });
})();
