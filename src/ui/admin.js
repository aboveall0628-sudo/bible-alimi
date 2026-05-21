/**
 * admin.js — 운영자 페이지 (Swan 관리자 단독 진입점)
 *
 * (2026-05-18 후속) 사용자 명시:
 *   "사이드 메뉴로 운영자 하나 추가, 거기 들어가면 바로 피드백 관리, 슬림/메인 변환 모드 보이게"
 *
 * 구조:
 *   - 카드 1: 🌱 슬림 ↔ 메인 모드 토글 (즉시 적용)
 *   - 카드 2: 📋 피드백 관리 — 클릭 시 view-feedback-admin 진입
 *
 * isSwanAdmin 일 때만 nav-admin 노출됨. 본 함수는 sanity check 없이 동작.
 */

import { getTier, setTier, TIERS } from '../config/featureFlags.js';
// (2026-05-20 Phase 1) 피드백 도착 알림 — Swan 관리자 전용
import {
    requestSwanAdminPushPermission,
    getPushPermissionState,
    isPushRegistered,
} from './fcmRegister.js';

// iOS 사파리 PWA 자리 감지 — 16.4+ + standalone 모드 필수
function _detectiOSStandalone() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isStandalone =
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        // @ts-ignore — iOS 사파리만 자리잡은 비표준 자리
        window.navigator.standalone === true;
    return { isIOS, isStandalone };
}

