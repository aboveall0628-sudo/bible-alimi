/**
 * userDataReset.js — 테스트 계정 통째 초기화 (v118 2026-05-21)
 *
 * 사용자 명시 "테스트 계정 별도로 지정해놓고 계정 초기화하기 버튼 부여".
 *
 * 자기 카드 포함 모든 사용자 데이터를 통째 비워요. 다시 로그인하면 가입 직후 결로 자연 자리잡혀
 * 온보딩 모달부터 자연 다시 자리잡혀요.
 *
 * 안전 가드:
 *   - 호출 자리에서 `isTestAccount(userEmail)` 가드 자리잡혀 있어야 자연 — 일반 운영자 자기 데이터 보호.
 *   - 본 모듈 자체는 가드 X. 호출처(settings.js)에서 자리잡혀요.
 *
 * 어디까지 비움:
 *   1. users/{userId} 안 서브컬렉션 22 자리 (persons·organizations·dots·meditations 등)
 *   2. referralCodes 루트 안 사용자가 가진 referralCode (selfCard 안 자리에서 가져와요)
 *   3. localStorage 안 사용자 환경 자리 (scriptureSettings·테마·폰트·추천 캐시 등)
 *
 * 어디는 안 비움:
 *   - Firebase Auth 사용자 자리(이메일·UID 자체) — 다시 로그인해야 함
 *   - adminTokens (운영자만 사용하니 의미 없음)
 */

import { db, collection, getDocs, deleteDoc, doc } from './firebase.js';

// users/{userId} 안 서브컬렉션 카탈로그 — 코드 베이스 결로 정리.
//   새 컬렉션 자리잡힐 때마다 여기 추가 자리.
const USER_SUBCOLLECTIONS = [
    'persons',
    'organizations',
    'dots',
    'meditations',
    'principles',
    'precedents',
    'goals',
    'goalVersions',
    'workflows',
    'accounts',
    'assets',
    'assetCategories',
    'liabilities',
    'transactions',
    'cashflowSnapshots',
    'netWorthSnapshots',
    'interactions',
    'consents',
    'recoveryMemos',
    'feedbacks',
    'reminders',
    'settings',
    'dayReports',
];

// localStorage 안 사용자별 환경 자리 — 통째 초기화 자리에서 같이 비움.
//   여기 적힌 키들은 다음 가입 직후 자리 디폴트 결로 자연 돌아가요.
const LOCAL_STORAGE_KEYS = [
    'sanctum.scriptureSettings.v1',
    'sanctum.userPlans.v1',
    'sanctum-theme',
    'sanctum-sensitive-mode',
    'sanctum.accentColor.v1',
    'sanctum.noteFont.v1',
    'sanctum.systemFontScale.v1',
    'sanctum.ref.v1',
    'sanctum.referralCode',
    'sanctum-dot-categories-user',
    'sanctum-dot-categories-recent',
    'sanctum-tier',
];

/**
 * 한 서브컬렉션 안 모든 문서 비우기 (페이지네이션 없이 한 번에).
 *   1차 베타 테스트 계정 결로 문서 100~1000 개 이내 가정.
 */
async function wipeSubcollection(userId, subName) {
    const path = `users/${userId}/${subName}`;
    try {
        const snap = await getDocs(collection(db, path));
        const deletes = snap.docs.map(d => deleteDoc(d.ref).catch(e => {
            console.warn(`[userDataReset] ${path}/${d.id} 삭제 실패:`, e?.message || e);
        }));
        await Promise.all(deletes);
        return snap.size;
    } catch (e) {
        console.warn(`[userDataReset] ${path} 비우기 실패:`, e?.message || e);
        return 0;
    }
}

/**
 * 사용자 referralCode 자리 비우기 (root referralCodes 컬렉션 안 자기 자리).
 *   selfCard.referralCode 에서 가져온 코드로만 자기 자리만 비움. 다른 사람 코드는 안 건드림.
 */
async function wipeReferralCode(referralCode) {
    if (!referralCode) return 0;
    try {
        await deleteDoc(doc(db, `referralCodes/${referralCode}`));
        return 1;
    } catch (e) {
        console.warn('[userDataReset] referralCode 삭제 실패:', e?.message || e);
        return 0;
    }
}

/**
 * localStorage 안 사용자 환경 자리 비우기.
 *   로그아웃은 안 함 — 호출처에서 따로 처리.
 */
function wipeLocalStorage() {
    let cleared = 0;
    LOCAL_STORAGE_KEYS.forEach(key => {
        try {
            if (localStorage.getItem(key) !== null) {
                localStorage.removeItem(key);
                cleared += 1;
            }
        } catch (_) {}
    });
    return cleared;
}

/**
 * 테스트 계정 통째 초기화 진입점.
 *
 * @param {string} userId - 비울 사용자의 UID
 * @param {Object} [opts]
 * @param {string} [opts.referralCode] - selfCard.referralCode 자리. 없으면 referralCodes 자리 안 비움
 * @param {(msg:string)=>void} [opts.onStep] - 진행 자리 콜백 (UI 갱신용)
 * @returns {Promise<{ subcollections: Record<string, number>, referralCode: number, localStorage: number }>}
 */
export async function resetAllUserData(userId, opts = {}) {
    if (!userId) throw new Error('userId 자리 비어있어요.');
    const { referralCode = null, onStep = null } = opts;
    const report = {
        subcollections: {},
        referralCode: 0,
        localStorage: 0,
    };

    // 1) 서브컬렉션 22 자리 순차 비움 (병렬도 가능하지만 진행 자리 단계로 알리기 위해 순차).
    for (const sub of USER_SUBCOLLECTIONS) {
        if (onStep) onStep(`${sub} 비우는 중...`);
        const count = await wipeSubcollection(userId, sub);
        report.subcollections[sub] = count;
    }

    // 2) referralCodes 자리 안 자기 코드
    if (referralCode) {
        if (onStep) onStep('추천 코드 비우는 중...');
        report.referralCode = await wipeReferralCode(referralCode);
    }

    // 3) localStorage
    if (onStep) onStep('환경 자리 비우는 중...');
    report.localStorage = wipeLocalStorage();

    if (onStep) onStep('완료. 새로고침하면 가입 직후 결로 다시 자리잡혀요.');
    return report;
}
