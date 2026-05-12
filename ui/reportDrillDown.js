/**
 * reportDrillDown.js — 리포트 카드 안의 "드릴다운" drawer (Phase E-9/R-DD)
 *
 * spec §1.6 3층 분리 중 2층("드릴다운 — 사용자가 클릭할 때만 raw 데이터").
 * AI 산문이 추상화된 흐름이라면, 드릴다운은 그 흐름이 만들어진 원본 도트/결단을 보여줌.
 * 페이지를 떠나지 않고 카드 안에서 인라인 펼치기/접기.
 *
 * 정책 (메모리 project_reports_module.md):
 *  - "성장을 위한 극단적 투명성 + 따뜻한 톤 = 하나님의 빛을 흉내내는 그림자"
 *  - 도트 ID나 결단 ID는 사용자에게 노출하지만 영적 평가는 0건
 *  - 라벨/카테고리/만족도 raw 수치 그대로 표시
 *
 * 데이터 흐름:
 *  - 카드의 (start, end) 기간 도트를 한 번 fetch → 메모리 캐시 (rangeKey = start..end)
 *  - 클라이언트 필터로 5종 뷰 제공: person / category / labelPair / pinnedPrinciple / decision
 *  - aggregator의 stats를 다시 손대지 않음 (UI-only 작업)
 *
 * 사용:
 *  attachDrillDown(rowEl, {
 *      type: 'person',
 *      params: { personId: 'p_xxx', name: '홍길동' },
 *      range: { start: '2026-05-01', end: '2026-05-31' },
 *      dek, userId,
 *  });
 */

import { getDotsByDateRange } from '../data/dotsRepo.js';
import { getAllPersons } from '../data/personRepo.js';
import { getDailyGoals } from '../data/goalsRepo.js';

// (start, end) 별 도트 캐시 — 한 카드에서 여러 드릴다운을 눌러도 한 번만 fetch.
// (dek, userId) 가 바뀌면 자연스럽게 새 key로 재fetch.
const _dotCache = new Map(); // key: `${userId}|${start}..${end}` → Promise<dots[]>

function cacheKey(userId, start, end) {
    return `${userId}|${start}..${end}`;
}

async function getDotsCached(dek, userId, start, end) {
    const k = cacheKey(userId, start, end);
    if (!_dotCache.has(k)) {
        _dotCache.set(k, getDotsByDateRange(dek, userId, start, end).catch(e => {
            _dotCache.delete(k);
            throw e;
        }));
    }
    return _dotCache.get(k);
}

/**
 * 클릭 가능한 행에 드릴다운 동작을 부착.
 * 같은 행을 다시 누르면 닫힘.
 *
 * @param {HTMLElement} rowEl - 클릭 트리거가 될 요소 (보통 stat span, bullet li, pattern card)
 * @param {Object} cfg
 *   @param {string} cfg.type - 'person'|'category'|'labelPair'|'pinnedPrinciple'|'decision'
 *   @param {Object} cfg.params - type 별 필터 인자
 *   @param {{start:string, end:string}} cfg.range
 *   @param {CryptoKey} cfg.dek
 *   @param {string} cfg.userId
 *   @param {string} [cfg.label] - drawer 헤더 라벨 (없으면 type으로 자동)
 */
export function attachDrillDown(rowEl, cfg) {
    if (!rowEl || rowEl.dataset.drillBound === '1') return;
    rowEl.dataset.drillBound = '1';
    rowEl.classList.add('drill-trigger');
    rowEl.setAttribute('role', 'button');
    rowEl.setAttribute('tabindex', '0');
    rowEl.title = '클릭해서 raw 데이터 펼치기';

    const trigger = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        toggleDrawer(rowEl, cfg);
    };
    rowEl.addEventListener('click', trigger);
    rowEl.addEventListener('keydown', trigger);
}

