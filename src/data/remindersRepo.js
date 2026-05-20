/**
 * remindersRepo.js — 알람·메모 CRUD (Phase E-7)
 *
 * 컬렉션: 'reminders' (encryptionPolicy.js 에 정책 등록됨)
 *   - plaintext: id, userId, type, read, dueDate, targetView, createdAt, readAt
 *   - encrypted: title, body, targetParams
 *
 * type 종류
 *   - 'weekly-review'       — 토요일 주간 회고 자동 (yearWeek 단위 idempotent)
 *   - 'yesterday-unrated'   — 어제 미평가 도트 자동 (date 단위 idempotent)
 *   - 'stale-goal'          — 며칠 안 채워진 daily 목표 자동 (goalId 단위 idempotent)
 *   - 'principle-unused'    — 핀 원칙 미적용 자동 (principleId+yearWeek 단위 idempotent)
 *   - 'manual'              — 사용자가 직접 추가
 *
 * idempotent ID 규약 (자동 알람 — 사용자 'reminderGenerator' 함수가 ID 생성)
 *   `${userId}_${type}_${context}`
 *   수동은 `${timestamp}_manual_${rand}`
 */

import {
    db, doc, deleteDoc, collection, query, where, serverTimestamp,
} from './firebase.js';
import { saveRecord, getRecord, queryRecords } from './baseRepo.js';

const COLLECTION = 'reminders';

/**
 * 알람·메모 저장 (자동 알람은 호출 측에서 idempotent ID 채워서 호출)
 *
 * @param {CryptoKey} dek
 * @param {Object} data - { id, userId, type, title, body?, targetView?, targetParams?, dueDate? }
 * @returns {Promise<string>} id
 */
export async function saveReminder(dek, data) {
    const id = data.id || `${Date.now()}_manual_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
        id,
        userId:        data.userId,
        type:          data.type || 'manual',
        title:         data.title || '(제목 없음)',
        body:          data.body         ?? null,
        targetView:    data.targetView   ?? null,
        targetParams:  data.targetParams ?? null,
        read:          data.read         ?? false,
        readAt:        data.readAt       ?? null,
        dueDate:       data.dueDate      ?? null,
        createdAt:     data.createdAt    ?? serverTimestamp(),
    };
    await saveRecord(dek, COLLECTION, record, id);
    return id;
}

/**
 * 알람 단건 조회 — saveIfAbsent 같은 idempotent 체크에 사용.
 */
export async function getReminder(dek, id) {
    return getRecord(dek, COLLECTION, id);
}

/**
 * 자동 알람 idempotent 저장 — 같은 id 면 새로 만들지 않음.
 * read=true 인 경우에도 다시 만들지 않음 (사용자가 이미 처리한 알람을 되살리지 않기).
 */
export async function saveReminderIfAbsent(dek, data) {
    if (!data.id) throw new Error('saveReminderIfAbsent: data.id 필수');
    const existing = await getReminder(dek, data.id);
    if (existing) return { created: false, id: data.id };
    await saveReminder(dek, data);
    return { created: true, id: data.id };
}

/**
 * 사용자 알람 목록 조회 (createdAt desc).
 * orderBy + userId 조합이 composite index 요구 가능 — 일단 client sort 로 안전하게.
 */
export async function listReminders(dek, userId, limitCount = 50) {
    const q = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
    );
    const items = await queryRecords(dek, q);
    // createdAt 내림차순 정렬 (없으면 0 으로)
    items.sort((a, b) => {
        const aT = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bT = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bT - aT;
    });
    return items.slice(0, limitCount);
}

/**
 * 미읽음 카운트 — 종 아이콘 빨간 뱃지 용도.
 */
export async function countUnreadReminders(dek, userId) {
    const q = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        where('read', '==', false),
    );
    const items = await queryRecords(dek, q);
    return items.length;
}

/**
 * 읽음 처리.
 */
export async function markReminderRead(dek, reminderId) {
    const existing = await getReminder(dek, reminderId);
    if (!existing) return;
    existing.read = true;
    existing.readAt = serverTimestamp();
    await saveRecord(dek, COLLECTION, existing, reminderId);
}

/**
 * 삭제 (사용자가 명시적으로 제거).
 */
export async function deleteReminder(reminderId) {
    await deleteDoc(doc(db, COLLECTION, reminderId));
}

// ─── idempotent ID 헬퍼 (reminderGenerator 가 사용) ───
export function makeReminderId(userId, type, context) {
    return `${userId}_${type}_${context}`;
}
