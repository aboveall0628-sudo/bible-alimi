/**
 * postSurveyForm.js — 1차 베타 사후 설문 풀스크린 카드 폼
 *
 * 2026-05-18 시안 v2: Q1~Q12 12 카드 + 마침 카드 = 13 카드.
 *   온보딩 결(.onboarding-card·.onboarding-card-enter·.onboarding-stepper) 정확 매칭.
 *   진입 애니메이션 + dot stepper 동일.
 *
 * 결정 사항 (사용자 합의, 2026-05-18):
 *   - 풀스크린 카드 (온보딩 결)
 *   - dot stepper 12 + 카드 enter 애니메이션
 *   - 객관식 칩 위 + 자유 텍스트 아래 (사용자 결로 칩 먼저)
 *   - Q1 다중 선택, Q3·Q6-B·Q9-B 자유 텍스트 필수
 *   - [닫기·멈추기] X (베타 진입 시) — 시안 단계엔 임시 [닫기]
 *   - 이전·다음 버튼 + 답변 보존 (state 유지)
 *   - AI 가공·자동 트리거·Firestore 저장은 Phase 2~4 — 시안은 정적 + 콘솔 출력
 */

import { showToast } from './quickReview.js';
import { callSwanPostSurveyQuestions } from './aiClient.js';
import { typeText, setTextInstant, shouldReduceMotion } from './aiThinking.js';

const MIN_LOADING_MS = 0;
const TYPING_DELAY_MS = 38;
const PRE_TYPING_DELAY_MS = 600;

// ─── 카탈로그 (v2 합의 12 질문) ─────────────────────────────────
const RAPPORT_COPY = '잠깐, 2주 동안 어땠는지 들려주세요. 정답은 없어요. 솔직한 한 줄이 가장 큰 선물이에요.';