export function renderAdminView(container) {
    if (!container) return;
    // (2026-05-20 v93) 사용자 명시 — 피드백 관리 카드 최상단 + 사전/사후/전체 가입 3 버튼 시연 카드로 옮김.
    //   미확인 뱃지 자리 3 자리(사이드바 [설정]·운영자 nav·피드백 관리 열기) 자연 자리잡혀요.
    container.innerHTML = `
        <header class="page-header">
            <h1>🛠 운영자</h1>
        </header>

        <section class="card-section admin-card">
            <h3 class="section-title"><i class="section-icon" data-lucide="inbox"></i> 피드백 관리</h3>
            <p class="section-desc">사용자 풍선·SWAN 사전·사후 설문 결과를 한 자리에서 봐요.</p>
            <div class="admin-flow-grid">
                <button type="button" id="admin-open-feedback-btn" class="admin-flow-btn admin-flow-btn-with-badge">
                    <span class="admin-flow-emoji">📥</span>
                    <span class="admin-flow-label">피드백 관리 열기</span>
                    <span class="feedback-unread-badge admin-flow-badge hidden" aria-label="미확인 피드백"></span>
                </button>
            </div>
        </section>

        <section class="card-section admin-card" id="admin-push-card">
            <h3 class="section-title"><i class="section-icon" data-lucide="bell"></i> 피드백 도착 알림</h3>
            <p class="section-desc">사용자가 피드백·사전·사후 설문 마치면 이메일(aboveall0628@gmail.com)과 푸시 알림으로 바로 알려드려요.</p>
            <div id="admin-push-status" class="admin-push-status"></div>
            <div class="admin-flow-grid">
                <button type="button" id="admin-push-enable-btn" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🔔</span>
                    <span class="admin-flow-label">이 기기에 알림 켜기</span>
                </button>
                <button type="button" id="admin-push-test-btn" class="admin-flow-btn">
                    <span class="admin-flow-emoji">📨</span>
                    <span class="admin-flow-label">테스트 알림 발송</span>
                </button>
            </div>
            <div id="admin-push-ios-hint" class="admin-push-ios-hint" hidden></div>
        </section>

        <section class="card-section admin-card">
            <h3 class="section-title"><i class="section-icon" data-lucide="layers"></i> 모드 전환</h3>
            <p class="section-desc">슬림(베타 6 화면)과 메인(전체 모듈) 사이를 자유롭게 오갈 수 있어요. 사용자에게 어떤 모드로 보일지 직접 확인하실 수 있어요.</p>
            <div id="admin-tier-row" class="settings-tier-row"></div>
        </section>

        <section class="card-section admin-card">
            <h3 class="section-title"><i class="section-icon" data-lucide="play-circle"></i> 신규 사용자 흐름 시연</h3>
            <p class="section-desc">베타 사용자가 처음 진입할 때 보는 화면을 직접 띄워볼 수 있어요. 실제 데이터는 자리잡히지 않아요.</p>
            <div class="admin-flow-grid">
                <button type="button" id="admin-flow-google-login" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🔐</span>
                    <span class="admin-flow-label">Google 로그인 화면</span>
                </button>
                <button type="button" id="admin-flow-setup-pwd" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🗝</span>
                    <span class="admin-flow-label">비밀번호 만들기</span>
                </button>
                <button type="button" id="admin-flow-setup-recovery" class="admin-flow-btn">
                    <span class="admin-flow-emoji">📄</span>
                    <span class="admin-flow-label">24단어 복구 코드</span>
                </button>
                <button type="button" id="admin-flow-onboarding" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🦢</span>
                    <span class="admin-flow-label">온보딩 13 step</span>
                </button>
                <button type="button" id="admin-start-presurvey-btn" class="admin-flow-btn">
                    <span class="admin-flow-emoji">📋</span>
                    <span class="admin-flow-label">사전 설문 단독 테스트</span>
                </button>
                <button type="button" id="admin-start-postsurvey-btn" class="admin-flow-btn">
                    <span class="admin-flow-emoji">📝</span>
                    <span class="admin-flow-label">사후 설문 단독 테스트</span>
                </button>
                <button type="button" id="admin-start-fullsignup-btn" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🚀</span>
                    <span class="admin-flow-label">전체 가입 흐름 (랜딩→동의→온보딩→설문)</span>
                </button>
            </div>
        </section>
    `;

    // 모드 전환 — settings 의 bindTierSettings 와 같은 패턴
    const row = container.querySelector('#admin-tier-row');
    if (row) {
        const current = getTier();
        row.innerHTML = Object.entries(TIERS).map(([id, cfg]) => `
            <button type="button"
                    class="settings-tier-chip"
                    role="radio"
                    aria-checked="${current === id ? 'true' : 'false'}"
                    data-tier="${id}">
                <span class="settings-tier-chip-label">${escapeText(cfg.label)}</span>
                <span class="settings-tier-chip-desc">${escapeText(cfg.desc)}</span>
            </button>
        `).join('');
        row.querySelectorAll('.settings-tier-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.tier;
                if (!TIERS[id]) return;
                setTier(id);
                row.querySelectorAll('.settings-tier-chip').forEach(b => {
                    b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
                });
            });
        });
    }

    // 피드백 관리 진입
    const openBtn = container.querySelector('#admin-open-feedback-btn');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            try {
                if (typeof window.__sanctumSwitchView === 'function') {
                    window.__sanctumSwitchView('feedback-admin');
                }
            } catch (e) { console.warn('[admin] open feedback-admin failed:', e); }
        });
    }

    // (2026-05-19 후속) 사전·사후 설문 단독 테스트 + 전체 가입 흐름 — settings 자리에서 통합
    container.querySelector('#admin-start-presurvey-btn')?.addEventListener('click', () => {
        if (typeof window.__sanctumOpenPreSurveyForm === 'function') {
            window.__sanctumOpenPreSurveyForm();
        }
    });
    container.querySelector('#admin-start-postsurvey-btn')?.addEventListener('click', () => {
        if (typeof window.__sanctumOpenPostSurveyForm === 'function') {
            window.__sanctumOpenPostSurveyForm();
        }
    });
    // (2026-05-20 v104) 전체 가입 흐름 = 랜딩페이지부터 시작.
    //   사용자 명시 "전체 가입흐름 저거는 랜딩페이지에서 시작하는걸로".
    //   새 탭에서 landing.html 자리잡혀 사용자가 [Google로 시작하기] 자리잡혀 실제 흐름.
    //   시뮬 결로 자기 자리 확인하고 싶으면 ?demo=1 쿼리 자리잡혀 자리 자리.
    container.querySelector('#admin-start-fullsignup-btn')?.addEventListener('click', async () => {
        const { showToast } = await import('./quickReview.js');
        showToast('🌐 랜딩페이지부터 한 바퀴 — 새 탭에서 열어요');
        try {
            window.open('landing.html?demo=1', '_blank');
        } catch (e) {
            console.warn('[admin] landing open failed:', e);
            // 폴백 — 같은 탭
            location.href = 'landing.html?demo=1';
        }
    });

    // (2026-05-19 후속) 신규 사용자 흐름 시연 6 버튼
    bindFlowDemo(container);

    // (2026-05-20 Phase 1) 피드백 도착 알림 카드 자리잡기
    bindPushNotificationCard(container);

    // lucide 아이콘 재렌더 — switchView 직후 createIcons 호출 자리 정합
    try { if (window.lucide) window.lucide.createIcons(); } catch (_) {}
}

