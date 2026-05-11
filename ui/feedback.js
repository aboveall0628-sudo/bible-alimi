/**
 * feedback.js — 저장/삭제 등 비동기 액션의 사용자 피드백을 통일.
 *
 * 정책: try/catch 안에서 console.error 만 찍고 토스트 없이 끝내는 패턴을
 * 한 곳에 묶어, 실패 시 항상 토스트가 뜨도록 한다.
 *
 * 사용:
 *   const { ok, result } = await withFeedback(
 *       () => savePerson(...),
 *       { success: '저장됐어요', error: '저장이 잘 안 됐어요' }
 *   );
 *   if (!ok) return;
 *
 * 또는 silent 옵션으로 성공 토스트만 끄고 실패 토스트는 유지:
 *   await withFeedback(() => fetchStats(...), { silent: true });
 */

import { showToast } from './quickReview.js';

/**
 * 비동기 함수를 실행하고, 성공/실패 시 토스트로 피드백.
 *
 * @param {() => Promise<any>} asyncFn - 실행할 비동기 함수 (zero-arg)
 * @param {Object} [opts]
 * @param {string|false} [opts.success='저장됐어요'] - 성공 토스트. false 면 토스트 안 띄움.
 * @param {string} [opts.error='저장이 잘 안 됐어요. 한 번만 더 시도해 주실래요?'] - 실패 토스트.
 * @param {boolean} [opts.silent=false] - 성공 토스트 끄기 (실패 토스트는 유지).
 * @param {string} [opts.tag] - console 로그용 라벨.
 * @returns {Promise<{ok: boolean, result?: any, error?: Error}>}
 */
export async function withFeedback(asyncFn, opts = {}) {
    const {
        success = '저장됐어요',
        error = '저장이 잘 안 됐어요. 한 번만 더 시도해 주실래요?',
        silent = false,
        tag = 'feedback',
    } = opts;

    try {
        const result = await asyncFn();
        if (!silent && success !== false) showToast(success);
        return { ok: true, result };
    } catch (e) {
        console.error(`[${tag}]`, e);
        if (error) showToast(error);
        return { ok: false, error: e };
    }
}

/**
 * 정보성 토스트만 — 동기적 액션 후에 사용.
 */
export function feedback(msg) {
    if (msg) showToast(msg);
}