// 사후 설문 v2 — 오픈 결말 13 문항 (2026-05-19)
//   사용자 결정: 페르소나 chip 폐기 → 자유 답변 결로 사후 카테고라이징
//   5 검증(Sean Ellis·NPS·사용 강도·통증·페르소나) + 리포트 결·보완 자료·니즈·시스템 일관·가격·확장
const QUESTIONS_OLD_v1 = [
    // ─── A. 전반적 체험 (증거 3 — 핵심 가치 식별) ────────────
    {
        id: 'Q1',
        title: '2주 다 돌아봤을 때 가장 기억에 남는 순간이나 장면이 뭐예요?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '한 장면을 떠올려 적어주세요 (필수)', required: true, rows: 3 },
        ],
    },
    {
        id: 'Q2',
        title: '이 앱을 한 문장으로 설명해야 한다면 어떻게 말할 거예요?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '마케팅 카피 말고 친구한테 진짜 말하듯 (필수)', required: true, rows: 3 },
        ],
    },

    // ─── B. 묵상→실행 연결 (증거 6 — 가중치 1.5배, 최우선) ────
    {
        id: 'Q3',
        title: '묵상 끝나고 목표 만들어서 시간표에 넣는 흐름, 처음 해봤을 때 어떤 느낌이었어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['자연스러웠어요', '어색했어요', '잘 모르겠어요', '안 해봤어요'],
        }],
        freeTextBlocks: [
            { label: '묵상이 할 일로 변하는 느낌이었나요? 다른 결이었나요? (필수)', required: true, rows: 3 },
        ],
    },
    {
        id: 'Q4',
        title: '시간표에 올린 목표 중에 실제로 해본 거 있어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['거의 다 했어요', '절반쯤', '1~2개', '전혀 못 했어요', '목표 자체를 안 만들었어요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 실행한 거 1개만 떠올려 보면 어떤 자리였어요?', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q5',
        title: '사전 설문 때 쓰던 묵상 앱이랑 이번 앱이 가장 크게 달랐던 점이 뭐예요?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '(선택) 가장 큰 차이 한 줄', required: false, rows: 2 },
            { label: '(선택) 이 앱이 없어도 그 방식만으로 똑같이 할 수 있을까요?', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q6',
        title: '이 앱이 내일 사라진다면 얼마나 아쉬울 거 같아요?',
        chipBlocks: [{
            mode: 'single',
            type: 'scale',
            hint: '1점에서 10점 중 하나만',
            scaleMinLabel: '하나도 안 아쉬워요',
            scaleMaxLabel: '엄청 아쉬울 거예요',
            allowOther: false,
            chips: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        }],
        freeTextBlocks: [
            { label: '7점 이상이면 사라진 자리를 무엇으로 대체할 거 같아요? / 6점 이하면 어떻게 됐으면 9~10점이었을까요? (필수)', required: true, rows: 3 },
        ],
    },

    // ─── C. 확장 기능 수용성 (증거 7) ─────────────────────────
    {
        id: 'Q7',
        title: '처음 앱 켰을 때 튜토리얼 미션 만났잖아요. 어떻게 느끼셨어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['도움 됐어요', '부담이었어요', '잘 모르겠어요', '기억이 안 나요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 어떤 자리에서 그 느낌이었어요?', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q8',
        title: '도트 콜렉터 — 도트 남길 때 어떤 마음이었어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['묵상의 연장선 같았어요', '별개 기능 같았어요', '잘 안 남겼어요', '안 써봤어요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 도트 남길 때 마음·아쉬움 한 줄', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q9',
        title: 'AI 리포트 받아본 적 있으세요? 어떤 결이었어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['새로운 발견 있었어요', '이미 알던 것이었어요', '안 봤어요', '봤지만 기억 안 나요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 행동에 영향이 있었거나, 어떻게 됐으면 한 번이라도 열어봤을까?', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q10',
        title: '확장 기능 어디까지 가보셨어요?',
        chipBlocks: [{
            mode: 'multi',
            hint: '여러 개 골라도 좋아요',
            allowOther: false,
            chips: ['의사결정 보조 (분별의 자리)', '워크플로우', '인물 카드', '가계부 (경제)', '하나도 안 가봤어요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 가본 자리 중 가장 인상 깊었거나 어색했던 자리', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q11',
        title: '묵상 → 목표 → 시간표 → 도트 → 리포트 → 의사결정 흐름 — 하나의 시스템처럼 느껴졌나요, 따로따로 기능이 붙어 있는 느낌이었나요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['하나의 시스템처럼', '따로따로 기능 모음', '중간', '잘 모르겠어요'],
        }],
        freeTextBlocks: [
            { label: '어디가 가장 자연스러웠어요? (필수)', required: true, rows: 3 },
            { label: '어디서 끊긴 느낌이었어요? (필수)', required: true, rows: 3 },
        ],
    },

    // ─── C-2. 회복의 자리 (정서 결 검증) ───────────────────────
    {
        id: 'Q12',
        title: '"회복의 자리" 화면 — 2주 동안 어떻게 느끼셨어요?',
        chipBlocks: [
            {
                mode: 'single',
                hint: '회복의 자리 화면을 본 적 있어요?',
                allowOther: false,
                chips: ['본 적 있어요', '메뉴는 봤지만 안 들어갔어요', '본 적 없어요'],
            },
            {
                mode: 'single',
                optional: true,
                hint: '(본 적 있으면) 처음 봤을 때 느낌은?',
                allowOther: true,
                chips: ['정죄·압박 느낌', '부담', '궁금', '고마움', '잘 모르겠어요'],
            },
            {
                mode: 'single',
                hint: '"약속 어김을 자동 감지해서 띄워준다면?" 어떻게 받아들이실 거 같아요?',
                allowOther: false,
                chips: ['좋겠어요', '부담스러워요', '잘 모르겠어요'],
            },
        ],
        freeTextBlocks: [
            { label: '(선택) 다시 들어가고 싶었던 순간이나 아쉬움 한 줄', required: false, rows: 2 },
        ],
    },

    // ─── D. 자발 확산 & 지불 의향 (증거 4, 5) ──────────────────
    {
        id: 'Q13',
        title: '2주 동안 누군가한테 이 앱 얘기한 적 있어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['했어요', '안 했어요', '기회가 없었어요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 누구한테·어떤 반응이었나요?', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q14',
        title: '2주 써보고 나서 — 한 달에 얼마까지 쓰실 의향 있어요?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '솔직한 한 줄이 가장 큰 선물이에요 (필수)', required: true, rows: 2 },
        ],
    },

    // ─── E. 다음 단계 ─────────────────────────────────────────
    {
        id: 'Q15',
        title: '베타 끝나도 이 앱 계속 쓰실 거예요?',
        chipBlocks: [{
            mode: 'single',
            hint: '솔직하게',
            allowOther: false,
            chips: ['계속 쓸 거예요', '고민 중이에요', '끝낼 거 같아요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 그 이유 한 줄', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q16',
        title: '개발자한테 딱 한 가지 메시지를 전한다면?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '솔직한 한 마디 (필수)', required: true, rows: 3 },
        ],
    },
    {
        id: 'Q17',
        title: '이 앱이 더 자라난다면 어떤 방향이 가장 끌릴까요?',
        chipBlocks: [{
            mode: 'multi',
            hint: '여러 개 골라도 좋아요',
            allowOther: true,
            chips: ['공동체 안 묵상 나눔', '말씀 학습 깊이', '기도 회복·습관', '자녀·신앙 동반', '삶 적용·실행 결', '다른 묵상 도구 통합'],
        }],
        freeTextBlocks: [
            { label: '(선택) 어떤 자리에 자원 가장 두면 좋을지 한 줄', required: false, rows: 2 },
        ],
    },
];

// 사후 설문 v3 — 카피 일괄 다듬기 (2026-05-19)
// 사용자 결정: AI 같지 않게·자연스럽게·필수/선택 정합
const QUESTIONS = [
    // ─── 정량 4 자리 ────────────────────────────────────────────
    {
        id: 'Q1',
        title: '이 앱이 내일부터 없어진다면 어떨 거 같으세요?',
        chipBlocks: [{
            mode: 'single',
            hint: '솔직하게 골라요',
            allowOther: false,
            chips: ['많이 아쉬울 거예요', '조금 아쉬울 거예요', '별로 상관없어요', '잘 모르겠어요'],
        }],
        freeTextBlocks: [],
    },
    {
        id: 'Q2',
        title: '친한 친구한테 이 앱 추천한다면 몇 점이나 줄 수 있을까요?',
        chipBlocks: [{
            mode: 'single',
            type: 'scale',
            hint: '0~10점',
            scaleMinLabel: '전혀 추천 X',
            scaleMaxLabel: '꼭 추천',
            allowOther: false,
            chips: ['0','1','2','3','4','5','6','7','8','9','10'],
        }],
        freeTextBlocks: [],
    },
    {
        id: 'Q3',
        title: '지난 2주 동안 이 앱을 얼마나 자주 쓰셨어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['거의 매일', '가끔', '거의 안 썼어요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 그 빈도가 된 이유 한 줄', required: false, rows: 2 },
        ],
    },
    {
        id: 'Q4',
        title: '베타 시작 전에 신앙 자리에서 어떤 어려움이 가장 컸어요?',
        chipBlocks: [{
            mode: 'multi',
            hint: '여러 개 골라도 좋아요',
            allowOther: true,
            chips: [
                '묵상은 했는데 삶으로 이어지지 않았어요',
                '묵상이 자주 끊겼어요',
                '말씀이 깊이 와닿지 않았어요',
                '신앙 정체기·메마름',
                '기도·묵상이 따로따로 흩어져요',
                '공동체 안에서 신앙 깊이가 부족해요',
                '특별한 어려움 없었어요',
            ],
        }],
        freeTextBlocks: [
            { label: '(선택) 본인이 느낀 진짜 어려움 한 줄', required: false, rows: 2 },
        ],
    },

    // ─── 정성 자유 ──────────────────────────────────────────
    {
        id: 'Q5',
        title: '본인의 신앙을 한 문장으로 표현하신다면?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '편안하게 한 줄 (필수)', required: true, rows: 3 },
        ],
    },
    {
        id: 'Q6',
        title: '지난 2주 돌아봤을 때 가장 기억에 남는 순간이 있다면?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '한 장면을 떠올려 적어주세요 (필수)', required: true, rows: 3 },
        ],
    },
    {
        id: 'Q7',
        title: '묵상하고 결단해서 시간표에 넣는 흐름은 어땠어요?',
        chipBlocks: [{
            mode: 'single',
            hint: '하나만 골라요',
            allowOther: false,
            chips: ['자연스러웠어요', '어색했어요', '잘 모르겠어요', '안 해봤어요'],
        }],
        freeTextBlocks: [
            { label: '어떻게 다가왔는지 한 줄 (필수)', required: true, rows: 3 },
        ],
    },

    // ─── 분별·회복 니즈 검증 ───────────────────────────────
    {
        id: 'Q8',
        title: '이런 자리가 있다면 어떨까요?',
        chipBlocks: [
            {
                mode: 'single',
                hint: '① 결단을 못 지켰을 때 부드럽게 다시 시작하게 돕는 화면',
                allowOther: false,
                chips: ['꼭 가지고 싶어요', '있으면 좋겠어요', '잘 모르겠어요', '없어도 돼요'],
            },
            {
                mode: 'single',
                hint: '② 중요한 선택 앞에서 결을 도와주는 화면',
                allowOther: false,
                chips: ['꼭 가지고 싶어요', '있으면 좋겠어요', '잘 모르겠어요', '없어도 돼요'],
            },
        ],
        freeTextBlocks: [
            { label: '(선택) 어떻게 도와줬으면 좋을지 한 줄', required: false, rows: 2 },
        ],
    },

    // ─── 리포트 결 + 보완 자료 (한 카드 결로 묶기) ───────────
    {
        id: 'Q9',
        title: '리포트는 어땠어요? 더 풍부해지려면 뭐가 있으면 좋을까요?',
        chipBlocks: [
            {
                mode: 'single',
                hint: '리포트(주간 자료 자동 정리)를 받아본 느낌',
                allowOther: false,
                chips: ['새로운 발견 있었어요', '이미 알던 거였어요', '안 봤어요', '봤지만 기억 안 나요'],
            },
            {
                mode: 'multi',
                hint: '리포트가 더 풍부해지려면 어떤 자료가 있으면 좋을까요? (여러 개 OK)',
                allowOther: true,
                chips: [
                    '인물 카드 (관계·만남)',
                    '조직·공동체 활동',
                    '거래·재정 기록',
                    '도트 (감정·사건·결정)',
                    '시간 사용 기록',
                    '대화·간증 노트',
                ],
            },
        ],
        freeTextBlocks: [
            { label: '(선택) 리포트가 어떻게 됐으면 좋을지 한 줄', required: false, rows: 2 },
        ],
    },

    // ─── 시스템 일관 자리 (증거 7-5) ─────────────────────────
    {
        id: 'Q10',
        title: '써보신 흐름이 자연스럽게 이어졌어요? 끊긴 자리는 있었어요?',
        chipBlocks: [],
        freeTextBlocks: [
            { label: '(선택) 자연스럽게 이어졌던 자리', required: false, rows: 3 },
            { label: '(선택) 끊긴 자리·아쉬움', required: false, rows: 3 },
        ],
    },

    // ─── 가격 의향 (옵션 B) ──────────────────────────────────
    {
        id: 'Q11',
        title: '이 앱을 한 달에 얼마까지 써볼 의향 있으세요?',
        chipBlocks: [{
            mode: 'single',
            hint: '6,900원이면 어떨 거 같으세요?',
            allowOther: false,
            chips: ['낼 거예요', '안 낼 거예요', '잘 모르겠어요'],
        }],
        freeTextBlocks: [
            { label: '(선택) 자연스럽게 낼 수 있을 액수 한 줄', required: false, rows: 2 },
        ],
    },

    // ─── 마무리 (확장 방향 + 개발자 메시지) ─────────────────
    {
        id: 'Q12',
        title: '이 앱이 더 자라난다면 어떤 방향이 끌리세요?',
        chipBlocks: [{
            mode: 'multi',
            hint: '여러 개 골라도 좋아요',
            allowOther: true,
            chips: [
                '공동체 안 묵상 나눔',
                '가족·부부 동반',
                '말씀 학습 깊이',
                '기도 회복·습관',
                '자녀 신앙 교육',
                '분별·회복 자리 확장',
                '다른 묵상 도구 통합',
            ],
        }],
        freeTextBlocks: [
            { label: '(선택) 개발자한테 한 마디 — 솔직하게 들려주세요', required: false, rows: 3 },
        ],
    },
];

