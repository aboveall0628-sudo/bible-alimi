/**
 * stanceGate.js — v3-①-F 영적 안전장치
 *
 * stance(ally / neutral / caution / adversary) 변경 시,
 * 부정 방향(ally → caution/adversary)일 때만 30초 기도 게이트를 강제한다.
 *
 * 게이트가 요구하는 것:
 *   1) 사유 입력 (한 줄 이상)
 *   2) 30초 동안 [기도 중] 진행바가 다 차야 [변경 확정] 활성화
 *   3) 확정 시 stance + 사유 + prayerDone=true가 stanceHistory에 박힘
 *
 * 긍정 방향 변경(adversary → ally 등)은 게이트 없이 즉시 변경.
 *
 * 사용:
 *   const result = await openStanceGate({
 *     subjectType: 'person' | 'org',
 *     subjectName: '...',
 *     fromStance: 'ally',
 *     toStance: 'adversary',
 *   });
 *   if (result) { changeStance(...) }   // null이면 취소
 */

const STANCE_META = {
    ally:      { label: '우호', color: 'var(--dot-green)',  icon: '🤝', weight: 0 },
    neutral:   { label: '중립', color: 'var(--dot-gray)',   icon: '➖', weight: 1 },
    caution:   { label: '주의', color: 'var(--dot-orange)', icon: '⚠️', weight: 2 },
    adversary: { label: '적대', color: 'var(--dot-red)',    icon: '⚡', weight: 3 },
};

const GATE_DURATION_SEC = 30;

const QUOTES = [
    '"원수를 사랑하며 너희를 박해하는 자를 위하여 기도하라." — 마태 5:44',
    '"노하기를 더디 하는 자는 용사보다 낫다." — 잠언 16:32',
    '"분을 내어도 죄를 짓지 말며 해가 지도록 분을 품지 말라." — 에베소 4:26',
    '"비판을 받지 아니하려거든 비판하지 말라." — 마태 7:1',
    '"악을 악으로, 욕을 욕으로 갚지 말라." — 베드로전 3:9',
];

/**
 * 부정 방향 여부 (게이트 필요한지)
 */
export function isNegativeShift(fromStance, toStance) {
    const f = STANCE_META[fromStance]?.weight ?? 1;
    const t = STANCE_META[toStance]?.weight ?? 1;
    return t > f;
}

/**
 * stance 게이트 열기.
 * @returns {Promise<null | { reason: string, prayerDone: boolean }>}
 *           null = 사용자가 취소
 */
export function openStanceGate({ subjectType, subjectName, fromStance, toStance }) {
    return new Promise((resolve) => {
        // 부정 방향이 아니면 즉시 통과 (사유는 비어 있어도 됨)
        if (!isNegativeShift(fromStance, toStance)) {
            resolve({ reason: '', prayerDone: true });
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'stance-gate-overlay';
        overlay.innerHTML = templateHtml({ subjectType, subjectName, fromStance, toStance });
        document.body.appendChild(overlay);

        const reasonEl   = overlay.querySelector('.stance-gate-reason');
        const confirmBtn = overlay.querySelector('.stance-gate-confirm-btn');
        const cancelBtn  = overlay.querySelector('.stance-gate-cancel-btn');
        const fillEl     = overlay.querySelector('.stance-gate-prayer-fill');
        const labelEl    = overlay.querySelector('.stance-gate-prayer-label');

        let prayerDone = false;
        let reasonOk = false;
        let cleanedUp = false;

        const updateConfirmEnabled = () => {
            confirmBtn.disabled = !(prayerDone && reasonOk);
        };

        // 사유 입력 감시
        reasonEl.addEventListener('input', () => {
            reasonOk = (reasonEl.value || '').trim().length >= 2;
            updateConfirmEnabled();
        });

        // 30초 타이머
        let elapsed = 0;
        const stepMs = 200;
        const totalMs = GATE_DURATION_SEC * 1000;
        const timer = setInterval(() => {
            if (cleanedUp) return;
            elapsed += stepMs;
            const pct = Math.min(100, (elapsed / totalMs) * 100);
            fillEl.style.width = `${pct}%`;
            const remain = Math.max(0, GATE_DURATION_SEC - Math.floor(elapsed / 1000));
            labelEl.textContent = remain > 0 ? `${remain}초` : '기도 완료';
            if (elapsed >= totalMs) {
                clearInterval(timer);
                prayerDone = true;
                updateConfirmEnabled();
            }
        }, stepMs);

        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            clearInterval(timer);
            overlay.remove();
        };

        cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
        confirmBtn.addEventListener('click', () => {
            if (confirmBtn.disabled) return;
            const reason = (reasonEl.value || '').trim();
            cleanup();
            resolve({ reason, prayerDone: true });
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // 배경 클릭으로 닫기 — 취소 처리
                cleanup();
                resolve(null);
            }
        });

        // 첫 포커스
        setTimeout(() => reasonEl.focus(), 100);
    });
}

function templateHtml({ subjectType, subjectName, fromStance, toStance }) {
    const from = STANCE_META[fromStance] || STANCE_META.neutral;
    const to   = STANCE_META[toStance]   || STANCE_META.neutral;
    const subjectLabel = subjectType === 'org' ? '조직' : '사람';
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    return `
        <div class="stance-gate-modal">
            <div class="stance-gate-header">
                <span style="font-size:20px">🙏</span>
                <h3>잠깐, 30초만 같이 머물러요</h3>
            </div>
            <div class="stance-gate-body">
                <p>이 ${escapeHtml(subjectLabel)}을(를) <b>${escapeHtml(to.label)}</b>로 옮기려 해요.<br>
                마음이 굳어지기 전에, 한 번 더 하나님 앞에 두는 시간이에요.</p>
                <div class="stance-gate-target">
                    <span class="stance-pill-mini" style="background:${from.color}1A;color:${from.color}">
                        ${from.icon} ${escapeHtml(from.label)}
                    </span>
                    <span class="stance-gate-target-arrow">→</span>
                    <span class="stance-pill-mini" style="background:${to.color}1A;color:${to.color}">
                        ${to.icon} ${escapeHtml(to.label)}
                    </span>
                    <span style="margin-left:auto; font-size:13px; color:var(--text-primary); font-weight:600;">
                        ${escapeHtml(subjectName || '(이름 없음)')}
                    </span>
                </div>
                <blockquote class="stance-gate-quote">${escapeHtml(quote)}</blockquote>
                <label style="font-size:12px; color:var(--text-secondary); font-weight:600; margin-top:4px;">
                    왜 이렇게 보고 있나요? (사실 vs 감정 분리해 보기)
                </label>
                <textarea class="stance-gate-reason"
                          placeholder="구체적인 사건 / 내 안에 일어난 감정 / 내가 모르는 그 사람의 사정도 있을 수 있다는 자각"></textarea>
                <div class="stance-gate-prayer-row">
                    <span class="stance-gate-prayer-bar">
                        <span class="stance-gate-prayer-fill" style="width:0%"></span>
                    </span>
                    <span class="stance-gate-prayer-label">${GATE_DURATION_SEC}초</span>
                </div>
            </div>
            <div class="stance-gate-footer">
                <button class="text-btn stance-gate-cancel-btn">지금은 그냥 둘게요</button>
                <button class="primary-btn stance-gate-confirm-btn" disabled>변경 확정</button>
            </div>
        </div>
    `;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
