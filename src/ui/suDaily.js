/**
 * suDaily.js — 매일성경 외부 링크 행 (Phase E-8/C 단순화)
 *
 * fetch·파싱 없이 그냥 "매일성경에서 본문·해설 보기 →" 한 줄.
 * 클릭하면 새 창에서 성서유니온 사이트로.
 *
 * 본문 카드(meditation-content) 맨 아래에 박힘. 본문 접기와 함께 자연스럽게 숨겨짐.
 * 설정 → 말씀 본문 → "매일성경 링크 보이기" 토글로 켜고 끌 수 있음.
 */

import { getScriptureSettings } from './scriptureSettings.js';

const EXTERNAL_URL = 'https://sum.su.or.kr:8888/bible/today';

/**
 * 통독 본문 컨테이너(#meditation-content) 안의 마지막에 링크 행 한 줄을 박는다.
 * 이미 박혀 있으면 setting을 다시 보고 보일지/뗄지 결정.
 *
 * @param {HTMLElement} container — 통독 본문 컨테이너
 */
export function renderDailyBibleLink(container) {
    if (!container) return;
    const existing = container.querySelector('.daily-bible-link');
    const { showDailyBibleLink } = getScriptureSettings();

    if (!showDailyBibleLink) {
        if (existing) existing.remove();
        return;
    }

    // 이미 박혀 있으면 위치만 보장
    if (existing) {
        container.appendChild(existing);
        return;
    }

    const row = document.createElement('a');
    row.className = 'daily-bible-link';
    row.href = EXTERNAL_URL;
    row.target = '_blank';
    row.rel = 'noopener';
    row.innerHTML = `
        <span class="daily-bible-link-text">매일성경에서 오늘 본문·해설 보기</span>
        <i data-lucide="external-link" class="daily-bible-link-icon"></i>
    `;
    container.appendChild(row);
    if (typeof window.__sanctumRenderLucide === 'function') window.__sanctumRenderLucide();
}
