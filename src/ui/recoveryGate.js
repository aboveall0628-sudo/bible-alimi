/**
 * recoveryGate.js — 회복의 자리 모달 (B-5 트랙 Phase 1 알 단계, 2026-05-14)
 *
 * 🕊️ 가이드 별 (사용자 명시):
 *   "양치기 소년 = 정죄 X / 회복으로 이끄는 게임 ✓"
 *   "무조건 귀여워야 함, 아무런 해 끼치지 않게"
 *   "디지소울 = 매개체 (예수를 대체 X, 바라보게 함)"
 *   "신뢰·회개는 스스로 — 시스템은 다시 말씀 앞으로 데려오기만"
 *
 * 사용:
 *   openRecoveryGate({ userId, patternResult?, source?, onSaved? })
 *     - patternResult: detectBrokenPromisePattern() 결과 (linkedDotIds 등)
 *     - 없으면 사용자가 그냥 들어온 자리 (자기 인식 메모만)
 *
 * 톤 분기:
 *   - cute: "🐣 우리 다시 한번 같이 봐볼래요?" (귀여운 캐릭터 톤, 디지소울 모드)
 *   - calm: "이 패턴이 보여요. 잠깐 같이 머무를래요?" (차분한 묵상 톤)
 *   - off:  자동 노출 안 함 (이 모달 자체는 사용자 수동 호출만)
 *
 * 박지 말 것:
 *   - "N회 어겼어요" 카운터 표시
 *   - "신뢰도 -5" 같은 점수
 *   - 강제 닫기 차단
 *   - 정죄 톤
 */

import { getDEK } from './lockScreen.js';
import { showToast } from './quickReview.js';
import { openModal } from './modalManager.js';
import { saveRecoveryMemo, normalizeRecoveryTone } from '../data/recoveryMemosRepo.js';
import { getDot } from '../data/dotsRepo.js';
import { db, doc, getDoc } from '../data/firebase.js';

const OVERLAY_ID = 'recovery-gate-overlay';

// 톤별 카피
const COPY = {
    cute: {
        title: '🐣 잠깐 같이 봐볼래요?',
        intro: '무거우면 안 해도 돼요. 그냥 오늘 마음에 머무는 게 있으면 한 줄.',
        placeholder: '오늘 마음에 머무는 거... 작게 적어 봐요',
        prayerLabel: '🙏 같이 기도하고 싶은 거 (선택)',
        prayerPh: '주님께 솔직하게... (저만 봐요)',
        save: '✓ 마음 박기',
        skip: '다음에 할게요',
        meditate: '📖 묵상으로 가기',
        toast: '🐣 우리 마음 함께 박혔어요'
    },
    calm: {
        title: '🕊️ 회복의 자리',
        intro: '이 패턴이 마음에 들어옵니다. 잠깐 같이 머무를래요?',
        placeholder: '지금 마음을 풀어 적어 봅니다...',
        prayerLabel: '🙏 기도로 가져가고 싶은 것 (선택)',
        prayerPh: '주님 앞에 정직하게...',
        save: '저장',
        skip: '다음에',
        meditate: '📖 묵상으로',
        toast: '🕊️ 회복의 자리에 박혔어요'
    }
};

