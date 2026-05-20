/**
 * surveyPersist.js — 사전·사후 설문 답변을 Firestore feedbacks 결로 저장
 *
 * 2026-05-20 Phase 2 신규. 사용자 명시 "둘 다 피드백 관리에서 볼 수 있게 · 일반 CS처럼".
 *
 * 사전·사후 설문 폼 마치는 자리에서 호출 → users/{uid}/feedbacks/{id} 자리잡힘.
 * kind 분기로 피드백 관리 페이지의 사전·사후 탭에 자연 노출.
 * Cloud Function feedbackNotify 가 endedAt 자리 자리잡힌 후 자동 발화 → Swan 이메일·푸시.
 *
 * 답변 직렬화 결: 각 질문이 turn 2개(SWAN 질문 + 사용자 답변)로 자리잡힘 → 일반 CS 결.
 */

import { startFeedback, finalizeFeedback } from '../data/feedbacksRepo.js';
import { db, doc, updateDoc } from '../data/firebase.js';

/**
 * 설문 답변 → turns 배열 변환.
 *
 * 각 질문 1개당 2 turns:
 *   - { role: 'swan', text: 질문 카피 (AI 가공 자리잡힘 우선) }
 *   - { role: 'user', text: chip 선택 + 자유 텍스트 결합 }
 */
function buildTurns(questions, responses, aiQuestions) {
    const turns = [];
    const at = new Date().toISOString();

    for (const q of questions) {
        const stored = responses[q.id] || { chipBlocks: [], freeTextBlocks: [] };
        const swanText = (aiQuestions && aiQuestions[q.id]) || q.title;
        turns.push({ role: 'swan', text: swanText, at });

        const parts = [];

        (q.chipBlocks || []).forEach((block, idx) => {
            const sb = stored.chipBlocks[idx] || { selected: [], other: '' };
            const selected = (sb.selected || []).filter(c => c !== '__OTHER__');
            const labels = [];
            if (selected.length > 0) labels.push(...selected);
            if (sb.other && String(sb.other).trim()) labels.push(`기타: ${String(sb.other).trim()}`);
            if (labels.length > 0) {
                const hint = block.hint ? `[${block.hint}]\n` : '';
                parts.push(`${hint}${labels.join(' / ')}`);
            }
        });

        (q.freeTextBlocks || []).forEach((ft, idx) => {
            const val = String(stored.freeTextBlocks[idx] || '').trim();
            if (val) {
                const label = ft.label ? `(${ft.label})\n` : '';
                parts.push(`${label}${val}`);
            }
        });

        const userText = parts.length > 0 ? parts.join('\n\n') : '(답변 없음)';
        turns.push({ role: 'user', text: userText, at });
    }

    return turns;
}

/**
 * 답변 카운트 — 무엇이라도 자리잡힌 답변 자리.
 */
function countAnswered(questions, responses) {
    return questions.filter(q => {
        const stored = responses[q.id];
        if (!stored) return false;
        const hasChip = (stored.chipBlocks || []).some(sb =>
            (sb.selected || []).filter(c => c !== '__OTHER__').length > 0 ||
            (sb.other && String(sb.other).trim())
        );
        const hasText = (stored.freeTextBlocks || []).some(t => String(t || '').trim());
        return hasChip || hasText;
    }).length;
}

/**
 * 설문 답변 Firestore 자리잡기.
 *
 * @param {Object} args
 *   - userId: string
 *   - nickname: string
 *   - kind: 'preSurvey' | 'postSurvey'
 *   - questions: Array - QUESTIONS 카탈로그
 *   - responses: Object - _state.responses
 *   - aiQuestions: Object|null - AI 가공 질문 캐시 (있으면 사용)
 *   - context: { screenPath, moduleName, viewport, userAgent }
 * @returns {Promise<{ feedbackId: string }>}
 */
export async function persistSurveyResponses({
    userId, nickname, kind, questions, responses, aiQuestions, context,
}) {
    if (!userId) throw new Error('persistSurveyResponses: userId 자리 X');
    if (!questions || questions.length === 0) {
        throw new Error('persistSurveyResponses: questions 자리 X');
    }

    const turns = buildTurns(questions, responses, aiQuestions);
    const opening = turns.length > 0 ? turns[0] : null;

    const kindLabel = kind === 'preSurvey' ? '사전 설문' : '사후 설문';
    const totalQ = questions.length;
    const answeredCount = countAnswered(questions, responses);

    const feedbackId = await startFeedback({
        userId,
        nickname: nickname || '',
        context: context || {},
        openingTurn: opening,
        kind,
    });

    // 한 번의 updateDoc 으로 전체 turns 자리잡기 (성능·비용 자리)
    const ref = doc(db, 'users', userId, 'feedbacks', feedbackId);
    await updateDoc(ref, { turns });

    await finalizeFeedback(userId, feedbackId, {
        endReason: 'manual_send',
        summary: `${kindLabel} ${answeredCount}/${totalQ} 답변 자리잡힘`,
        category: 'other',
        categoryConfidence: 1,
    });

    return { feedbackId };
}

/**
 * context 자동 자리잡기 — preSurveyForm·postSurveyForm 양쪽에서 같은 결.
 */
export function buildSurveyContext(kind) {
    const screenPath = (typeof location !== 'undefined') ? location.pathname + location.search : '';
    return {
        screenPath: kind === 'preSurvey' ? '/preSurvey' : '/postSurvey',
        moduleName: kind === 'preSurvey' ? 'preSurveyForm' : 'postSurveyForm',
        viewport: (typeof window !== 'undefined') ? `${window.innerWidth}x${window.innerHeight}` : '',
        userAgent: (typeof navigator !== 'undefined') ? (navigator.userAgent || '').slice(0, 200) : '',
        consoleErrors: [],
    };
}
