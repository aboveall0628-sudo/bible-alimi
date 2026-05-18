/**
 * reportQna.js — 리포트 카드 하단 "리포트에 대해 질문하기" 입력창 (Phase E-9/R-QA)
 *
 * spec §4: A3 확장 — AI Q&A 패턴. 모든 리포트 공통.
 * 카드 하단(데이터 경계선 위)에 입력창 + 답변 누적 표시.
 *
 * 사용:
 *   mountReportQna(footEl, {
 *       reportId: '2026-05-12' | '2026-W19' | '2026-05',
 *       reportType: 'day' | 'week' | 'month' | 'quarter' | 'year',
 *       stats,                      // 그 리포트의 stats
 *       context: { persons, orgs },// 가명화 복원용 (선택)
 *       dek, userId,
 *   });
 */

import { callReportQuestion } from './aiClient.js';
// (Phase C 2026-05-16) AI 로딩 보강 — 단계 라벨 회전 + typing breath
import { THINKING_COPY, typeText, shouldReduceMotion } from './aiThinking.js';
import {
    saveReportQuestion, listQuestionsByReport, markQuestionSeen,
    countArchivedByReport, listArchivedQuestionsByReport,
} from '../reports/reportQuestionsRepo.js';
import { getAllPersons } from '../data/personRepo.js';
import { getAllOrganizations } from '../data/orgRepo.js';

// (2026-05-13 #4) Q&A 응답에 P_001/O_001 토큰 회귀 fix —
//   reports.js bindDayQna 등이 `context: {}` 로 호출. pseudonymize 매핑이 비어
//   LLM 의 P_001 토큰이 역가명화 못 되고 그대로 노출됨.
// (2026-05-13 STEP A-2) 추가: stats.connections + stats.dotsTimeline 안의 personId·orgId 도
//   이름으로 치환한 statsForLLM 을 함께 반환. (#4 잔재 회귀 — Q&A 응답 ⑤에 P_001 노출)
async function enrichStatsAndContext(stats, dek, userId) {
    try {
        const personConns = stats?.connections?.persons || [];
        const orgConns   = stats?.connections?.organizations || [];
        const timeline   = stats?.dotsTimeline || [];
        const hasTimelineIds = timeline.some(t =>
            (t.personIds && t.personIds.length > 0) || (t.orgIds && t.orgIds.length > 0)
        );
        if (personConns.length === 0 && orgConns.length === 0 && !hasTimelineIds) {
            return { context: { persons: [], orgs: [] }, statsForLLM: stats };
        }

        const [allPersons, allOrgs] = await Promise.all([
            getAllPersons(dek, userId).catch(() => []),
            getAllOrganizations(dek, userId).catch(() => []),
        ]);
        const personNameById = new Map(allPersons.map(p => [p.id, p.name || '']));
        const orgNameById    = new Map(allOrgs.map(o => [o.id, o.name || '']));

        const personsForLLM = personConns.map(({ personId, ...rest }) => ({
            name: personNameById.get(personId) || '(알 수 없는 인물)',
            ...rest,
        }));
        const orgsForLLM = orgConns.map(({ orgId, ...rest }) => ({
            name: orgNameById.get(orgId) || '(알 수 없는 조직)',
            ...rest,
        }));
        const timelineForLLM = timeline.map(t => ({
            ...t,
            personIds: undefined,
            orgIds:    undefined,
            persons:   (t.personIds || []).map(id => personNameById.get(id)).filter(Boolean),
            orgs:      (t.orgIds || []).map(id => orgNameById.get(id)).filter(Boolean),
        }));

        const statsForLLM = {
            ...stats,
            connections: { ...stats.connections, persons: personsForLLM, organizations: orgsForLLM },
            dotsTimeline: timelineForLLM,
        };

        const persons = Array.from(new Set([
            ...personsForLLM.map(p => p.name).filter(n => n && !n.startsWith('(')),
            ...timelineForLLM.flatMap(t => t.persons || []),
        ]));
        const orgs = Array.from(new Set([
            ...orgsForLLM.map(o => o.name).filter(n => n && !n.startsWith('(')),
            ...timelineForLLM.flatMap(t => t.orgs || []),
        ]));

        return { context: { persons, orgs }, statsForLLM };
    } catch {
        return { context: { persons: [], orgs: [] }, statsForLLM: stats };
    }
}

/**
 * 카드의 "여기까지가 데이터예요…" 푸터 바로 위에 Q&A 영역을 끼움.
 * 같은 카드에 이미 박혀 있으면 무시 (idempotent).
 */