async function toggleDrawer(rowEl, cfg) {
    // 이미 열려 있는 drawer 가 있으면 토글로 닫기
    const existing = rowEl.nextElementSibling?.classList?.contains('drill-drawer')
        ? rowEl.nextElementSibling : null;
    if (existing) {
        existing.remove();
        rowEl.classList.remove('drill-open');
        return;
    }

    // 같은 부모 안의 다른 열려 있는 drawer 는 닫음 (한 번에 하나만)
    rowEl.parentElement?.querySelectorAll('.drill-drawer').forEach(el => el.remove());
    rowEl.parentElement?.querySelectorAll('.drill-trigger.drill-open')
        .forEach(el => el.classList.remove('drill-open'));

    const drawer = document.createElement('div');
    drawer.className = 'drill-drawer';
    drawer.innerHTML = `
        <div class="drill-drawer-head">
            <span class="drill-drawer-label">${escapeHtml(cfg.label || labelOf(cfg.type))}</span>
            <button class="drill-drawer-close" type="button" aria-label="닫기">×</button>
        </div>
        <div class="drill-drawer-body">
            <div class="drill-loading">불러오는 중이에요...</div>
        </div>
    `;
    rowEl.insertAdjacentElement('afterend', drawer);
    rowEl.classList.add('drill-open');

    drawer.querySelector('.drill-drawer-close')?.addEventListener('click', () => {
        drawer.remove();
        rowEl.classList.remove('drill-open');
    });

    const body = drawer.querySelector('.drill-drawer-body');
    try {
        const html = await renderByType(cfg);
        body.innerHTML = html || '<p class="drill-empty">이 기간에 해당하는 raw 데이터가 없어요.</p>';
        if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();
    } catch (e) {
        console.warn('drill render failed:', e);
        body.innerHTML = `<p class="drill-error">불러오기에 잠깐 막혔어요. ${escapeHtml(e?.message || '')}</p>`;
    }
}

function labelOf(type) {
    return ({
        person:          '이 사람과의 도트',
        category:        '이 카테고리의 도트',
        labelPair:       '이 두 라벨이 함께 등장한 도트',
        pinnedPrinciple: '이 원칙을 의식한 도트',
        decision:        '이 기간 결단의 흐름',
    })[type] || '상세';
}

async function renderByType(cfg) {
    const { type, params, range, dek, userId } = cfg;
    if (type === 'decision') {
        return renderDecisionDrill(dek, userId, range);
    }

    const dots = await getDotsCached(dek, userId, range.start, range.end);

    switch (type) {
        case 'person':          return renderPersonDrill(dots, params, dek, userId);
        case 'category':        return renderCategoryDrill(dots, params);
        case 'labelPair':       return renderLabelPairDrill(dots, params);
        case 'pinnedPrinciple': return renderPinnedPrincipleDrill(dots, params);
        default:                return '<p class="drill-empty">알 수 없는 드릴다운 유형이에요.</p>';
    }
}

// ─── 5종 드릴다운 렌더 ──────────────────────────────────────

async function renderPersonDrill(dots, { personId, name }, dek, userId) {
    const filtered = dots.filter(d => (d.linkedPersonIds || []).includes(personId));
    if (filtered.length === 0) return '';
    // 이름이 안 들어왔으면 personRepo에서 한 번 조회 (드릴다운 인라인이라 lazy)
    let displayName = name;
    if (!displayName) {
        const all = await getAllPersons(dek, userId).catch(() => []);
        displayName = (all.find(p => p.id === personId) || {}).name || '(이름 미지정)';
    }
    return renderDotList(filtered, `${displayName} (${filtered.length}회)`);
}

function renderCategoryDrill(dots, { categoryId }) {
    const filtered = dots.filter(d => (d.categoryId || d.category) === categoryId);
    if (filtered.length === 0) return '';
    const totalMin = filtered.reduce((s, d) => s + (typeof d.durationSlots === 'number' ? d.durationSlots * 15 : 0), 0);
    const hours = Math.round(totalMin / 60 * 10) / 10;
    return renderDotList(filtered, `${categoryId} · ${filtered.length}회 · ${hours}h`);
}

function renderLabelPairDrill(dots, { a, b }) {
    const filtered = dots.filter(d => {
        const set = new Set(d.labelIds || []);
        return set.has(a) && set.has(b);
    });
    if (filtered.length === 0) return '';
    return renderDotList(filtered, `${a} × ${b} (${filtered.length}회)`);
}

function renderPinnedPrincipleDrill(dots, { principleId, title }) {
    const filtered = dots.filter(d => (d.linkedPrincipleIds || []).includes(principleId));
    if (filtered.length === 0) return '';
    return renderDotList(filtered, `${title || '원칙'} 적용 도트 (${filtered.length}회)`);
}

/**
 * 결단 드릴다운 — 도트가 아니라 결단(goal) 목록 기준.
 * 그 기간에 createdAt 또는 첫 실행 도트가 있는 결단.
 */
