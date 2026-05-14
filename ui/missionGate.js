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

import { MISSION_CATALOG, getActiveMissionIds } from '../config/missionCatalog.js';
import { isModuleLocked, getOpenMissions, getSelfCard } from '../data/personRepo.js';

// nav 버튼 id ↔ moduleId 매핑.
//   - 'today', 'self-profile', 'settings', 'economy', 'meditation' 같은 항상 unlocked 모듈은 X
//   - 'dashboard', 'past', 'principles' 는 잠금 가드 안 박음 (관제탑·지난 묵상·원칙 목록은 빈 페이지 OK)
//   1차 잠금 가드 대상: persons, organizations, reports.
const NAV_LOCK_TARGETS = {
    'nav-persons': 'persons',
    'nav-organizations': 'organizations',
    'nav-reports': 'reports',
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
 * 사이드바 + 진행도 한 번에 갱신 — 미션 클리어 후 / 뷰 전환 시.
 */
export async function refreshMissionGateUI(dek, userId, progressContainerId) {
    await Promise.all([
        refreshSidebarLockStyles(dek, userId),
        progressContainerId
            ? renderMissionProgressBlock(progressContainerId, dek, userId)
            : Promise.resolve()
    ]);
}

/**
 * 미션 클리어 즉시 UI 갱신 — personRepo.markMissionComplete 가 발화하는
 *   `sanctum:mission-unlocked` 이벤트를 listen 해서 사이드바 회색 톤·진행도 즉시 갱신.
 *
 *   app.js init 시 1회만 호출. getCtx 클로저로 dek/userId 최신값 추적.
 */
export function bindMissionUnlockListener(getCtx, progressContainerId) {
    if (typeof window === 'undefined') return;
    if (window.__sanctumMissionUnlockBound) return;
    window.__sanctumMissionUnlockBound = true;
    window.addEventListener('sanctum:mission-unlocked', () => {
        const ctx = getCtx();
        if (!ctx?.dek || !ctx?.userId) return;
        // mission-progress-block 이 현재 DOM 에 있을 때만 도트 갱신.
        const hasProgress = !!document.getElementById(progressContainerId);
        refreshMissionGateUI(
            ctx.dek,
            ctx.userId,
            hasProgress ? progressContainerId : null
        ).catch(() => {});
    });
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