// ─── 모듈 상태 ───────────────────────────────────────────────
let _backdropEl = null;
let _state = null;
let _escHandler = null;
let _onComplete = null;

// ─── 진입점 ─────────────────────────────────────────────────
export async function openPostSurveyForm({ userContext = {}, onComplete = null } = {}) {
    if (_backdropEl) return;

    _state = {
        currentIdx: 0,
        responses: {},
        aiQuestions: null,  // Phase 2-1: 일괄 호출 결과 { Q1: '...', ..., Q12: '...' }
        aborted: false,
    };
    _onComplete = onComplete;

    const backdrop = document.createElement('div');
    backdrop.id = 'presurvey-backdrop';
    backdrop.className = 'presurvey-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = `
        <div class="presurvey-modal" id="presurvey-modal">
            <button type="button" class="presurvey-close-temp" id="presurvey-close-btn" aria-label="시안 닫기 (베타에서는 없어요)">×</button>
            <div class="onboarding-stepper presurvey-stepper" id="presurvey-stepper" aria-label="진행도">
                ${Array.from({ length: QUESTIONS.length }, (_, i) => i + 1).map(n =>
                    `<span class="onboarding-step-dot${n === 1 ? ' active' : ''}" data-step="${n}"></span>`
                ).join('')}
            </div>
            <div class="presurvey-body" id="presurvey-body"></div>
        </div>
    `;

    document.body.appendChild(backdrop);
    _backdropEl = backdrop;

    document.getElementById('presurvey-close-btn').addEventListener('click', closeForm);

    _escHandler = (e) => {
        if (e.key === 'Escape') closeForm();
    };
    document.addEventListener('keydown', _escHandler);

    // Phase 2-1: 시작 시 일괄 호출로 12 질문 SWAN 톤 발화 캐싱.
    // 호출 진행 중엔 로딩 카드 노출. 끝나면 첫 카드 자연 전환.
    renderLoadingCard();
    const loadStart = Date.now();
    try {
        const payload = {
            userContext: { devotionalLevel: userContext.devotionalLevel || null },
            questions: QUESTIONS.map(q => ({ id: q.id, originalTitle: stripHtml(q.title) })),
        };
        const result = await callSwanPostSurveyQuestions(payload);
        if (_state?.aborted) return;
        if (result.fallback || !result.questions) {
            console.warn('[postSurveyForm] AI 가공 실패 — 정적 카피로 진입');
            _state.aiQuestions = null;
        } else {
            _state.aiQuestions = result.questions;
        }
    } catch (e) {
        console.warn('[postSurveyForm] AI 호출 예외:', e?.message || e);
        if (_state?.aborted) return;
        _state.aiQuestions = null;
    }

    // 로딩 카드 최소 노출 시간 보장 — 너무 빨라서 깜빡이는 결 방지
    const elapsed = Date.now() - loadStart;
    if (elapsed < MIN_LOADING_MS) {
        await new Promise(r => setTimeout(r, MIN_LOADING_MS - elapsed));
    }

    if (!_state || _state.aborted) return;
    renderCurrentCard();
}

// ─── 카드 렌더링 ────────────────────────────────────────────
function renderCurrentCard() {
    const body = document.getElementById('presurvey-body');
    if (!body) return;

    const idx = _state.currentIdx;

    if (idx >= QUESTIONS.length) {
        renderFinishCard(body);
    } else {
        renderQuestionCard(body, idx);
    }

    // dot stepper 갱신 (마침 카드면 모두 done)
    updateStepperDots(idx + 1);

    // 카드 enter 애니메이션 (온보딩 결)
    const card = body.querySelector('.onboarding-card');
    if (card) {
        card.classList.add('onboarding-card-enter');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => card.classList.add('onboarding-card-enter-active'));
        });
    }
}

function renderQuestionCard(body, idx) {
    const q = QUESTIONS[idx];
    const stored = _state.responses[q.id] || initResponse(q);
    _state.responses[q.id] = stored;

    const isFirst = idx === 0;
    const isLast = idx === QUESTIONS.length - 1;
    const stepLabel = `${idx + 1} / ${QUESTIONS.length}`;

    // Phase 2-1: AI 가공 질문 캐시 우선, 없으면 정적 카피 fallback
    const aiTitle = _state.aiQuestions?.[q.id];
    const titleHtml = aiTitle || q.title;
    // 타이핑용 plain text —  → 줄바꿈
    const titleForTyping = titleHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

    // AI 가공 질문이 라포 흡수 한 결이면 별도 라포 카드 카피 X
    const showStaticRapport = isFirst && !aiTitle;

    body.innerHTML = `
        <div class="onboarding-card presurvey-card-wrap presurvey-card-typing-locked">
            <p class="presurvey-step-count">${stepLabel}</p>
            ${showStaticRapport ? `<p class="presurvey-rapport">${RAPPORT_COPY}</p>` : ''}
            <h2 class="onboarding-title presurvey-question presurvey-question-pre" data-typing-target></h2>

            <div class="presurvey-after-typing">
                ${renderChipBlocks(q, stored)}
                ${renderFreeTextBlocks(q, stored)}

                <div class="onboarding-actions presurvey-footer">
                    <button type="button" class="onboarding-btn presurvey-btn-prev" ${idx === 0 ? 'disabled' : ''}>← 이전</button>
                    <button type="button" class="onboarding-btn onboarding-btn-primary presurvey-btn-next">${isLast ? '다 들려줬어요 →' : '다음 →'}</button>
                </div>
            </div>
        </div>
    `;

    bindCardEvents(body, q);
    updateNextButton(q);

    // 타이핑 결: 질문 카피 한 글자씩 노출 → 끝나면 칩·footer 자연 fade-in
    const titleEl = body.querySelector('[data-typing-target]');
    const cardEl = body.querySelector('.presurvey-card-typing-locked');
    if (!titleEl) return;

    const unlock = () => cardEl?.classList.remove('presurvey-card-typing-locked');

    if (shouldReduceMotion()) {
        setTextInstant(titleEl, titleForTyping);
        unlock();
    } else {
        // 카드 enter(280ms) 자연 완료 후 살짝 호흡 → 타이핑 시작
        setTimeout(() => {
            if (!_state || _state.aborted) return;
            typeText(titleEl, titleForTyping, { delay: TYPING_DELAY_MS }).then(unlock);
        }, PRE_TYPING_DELAY_MS);
    }
}

function renderLoadingCard() {
    const body = document.getElementById('presurvey-body');
    if (!body) return;
    body.innerHTML = `
        <div class="onboarding-card presurvey-card-wrap presurvey-loading-card">
            <div class="presurvey-loading-body">
                <span class="swan-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
                <p class="presurvey-loading-text">잠깐 자리 다듬는 중이에요…</p>
            </div>
        </div>
    `;
    // 카드 enter 애니메이션
    const card = body.querySelector('.onboarding-card');
    if (card) {
        card.classList.add('onboarding-card-enter');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => card.classList.add('onboarding-card-enter-active'));
        });
    }
}

function renderChipBlocks(q, stored) {
    if (!q.chipBlocks || q.chipBlocks.length === 0) return '';
    return q.chipBlocks.map((block, blockIdx) => {
        const storedBlock = stored.chipBlocks[blockIdx] || { selected: [], other: '' };
        const chipsHtml = block.chips.map((label) => {
            const isActive = storedBlock.selected.includes(label);
            const scaleClass = block.type === 'scale' ? ' presurvey-chip-scale' : '';
            return `<button type="button" class="presurvey-chip${scaleClass}${isActive ? ' presurvey-chip-active' : ''}" data-block="${blockIdx}" data-chip="${escapeAttr(label)}" aria-pressed="${isActive}">${escapeHtml(label)}</button>`;
        }).join('');

        const otherActive = storedBlock.other.length > 0;
        const otherHtml = block.allowOther ? `
            <div class="presurvey-chip-other">
                <button type="button" class="presurvey-chip${otherActive ? ' presurvey-chip-active' : ''}" data-block="${blockIdx}" data-chip="__OTHER__" aria-pressed="${otherActive}">기타</button>
                <input type="text" class="presurvey-chip-other-input" data-block="${blockIdx}" placeholder="자유 입력" maxlength="60" value="${escapeAttr(storedBlock.other)}" ${otherActive ? '' : 'hidden'}>
            </div>
        ` : '';

        const isScale = block.type === 'scale';
        const scaleLabels = isScale ? `
            <div class="presurvey-scale-labels">
                <span>${escapeHtml(block.scaleMinLabel || '')}</span>
                <span>${escapeHtml(block.scaleMaxLabel || '')}</span>
            </div>
        ` : '';

        return `
            <div class="presurvey-block">
                ${block.hint ? `<p class="presurvey-chip-hint">${escapeHtml(block.hint)}</p>` : ''}
                ${scaleLabels}
                <div class="presurvey-chip-grid${isScale ? ' presurvey-chip-grid--scale' : ''}" data-block="${blockIdx}" data-mode="${block.mode}">
                    ${chipsHtml}
                    ${otherHtml}
                </div>
            </div>
        `;
    }).join('');
}

function renderFreeTextBlocks(q, stored) {
    if (!q.freeTextBlocks || q.freeTextBlocks.length === 0) return '';
    return q.freeTextBlocks.map((ft, ftIdx) => {
        const value = stored.freeTextBlocks[ftIdx] || '';
        const isRequired = !!ft.required;
        return `
            <div class="presurvey-block">
                <label class="presurvey-free-label${isRequired ? ' presurvey-free-required' : ''}" for="presurvey-ft-${ftIdx}">${escapeHtml(ft.label)}</label>
                <textarea
                    id="presurvey-ft-${ftIdx}"
                    class="presurvey-free-input"
                    data-ft-idx="${ftIdx}"
                    rows="${ft.rows || 2}"
                    maxlength="${ft.maxLength || 500}"
                    placeholder="">${escapeHtml(value)}</textarea>
            </div>
        `;
    }).join('');
}

function renderFinishCard(body) {
    body.innerHTML = `
        <div class="onboarding-card presurvey-card-wrap presurvey-finish-card">
            <h2 class="onboarding-title presurvey-question">2주 자리 함께 해주셔서 고마워요. 들려주신 결이 다음 자리의 큰 자료가 돼요.</h2>
            <div class="onboarding-actions presurvey-footer presurvey-finish-footer">
                <button type="button" class="onboarding-btn presurvey-btn-prev" id="presurvey-finish-prev">← 이전</button>
                <button type="button" class="onboarding-btn onboarding-btn-primary presurvey-btn-finish">마치기</button>
            </div>
        </div>
    `;
    body.querySelector('#presurvey-finish-prev').addEventListener('click', () => {
        _state.currentIdx -= 1;
        renderCurrentCard();
    });
    body.querySelector('.presurvey-btn-finish').addEventListener('click', () => {
        if (_state) console.log('[postSurveyForm] 전체 답변:', JSON.parse(JSON.stringify(_state.responses)));
        closeForm();  // onComplete 자연 호출 → onboarding step 10 자연 이어
    });
}

// ─── 이벤트 바인딩 ──────────────────────────────────────────
function bindCardEvents(body, q) {
    const stored = _state.responses[q.id];

    // 칩 클릭
    body.querySelectorAll('.presurvey-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const blockIdx = parseInt(chip.dataset.block, 10);
            const block = q.chipBlocks[blockIdx];
            const storedBlock = stored.chipBlocks[blockIdx];
            const chipLabel = chip.dataset.chip;

            if (chipLabel === '__OTHER__') {
                // 기타 클릭 = 입력 자리 토글
                const otherInput = body.querySelector(`.presurvey-chip-other-input[data-block="${blockIdx}"]`);
                if (storedBlock.other) {
                    // 이미 입력 있음 → 비우기
                    storedBlock.other = '';
                    otherInput.value = '';
                    otherInput.hidden = true;
                    chip.classList.remove('presurvey-chip-active');
                    chip.setAttribute('aria-pressed', 'false');
                } else {
                    // 비어 있음 → 입력 자리 노출 + focus
                    otherInput.hidden = false;
                    chip.classList.add('presurvey-chip-active');
                    chip.setAttribute('aria-pressed', 'true');
                    setTimeout(() => otherInput.focus(), 30);
                }
            } else if (block.mode === 'single') {
                // 단일 선택 = 새로 갈아끼움
                storedBlock.selected = [chipLabel];
                // 모든 칩 비활성화 후 현재 칩 활성화
                body.querySelectorAll(`.presurvey-chip[data-block="${blockIdx}"]`).forEach(c => {
                    if (c.dataset.chip !== '__OTHER__') {
                        const active = c.dataset.chip === chipLabel;
                        c.classList.toggle('presurvey-chip-active', active);
                        c.setAttribute('aria-pressed', active ? 'true' : 'false');
                    }
                });
            } else {
                // 다중 선택 = toggle
                const idx = storedBlock.selected.indexOf(chipLabel);
                if (idx === -1) {
                    storedBlock.selected.push(chipLabel);
                    chip.classList.add('presurvey-chip-active');
                    chip.setAttribute('aria-pressed', 'true');
                } else {
                    storedBlock.selected.splice(idx, 1);
                    chip.classList.remove('presurvey-chip-active');
                    chip.setAttribute('aria-pressed', 'false');
                }
            }
            updateNextButton(q);
        });
    });

    // 기타 입력
    body.querySelectorAll('.presurvey-chip-other-input').forEach(input => {
        input.addEventListener('input', () => {
            const blockIdx = parseInt(input.dataset.block, 10);
            stored.chipBlocks[blockIdx].other = input.value;
            updateNextButton(q);
        });
    });

    // 자유 텍스트
    body.querySelectorAll('.presurvey-free-input').forEach(ta => {
        ta.addEventListener('input', () => {
            const ftIdx = parseInt(ta.dataset.ftIdx, 10);
            stored.freeTextBlocks[ftIdx] = ta.value;
            updateNextButton(q);
        });
    });

    // 이전·다음
    body.querySelector('.presurvey-btn-prev')?.addEventListener('click', () => {
        if (_state.currentIdx > 0) {
            _state.currentIdx -= 1;
            renderCurrentCard();
        }
    });
    body.querySelector('.presurvey-btn-next')?.addEventListener('click', () => {
        if (!isCardValid(q, stored)) return;
        _state.currentIdx += 1;
        renderCurrentCard();
    });
}

// ─── 헬퍼 ──────────────────────────────────────────────────
function initResponse(q) {
    return {
        chipBlocks: (q.chipBlocks || []).map(() => ({ selected: [], other: '' })),
        freeTextBlocks: (q.freeTextBlocks || []).map(() => ''),
    };
}

function isCardValid(q, response) {
    // 모든 칩 블록 = 최소 1 선택 또는 기타 입력. optional: true 블록은 건너뜀.
    if (q.chipBlocks) {
        for (let i = 0; i < q.chipBlocks.length; i++) {
            const block = q.chipBlocks[i];
            if (block.optional) continue;
            const storedBlock = response.chipBlocks[i] || { selected: [], other: '' };
            const hasSelection = storedBlock.selected.length > 0 || storedBlock.other.trim().length > 0;
            if (!hasSelection) return false;
        }
    }
    // 필수 자유 텍스트 = 1자 이상
    if (q.freeTextBlocks) {
        for (let i = 0; i < q.freeTextBlocks.length; i++) {
            const ft = q.freeTextBlocks[i];
            if (ft.required) {
                const value = response.freeTextBlocks[i] || '';
                if (value.trim().length === 0) return false;
            }
        }
    }
    return true;
}

function updateNextButton(q) {
    const stored = _state.responses[q.id];
    const nextBtn = document.querySelector('.presurvey-btn-next');
    if (!nextBtn) return;
    nextBtn.disabled = !isCardValid(q, stored);
}

function updateStepperDots(currentStep) {
    document.querySelectorAll('#presurvey-stepper .onboarding-step-dot').forEach(el => {
        const n = parseInt(el.dataset.step, 10);
        el.classList.toggle('active', n === currentStep);
        el.classList.toggle('done', n < currentStep);
    });
}

function closeForm() {
    if (!_backdropEl) return;
    if (_state) _state.aborted = true;
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
    _backdropEl.remove();
    _backdropEl = null;
    _state = null;
    // onComplete 콜백 자연 호출 (마침·닫기 둘 다 동일 결로 처리 — 시안 단계)
    const completeFn = _onComplete;
    _onComplete = null;
    if (typeof completeFn === 'function') {
        try { completeFn(); } catch (e) { console.warn('[postSurveyForm] onComplete 호출 실패:', e); }
    }
}

function stripHtml(s) {
    return String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return escapeHtml(str);
}
