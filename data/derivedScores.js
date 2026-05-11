/**
 * derivedScores.js — 도트 누적 만족도를 인물·조직 카드의 점수에 자동 반영
 *
 * 정책 (2026-05-12 합의, memory/project_person_card_policy.md):
 *   - 사용자가 직접 슬라이더를 움직인 축은 `xxxLocked = true` 로 잠김 → 자동 갱신 차단
 *   - 잠기지 않은 축만 만족도 평균에서 파생된 값으로 갱신
 *   - "함께한 시간의 만족도 누적이지 능력 그 자체가 아님" — UI에서 hint로 명시
 *
 * 매핑:
 *   - 0~100 점수축 (Big5, competencies): 기본 50, 만족도 평균(1~5)을 50 + (avg-3)*10 으로 매핑 (범위 30~70)
 *   - 1~5 점수축 (조직 관계 4지표):       만족도 평균을 round 후 1~5 clamp
 *   - 위험도 (1~4):                       만족도 평균과 역방향 (만족도 높음 → 위험도 낮음)
 *
 * 입출력:
 *   - applyDerivedToPerson(person, stats) → 변경된 person 객체 반환 (in-place 갱신)
 *   - applyDerivedToOrg(org, stats)       → 변경된 org 객체 반환 (in-place 갱신)
 *   - stats 인자는 cardStats.computeAllPersonStats / computeAllOrgStats 결과의 개별 항목
 */

const BIG5_KEYS = ['O', 'C', 'E', 'A', 'N'];
const COMPETENCY_KEYS = [
    'analysis', 'execution', 'creativity', 'communication',
    'leadership', 'empathy', 'expertise', 'stamina',
];
const REL_KEYS = ['closeness', 'trust', 'friendliness', 'importance'];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 만족도 평균(1~5) → 0~100 스케일 매핑. 표본이 없으면 기본 50.
 */
function avgTo100(avg) {
    if (avg == null) return 50;
    return clamp(Math.round(50 + (avg - 3) * 10), 0, 100);
}

/**
 * 만족도 평균(1~5) → 1~5 정수. 표본 없으면 null.
 */
function avgTo5(avg) {
    if (avg == null) return null;
    return clamp(Math.round(avg), 1, 5);
}

/**
 * 만족도 평균(1~5) → 위험도 key. 역방향.
 *   avg ≥ 4.0 → 'safe'
 *   2.5~4.0   → 'caution'
 *   < 2.5     → 'risk'
 * 표본 없으면 null.
 */
function avgToRisk(avg) {
    if (avg == null) return null;
    if (avg >= 4.0) return 'safe';
    if (avg >= 2.5) return 'caution';
    return 'risk';
}

/**
 * locked 객체가 그 축을 lock 했는지 확인. 미설정/false면 자동 갱신 허용.
 */
function isLocked(lockMap, key) {
    if (!lockMap || typeof lockMap !== 'object') return false;
    return !!lockMap[key];
}

/**
 * 인물 카드의 unlocked 축에 derived 값을 적용한다.
 * @returns {boolean} 실제로 한 칸이라도 갱신됐으면 true
 */
export function applyDerivedToPerson(person, stats) {
    if (!person) return false;
    const avg = stats?.avgRating ?? null;
    let changed = false;

    // Big5 (0~100)
    if (!person.bigFive) person.bigFive = {};
    BIG5_KEYS.forEach(k => {
        if (isLocked(person.bigFiveLocked, k)) return;
        const next = avgTo100(avg);
        if (person.bigFive[k] !== next) { person.bigFive[k] = next; changed = true; }
    });

    // 능력 8축 (0~100)
    if (!person.competencies) person.competencies = {};
    COMPETENCY_KEYS.forEach(k => {
        if (isLocked(person.competenciesLocked, k)) return;
        const next = avgTo100(avg);
        if (person.competencies[k] !== next) { person.competencies[k] = next; changed = true; }
    });

    // 관계 4지표 (1~5)
    if (!person.relationship) person.relationship = {};
    REL_KEYS.forEach(k => {
        if (isLocked(person.relationshipLocked, k)) return;
        const next = avgTo5(avg);
        if (person.relationship[k] !== next) { person.relationship[k] = next; changed = true; }
    });

    return changed;
}

/**
 * 조직 카드의 unlocked 축에 derived 값을 적용한다.
 */
export function applyDerivedToOrg(org, stats) {
    if (!org) return false;
    const avg = stats?.avgRating ?? null;
    let changed = false;

    // 관계 4지표(friendliness, trust, importance)는 평탄 1~5
    if (!isLocked(org.locked, 'friendliness')) {
        const next = avgTo5(avg);
        if (org.friendliness !== next) { org.friendliness = next; changed = true; }
    }
    if (!isLocked(org.locked, 'trust')) {
        const next = avgTo5(avg);
        if (org.trust !== next) { org.trust = next; changed = true; }
    }
    if (!isLocked(org.locked, 'importance')) {
        const next = avgTo5(avg);
        if (org.importance !== next) { org.importance = next; changed = true; }
    }
    // 위험도는 역방향
    if (!isLocked(org.locked, 'riskLevel')) {
        const next = avgToRisk(avg);
        if (org.riskLevel !== next) { org.riskLevel = next; changed = true; }
    }

    return changed;
}

export { BIG5_KEYS, COMPETENCY_KEYS, REL_KEYS };
