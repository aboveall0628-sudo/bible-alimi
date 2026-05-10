/**
 * seeds.js — 시드 데이터 자동 생성
 *
 * 최초 가입 시 기본 데이터 주입:
 * - 핀 원칙 1개
 * - 기본 라벨 5축 각 3~4개
 * - 샘플 목표 트리 1세트
 */

import { db, doc, setDoc, getDoc, serverTimestamp } from './data/firebase.js';
import { prepareDocument } from './crypto/cryptoService.js';

/**
 * 기본 라벨 체계 (5축)
 */
const DEFAULT_LABELS = {
    spiritual: ['평안함', '감사함', '메마름', '갈등함'],
    energy: ['활력', '보통', '피로', '소진'],
    environment: ['조용함', '분주함', '쾌적함'],
    cognitive: ['집중', '산만', '창의적', '루틴적'],
    relationship: ['연결됨', '단절됨', '갈등'],
};

/**
 * 기본 핀 원칙
 */
const DEFAULT_PRINCIPLE = {
    title: '말씀으로 방향 점검, 선택 전 하나님께 묻고 응답 기다리기',
    body: '모든 일정, 계획, 결정 전에 잠시 멈추고 하나님의 뜻을 구합니다. 급한 마음에 휩쓸리지 않고, 기도 후에 평안이 오는 방향으로 움직입니다.',
    category: 'spiritual',
    pinned: true,
    active: true,
};

/**
 * 샘플 목표 트리
 */
const SAMPLE_GOALS = [
    {
        id: 'goal_seed_10y',
        period: '10year',
        title: '하나님과 동행하는 삶의 기반을 세우기',
        description: '말씀, 기도, 나눔이 자연스러운 일상이 되는 삶',
        parentGoalId: null,
    },
    {
        id: 'goal_seed_yearly',
        period: 'yearly',
        title: '매일 묵상 습관 정착',
        description: '하루도 빠짐없이 말씀을 묵상하고 기록하는 한 해',
        parentGoalId: 'goal_seed_10y',
    },
    {
        id: 'goal_seed_quarterly',
        period: 'quarterly',
        title: '통독 파트1 완독',
        description: '시가서(욥기~아가) 전체 통독',
        parentGoalId: 'goal_seed_yearly',
    },
    {
        id: 'goal_seed_weekly',
        period: 'weekly',
        title: '이번 주 묵상 5일 이상',
        description: '주중 5일 이상 아침 묵상 시간 확보',
        parentGoalId: 'goal_seed_quarterly',
    },
];

/**
 * 시드 데이터 초기화
 * @param {CryptoKey} dek
 * @param {string} userId
 */
export async function initializeSeedData(dek, userId) {
    // 1. 설정(라벨) 저장
    const settingsRef = doc(db, 'settings', userId);
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
            labels: DEFAULT_LABELS,
            updatedAt: serverTimestamp(),
        });
    }

    // 2. 기본 원칙 저장
    const principleId = `principle_seed_${userId.slice(0, 8)}`;
    const principleRef = doc(db, 'principles', principleId);
    const principleSnap = await getDoc(principleRef);
    if (!principleSnap.exists()) {
        const meta = {
            id: principleId,
            userId,
            category: DEFAULT_PRINCIPLE.category,
            pinned: DEFAULT_PRINCIPLE.pinned,
            active: DEFAULT_PRINCIPLE.active,
            derivedFromDotIds: [],
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

    // 3. 샘플 목표 저장
    for (const goal of SAMPLE_GOALS) {
        const goalRef = doc(db, 'goals', goal.id);
        const goalSnap = await getDoc(goalRef);
        if (!goalSnap.exists()) {
            const meta = {
                id: goal.id,
                userId,
                period: goal.period,
                parentGoalId: goal.parentGoalId,
                startDate: new Date().toISOString().split('T')[0],
                endDate: '2036-12-31',
                status: 'active',
                progress: 0,
                createdAt: serverTimestamp(),
            };
            const sensitive = {
                title: goal.title,
                description: goal.description,
                notes: '',
                scriptureRef: null,
            };
            const doc_ = await prepareDocument(dek, meta, sensitive);
            await setDoc(goalRef, doc_);
        }
    }
}

export { DEFAULT_LABELS, DEFAULT_PRINCIPLE, SAMPLE_GOALS };