// (2026-05-20 Phase 1) 피드백 도착 알림 카드 자리
function bindPushNotificationCard(container) {
    const statusEl = container.querySelector('#admin-push-status');
    const enableBtn = container.querySelector('#admin-push-enable-btn');
    const testBtn = container.querySelector('#admin-push-test-btn');
    const iosHint = container.querySelector('#admin-push-ios-hint');
    if (!statusEl || !enableBtn || !testBtn) return;

    const { isIOS, isStandalone } = _detectiOSStandalone();

    function refreshStatus() {
        const perm = getPushPermissionState();
        const reg = isPushRegistered();
        let html = '';
        if (perm === 'unsupported') {
            html = `<span class="push-badge push-badge-warn">⚠️ 이 브라우저는 알림 자리잡혀 있지 않아요</span>`;
            enableBtn.disabled = true;
            testBtn.disabled = true;
        } else if (perm === 'denied') {
            html = `<span class="push-badge push-badge-warn">🚫 알림 거부 상태 — 브라우저 설정에서 다시 허용해 주세요</span>`;
            enableBtn.disabled = true;
            testBtn.disabled = true;
        } else if (perm === 'granted' && reg) {
            html = `<span class="push-badge push-badge-ok">✅ 이 기기 알림 자리잡혔어요</span>`;
            enableBtn.textContent = '';
            const reEmoji = document.createElement('span');
            reEmoji.className = 'admin-flow-emoji';
            reEmoji.textContent = '🔄';
            const reLabel = document.createElement('span');
            reLabel.className = 'admin-flow-label';
            reLabel.textContent = '토큰 다시 등록';
            enableBtn.appendChild(reEmoji);
            enableBtn.appendChild(reLabel);
        } else if (perm === 'granted') {
            html = `<span class="push-badge push-badge-warn">⚠️ 권한은 허용됐는데 토큰 자리잡지 못함 — 다시 시도해 주세요</span>`;
        } else {
            html = `<span class="push-badge push-badge-info">⏳ 알림 권한 자리잡지 않음 — 아래 [켜기] 클릭해 주세요</span>`;
        }
        statusEl.innerHTML = html;

        // iOS 안내
        if (isIOS && !isStandalone) {
            iosHint.hidden = false;
            iosHint.innerHTML = `
                <div class="ios-hint-inner">
                    <div class="ios-hint-title">📱 iPhone 자리잡는 결</div>
                    <ol class="ios-hint-steps">
                        <li><b>iOS 16.4 이상</b>이어야 알림 자리잡혀요 (설정 → 일반 → 정보 → iOS 버전 확인)</li>
                        <li>Safari 우측 아래 <b>공유 버튼</b> 클릭 → <b>"홈 화면에 추가"</b></li>
                        <li>홈 화면에 자리잡힌 <b>Sanctum</b> 아이콘으로 다시 들어와요 (Safari 안 아니라 홈 화면 아이콘)</li>
                        <li>설정 → 운영자 → [알림 켜기] 클릭 → 권한 허용</li>
                    </ol>
                </div>
            `;
        } else if (isIOS && isStandalone) {
            iosHint.hidden = false;
            iosHint.innerHTML = `<div class="ios-hint-inner ios-hint-ok">✓ iPhone 홈 화면 자리 OK. 아래 [켜기] 클릭하면 자리잡혀요.</div>`;
        } else {
            iosHint.hidden = true;
        }
    }

    enableBtn.addEventListener('click', async () => {
        enableBtn.disabled = true;
        try {
            const userId = window.currentUserId;
            const result = await requestSwanAdminPushPermission(userId);
            const { showToast } = await import('./quickReview.js');
            const TOAST_BY_RESULT = {
                granted: '✅ 알림 자리잡혔어요. 피드백 도착하면 바로 알려드려요.',
                denied: '🚫 알림 거부 자리. 브라우저 설정에서 다시 허용해 주세요.',
                default: '⏳ 권한 자리잡지 않음. 다시 클릭해 주세요.',
                not_admin: '⚠️ 관리자 권한 자리 확인이 안 돼요.',
                unsupported: '⚠️ 이 브라우저는 알림 자리잡혀 있지 않아요.',
                no_sw: '⚠️ Service Worker 자리잡지 못했어요.',
                sw_failed: '⚠️ Service Worker 등록 실패.',
                token_failed: '⚠️ 토큰 자리잡기 실패. 다시 시도해 주세요.',
                no_token: '⚠️ 토큰 자리 못 받음.',
                save_failed: '⚠️ Firestore 저장 자리 실패.',
            };
            showToast(TOAST_BY_RESULT[result] || `결과: ${result}`);
        } catch (e) {
            console.error('[admin] push enable failed:', e);
            const { showToast } = await import('./quickReview.js');
            showToast('⚠️ 알림 자리잡기 실패: ' + (e?.message || e));
        } finally {
            enableBtn.disabled = false;
            refreshStatus();
        }
    });

    testBtn.addEventListener('click', async () => {
        const { showToast } = await import('./quickReview.js');
        const userId = window.currentUserId;
        if (!userId || userId === 'anonymous') {
            showToast('로그인 자리 확인이 안 돼요');
            return;
        }
        testBtn.disabled = true;
        showToast('📨 테스트 피드백 자리잡는 중...');
        try {
            const { startFeedback, finalizeFeedback } = await import('../data/feedbacksRepo.js');
            const fid = await startFeedback({
                userId,
                nickname: 'Swan(테스트)',
                context: {
                    screenPath: '/settings/admin',
                    moduleName: 'admin',
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    userAgent: (navigator.userAgent || '').slice(0, 120),
                },
                openingTurn: {
                    role: 'swan',
                    text: '(테스트 발송)',
                    at: new Date().toISOString(),
                },
                kind: 'feedback',
            });
            await finalizeFeedback(userId, fid, {
                endReason: 'manual_send',
                summary: '🧪 알림 자리 작동 확인용 테스트 피드백이에요. 이메일·푸시 둘 다 도착하면 자리잡힌 결.',
                category: 'other',
                categoryConfidence: 1,
            });
            showToast('✅ 테스트 피드백 발송 완료. 1~2분 안에 이메일·푸시 도착하면 자리잡힌 결.');
        } catch (e) {
            console.error('[admin] test push failed:', e);
            showToast('⚠️ 테스트 발송 실패: ' + (e?.message || e));
        } finally {
            testBtn.disabled = false;
            refreshStatus();
        }
    });

    refreshStatus();
}

