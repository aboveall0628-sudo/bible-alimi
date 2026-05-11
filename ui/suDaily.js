/**
 * suDaily.js — 매일성경 순(SU) 오늘 본문·해설 카드 (Phase E-8/C)
 *
 * 오늘 화면에 작은 카드를 띄워, 펼치면 functions/suProxy를 호출하고 본문/해설을
 * 우리 디자인으로 표시. 새로 펼칠 때마다가 아니라 한 번만 fetch + 메모리 캐시.
 *
 * SU 페이지는 마크업이 안정적이지 않아 파싱이 깨질 수 있음. 그래서:
 *   - 결과가 비어 있으면 "외부에서 보기" 폴백 안내를 항상 함께 노출
 *   - 함수 호출 실패도 같은 폴백
 *
 * 보안:
 *   - 외부 HTML을 그대로 innerHTML 하지 않음. 함수가 이미 escapeHtml + 화이트리스트
 *     마크업(<p>·<span>)으로 정규화해서 돌려줌. 그 정규화된 결과만 박음.
 */

import { functions, httpsCallable } from '../data/firebase.js';

let _cache = null; // { ok, ..., fetchedAt } — 메모리 캐시 (탭 살아있는 동안)
let _inflight = null; // 동시 요청 합치기

const FALLBACK_URL = 'https://sum.su.or.kr:8888/bible/today';

/**
 * 오늘 화면에 SU 카드를 마운트.
 * @param {HTMLElement} container — 카드가 들어갈 부모
 */
export function mountSuDailyCard(container) {
    if (!container || document.getElementById('section-su-daily')) return;

    const section = document.createElement('section');
    section.id = 'section-su-daily';
    section.className = 'card-section su-card';
    section.innerHTML = `
        <div class="section-header-flex">
            <h2 class="section-title">
                <i class="section-icon" data-lucide="newspaper"></i>
                매일성경(SU) 본문·해설
            </h2>
            <div class="su-actions">
                <a class="text-btn" href="${FALLBACK_URL}" target="_blank" rel="noopener"
                   title="성서유니온 매일성경 사이트로 이동">SU 사이트</a>
                <button class="collapsible-toggle" type="button" data-target="su-body">펼치기</button>
            </div>
        </div>
        <div id="su-body" class="su-body collapsible-body collapsed">
            <p class="setting-hint" style="margin: var(--sp-3) 0;">
                펼치기를 누르면 매일성경의 오늘 본문과 해설을 가져와요.
            </p>
        </div>
    `;
    container.appendChild(section);

    // 펼치기 버튼 — 토글 + 첫 펼침 때 자동 fetch
    const body = section.querySelector('#su-body');
    const toggle = section.querySelector('.collapsible-toggle');
    toggle.addEventListener('click', async () => {
        const willOpen = body.classList.contains('collapsed');
        body.classList.toggle('collapsed', !willOpen);
        toggle.textContent = willOpen ? '접기' : '펼치기';
        if (willOpen) {
            await ensureLoadedAndRender(body);
        }
    });

    if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();
}

/**
 * 캐시가 있으면 그대로 렌더. 없으면 callable 호출 → 결과 렌더.
 * 두 번째 호출부터는 메모리 캐시만으로 즉시 표시.
 */
async function ensureLoadedAndRender(body) {
    if (_cache) {
        renderResult(body, _cache);
        return;
    }
    body.innerHTML = `
        <div class="su-loading">
            <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
            <span>매일성경에서 본문·해설을 받아오는 중이에요...</span>
        </div>
    `;
    try {
        if (!_inflight) {
            const call = httpsCallable(functions, 'suProxy');
            _inflight = call({}).then(r => r.data).finally(() => { _inflight = null; });
        }
        const data = await _inflight;
        _cache = data;
        renderResult(body, data);
    } catch (e) {
        console.warn('[suProxy] call failed:', e);
        renderError(body, e?.message || String(e));
    }
}

function renderResult(body, data) {
    if (!data || data.ok === false) {
        renderError(body, data?.reason || '불러오지 못했어요.');
        return;
    }
    const dateLine = data.date
        ? `<span class="su-meta-date">${escapeText(data.date)}</span>`
        : '';
    const titleLine = data.title
        ? `<h3 class="su-title">${escapeText(data.title)}</h3>`
        : '';

    // passageHtml / commentaryHtml은 Functions에서 escapeHtml + 화이트리스트 마크업으로
    // 정규화된 상태. 그래도 빈 문자열 보호.
    const passage = data.passageHtml || '<p class="su-empty">본문을 받아오지 못했어요.</p>';
    const commentary = data.commentaryHtml || '<p class="su-empty">해설을 받아오지 못했어요.</p>';

    const lowConfidenceWarn = data.parseConfidence === 'low'
        ? `<p class="su-warn">자동 추출이 부분적으로만 됐어요. 빠진 부분은
              <a href="${escapeAttr(data.sourceUrl || FALLBACK_URL)}" target="_blank" rel="noopener">SU 사이트</a>에서 확인해 주세요.</p>`
        : '';

    body.innerHTML = `
        <header class="su-head">
            ${dateLine}
            ${titleLine}
        </header>
        ${lowConfidenceWarn}
        <section class="su-passage">
            <h4 class="su-subhead">본문</h4>
            <div class="su-passage-body">${passage}</div>
        </section>
        <section class="su-commentary">
            <h4 class="su-subhead">해설</h4>
            <div class="su-commentary-body">${commentary}</div>
        </section>
        <p class="su-source-note">
            출처: <a href="${escapeAttr(data.sourceUrl || FALLBACK_URL)}" target="_blank" rel="noopener">성서유니온 매일성경</a>
            · 받아온 시각 ${formatTime(data.fetchedAt)}
        </p>
    `;
    if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();
}

function renderError(body, reason) {
    body.innerHTML = `
        <div class="su-error">
            <p>매일성경 본문을 가져오지 못했어요.</p>
            <p class="setting-hint">${escapeText(reason)}</p>
            <p style="margin-top: var(--sp-3);">
                <a class="primary-btn" href="${FALLBACK_URL}" target="_blank" rel="noopener" style="display:inline-block;">
                    SU 사이트에서 보기 →
                </a>
            </p>
        </div>
    `;
}

function escapeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
const escapeAttr = escapeText;

function formatTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return ''; }
}
