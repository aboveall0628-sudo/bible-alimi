/**
 * missionGate.js — 사이드바 잠금 가드 + 진행도 도트 블록 + 미션 안내 모달
 *
 * (본인 프로필 재기획 트랙 2026-05-14 S-C)
 *
 * 합의:
 *  - 잠긴 사이드바 모듈 = 글자 회색 톤 (자물쇠 아이콘 X). 클릭은 가능.
 *  - 클릭하면 미션 안내 모달 — 아이콘 + 제목 + 힌트 + 버튼 2개 ("나중에" / "지금 시작")
 *  - "지금 시작" 누르면 그 모듈의 view 로 그대로 이동 (1차 액션 자리 자동 open 은 후속)
 *  - 진행도 도트 블록 — view-today 머리말 (오늘의 시작 영역 안 맨 위)
 *  - 도트 점 채워짐 ●●●●○○ — 6 미션 (경제 deferred 제외)
 *  - hover/tap 시 미션 title tooltip
 *
 * 단일 출처:
 *  - config/missionCatalog.js (미션 메타)
 *  - data/personRepo.js (isModuleLocked, getOpenMissions, markMissionComplete, getSelfCard)
 *
 * 갱신 흐름:
 *  - 사용자 진입·뷰 전환·미션 클리어 후 refreshMissionGateUI() 호출
 *  - missionStatus 변경 자동 detect 는 후속 (Firestore subscribe). 1차는 명시 갱신.
 */

import { MISSION_CATALOG, getActiveMissionIds, getRecommendedMissions } from '../config/missionCatalog.js';
import { isModuleLocked, getOpenMissions, getSelfCard } from '../data/personRepo.js';

// nav 버튼 id ↔ moduleId 매핑.
//   - 'today', 'self-profile', 'settings', 'economy', 'meditation' 같은 항상 unlocked 모듈은 X
//   - 'dashboard', 'past', 'principles' 는 잠금 가드 없음 (관제탑·지난 묵상·원칙 목록은 빈 페이지 OK)
//   1차 잠금 가드 대상: persons, organizations, reports.
const NAV_LOCK_TARGETS = {
    'nav-persons': 'persons',
    'nav-organizations': 'organizations',
    'nav-reports': 'reports',
};

// 추천 카드 클릭 시 이동할 view 키 — missionId → switchView 키.
//   (S-E 2026-05-15) 미션별로 진입 자리가 다름. moduleId 단순 매핑으로 부족.
//   예: past_meditation_revisit 은 moduleId=meditation 이지만 "지난 묵상" view 로 가야 함.
const ROUTE_BY_MISSION = {
    person_first_dot: 'persons',
    org_first_dot: 'organizations',
    economy_first_transaction: 'economy',
    goal_first_save: 'today',
    decision_first_record: 'today',
    report_first_weekly: 'reports',
    meditation_first_save: 'today',
    past_meditation_revisit: 'past',
    notification_setup: 'settings',
    settings_explore: 'settings',
};

/**
 * 사이드바 잠금 가드 attach — 잠긴 모듈 회색 톤 + 클릭 시 모달.
 *
 *   ui/app.js setupNavigation 의 nav.click 핸들러보다 먼저 호출되어야 함.
 *   기존 핸들러는 그대로 두고, 이 함수가 capture 단계에서 가로채 잠긴 경우 stopPropagation.
 *
 * @param {Function} getCtx - () => ({ dek, userId }) 반환. dek/userId 변동 가능 (잠금 해제·로그인 흐름).
 */
export function attachSidebarLockGuard(getCtx) {
    Object.entries(NAV_LOCK_TARGETS).forEach(([btnId, moduleId]) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', async (e) => {
            const ctx = getCtx();
            if (!ctx?.dek || !ctx?.userId) return; // 잠금 해제 전이면 가드 X
            try {
                const locked = await isModuleLocked(ctx.dek, ctx.userId, moduleId);
                if (locked) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    openMissionGateModal(moduleId, ctx);
                }
            } catch (err) {
                console.warn('[missionGate] lock check failed:', err?.message || err);
            }
        }, { capture: true });
    });
}