// 신규 사용자 흐름 시연 — 각 화면 자리 자연 자리잡고 사용자가 직접 X 로 닫음.
//   실제 vault·계정 자리잡히지 않게 *시연 안내 토스트* 자리.
function bindFlowDemo(container) {
    const onClick = (id, fn) => {
        const btn = container.querySelector('#' + id);
        if (btn) btn.addEventListener('click', fn);
    };

    onClick('admin-flow-google-login', async () => {
        showDemoToast('🔐 Google 로그인 화면 — 실제 로그인 자리잡힘 X. ESC 또는 다시 클릭으로 닫기');
        const { showGoogleLoginScreen } = await import('./auth.js');
        showGoogleLoginScreen();
        bindEscClose('google-login-overlay');
    });

    onClick('admin-flow-setup-pwd', async () => {
        showDemoToast('🗝 비밀번호 만들기 화면 시연 — 실제 vault 자리잡힘 X. 입력해도 다음 자리 자연 진행 시연');
        const { showSetupScreen } = await import('./auth.js');
        showSetupScreen('demo-user-id');
        bindEscClose('setup-screen-overlay');
    });

    onClick('admin-flow-setup-recovery', async () => {
        showDemoToast('📄 24단어 복구 코드 화면 — 시연용 가짜 단어 자리잡힘');
        const { showSetupScreen } = await import('./auth.js');
        showSetupScreen('demo-user-id');
        // step 1 → step 2 자리 자동 이동
        setTimeout(() => {
            document.getElementById('setup-step-1')?.classList.add('hidden');
            document.getElementById('setup-step-2')?.classList.remove('hidden');
            // 가짜 24단어 자리잡기
            const box = document.getElementById('recovery-words-box');
            if (box) {
                const fake = ['참새','부활','양떼','골로','어린','베들','믿음','목자','노래','창조','여호','시온','기둥','에베','목자','마가','요단','에베','까마','요셉','달빛','영광','보좌','요셉'];
                box.innerHTML = fake.map((w,i) => `<div class="word-chip"><span class="w-num">${i+1}.</span> ${w}</div>`).join('');
            }
        }, 100);
        bindEscClose('setup-screen-overlay');
    });

    // (2026-05-19 후속) admin-flow-setup-samples 자리 제거 — 샘플 목표 흐름 자체 자리잡힘 X

    onClick('admin-flow-onboarding', async () => {
        showDemoToast('🦢 온보딩 13 step 시연 — 실제 selfCard 자리잡히지 않게 [건너뛰기]·X 로 자연 닫기');
        try {
            const { showOnboardingModal } = await import('./onboarding.js');
            // 현재 사용자 dek 자리 사용 — 닫으면 자연 종료
            const { getDEK } = await import('./lockScreen.js');
            const { isSwanAdmin } = await import('../config/adminConfig.js');
            // 현재 운영자 userId 자리잡혀 있으면 자연 진행. 없으면 demo
            const userId = window.currentUserId || 'demo-user-id';
            // (v121) 운영자 시연 자리만 X 닫기 버튼 자리잡힘 — 리얼 진입엔 X 안 보임.
            await showOnboardingModal({ userId, dek: getDEK(), onComplete: () => {}, demoMode: true });
        } catch (e) {
            console.warn('[admin] onboarding demo failed:', e);
            alert('온보딩 시연 실패: ' + (e?.message || e));
        }
    });

    // (2026-05-20 v104) admin-flow-landing 자리 자체 자리잡지 X — 사용자 명시 "랜딩페이지 (준비 중) 이거는 지워줘".
    //   전체 가입 흐름 자리에서 자연 랜딩 자리 자리잡혀 자리.
}

function showDemoToast(msg) {
    import('./quickReview.js').then(({ showToast }) => showToast(msg)).catch(() => {});
}

function bindEscClose(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    const close = () => {
        overlay.classList.remove('is-visible');
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        document.removeEventListener('keydown', onEsc);
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    // 시연용 [닫기] 버튼 자리잡기 (오른쪽 상단)
    if (!overlay.querySelector('.admin-demo-close')) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'admin-demo-close';
        closeBtn.textContent = '✕ 시연 닫기';
        closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer;font-size:13px;z-index:10;';
        closeBtn.addEventListener('click', close);
        overlay.appendChild(closeBtn);
    }
}

function escapeText(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
