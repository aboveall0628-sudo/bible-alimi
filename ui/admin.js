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

export function renderAdminView(container) {
    if (!container) return;
    container.innerHTML = `
        <header class="page-header">
            <h1>🛠 운영자</h1>
        </header>

        <section class="card-section admin-card">
            <h3 class="section-title"><i class="section-icon" data-lucide="layers"></i> 모드 전환</h3>
            <p class="section-desc">슬림(베타 6 화면)과 메인(전체 모듈) 사이를 자유롭게 오갈 수 있어요. 사용자에게 어떤 모드로 보일지 직접 확인하실 수 있어요.</p>
            <div id="admin-tier-row" class="settings-tier-row"></div>
        </section>

        <section class="card-section admin-card">
            <h3 class="section-title"><i class="section-icon" data-lucide="inbox"></i> 피드백 관리</h3>
            <p class="section-desc">사용자가 우하단 풍선으로 보내준 피드백·사전 설문·사후 설문을 한 자리에서 관리해요.</p>
            <button type="button" id="admin-open-feedback-btn" class="primary-btn">
                <i data-lucide="arrow-right" class="btn-icon"></i> 피드백 관리 열기
            </button>
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
                <button type="button" id="admin-flow-setup-samples" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🎯</span>
                    <span class="admin-flow-label">샘플 목표 선택</span>
                </button>
                <button type="button" id="admin-flow-onboarding" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🦢</span>
                    <span class="admin-flow-label">온보딩 11 step</span>
                </button>
                <button type="button" id="admin-flow-landing" class="admin-flow-btn">
                    <span class="admin-flow-emoji">🌐</span>
                    <span class="admin-flow-label">랜딩페이지 (준비 중)</span>
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

    // (2026-05-19 후속) 신규 사용자 흐름 시연 6 버튼
    bindFlowDemo(container);

    // lucide 아이콘 재렌더 — switchView 직후 createIcons 호출 자리 정합
    try { if (window.lucide) window.lucide.createIcons(); } catch (_) {}
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

    onClick('admin-flow-setup-samples', async () => {
        showDemoToast('🎯 샘플 목표 선택 화면 시연');
        const { showSetupScreen } = await import('./auth.js');
        showSetupScreen('demo-user-id');
        setTimeout(() => {
            document.getElementById('setup-step-1')?.classList.add('hidden');
            document.getElementById('setup-step-2')?.classList.add('hidden');
            document.getElementById('setup-step-3')?.classList.remove('hidden');
        }, 100);
        bindEscClose('setup-screen-overlay');
    });

    onClick('admin-flow-onboarding', async () => {
        showDemoToast('🦢 온보딩 11 step 시연 — 실제 selfCard 자리잡히지 않게 [건너뛰기]·X 로 자연 닫기');
        try {
            const { showOnboardingModal } = await import('./onboarding.js');
            // 현재 사용자 dek 자리 사용 — 닫으면 자연 종료
            const { getDEK } = await import('./lockScreen.js');
            const { isSwanAdmin } = await import('../config/adminConfig.js');
            // 현재 운영자 userId 자리잡혀 있으면 자연 진행. 없으면 demo
            const userId = window.currentUserId || 'demo-user-id';
            await showOnboardingModal({ userId, dek: getDEK(), onComplete: () => {} });
        } catch (e) {
            console.warn('[admin] onboarding demo failed:', e);
            alert('온보딩 시연 실패: ' + (e?.message || e));
        }
    });

    onClick('admin-flow-landing', () => {
        showDemoToast('🌐 랜딩페이지 자리 — 아직 자리잡혀 있지 않아요. 베타 시작 전 신규 트랙 (project_beta_v1_track.md)');
    });
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
