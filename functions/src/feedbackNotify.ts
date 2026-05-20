/**
 * feedbackNotify.ts — 사용자 피드백 도착 알림 (이메일 + FCM 푸시)
 *
 * 2026-05-20 신규. Phase 1 (1차 베타 직전).
 *
 * 트리거: users/{userId}/feedbacks/{feedbackId} 도큐먼트 update.
 *   finalize 완료(endedAt null → 값) 자리에서만 발화.
 *   summary·category 자리잡힌 후 발송해야 알림 가치가 자리잡혀요.
 *
 * 발송 결:
 *   1. 이메일 → aboveall0628@gmail.com (Nodemailer + Gmail SMTP)
 *   2. FCM 푸시 → adminTokens/{SWAN_UID}/tokens/* 모든 토큰 대상
 *
 * 외부 시크릿: GMAIL_USER, GMAIL_APP_PASSWORD (emailRecovery.ts 자리 재활용)
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const SWAN_ADMIN_UID = "Zb3FjbyIboUr5hXsfms9v5AreTd2";
const NOTIFY_EMAIL = "aboveall0628@gmail.com";

if (admin.apps.length === 0) {
    admin.initializeApp();
}

function getDb(): admin.firestore.Firestore {
    return admin.firestore();
}

const KIND_LABEL: Record<string, string> = {
    feedback: '피드백',
    preSurvey: '사전 설문',
    postSurvey: '사후 설문',
};

const CATEGORY_LABEL: Record<string, string> = {
    error: '🐛 에러',
    ux_ui: '🎨 UX/UI',
    feature_request: '💡 기능 요청',
    other: '📝 기타',
};

function createMailTransporter(): nodemailer.Transporter {
    const user = GMAIL_USER.value();
    const pass = GMAIL_APP_PASSWORD.value();
    if (!user || !pass) {
        throw new Error("메일 발송 자격이 설정되지 않았어요.");
    }
    return nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
    });
}

function escapeHtml(s: string): string {
    return (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function sendEmail(payload: {
    userId: string;
    nickname: string;
    kind: string;
    category: string;
    summary: string;
    turns: { role: string; text: string }[];
    screenPath: string;
    endReason: string;
}) {
    const transporter = createMailTransporter();
    const from = GMAIL_USER.value();

    const kindLabel = KIND_LABEL[payload.kind] || '피드백';
    const categoryLabel = CATEGORY_LABEL[payload.category] || '📝 기타';
    const subject = `[Sanctum OS] 새 ${kindLabel} — ${categoryLabel}`;

    const turnsHtml = (payload.turns || [])
        .map(t => `<div style="margin:6px 0;padding:8px 12px;background:${t.role === 'user' ? '#f0f4ec' : '#fafafa'};border-radius:6px;"><b style="color:${t.role === 'user' ? '#7C8B6F' : '#888'};">${t.role === 'user' ? '사용자' : 'SWAN'}:</b><br/>${escapeHtml(t.text || '').replace(/\n/g, '<br>')}</div>`)
        .join('');

    const text = [
        `새 ${kindLabel} 도착했어요.`,
        '',
        `종류: ${kindLabel}`,
        `분류: ${categoryLabel}`,
        `사용자: ${payload.nickname || '익명'} (${payload.userId.slice(0, 8)}...)`,
        `화면: ${payload.screenPath || '-'}`,
        `종료 이유: ${payload.endReason || '-'}`,
        '',
        `요약:`,
        payload.summary || '(자동 요약 없음)',
        '',
        `관리자 페이지 → https://sanctumos.kr`,
    ].join('\n');

    const html = `
        <div style="font-family:'Pretendard',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#333;">
            <h2 style="color:#7C8B6F;margin:0 0 16px;">새 ${kindLabel} 도착</h2>
            <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px;">
                <tr><td style="padding:4px 8px;color:#666;width:80px;">종류</td><td style="padding:4px 8px;">${kindLabel}</td></tr>
                <tr><td style="padding:4px 8px;color:#666;">분류</td><td style="padding:4px 8px;">${categoryLabel}</td></tr>
                <tr><td style="padding:4px 8px;color:#666;">사용자</td><td style="padding:4px 8px;">${escapeHtml(payload.nickname || '익명')} (${payload.userId.slice(0, 8)}...)</td></tr>
                <tr><td style="padding:4px 8px;color:#666;">화면</td><td style="padding:4px 8px;">${escapeHtml(payload.screenPath || '-')}</td></tr>
                <tr><td style="padding:4px 8px;color:#666;">종료</td><td style="padding:4px 8px;">${escapeHtml(payload.endReason || '-')}</td></tr>
            </table>
            <h3 style="margin:24px 0 8px;color:#333;font-size:15px;">요약</h3>
            <div style="background:#f5f3ef;padding:14px;border-radius:6px;font-size:14px;line-height:1.6;">
                ${escapeHtml(payload.summary || '(자동 요약 없음)').replace(/\n/g, '<br>')}
            </div>
            <h3 style="margin:24px 0 8px;color:#333;font-size:15px;">전체 대화</h3>
            <div style="font-size:13px;line-height:1.6;">
                ${turnsHtml || '<i style="color:#999;">대화 없음</i>'}
            </div>
            <p style="margin-top:32px;font-size:13px;">
                <a href="https://sanctumos.kr" style="color:#7C8B6F;text-decoration:none;border-bottom:1px solid #7C8B6F;">관리자 페이지 열기 →</a>
            </p>
        </div>
    `;

    await transporter.sendMail({ from, to: NOTIFY_EMAIL, subject, text, html });
    logger.info('[feedbackNotify] email sent', { kind: payload.kind, category: payload.category });
}

async function sendPush(payload: {
    nickname: string;
    kind: string;
    category: string;
    summary: string;
    feedbackId: string;
    userId: string;
}) {
    const db = getDb();
    const tokensSnap = await db
        .collection('adminTokens')
        .doc(SWAN_ADMIN_UID)
        .collection('tokens')
        .get();

    if (tokensSnap.empty) {
        logger.warn('[feedbackNotify] no FCM tokens registered for SWAN_ADMIN');
        return;
    }

    const tokens = tokensSnap.docs
        .map(d => d.data().token as string)
        .filter(Boolean);
    if (tokens.length === 0) return;

    const kindLabel = KIND_LABEL[payload.kind] || '피드백';
    const categoryLabel = CATEGORY_LABEL[payload.category] || '📝 기타';
    const title = `새 ${kindLabel}`;
    const bodyRaw = `${categoryLabel} · ${payload.summary || payload.nickname || '익명'}`;
    const body = bodyRaw.length > 140 ? bodyRaw.slice(0, 140) + '...' : bodyRaw;

    const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: { title, body },
        webpush: {
            notification: {
                icon: '/assets/favicon-32.png',
                badge: '/assets/favicon-16.png',
            },
            fcmOptions: { link: 'https://sanctumos.kr/?view=feedback-admin' },
        },
        data: {
            kind: payload.kind,
            category: payload.category,
            feedbackId: payload.feedbackId,
            userId: payload.userId,
        },
    };

    const result = await admin.messaging().sendEachForMulticast(message);
    logger.info('[feedbackNotify] push sent', {
        success: result.successCount,
        failure: result.failureCount,
    });

    if (result.failureCount > 0) {
        const batch = db.batch();
        let deleted = 0;
        result.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code || '';
                if (code.includes('registration-token-not-registered') ||
                    code.includes('invalid-argument') ||
                    code.includes('mismatched-credential')) {
                    batch.delete(tokensSnap.docs[idx].ref);
                    deleted += 1;
                }
            }
        });
        if (deleted > 0) {
            await batch.commit().catch(e => logger.warn('[feedbackNotify] batch delete failed', e));
            logger.info('[feedbackNotify] removed stale tokens', { count: deleted });
        }
    }
}

export const onFeedbackFinalized = onDocumentUpdated(
    {
        document: 'users/{userId}/feedbacks/{feedbackId}',
        secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
        region: 'us-central1',
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        if (!before || !after) return;

        if (before.endedAt != null) return;
        if (after.endedAt == null) return;
        if (after.deletedAt != null) return;

        const payload = {
            userId: event.params.userId,
            feedbackId: event.params.feedbackId,
            nickname: after.nickname || '',
            kind: after.kind || 'feedback',
            category: after.category || 'other',
            summary: after.summary || '',
            turns: after.turns || [],
            screenPath: after.screenPath || '',
            endReason: after.endReason || '',
        };

        try {
            await sendEmail(payload);
        } catch (e: any) {
            logger.error('[feedbackNotify] email failed', { error: e?.message });
        }

        try {
            await sendPush({
                userId: payload.userId,
                feedbackId: payload.feedbackId,
                nickname: payload.nickname,
                kind: payload.kind,
                category: payload.category,
                summary: payload.summary,
            });
        } catch (e: any) {
            logger.error('[feedbackNotify] push failed', { error: e?.message });
        }
    }
);
