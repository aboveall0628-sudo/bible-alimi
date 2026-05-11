/**
 * encryptionPolicy.js — 데이터 컬렉션별 등급 및 필드 정책
 *
 * 이 정책은 v2 앱 전역에서 참조되며, 어떤 필드가 암호화되어야 하는지 명시합니다.
 * 평문 필드(plaintext)는 Firestore 인덱싱 및 쿼리 용도로만 사용해야 합니다.
 */

export const POLICY = {
    dots: {
        plaintext: [
            'id', 'userId', 'date', 'timeSlot', 'executionSatisfaction', 
            'outcomeSatisfaction', 'executed', 'labelIds', 
            'amountBucket', 'sentimentBucket', 'createdAt'
        ],
        encrypted: [
            'plannedTask', 'actualTask', 'reason', 'notes', 
            'linkedScriptureId', 'linkedPrincipleIds', 'linkedGoalId', 
            'linkedTransactionIds', 'linkedPersonIds', 'linkedOrgIds'
        ]
    },
    meditations: {
        plaintext: ['id', 'userId', 'date', 'scriptureRef', 'createdAt'],
        encrypted: ['content', 'decisions', 'prayer']
    },
    // memos: v1 빌드의 묵상 컬렉션. meditations와 동일 구조로 마이그레이션됨.
    memos: {
        plaintext: ['id', 'userId', 'date', 'scriptureRef', 'createdAt'],
        encrypted: ['content', 'decisions', 'prayer']
    },
    principles: {
        plaintext: ['id', 'userId', 'category', 'pinned', 'active', 'createdAt', 'updatedAt'],
        encrypted: ['title', 'body', 'triggerKeywords', 'derivedFromDotIds']
    },
    goals: {
        plaintext: ['id', 'userId', 'period', 'parentGoalId', 'startDate', 'endDate', 'progress', 'status', 'createdAt'],
        encrypted: ['title', 'description', 'notes', 'scriptureRef']
    },
    dayReports: {
        plaintext: ['id', 'userId', 'period', 'startDate', 'endDate', 'stats', 'drillDownChildIds', 'createdAt'],
        encrypted: ['aiSummary', 'keyPatterns', 'suggestedPrinciples', 'userNotes']
    },
    weekReports: {
        plaintext: ['id', 'userId', 'period', 'startDate', 'endDate', 'stats', 'drillDownChildIds', 'createdAt'],
        encrypted: ['aiSummary', 'keyPatterns', 'suggestedPrinciples', 'userNotes']
    },
    monthReports: {
        plaintext: ['id', 'userId', 'period', 'startDate', 'endDate', 'stats', 'drillDownChildIds', 'createdAt'],
        encrypted: ['aiSummary', 'keyPatterns', 'suggestedPrinciples', 'userNotes']
    },
    quarterReports: {
        plaintext: ['id', 'userId', 'period', 'startDate', 'endDate', 'stats', 'drillDownChildIds', 'createdAt'],
        encrypted: ['aiSummary', 'keyPatterns', 'suggestedPrinciples', 'userNotes']
    },
    yearReports: {
        plaintext: ['id', 'userId', 'period', 'startDate', 'endDate', 'stats', 'drillDownChildIds', 'createdAt'],
        encrypted: ['aiSummary', 'keyPatterns', 'suggestedPrinciples', 'userNotes']
    },
    // 통독 진행률: 챕터/날짜는 평문(통계 가능), 메모만 암호화
    bibleProgress: {
        plaintext: ['id', 'userId', 'partId', 'chapterIndex', 'date', 'completed', 'createdAt'],
        encrypted: ['note', 'highlightVerseIds']
    },
    // 결단: 시간 슬롯/배치 상태는 평문(타임라인 그리드 계산), 본문/링크는 암호화
    decisions: {
        plaintext: ['id', 'userId', 'date', 'timeSlot', 'durationSlots', 'placedAt', 'order', 'createdAt', 'gcalEventId'],
        encrypted: ['text', 'linkedScriptureId', 'linkedGoalId', 'linkedPrincipleId']
    },

    // ═══════════════════════════════════════════════════════════════
    //  v3.0 신규 — 사용자 서브컬렉션(users/{uid}/<col>) 으로 저장됨
    //  영적 안전장치: docs/future-modules.md 참조 (인물 라벨링 금지 등)
    // ═══════════════════════════════════════════════════════════════

    // ── 인물·조직 모듈 ──
    persons: {
        plaintext: [
            'id', 'relation', 'innerCircle', 'stance', 'isPinned', 'isFallback',
            'lastInteractionAt', 'createdAt', 'updatedAt'
        ],
        encrypted: [
            'name', 'nicknames', 'avatarUrl',
            'bigFive',          // {O,C,E,A,N} 0-100, 노출 시 비교/라벨링 위험으로 암호화
            'competencies',     // {analysis, ...} 0-100
            'relationship',     // {closeness, trust, friendliness, importance} 1-5
            'stanceHistory',    // [{from, to, changedAt, reason, prayerDone}]
            'meaningfulVerse',  // 이 사람을 위한 말씀
            'knownFacts', 'sensitivities',
            'notes', 'strengths', 'tendencies'
        ]
    },
    organizations: {
        plaintext: [
            'id', 'type', 'stance', 'friendliness', 'trust', 'importance', 'riskLevel',
            'createdAt', 'updatedAt'
        ],
        encrypted: ['name', 'memberPersonIds', 'meaningfulVerse', 'notes', 'stanceHistory']
    },
    interactions: {
        plaintext: ['id', 'dotId', 'date', 'sentiment', 'createdAt'],
        encrypted: ['personIds', 'orgIds', 'summary', 'moves', 'feelings', 'lessons', 'factsLearned']
    },

    // ── 경제 모듈 ──
    accounts: {
        plaintext: ['id', 'type', 'currency', 'isPrimary', 'createdAt'],
        encrypted: ['name', 'institution']
    },
    assetCategories: {
        plaintext: ['id', 'kind', 'createdAt'],
        encrypted: ['name']
    },
    assets: {
        plaintext: ['id', 'categoryId', 'currentValueBucket', 'lastValuationAt', 'createdAt'],
        encrypted: ['label', 'details', 'exactValue']
    },
    liabilities: {
        plaintext: ['id', 'type', 'principalBucket', 'createdAt'],
        encrypted: ['details', 'interestRate', 'exactPrincipal']
    },
    transactions: {
        plaintext: [
            'id', 'date', 'direction', 'amountBucket',
            'category', 'subCategory', 'incomeType', 'expenseType',
            'createdAt'
        ],
        encrypted: [
            'exactAmount', 'description', 'accountId',
            'linkedAssetId', 'linkedLiabilityId',
            'linkedDotId', 'linkedPersonIds', 'linkedOrgIds'
        ]
    },
    cashflowSnapshots: {
        plaintext: ['id', 'month', 'savingsRate', 'passiveRatio', 'createdAt'],
        encrypted: ['totalsExact', 'breakdownExact', 'aiInsights']
    },
    netWorthSnapshots: {
        plaintext: ['id', 'month', 'netWorthBucket', 'createdAt'],
        encrypted: ['totalsExact', 'breakdownExact']
    },

    // ── 영적 잠금 모듈 ──
    spiritualTokens: {
        plaintext: [
            'id', 'issuedAt', 'mode', 'wordPassageRef',
            'eveningClosed', 'eveningClosedAt', 'nextDayPrep', 'nextDayPassageRef',
            'createdAt'
        ],
        encrypted: ['meditationNote', 'prayerNote', 'oneLineToGod', 'nextDayDecisions']
    },
    retreatSessions: {
        plaintext: [
            'id', 'type', 'startDate', 'endDate', 'dailyLockMode',
            'autoCloseEvening', 'createdAt', 'closedAt'
        ],
        encrypted: ['location', 'purpose', 'reflectionPayload']
    },

    // ── 단일 문서 설정 ──
    // settings/{docName} 패턴으로 사용. 키는 'spiritualLock' 등.
    spiritualLockSettings: {
        plaintext: [
            'id', 'morningSlotTime', 'morningSlotDuration',
            'eveningSlotTime', 'eveningSlotDuration', 'eveningCutoffHour',
            'skipQuotaPerDay', 'sabbathDates', 'sabbathQuotaPerMonth',
            'alarmEnabled', 'minimumMeditationLength', 'streakVisible',
            'updatedAt'
        ],
        encrypted: []
    },
};

/**
 * 컬렉션 path → 정책 키 추출
 * 예) 'users/abc/persons' → 'persons'
 *     'users/abc/settings/spiritualLock' → 'spiritualLockSettings'
 *     'goals' → 'goals'
 */
export function policyKeyFromPath(path) {
    if (!path) return null;
    const parts = path.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    // settings/{docName} 같은 단일 문서 패턴 처리
    if (parts.length >= 2 && parts[parts.length - 2] === 'settings') {
        return `${last}Settings`; // 'spiritualLock' → 'spiritualLockSettings'
    }
    return last;
}