export async function mountReportQna(anchorEl, cfg) {
    if (!anchorEl) return;
    // 카드 내부에서 anchorEl 의 부모 = report-card 자체. 그 안에 q&a 노드를 push.
    const parent = anchorEl.parentElement || anchorEl;
    if (parent.querySelector('.qna-wrap')) return; // 중복 마운트 차단

    const wrap = document.createElement('div');
    wrap.className = 'qna-wrap';
    wrap.innerHTML = `
        <div class="qna-history" data-empty="true"></div>
        <div class="qna-archive-row" data-mounted="false"></div>
        <form class="qna-form" autocomplete="off">
            <label class="qna-label" for="qna-input-${escapeId(cfg.reportId)}">리포트에 대해 질문하기</label>
            <div class="qna-input-row">
                <input id="qna-input-${escapeId(cfg.reportId)}" class="qna-input" type="text"
                       placeholder='예: "왜 화요일이 낮았어?" / "이 시기에 어떤 흐름이 있었어?"' maxlength="200" />
                <button type="submit" class="qna-submit">묻기</button>
            </div>
            <p class="qna-hint">AI는 데이터가 그린 흐름만 보여줘요. 답은 묵상에서.</p>
        </form>
    `;
    // 푸터(여기까지가 데이터예요…) 바로 앞에 끼움. 없으면 마지막에.
    anchorEl.insertAdjacentElement('beforebegin', wrap);

    // 재작성으로 archive 된 이전 Q&A 가 있으면 토글 노출 (2026-05-14 정책 C)
    countArchivedByReport(cfg.userId, cfg.reportId).then(count => {
        if (count <= 0) return;
        const row = wrap.querySelector('.qna-archive-row');
        if (!row) return;
        row.dataset.mounted = 'true';
        row.innerHTML = `
            <button type="button" class="qna-archive-toggle" aria-expanded="false">
                ↻ 이전 Q&A ${count}건 보기
            </button>
            <div class="qna-archive-list hidden"></div>
        `;
        const btn  = row.querySelector('.qna-archive-toggle');
        const list = row.querySelector('.qna-archive-list');
        btn.addEventListener('click', async () => {
            const willOpen = list.classList.contains('hidden');
            if (willOpen && !list.dataset.loaded) {
                btn.disabled = true;
                btn.textContent = '불러오는 중…';
                try {
                    const items = await listArchivedQuestionsByReport(cfg.dek, cfg.userId, cfg.reportId, 50);
                    renderArchivedList(list, items);
                    list.dataset.loaded = 'true';
                } catch (e) {
                    console.warn('archive load failed:', e);
                    list.innerHTML = `<p class="qna-error">이전 Q&A 를 부르지 못했어요.</p>`;
                }
                btn.disabled = false;
            }
            list.classList.toggle('hidden', !willOpen);
            btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            btn.textContent = willOpen ? `▾ 이전 Q&A ${count}건 접기` : `↻ 이전 Q&A ${count}건 보기`;
        });
    }).catch(e => console.warn('archive count failed:', e));

    // 기존 질문 로드 — listQuestionsByReport
    try {
        const history = await listQuestionsByReport(cfg.dek, cfg.userId, cfg.reportId, 10);
        if (history && history.length > 0) {
            renderHistory(wrap.querySelector('.qna-history'), history);
            // 본 즉시 seen 마킹 (다음 아침 게이트에서 안 보이도록)
            history.filter(h => !h.seenAt).forEach(h => {
                markQuestionSeen(cfg.userId, h.id).catch(() => {});
            });
        }
    } catch (e) {
        console.warn('qna history load failed:', e);
    }

    // submit 핸들러
    const form = wrap.querySelector('.qna-form');
    const input = wrap.querySelector('.qna-input');
    const submitBtn = wrap.querySelector('.qna-submit');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = (input.value || '').trim();
        if (!question) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '듣는 중...';
        const tempCard = appendPendingCard(wrap.querySelector('.qna-history'), question);

        try {
            // (2026-05-13 STEP A-2) cfg.stats 안의 personId/orgId 까지 이름으로 치환한 statsForLLM 사용.
            //   기존 buildContextFromStats 는 context.persons 만 채웠고 stats 내부 ID 는 그대로 — #4 회귀.
            const enriched = await enrichStatsAndContext(cfg.stats || {}, cfg.dek, cfg.userId);
            const explicitCtx = cfg.context || {};
            const finalCtx = (explicitCtx.persons?.length || explicitCtx.orgs?.length)
                ? explicitCtx
                : enriched.context;
            const res = await callReportQuestion({
                question,
                reportType: cfg.reportType,
                stats:      enriched.statsForLLM,
                context:    finalCtx,
            });

            // 저장 — Firestore
            await saveReportQuestion(cfg.dek, cfg.userId, {
                reportId:           cfg.reportId,
                reportType:         cfg.reportType,
                question,
                observationFlow:    res.observationFlow,
                returnToMeditation: res.returnToMeditation,
            });

            // 임시 카드 → 정식 답변으로 교체 (typing breath 적용)
            card_clearThinkingTimer(tempCard);
            tempCard.classList.remove('qna-card-pending');
            await fillAnswerWithTyping(tempCard.querySelector('.qna-answer'), res);
            input.value = '';
        } catch (e) {
            console.error('reportQuestion failed:', e);
            card_clearThinkingTimer(tempCard);
            tempCard.querySelector('.qna-answer').innerHTML =
                `<p class="qna-error">답을 부르지 못했어요. 잠시 후 다시 시도해 주세요.</p>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '묻기';
        }
    });
}

function renderHistory(historyEl, items) {
    historyEl.dataset.empty = 'false';
    historyEl.innerHTML = items.map(it => `
        <article class="qna-card" data-question-id="${escapeAttr(it.id)}">
            <p class="qna-question">${escapeHtml(it.question || '')}</p>
            <div class="qna-answer">${renderAnswerHtml(it)}</div>
        </article>
    `).join('');
}

// archive 토글 본문 — 옅은 톤으로 현재와 구분
function renderArchivedList(listEl, items) {
    if (!items || items.length === 0) {
        listEl.innerHTML = `<p class="qna-archive-empty">기록된 이전 Q&A 가 없어요.</p>`;
        return;
    }
    listEl.innerHTML = items.map(it => `
        <article class="qna-card qna-card-archived" data-question-id="${escapeAttr(it.id)}">
            <p class="qna-question">${escapeHtml(it.question || '')}</p>
            <div class="qna-answer">${renderAnswerHtml(it)}</div>
        </article>
    `).join('');
}

function appendPendingCard(historyEl, question) {
    historyEl.dataset.empty = 'false';
    const card = document.createElement('article');
    card.className = 'qna-card qna-card-pending';
    // (Phase C 2026-05-16) 단계 라벨 회전 + 가짜 progress bar
    card.innerHTML = `
        <p class="qna-question">${escapeHtml(question)}</p>
        <div class="qna-answer">
            <div class="ai-thinking ai-thinking-sm">
                <div class="ai-thinking-bar"></div>
                <span class="ai-thinking-label">${escapeHtml(THINKING_COPY.reportQna[0])}</span>
            </div>
        </div>
    `;
    historyEl.prepend(card);

    // 라벨 회전
    const labelEl = card.querySelector('.ai-thinking-label');
    const labels = THINKING_COPY.reportQna;
    let stage = 0;
    const timer = setInterval(() => {
        if (!labelEl.isConnected) { clearInterval(timer); return; }
        stage = (stage + 1) % labels.length;
        labelEl.style.opacity = '0';
        setTimeout(() => {
            labelEl.textContent = labels[stage];
            labelEl.style.opacity = '';
        }, 150);
    }, 2500);
    card._thinkingTimer = timer;

    return card;
}

/**
 * (Phase C 2026-05-16) 응답 노출 — typing breath. 본문(flow)만 한 자씩, 종결 두 줄은 한 번에.
 */
async function fillAnswerWithTyping(answerEl, res) {
    if (card_clearThinkingTimer(answerEl)) {/* noop, helper handles */}
    const flow = res.observationFlow || res.full || '';
    const tail = res.returnToMeditation || '';
    answerEl.innerHTML = `
        <div class="qna-flow ai-typing"></div>
        ${tail ? `<div class="qna-tail" hidden>${escapeHtml(tail).replace(/\n/g, '<br>')}</div>` : ''}
    `;
    const flowEl = answerEl.querySelector('.qna-flow');
    const tailEl = answerEl.querySelector('.qna-tail');
    if (!flowEl) return;

    if (shouldReduceMotion() || !flow) {
        flowEl.classList.remove('ai-typing');
        flowEl.innerHTML = escapeHtml(flow).replace(/\n/g, '<br>');
        if (tailEl) tailEl.hidden = false;
        return;
    }
    // 한 자씩 노출 — \n 만나면 <br>
    for (let i = 0; i < flow.length; i++) {
        const ch = flow[i];
        if (ch === '\n') flowEl.appendChild(document.createElement('br'));
        else flowEl.appendChild(document.createTextNode(ch));
        await new Promise(r => setTimeout(r, 22));
    }
    flowEl.classList.remove('ai-typing');
    if (tailEl) tailEl.hidden = false;
}

function card_clearThinkingTimer(scopeEl) {
    // 카드 (또는 그 안 자리)에서 thinking timer 정리
    const card = scopeEl.closest?.('.qna-card') || scopeEl;
    if (card?._thinkingTimer) {
        clearInterval(card._thinkingTimer);
        card._thinkingTimer = null;
    }
    return true;
}

/**
 * 답변 HTML — observationFlow 본문 + 종결 두 줄을 시각적으로 구분.
 */
function renderAnswerHtml(res) {
    const flow = res.observationFlow || res.full || '';
    const tail = res.returnToMeditation || '';
    return `
        <div class="qna-flow">${escapeHtml(flow).replace(/\n/g, '<br>')}</div>
        ${tail ? `<div class="qna-tail">${escapeHtml(tail).replace(/\n/g, '<br>')}</div>` : ''}
    `;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function escapeAttr(s) { return escapeHtml(s); }
function escapeId(s) { return String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '_'); }
