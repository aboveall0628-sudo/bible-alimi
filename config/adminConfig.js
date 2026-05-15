/**
 * adminConfig.js — Swan 관리자 UID + 관리자 권한 헬퍼
 *
 * 2026-05-15 신규 (CS AI 트랙 §9 코드 진입 1단계)
 *
 * ⚠️ 사용자(Swan Jung)가 본인 Firebase Auth UID를 채워야 합니다.
 *
 * 본인 UID 확인 방법:
 *   1) Firebase Console → Authentication → Users
 *   2) 또는 앱 로그인 후 브라우저 콘솔: firebase.auth().currentUser.uid
 *
 * 같은 UID를 firestore.rules 의 SWAN_ADMIN_UID 자리에도 동일하게 적어주세요.
 */

// ─── Swan 관리자 UID (1차 베타 1인 관리자) ────────────────────
// TODO: 사용자가 본인 Firebase Auth UID 채우기
export const SWAN_ADMIN_UID = 'PLACEHOLDER_REPLACE_WITH_YOUR_UID';

// ─── 헬퍼 ───────────────────────────────────────────────────
/**
 * 주어진 사용자 UID가 Swan 관리자인지 확인.
 *
 * 시각 차단용 — 사이드바 "관리자" 메뉴 노출·관리자 페이지 접근 가드.
 * 데이터 차단은 firestore.rules 가 따로 처리 (2중 차단).
 *
 * @param {string|null} uid - 현재 사용자 UID
 * @returns {boolean}
 */
export function isSwanAdmin(uid) {
    if (!uid) return false;
    if (SWAN_ADMIN_UID === 'PLACEHOLDER_REPLACE_WITH_YOUR_UID') return false;
    return uid === SWAN_ADMIN_UID;
}
