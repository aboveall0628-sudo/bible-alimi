/**
 * inAppBrowser.js — 카카오톡·인스타·페북 같은 인앱 브라우저 감지 + 외부 브라우저로 보내기
 *
 * 왜:
 *   Google이 OAuth 정책상 embedded webview에서 로그인을 차단함.
 *   카카오톡·NAVER·Line·Instagram·FBAN 등 인앱 브라우저는 모두 webview 계열이라
 *   "Google 계정으로 시작하기"를 눌러도 조용히 실패함.
 *
 * 어떻게:
 *   - User-Agent 패턴으로 감지 (메이저 인앱 7~8개)
 *   - 안드로이드: intent:// 스킴으로 Chrome 강제 열기 시도
 *   - iOS: Safari 강제 불가 → URL 복사 안내
 *
 * 일반 <script> 로 로드해 window.SanctumInApp 전역 노출.
 * landing.js (일반 script) / ui/auth.js (ESM) 양쪽에서 모두 사용.
 */
(function () {
    'use strict';

    function detectInApp() {
        var ua = navigator.userAgent || '';
        // 메이저 인앱 webview 패턴 — 모두 Google OAuth가 거절하는 환경
        var patterns = [
            /KAKAOTALK/i, /KAKAO/i, /KAKAOSTORY/i,
            /NAVER\(/i,                 // 네이버 인앱은 "NAVER(inapp; ..." 형식
            /; wv\)/i,                  // 안드로이드 WebView 일반 표식
            /Line\//i,
            /Instagram/i, /FBAN/i, /FBAV/i, /FB_IAB/i,
            /Snapchat/i,
            /TwitterAndroid/i,          // 안드 X(트위터)
            /Whale\//i,                 // 네이버 웨일 인앱 일부
            /Daum/i
        ];
        return patterns.some(function (re) { return re.test(ua); });
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent || '');
    }

    function isIOS() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    }

    /**
     * 안드로이드에서 Chrome 강제 열기 — intent:// 스킴.
     * Chrome 미설치면 폴백으로 그냥 원본 URL 이동.
     */
    function openInChromeAndroid(targetUrl) {
        var stripped = targetUrl.replace(/^https?:\/\//, '');
        var intent =
            'intent://' + stripped +
            '#Intent;scheme=https;package=com.android.chrome;' +
            'S.browser_fallback_url=' + encodeURIComponent(targetUrl) + ';end';
        try {
            location.href = intent;
        } catch (e) {
            location.href = targetUrl;
        }
    }

    function copyTextFallback(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
        } catch (_) {}
        // 폴백 — textarea select
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        } catch (_) {
            return Promise.reject();
        }
    }

    /**
     * 모달을 만들어 body에 박는다. 한 번만.
     * @param {Object} opts
     *   - targetUrl: 외부 브라우저에서 열 URL (없으면 현재 location.href)
     *   - dismissible: 닫기 버튼 노출 여부 (기본 true)
     */
    function injectStylesOnce() {
        if (document.getElementById('sanctum-inapp-style')) return;
        var css =
            '.inapp-overlay{position:fixed;inset:0;z-index:99999;' +
                'background:rgba(0,0,0,.55);backdrop-filter:blur(4px);' +
                'display:flex;align-items:center;justify-content:center;padding:16px;' +
                'animation:sanctumInappFade .2s ease-out;}' +
            '@keyframes sanctumInappFade{from{opacity:0}to{opacity:1}}' +
            '.inapp-box{background:#fff;color:#1A1814;border-radius:14px;' +
                'padding:28px 22px 22px;max-width:420px;width:100%;' +
                'box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center;' +
                'font-family:Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;' +
                'max-height:90vh;overflow-y:auto;}' +
            '@media (prefers-color-scheme: dark){.inapp-box{background:#23201B;color:#F2EFE8;}}' +
            '.inapp-icon{font-size:36px;line-height:1;margin-bottom:10px;}' +
            '.inapp-title{margin:0 0 10px;font-size:17px;font-weight:700;line-height:1.4;}' +
            '.inapp-desc{margin:0 0 14px;font-size:14px;line-height:1.65;color:inherit;opacity:.85;}' +
            '.inapp-tip{margin:10px 0 0;font-size:12px;color:inherit;opacity:.65;line-height:1.55;}' +
            '.inapp-tip-list{margin:8px 0 14px;padding-left:20px;font-size:13px;text-align:left;line-height:1.7;}' +
            '.inapp-tip-list li{margin-bottom:4px;}' +
            '.inapp-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px;}' +
            '.inapp-primary-btn{padding:14px 18px;border:none;border-radius:10px;' +
                'background:#1A1814;color:#FAF7F2;font-size:15px;font-weight:600;cursor:pointer;' +
                'min-height:48px;}' +
            '@media (prefers-color-scheme: dark){.inapp-primary-btn{background:#F2EFE8;color:#1A1814;}}' +
            '.inapp-primary-btn:active{transform:translateY(1px);}' +
            '.inapp-text-btn{padding:10px;border:none;background:transparent;color:inherit;' +
                'opacity:.6;font-size:13px;cursor:pointer;min-height:40px;}' +
            '.inapp-text-btn:hover{opacity:.9;}' +
            '.inapp-url{margin:14px 0 0;padding:8px 10px;font-size:11px;' +
                'background:rgba(0,0,0,.05);border-radius:6px;word-break:break-all;' +
                'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.4;}' +
            '@media (prefers-color-scheme: dark){.inapp-url{background:rgba(255,255,255,.06);}}';
        var style = document.createElement('style');
        style.id = 'sanctum-inapp-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function showGuideModal(opts) {
        opts = opts || {};
        if (document.getElementById('sanctum-inapp-modal')) return;
        injectStylesOnce();
        var targetUrl = opts.targetUrl || location.href;
        var dismissible = opts.dismissible !== false;
        var android = isAndroid();
        var ios = isIOS();

        var overlay = document.createElement('div');
        overlay.id = 'sanctum-inapp-modal';
        overlay.className = 'inapp-overlay';

        var primaryBtnHtml = android
            ? '<button id="sanctum-inapp-chrome-btn" class="inapp-primary-btn" type="button">Chrome으로 열기</button>'
            : (ios
                ? '<button id="sanctum-inapp-copy-btn" class="inapp-primary-btn" type="button">주소 복사하기</button>'
                : '<button id="sanctum-inapp-copy-btn" class="inapp-primary-btn" type="button">주소 복사하기</button>'
            );

        var iosTip = ios
            ? '<ol class="inapp-tip-list">' +
                '<li>아래 [주소 복사하기]를 누르세요</li>' +
                '<li>화면 우측 하단의 […] → "Safari로 열기"를 누르거나, Safari를 열어 주소창에 붙여넣기</li>' +
              '</ol>'
            : '';

        var androidTip = android
            ? '<p class="inapp-tip">[Chrome으로 열기]가 작동하지 않으면, 우측 상단의 […] → "다른 브라우저로 열기"에서 Chrome을 선택해 주세요.</p>'
            : '';

        overlay.innerHTML =
            '<div class="inapp-box" role="dialog" aria-label="외부 브라우저로 열어주세요">' +
                '<div class="inapp-icon" aria-hidden="true">⚠️</div>' +
                '<h3 class="inapp-title">카카오톡 안에서는 Google 로그인이 막혀요</h3>' +
                '<p class="inapp-desc">Google이 보안 정책상 카카오톡·인스타 같은 인앱 브라우저에서 로그인을 차단해요. ' +
                    '<strong>Chrome</strong>(안드로이드) 또는 <strong>Safari</strong>(아이폰)에서 다시 열어주세요.</p>' +
                iosTip +
                androidTip +
                '<div class="inapp-actions">' +
                    primaryBtnHtml +
                    (dismissible ? '<button id="sanctum-inapp-dismiss-btn" class="inapp-text-btn" type="button">그래도 여기서 둘러볼게요</button>' : '') +
                '</div>' +
                '<p class="inapp-url" id="sanctum-inapp-url">' + escapeText(targetUrl) + '</p>' +
            '</div>';

        document.body.appendChild(overlay);

        // 안드: Chrome으로 열기
        var chromeBtn = document.getElementById('sanctum-inapp-chrome-btn');
        if (chromeBtn) {
            chromeBtn.addEventListener('click', function () {
                openInChromeAndroid(targetUrl);
            });
        }

        // iOS / 폴백: 복사
        var copyBtn = document.getElementById('sanctum-inapp-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                copyTextFallback(targetUrl).then(function () {
                    copyBtn.textContent = '✅ 주소를 복사했어요';
                    setTimeout(function () { copyBtn.textContent = '주소 복사하기'; }, 2500);
                }).catch(function () {
                    copyBtn.textContent = '복사 실패 — 직접 선택해 주세요';
                });
            });
        }

        var dismissBtn = document.getElementById('sanctum-inapp-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                overlay.remove();
            });
        }
    }

    function escapeText(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // 전역 노출
    window.SanctumInApp = {
        detect: detectInApp,
        isAndroid: isAndroid,
        isIOS: isIOS,
        openInChromeAndroid: openInChromeAndroid,
        showGuideModal: showGuideModal
    };
})();