/**
 * 사이드바 회색 톤 적용 — missionStatus 따라 잠긴 모듈에 `.nav-locked` 클래스.
 *   사용자 진입 / 뷰 전환 / 미션 클리어 후 호출.
 */
export async function refreshSidebarLockStyles(dek, userId) {
    if (!dek || !userId) return;
    for (const [btnId, moduleId] of Object.entries(NAV_LOCK_TARGETS)) {
        const btn = document.getElementById(btnId);
        if (!btn) continue;
        try {
            const locked = await isModuleLocked(dek, userId, moduleId);
            btn.classList.toggle('nav-locked', !!locked);
        } catch (e) {
            // 실패해도 사이드바 자체 동작 끊지 않음
        }
    }
}

/**
 * 미션 안내 모달 — 잠긴 모듈 클릭 시 띄움.
 *   "나중에" → 모달 닫기. "지금 시작" → 해당 모듈 view 로 이동 (switchView 호출).
 *
 * @param {string} moduleId  - 'persons' | 'organizations' | 'reports' 등
 * @param {Object} ctx       - { dek, userId } — 1차엔 사용 X. 후속 카탈로그 외 데이터 노출 시 활용.
 */
export function openMissionGateModal(moduleId, ctx) {
    const entry = Object.entries(MISSION_CATALOG).find(([_, m]) => m.moduleId === moduleId);
    if (!entry) return;
    const [missionId, mission] = entry;

    closeMissionGateModal(); // 기존 모달 있으면 제거

    const backdrop = document.createElement('div');
    backdrop.className = 'mission-gate-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'mission-gate-title');

    backdrop.innerHTML = `
      <div class="mission-gate-modal">
        <div class="mission-gate-icon">${escapeHtml(mission.icon)}</div>
        <h2 class="mission-gate-title" id="mission-gate-title">${escapeHtml(mission.title)}</h2>
        <p class="mission-gate-hint">${escapeHtml(mission.hint)}</p>
        <p class="mission-gate-foot">${escapeHtml(mission.unlockCopy)}</p>
        <div class="mission-gate-actions">
          <button type="button" class="mission-gate-btn mission-gate-btn-secondary" data-action="later">나중에</button>
          <button type="button" class="mission-gate-btn mission-gate-btn-primary" data-action="start">지금 시작</button>
        </div>
        <div class="mission-gate-recommend" id="mission-gate-recommend"></div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeMissionGateModal();
    });
    backdrop.querySelector('[data-action="later"]').addEventListener('click', closeMissionGateModal);
    backdrop.querySelector('[data-action="start"]').addEventListener('click', () => {
        closeMissionGateModal();
        // 모듈 view 로 이동 — switchView 는 ui/app.js 가 window 에 노출
        if (typeof window.__sanctumSwitchView === 'function') {
            window.__sanctumSwitchView(moduleId);
        }
    });

    document.body.appendChild(backdrop);
    // ESC 닫기
    backdrop._escHandler = (e) => { if (e.key === 'Escape') closeMissionGateModal(); };
    document.addEventListener('keydown', backdrop._escHandler);

    // 모달 안 "다른 추천 미션" 2개 — 현재 누른 미션 제외, 난이도 오름차순.
    if (ctx?.dek && ctx?.userId) {
        renderRecommendInModal(missionId, ctx.dek, ctx.userId).catch(() => {});
    }
}

/**
 * 모달 안 "다른 추천 미션" 카드 — 현재 누른 missionId 빼고 2개.
 */
async function renderRecommendInModal(currentMissionId, dek, userId) {
    const slot = document.getElementById('mission-gate-recommend');
    if (!slot) return;
    let completedIds;
    try {
        completedIds = await getCompletedMissionIds(dek, userId);
    } catch (_) { return; }
    const completedPlusCurrent = [...completedIds, currentMissionId];
    const recs = getRecommendedMissions(completedPlusCurrent, 2);
    if (!recs.length) {
        slot.innerHTML = '';
        return;
    }
    slot.innerHTML = `
      <div class="mission-gate-rec-head">다른 추천 미션</div>
      <div class="mission-gate-rec-cards">
        ${recs.map(r => `
          <button type="button" class="mission-rc-card mission-rc-card-sm" data-mission-id="${escapeHtml(r.missionId)}">
            <span class="mission-rc-icon">${escapeHtml(r.mission.icon)}</span>
            <span class="mission-rc-title">${escapeHtml(r.mission.title)}</span>
          </button>
        `).join('')}
      </div>
    `;
    slot.querySelectorAll('[data-mission-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mid = btn.getAttribute('data-mission-id');
            closeMissionGateModal();
            routeToMission(mid);
        });
    });
}

export function closeMissionGateModal() {
    const existing = document.querySelector('.mission-gate-backdrop');
    if (!existing) return;
    if (existing._escHandler) document.removeEventListener('keydown', existing._escHandler);
    existing.remove();
}

// ─── 진행도 도트 블록 ───────────────────────────────────────────────

/**
 * view-today 머리말의 미션 진행도 도트 블록 렌더.
 *   active 미션 (deferred 제외) 6개 도트로 그림. ●(완료) ○(미완료).
 *   hover/tap 시 미션 title tooltip.
 *
 *   모든 미션 클리어 시 블록 자동 hidden (졸업식 자리는 Q7 후속).
 *
 * @param {string} containerId - mount 자리 id
 */
export async function renderMissionProgressBlock(containerId, dek, userId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!dek || !userId) {
        container.innerHTML = '';
        return;
    }

    let openMissions;
    try {
        openMissions = await getOpenMissions(dek, userId);
    } catch (e) {
        console.warn('[missionGate] getOpenMissions failed:', e?.message || e);
        container.innerHTML = '';
        return;
    }

    // missionStatus key 는 moduleId. catalog 의 missionId 와 join.
    const statusByModule = {};
    openMissions.forEach(m => { statusByModule[m.moduleId] = !!m.completed; });

    const activeIds = getActiveMissionIds(); // deferred 제외
    const completedCount = activeIds.filter(mid => {
        const moduleId = MISSION_CATALOG[mid]?.moduleId;
        return moduleId && statusByModule[moduleId];
    }).length;

    // 모든 미션 클리어 시 블록 숨김 (졸업식 자리는 별도)
    if (completedCount >= activeIds.length) {
        container.innerHTML = '';
        return;
    }

    const dotsHtml = activeIds.map(mid => {
        const m = MISSION_CATALOG[mid];
        const done = !!statusByModule[m.moduleId];
        const cls = done ? 'mission-dot mission-dot-done' : 'mission-dot';
        const tip = `${m.icon} ${m.title}${done ? ' — 완료' : ` — ${m.hint}`}`;
        return `<span class="${cls}" title="${escapeHtml(tip)}" data-mission-id="${mid}" aria-label="${escapeHtml(tip)}"></span>`;
    }).join('');

    container.innerHTML = `
      <div class="mission-progress-block" aria-label="튜토리얼 미션 진행도">
        <span class="mission-progress-label">오늘의 미션 ${completedCount}/${activeIds.length}</span>
        <span class="mission-progress-dots">${dotsHtml}</span>
      </div>
    `;
}

/**
 * 사이드바 + 진행도 + 추천 카드 + 사이드바 풋터 한 번에 갱신.
 *   미션 클리어 후 / 뷰 전환 시.
 */
export async function refreshMissionGateUI(dek, userId, progressContainerId, recommendContainerId, sidebarFooterId) {
    await Promise.all([
        refreshSidebarLockStyles(dek, userId),
        progressContainerId
            ? renderMissionProgressBlock(progressContainerId, dek, userId)
            : Promise.resolve(),
        recommendContainerId
            ? renderMissionRecommendCards(recommendContainerId, dek, userId)
            : Promise.resolve(),
        sidebarFooterId
            ? renderSidebarMissionFooter(sidebarFooterId, dek, userId)
            : Promise.resolve(),
    ]);
}

/**
 * 미션 클리어 즉시 UI 갱신 — personRepo.markMissionComplete 가 발화하는
 *   `sanctum:mission-unlocked` 이벤트를 listen 해서 사이드바 회색 톤·진행도·추천·풋터 즉시 갱신.
 *   동시에 조용한 토스트 한 번 노출 ("○○ 미션 완료").
 *
 *   app.js init 시 1회만 호출. getCtx 클로저로 dek/userId 최신값 추적.
 */
export function bindMissionUnlockListener(getCtx, progressContainerId, recommendContainerId, sidebarFooterId) {
    if (typeof window === 'undefined') return;
    if (window.__sanctumMissionUnlockBound) return;
    window.__sanctumMissionUnlockBound = true;
    window.addEventListener('sanctum:mission-unlocked', (e) => {
        // 미션 카탈로그에서 title 가져와 토스트 발화 — repo 레이어 의존 X.
        const missionId = e?.detail?.missionId;
        if (missionId && MISSION_CATALOG[missionId]) {
            showMissionToast(`${MISSION_CATALOG[missionId].title} 미션 완료`);
        }

        const ctx = getCtx();
        if (!ctx?.dek || !ctx?.userId) return;
        // 각 mount 자리가 현재 DOM 에 있을 때만 갱신.
        const hasProgress = !!document.getElementById(progressContainerId);
        const hasRecommend = !!document.getElementById(recommendContainerId);
        const hasFooter = !!document.getElementById(sidebarFooterId);
        refreshMissionGateUI(
            ctx.dek,
            ctx.userId,
            hasProgress ? progressContainerId : null,
            hasRecommend ? recommendContainerId : null,
            hasFooter ? sidebarFooterId : null
        ).catch(() => {});
    });
}

// ─── 추천 미션 카드 (대시보드) ──────────────────────────────────────

/**
 * "다음 해볼 만한 미션" 카드 3개 — 대시보드 도트 블록 바로 아래.
 *   미완료 미션 중 난이도 오름차순. 카드 클릭 → 해당 모듈 view 로 이동.
 *   데스크톱 가로 3개, 모바일 가로 스와이프 캐러셀 (CSS 처리).
 *   모든 미션 클리어 시 영역 자체 숨김.
 */
export async function renderMissionRecommendCards(containerId, dek, userId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!dek || !userId) {
        container.innerHTML = '';
        return;
    }

    let completedIds;
    try {
        completedIds = await getCompletedMissionIds(dek, userId);
    } catch (e) {
        console.warn('[missionGate] getCompletedMissionIds failed:', e?.message || e);
        container.innerHTML = '';
        return;
    }
    const recs = getRecommendedMissions(completedIds, 3);
    if (!recs.length) {
        container.innerHTML = '';
        return;
    }

    const cardsHtml = recs.map(r => `
      <button type="button" class="mission-rc-card" data-mission-id="${escapeHtml(r.missionId)}" aria-label="${escapeHtml(r.mission.title)} 시작">
        <span class="mission-rc-icon" aria-hidden="true">${escapeHtml(r.mission.icon)}</span>
        <span class="mission-rc-title">${escapeHtml(r.mission.title)}</span>
        <span class="mission-rc-hint">${escapeHtml(r.mission.hint)}</span>
        <span class="mission-rc-cta">시작</span>
      </button>
    `).join('');

    container.innerHTML = `
      <div class="mission-recommend-wrap">
        <div class="mission-recommend-head">다음 해볼 만한 미션</div>
        <div class="mission-recommend-cards">${cardsHtml}</div>
      </div>
    `;

    container.querySelectorAll('[data-mission-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mid = btn.getAttribute('data-mission-id');
            routeToMission(mid);
        });
    });
}

// ─── 사이드바 풋터 미니 힌트 ────────────────────────────────────────

/**
 * 사이드바 하단 미니 풋터 — 짧은 한 줄 힌트 3개.
 *   공간 좁아서 아이콘 + 짧은 title 만. 클릭 시 해당 모듈 view 로 이동.
 *   모든 미션 클리어 시 영역 숨김.
 */
export async function renderSidebarMissionFooter(containerId, dek, userId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!dek || !userId) {
        container.innerHTML = '';
        return;
    }

    let completedIds;
    try {
        completedIds = await getCompletedMissionIds(dek, userId);
    } catch (e) {
        container.innerHTML = '';
        return;
    }
    const recs = getRecommendedMissions(completedIds, 3);
    if (!recs.length) {
        container.innerHTML = '';
        return;
    }

    const itemsHtml = recs.map(r => `
      <button type="button" class="sidebar-mission-item" data-mission-id="${escapeHtml(r.missionId)}" title="${escapeHtml(r.mission.title)}" aria-label="${escapeHtml(r.mission.title)}">
        <span class="sidebar-mission-icon" aria-hidden="true">${escapeHtml(r.mission.icon)}</span>
        <span class="sidebar-mission-label">${escapeHtml(r.mission.title)}</span>
      </button>
    `).join('');

    container.innerHTML = `
      <div class="sidebar-mission-footer">
        <div class="sidebar-mission-head">다음 미션</div>
        ${itemsHtml}
      </div>
    `;

    container.querySelectorAll('[data-mission-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mid = btn.getAttribute('data-mission-id');
            routeToMission(mid);
        });
    });
}

// ─── 헬퍼: missionId → view 이동 ────────────────────────────────────

function routeToMission(missionId) {
    const view = ROUTE_BY_MISSION[missionId] || 'today';
    if (typeof window !== 'undefined' && typeof window.__sanctumSwitchView === 'function') {
        window.__sanctumSwitchView(view);
    }
}

// ─── 헬퍼: 완료 missionId 목록 ──────────────────────────────────────

/**
 * selfCard.missionStatus 를 missionId 단위 완료 목록으로 변환.
 *   missionStatus 키는 moduleId — 같은 모듈에 미션 2개(meditation_first_save / past_meditation_revisit)인 경우
 *   moduleId 1번 클리어로 두 미션을 다 끝낸 것으로 안 보고 missionId 별로 따로 추적해야 하지만,
 *   현재 markMissionComplete 가 moduleId 기준으로만 status 저장하므로 1차는 moduleId 매칭으로 추정.
 *   (tutorialState 안 missionId 키도 보조로 사용 — 더 정밀.)
 */
async function getCompletedMissionIds(dek, userId) {
    const self = await getSelfCard(dek, userId);
    if (!self) return [];
    const tutorialState = self.tutorialState || {};
    const missionStatus = self.missionStatus || {};

    const done = [];
    for (const [missionId, mission] of Object.entries(MISSION_CATALOG)) {
        if (mission.deferred) continue;
        // 1) tutorialState 안 missionId 키가 있으면 그것 우선 (정밀).
        if (tutorialState[missionId]?.completedAt) {
            done.push(missionId);
            continue;
        }
        // 2) fallback — moduleId 기준 missionStatus. 같은 모듈에 미션 여러 개면 모두 완료로 잡힘 (1차 한계).
        if (missionStatus[mission.moduleId]?.completed) {
            done.push(missionId);
        }
    }
    return done;
}

// ─── 헬퍼: 조용한 토스트 ────────────────────────────────────────────

/**
 * 미션 클리어 토스트 — 1.3초 자동 소멸. ui/quickReview.js 의 .sanctum-toast 와 같은 클래스 재사용.
 *   여러 미션 동시 클리어 시 element 가 따로따로 생기지만 1.3초 후 둘 다 자연 소멸.
 */
function showMissionToast(msg) {
    if (typeof document === 'undefined') return;
    try {
        const toast = document.createElement('div');
        toast.className = 'sanctum-toast';
        toast.textContent = String(msg);
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => toast.remove(), 1500);
    } catch (_) { /* 토스트 실패는 무시 */ }
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
