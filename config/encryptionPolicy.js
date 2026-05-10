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
        plaintext: ['id', 'userId', 'date', 'timeSlot', 'durationSlots', 'placedAt', 'order', 'createdAt'],
        encrypted: ['text', 'linkedScriptureId', 'linkedGoalId', 'linkedPrincipleId']
    }
    // RESERVED FOR v2 FUTURE MODULES
    // persons: { plaintext: [], encrypted: [] },
    // transactions: { plaintext: [], encrypted: [] },
};
