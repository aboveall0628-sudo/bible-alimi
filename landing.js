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

        // 2-b) 추천 코드(?ref=...) 처리
        //   - sessionStorage 에 저장해 로그인 후 본 앱에서 selfCard.referredBy 로 이어주기
        //   - 추천인 안내 줄 노출 (코드만 보여줌; 닉네임은 본 앱 진입 후 결합)
        try {
            var params = new URLSearchParams(location.search);
            var ref = params.get('ref');
            if (ref && /^[A-Za-z0-9_-]{2,32}$/.test(ref)) {
                sessionStorage.setItem('sanctum.referralCode', ref);
                var refEl = document.getElementById('landing-referral');
                var refText = document.getElementById('landing-referral-text');
                if (refEl && refText) {
                    refText.textContent = '추천 코드 ' + ref + ' 로 초대받으셨어요';
                    refEl.classList.remove('hidden');
                }
            }
        } catch (_) { /* sessionStorage 차단 환경 → 그냥 패스 */ }

        // Phase E-9/M-1 + (2026-05-16) 뒤로가기 자연 자리잡기:
        //   CTA 클릭 시 e.preventDefault + location.replace 사용 — 랜딩이 브라우저 history 에
        //   안 남도록. 로그인 후 사용자가 뒤로가기 누르면 랜딩으로 되돌아가지 않음.
        var cta = document.getElementById('landing-cta');
        if (cta) {
            cta.addEventListener('click', function (e) {
                e.preventDefault();
                // 인앱 브라우저 가드 우선
                if (window.SanctumInApp && window.SanctumInApp.detect()) {
                    window.SanctumInApp.showGuideModal({
                        targetUrl: location.origin + location.pathname.replace(/landing\.html$/, '') + 'index.html?login=true'
                    });
                    return;
                }
                // location.replace → history 에 자리잡지 않음.
                // 추천 코드가 있으면 쿼리스트링에도 같이 넘겨줘서 본 앱 부팅 시 양쪽 다 인식.
                var loginUrl = './index.html?login=true';
                try {
                    var savedRef = sessionStorage.getItem('sanctum.referralCode');
                    if (savedRef) loginUrl += '&ref=' + encodeURIComponent(savedRef);
                } catch (_) {}
                location.replace(loginUrl);
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