export async function openRecoveryGate(opts = {}) {
    const { userId, patternResult = null, source = 'user_initiated', onSaved, overrideTone = null } = opts;
    if (!userId) { showToast('사용자 정보가 없어요.'); return; }
    const dek = getDEK();
    if (!dek) { showToast('잠겨 있어요. 비밀번호로 먼저 열어 주실래요?'); return; }

    // 톤 모드 읽기 — (Phase 1.c) overrideTone 있으면 우선 (알람 시점 톤 유지)
    let tone = 'calm';
    if (overrideTone) {
        tone = normalizeRecoveryTone(overrideTone);
    } else {
        try {
            const ref = doc(db, 'users', userId, 'settings', 'spiritualLock');
            const snap = await getDoc(ref);
            const raw = snap.exists() ? (snap.data()?.recoveryTone || null) : null;
            tone = normalizeRecoveryTone(raw);
        } catch (e) {
            tone = 'calm';
        }
    }
    if (tone === 'off' && source !== 'user_initiated') {
        // off 모드 + 자동 트리거면 모달 자체 X
        // 단, 사용자가 직접 누른 거면 그래도 열어줌
        return;
    }
    const effectiveTone = (tone === 'off') ? 'calm' : tone;
    const copy = COPY[effectiveTone];

    // (Phase 1.c 2026-05-15) patternResult.linkedDotIds 있으면 도트 메타 미리 가져와 모달에 표시
    //   "어떤 어김이 보였는지" 사용자가 직접 보고 자기 인식 메모 적기 쉽게.
    //   영적 안전장치: plannedTask·actualTask 본문 그대로는 안 보여줌. *날짜·시각 메타*만 노출.
    //   본문이 궁금하면 도트 자체로 이동하면 보임.
    let linkedDotMeta = [];
    if (patternResult?.linkedDotIds && patternResult.linkedDotIds.length > 0) {
        const ids = patternResult.linkedDotIds.slice(0, 5); // 최대 5개만
        try {
            const dots = await Promise.all(ids.map(id => getDot(dek, id).catch(() => null)));
            linkedDotMeta = dots.filter(Boolean).map(d => ({
                id: d.id,
                date: d.date,
                timeSlot: d.timeSlot,
                executed: d.executed,
            }));
        } catch (e) {
            console.warn('[recoveryGate] 도트 메타 로드 실패:', e?.message || e);
        }
    }

    // (Phase 1.c) 연관 도트 메타 영역 — 날짜·슬롯·상태만 (본문 X, 영적 안전장치)
    const linkedDotsHtml = linkedDotMeta.length > 0 ? `
        <div class="recovery-row recovery-linked-dots">
            <label>${effectiveTone === 'cute' ? '🐤 보인 자리들' : '🕯️ 마음에 머무는 자리들'}</label>
            <ul class="recovery-dots-list">
                ${linkedDotMeta.map(d => {
                    const slotLabel = d.timeSlot != null ? slotToTime(d.timeSlot) : '';
                    const stateLabel = (d.executed === 'skipped') ? '건너뜀'
                                     : (d.executed === 'replaced') ? '다른 일'
                                     : '계획과 다름';
                    return `<li><span class="recovery-dot-date">${escapeHtml(d.date || '')}</span> <span class="recovery-dot-slot">${escapeHtml(slotLabel)}</span> <span class="recovery-dot-state">${escapeHtml(stateLabel)}</span></li>`;
                }).join('')}
            </ul>
            <p class="recovery-dots-note">${effectiveTone === 'cute'
                ? '괜찮아요. 누구나 그래요. 그냥 마음을 한 번 들여다보면 돼요.'
                : '평가가 아닌 거울이에요. 무엇이 있었는지 잠깐 머무릅니다.'}</p>
        </div>
    ` : '';

    const overlay = ensureOverlay();
    overlay.innerHTML = `
        <div class="modal-card recovery-gate-card recovery-${effectiveTone}">
            <header class="modal-head">
                <h3>${copy.title}</h3>
                <button class="modal-close" aria-label="닫기">×</button>
            </header>
            <div class="modal-body">
                <p class="recovery-intro">${copy.intro}</p>
                ${linkedDotsHtml}
                <div class="recovery-row">
                    <textarea id="recovery-content" placeholder="${copy.placeholder}" rows="4" maxlength="800"></textarea>
                </div>
                <div class="recovery-row">
                    <label>${copy.prayerLabel}</label>
                    <textarea id="recovery-prayer" placeholder="${copy.prayerPh}" rows="3" maxlength="500"></textarea>
                </div>
            </div>
            <footer class="modal-foot">
                <button id="recovery-meditate" class="text-btn">${copy.meditate}</button>
                <span style="flex:1"></span>
                <button class="modal-cancel text-btn">${copy.skip}</button>
                <button id="recovery-save" class="primary-btn">${copy.save}</button>
            </footer>
        </div>
    `;

    const handle = openModal({ overlay, initialFocus: '#recovery-content', label: 'recovery-gate' });
    overlay.querySelector('.modal-close')?.addEventListener('click', () => handle.close());
    overlay.querySelector('.modal-cancel')?.addEventListener('click', () => handle.close());

    // 묵상으로 가기 — 묵상 화면으로 점프
    overlay.querySelector('#recovery-meditate')?.addEventListener('click', () => {
        handle.close();
        try {
            window.location.hash = '#view-today';
        } catch {}
    });

    // 저장
    overlay.querySelector('#recovery-save')?.addEventListener('click', async () => {
        const content = (overlay.querySelector('#recovery-content')?.value || '').trim();
        const prayerNote = (overlay.querySelector('#recovery-prayer')?.value || '').trim();
        if (!content && !prayerNote) {
            // 둘 다 비면 그냥 닫기 (강제 X)
            handle.close();
            return;
        }
        try {
            const data = {
                userId,
                tone: effectiveTone,
                source,
                content: content || null,
                prayerNote: prayerNote || null,
                patternKey: patternResult?.patternKey || null,
                linkedDotIds: patternResult?.linkedDotIds || []
            };
            const id = await saveRecoveryMemo(dek, userId, data);
            showToast(copy.toast);
            handle.close();
            // (Phase 1.c 2026-05-15) 디지소울 hook 페이로드 확장 —
            //   캐릭터 진화 신호: source(어디서 왔는지)·패턴 메타·기도 여부.
            //   디지소울 저장소가 listen 해서 알 → 진화 / 회복 메모 → 경험치 매핑 가능.
            //   영적 안전장치: content·prayerNote 본문은 절대 안 보냄 (메타만).
            try {
                window.postMessage({
                    type: 'sanctum:recovery-memo-saved',
                    payload: {
                        id,
                        tone: effectiveTone,
                        source,
                        patternKey: patternResult?.patternKey || null,
                        linkedDotCount: linkedDotMeta.length,
                        hadContent: !!content,
                        hadPrayer: !!prayerNote,
                        savedAt: new Date().toISOString(),
                    }
                }, '*');
            } catch {}
            if (typeof onSaved === 'function') onSaved({ id, ...data });
        } catch (e) {
            console.error('[recoveryGate] save failed:', e);
            showToast('저장이 잠깐 막혔어요.');
        }
    });
}

function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.className = 'modal-overlay hidden';
    document.body.appendChild(el);
    return el;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// (Phase 1.c) 슬롯 번호 → 'HH:MM' (15분 단위 슬롯)
function slotToTime(slot) {
    if (slot == null || isNaN(slot)) return '';
    const totalMin = slot * 15;
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
