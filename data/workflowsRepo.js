/**
 * workflowsRepo.js — 워크플로우 CRUD (자동 암복호화)
 *
 * 워크플로우 = 목표를 도트로 분해하는 다리.
 * 한 목표(보통 yearly/quarterly/weekly 수준)에 여러 워크플로우가 붙을 수 있다.
 *
 * 정책 (목표_워크플로우_일일의식_기획서.md §4):
 * - 합작 형식: 사용자 초안 + AI 제안. source 로 어느 쪽 초안인지 박힘.
 * - 자동 도트 분배 없음: 매일 일일 의식에서 사용자가 직접 step → timeSlot 배치.
 * - revisionLog 누적: 워크플로우 수정 이력 보존.
 *
 * 데이터 모델:
 * Workflow {
 *   id, userId, parentGoalId, goalVersionAtCreate,
 *   status: 'active' | 'archived',
 *   source: 'self_report' | 'ai_inferred',
 *   title, steps: [Step], generatedByDecision, revisionLog,
 *   createdAt, updatedAt
 * }
 * Step {
 *   id, order, title, estimatedDots,
 *   executor: 'self' | 'helper' | 'external',
 *   status: 'pending' | 'in_progress' | 'done' | 'abandoned',
 *   linkedDotIds: string[]
 * }
 */

import { db, doc, deleteDoc, collection, query, where } from './firebase.js';
import { saveRecord, getRecord, queryRecords } from './baseRepo.js';

const PATH = 'workflows';

/**
 * 새 스텝 객체 빌더 — id/order/status/linkedDotIds 기본값 박힘.
 */
export function buildStep({ title, estimatedDots = 1, executor = 'self', order = 0 }) {
    return {
        id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        order,
        title: title || '',
        estimatedDots,
        executor,
        status: 'pending',
        linkedDotIds: []
    };
}

/**
 * 저장 (신규/수정).
 * id 없으면 baseRepo 가 자동 생성. updatedAt 박힘.
 */
export async function saveWorkflow(dek, workflow) {
    if (!workflow.status) workflow.status = 'active';
    if (!workflow.source) workflow.source = 'self_report';
    if (!Array.isArray(workflow.steps)) workflow.steps = [];
    if (!Array.isArray(workflow.revisionLog)) workflow.revisionLog = [];
    return await saveRecord(dek, PATH, workflow, workflow.id || null);
}

/**
 * 단건 조회
 */
export async function getWorkflow(dek, id) {
    return await getRecord(dek, PATH, id);
}

/**
 * 사용자의 모든 워크플로우.
 * composite index 회피 — userId 단일 쿼리.
 */
export async function getAllWorkflows(dek, userId) {
    const q = query(
        collection(db, PATH),
        where('userId', '==', userId)
    );
    return await queryRecords(dek, q);
}

/**
 * 활성 워크플로우만 (status === 'active').
 * 일일 의식 화면 좌패널에 노출되는 목록.
 */
export async function getActiveWorkflows(dek, userId) {
    const all = await getAllWorkflows(dek, userId);
    return all
        .filter(w => w.status === 'active')
        .sort((a, b) => (b.updatedAt?.seconds || b.updatedAt || 0) - (a.updatedAt?.seconds || a.updatedAt || 0));
}

/**
 * 특정 목표에 붙은 워크플로우들 (parentGoalId 일치).
 * 평문이므로 Firestore 쿼리 가능.
 */
export async function getWorkflowsByGoal(dek, userId, goalId) {
    const q = query(
        collection(db, PATH),
        where('userId', '==', userId),
        where('parentGoalId', '==', goalId)
    );
    return await queryRecords(dek, q);
}

/**
 * 스텝 추가 — 워크플로우 수정 + revisionLog 박힘.
 */
export async function addStep(dek, workflow, stepInput) {
    const order = workflow.steps.length;
    const step = buildStep({ ...stepInput, order });
    workflow.steps = [...workflow.steps, step];
    workflow.revisionLog = [
        ...(workflow.revisionLog || []),
        { at: Date.now(), summary: `step 추가: ${step.title || '(제목 없음)'}` }
    ];
    await saveWorkflow(dek, workflow);
    return step;
}

/**
 * 스텝에 도트 연결 — 일일 의식에서 step → timeSlot 배치 시 호출.
 * 도트 측에는 linkedWorkflowStepId/goalVersionId 가 박혀 양방향 참조 완성.
 */
export async function linkDotToStep(dek, workflow, stepId, dotId) {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);
    if (!step.linkedDotIds.includes(dotId)) {
        step.linkedDotIds = [...step.linkedDotIds, dotId];
        if (step.status === 'pending') step.status = 'in_progress';
        await saveWorkflow(dek, workflow);
    }
    return step;
}

/**
 * 워크플로우 archive — 완료/포기 시.
 * 삭제하지 않고 status 만 바꿈 (시점 스냅샷 보존, 회고 가능성).
 */
export async function archiveWorkflow(dek, workflow, reason = '') {
    workflow.status = 'archived';
    workflow.revisionLog = [
        ...(workflow.revisionLog || []),
        { at: Date.now(), summary: `archived${reason ? `: ${reason}` : ''}` }
    ];
    return await saveWorkflow(dek, workflow);
}

/**
 * 완전 삭제 — 사용 신중. 추모비(ExtinguishedGoalMemorial) 미구현 단계에선
 * archiveWorkflow 권장.
 */
export async function deleteWorkflow(id) {
    await deleteDoc(doc(db, PATH, id));
}