async function renderDecisionDrill(dek, userId, range) {
    const [goals, dots] = await Promise.all([
        getDailyGoals(dek, userId).catch(() => []),
        getDotsCached(dek, userId, range.start, range.end),
    ]);

    // 각 결단의 첫 실행 도트 찾기 (linkedGoalId 일치)
    const firstExecByGoal = new Map();
    for (const dot of dots) {
        const gid = dot.linkedGoalId;
        if (!gid || firstExecByGoal.has(gid)) continue;
        firstExecByGoal.set(gid, dot);
    }

    // 이 기간에 관련 있는 결단만 — createdAt이 기간 내 또는 실행이 기간 내
    const inRange = goals.filter(g => {
        const created = toLocalDate(g.createdAt);
        const createdInRange = created && created >= range.start && created <= range.end;
        return createdInRange || firstExecByGoal.has(g.id);
    });
    if (inRange.length === 0) return '';

    const rows = inRange.map(g => {
        const created = toLocalDate(g.createdAt) || '?';
        const exec = firstExecByGoal.get(g.id);
        const days = exec ? distanceDays(g.createdAt, exec.date) : null;
        return `
            <li class="drill-decision-row">
                <div class="drill-decision-head">
                    <span class="drill-decision-title">${escapeHtml(g.title || g.text || '(제목 없음)')}</span>
                    <span class="drill-decision-meta">
                        ${exec ? `실행 ${exec.date} · ${days}일` : '실행 표본 없음'}
                    </span>
                </div>
                <div class="drill-decision-sub">결단일 ${escapeHtml(created)}</div>
            </li>
        `;
    }).join('');

    return `
        <p class="drill-summary">이 기간에 시간표로 옮겨졌거나 만들어진 결단 ${inRange.length}건.</p>
        <ul class="drill-decision-list">${rows}</ul>
    `;
}

// ─── 공용 도트 리스트 렌더 ────────────────────────────────

function renderDotList(dots, headline) {
    const sorted = [...dots].sort((a, b) =>
        (a.date || '').localeCompare(b.date || '') ||
        ((a.timeSlot ?? 0) - (b.timeSlot ?? 0))
    );
    const rows = sorted.slice(0, 50).map(d => {
        const time = typeof d.timeSlot === 'number'
            ? `${String(Math.floor(d.timeSlot / 4)).padStart(2, '0')}:${String((d.timeSlot % 4) * 15).padStart(2, '0')}`
            : '';
        const sat = typeof d.executionSatisfaction === 'number' ? `만족 ${d.executionSatisfaction}` : '';
        const result = d.outcome != null ? `결과 ${d.outcome}` : '';
        const labels = (d.labelIds || []).slice(0, 4).join(' · ');
        const meta = [sat, result, labels].filter(Boolean).join(' · ');
        return `
            <li class="drill-dot-row">
                <span class="drill-dot-when">${escapeHtml(d.date || '')} ${escapeHtml(time)}</span>
                <span class="drill-dot-title">${escapeHtml(d.title || d.plannedTask || '(제목 없음)')}</span>
                ${meta ? `<span class="drill-dot-meta">${escapeHtml(meta)}</span>` : ''}
            </li>
        `;
    }).join('');
    const overflow = sorted.length > 50
        ? `<p class="drill-overflow">${sorted.length - 50}건이 더 있어요 (상위 50건만 표시)</p>` : '';

    return `
        <p class="drill-summary">${escapeHtml(headline)}</p>
        <ul class="drill-dot-list">${rows}</ul>
        ${overflow}
    `;
}

// ─── 헬퍼 ────────────────────────────────────────────────

function toLocalDate(v) {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    if (typeof v?.toDate === 'function') {
        const d = v.toDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (v instanceof Date) {
        return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    return null;
}

function distanceDays(from, to) {
    const ms = (toMillis(to) ?? 0) - (toMillis(from) ?? 0);
    return Math.max(0, Math.round(ms / 86400000));
}

function toMillis(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') {
        const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v;
        const ms = Date.parse(s);
        return isNaN(ms) ? null : ms;
    }
    return null;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/**
 * 카드 단위 캐시 비우기 — 재작성 후 또는 카드 다시 그릴 때 호출하면 좋음.
 * 비워두면 다음 클릭에 다시 fetch.
 */
export function invalidateDrillCache(userId, range) {
    if (!userId || !range) {
        _dotCache.clear();
        return;
    }
    _dotCache.delete(cacheKey(userId, range.start, range.end));
}
