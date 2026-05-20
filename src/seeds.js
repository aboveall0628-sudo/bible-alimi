/**
 * seeds.js — 시드 데이터 자동 생성
 *
 * 최초 가입 시 기본 데이터 주입:
 * - 핀 원칙 1개 (영적 톤)
 * - 기본 라벨 5축 (영적상태/에너지/환경/인지/관계)
 * - 샘플 목표 트리 (선택 — 거부 가능)
 *
 * 사용자별로 docId가 분리되어 다른 사용자와 충돌 안 함.
 */

import { db, doc, setDoc, getDoc, serverTimestamp } from './data/firebase.js';
import { prepareDocument } from './crypto/cryptoService.js';
import { saveGoal } from './data/goalsRepo.js';

/**
 * 기본 라벨 체계 (5축) — 영적·중립적 단어 위주
 */
const DEFAULT_LABELS = {
    spiritual:    ['평안', '조급', '무기력', '회개'],
    energy:       ['좋음', '저하', '번아웃'],
    environment:  ['혼자', '협업', '외부 방해'],
    cognitive:    ['집중', '산만', '명확', '혼란'],
    relationship: ['긍정', '갈등', '회복'],
};

/**
 * 기본 핀 원칙
 */
const DEFAULT_PRINCIPLE = {
    title: '말씀으로 방향 점검, 선택 전 하나님께 묻고 응답 기다리기',
    body: '모든 일정, 계획, 결정 전에 잠시 멈추고 하나님의 뜻을 구해요.\n급한 마음에 휩쓸리지 않고, 기도 후에 평안이 오는 방향으로 움직여요.',
    category: 'spiritual',
    pinned: true,
    active: true,
};

/**
 * 샘플 목표 트리 (사용자가 거부 가능)
 * id는 user별로 만들어 충돌 회피
 */
function buildSampleGoals(userId) {
    const uid = userId.slice(0, 12);
    return [
        {
            id: `goal_seed_${uid}_10y`,
            period: '10year',
            title: '하나님과 동행하는 삶의 기반 세우기',
            description: '말씀, 기도, 나눔이 자연스러운 일상이 되는 삶',
            parentGoalId: null,
        },
        {
            id: `goal_seed_${uid}_yearly`,
            period: 'yearly',
            title: '매일 한 줄 묵상 이어가기',
            description: '한 줄도 좋아요. 매일 말씀에 마음을 두는 한 해',
            parentGoalId: `goal_seed_${uid}_10y`,
        },
        {
            id: `goal_seed_${uid}_quarterly`,
            period: 'quarterly',
            title: '통독 파트1 완독',
            description: '시가서(욥기 ~ 아가) 전체 통독',
            parentGoalId: `goal_seed_${uid}_yearly`,
        },
        {
            id: `goal_seed_${uid}_weekly`,
            period: 'weekly',
            title: '이번 주 묵상 5일 이상',
            description: '주중 5일 이상 아침 묵상 시간 확보',
            parentGoalId: `goal_seed_${uid}_quarterly`,
        },
    ];
}

/**
 * 시드 데이터 초기화
 * @param {CryptoKey} dek
 * @param {string} userId
 * @param {Object} opts { includeSampleGoals=true }
 */
export async function initializeSeedData(dek, userId, opts = {}) {
    const { includeSampleGoals = true } = opts;

    // 1) 라벨 5축 (settings/{userId})
    const settingsRef = doc(db, 'settings', userId);
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
            userId,
            labels: DEFAULT_LABELS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    // 2) 기본 핀 원칙 (한 번만)
    const principleId = `principle_seed_${userId.slice(0, 12)}`;
    const principleRef = doc(db, 'principles', principleId);
    const principleSnap = await getDoc(principleRef);
    if (!principleSnap.exists()) {
        const meta = {
            id: principleId,
            userId,
            category: DEFAULT_PRINCIPLE.category,
            pinned: DEFAULT_PRINCIPLE.pinned,
            active: DEFAULT_PRINCIPLE.active,
            createdAt: serverTimestamp(),
        };
        const sensitive = {
            title: DEFAULT_PRINCIPLE.title,
            body: DEFAULT_PRINCIPLE.body,
            triggerKeywords: ['결정', '선택', '계획', '방향'],
        };
        const document = await prepareDocument(dek, meta, sensitive);
        await setDoc(principleRef, document);
    }

    // 3) 샘플 목표 (사용자가 원할 때만)
    // saveGoal 경유 — 자동 v1 GoalVersion 박힘 (워크플로우 트랙 2026-05-13).
    if (includeSampleGoals) {
        for (const goal of buildSampleGoals(userId)) {
            const goalRef = doc(db, 'goals', goal.id);
            const goalSnap = await getDoc(goalRef);
            if (!goalSnap.exists()) {
                await saveGoal(dek, {
                    id: goal.id,
                    userId,
                    period: goal.period,
                    parentGoalId: goal.parentGoalId,
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: '',
                    status: 'active',
                    progress: 0,
                    title: goal.title,
                    description: goal.description,
                    source: 'self_report'
                });
            }
        }
    }
}

export { DEFAULT_LABELS, DEFAULT_PRINCIPLE, buildSampleGoals };
