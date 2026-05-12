# Sanctum OS Design System

> **Sanctum OS는 비교의 도구가 아니라 거울입니다.**
> 사용자를 채찍질하거나 응원하지 않고, 사실을 정직하게 비춰주는 차분한 도구.

기독교인 직장인·학생을 위한 개인용 묵상·시간관리·목표관리 웹앱.
하루 흐름(아침의 말씀 → 낮의 시간표 → 저녁의 회고)과 7계층 목표·8 카테고리 원칙·6색 도트 평가를 하나의 거울 시스템으로 묶는다.

---

## 출처 (Sources)

| 종류 | 위치 |
|---|---|
| 코드베이스 | GitHub: `aboveall0628-sudo/sanctumos` (브랜치 `main`) |
| 토큰 출처 | `style.css` (1~60줄에 라이트·다크 + 도트 6색 + 타이포 스케일 정의) |
| 어체 가이드 | `docs/user-guide.md`, 사용자 신고 해소 매트릭스 |
| 변경 이력 | `CHANGELOG.md` (v2.1, 2026-05-10 시점) |
| 업로드 로고 | `uploads/Sanctum_logo_sketch.svg.svg` *(빈 패턴만 있고 픽셀 임베드가 누락된 SVG — 워드마크와 거울 마크를 임시로 만들어 두었어요. 정식 로고 파일을 다시 올려 주세요.)* |

> 독자(다른 에이전트·디자이너)가 위 자원에 직접 접근할 수 없을 수도 있어요. 이 폴더의 파일만으로도 다음 디자인을 시작할 수 있도록 모든 토큰과 사례를 적어두었어요.

---

## Index — 이 폴더 안에 무엇이 있는지

```
Sanctum OS Design System/
├─ README.md                  ← 여기. 브랜드 개요·콘텐츠·시각 가이드
├─ SKILL.md                   ← Agent Skill 메타 (다운로드해서 Claude Code에서도 사용 가능)
├─ colors_and_type.css        ← 모든 CSS 토큰 (--brand-primary, --dot-*, --fs-* 등)
├─ assets/
│  ├─ Sanctum_logo_original_sketch.svg   (사용자 업로드 — 비어 있음)
│  ├─ sanctum-wordmark.svg               (임시 워드마크, 6도트 echo)
│  └─ sanctum-mark.svg                   (임시 거울 마크)
├─ preview/                   ← Design System 탭에 뜨는 카드들
│  ├─ brand-keywords.html
│  ├─ logo-wordmark.html / logo-mark.html
│  ├─ colors-surface.html / colors-ink.html / colors-brand.html
│  ├─ colors-dot-semantic.html
│  ├─ colors-dark.html
│  ├─ type-scale.html / type-hierarchy.html
│  ├─ spacing-tokens.html / radius-shadow.html / motion.html
│  ├─ buttons.html / chips.html / cards.html / inputs.html
│  ├─ dot-rating.html
│  ├─ voice-do.html / voice-dont.html
│  └─ icon-system.html
└─ ui_kits/
   └─ sanctum-app/            ← Sanctum OS 웹앱 UI 재현
      ├─ README.md
      ├─ index.html           ← 클릭스루 프로토타입
      ├─ Sidebar.jsx
      ├─ TodayView.jsx
      ├─ Timeline.jsx
      ├─ DecisionCard.jsx
      └─ QuickReviewModal.jsx
```

UI 키트는 1개입니다 — Sanctum OS는 단일 웹앱이며 마케팅 사이트나 별도 모바일 앱 코드는 저장소에 없어요.

---

## 콘텐츠 펀더멘털 (Content Fundamentals)

### 1) 보이스 한 줄
> **평서문, 사실 진술, 거울 같은 반사.** 마이크로카피만 부드러운 권유형(~할까요?).

### 2) 사람 호칭
- 1인칭(나)을 쓰지 않음. 사용자를 "당신"이라고 부르지 않음.
- 동작 주체를 흐리거나, **사용자 자신의 시점**에서 적음.
  - `"오늘의 결단"` (사용자가 적은 결단)
  - `"나의 원칙"` `"나의 목표"` (사용자가 자기 자신을 향해 부른 호칭)

### 3) 어체 / 어미
| 상황 | 어미 | 예시 |
|---|---|---|
| 본문·설명·라벨 | 평서형 `~예요 / ~돼요 / ~있어요` | "오늘은 빨강 도트가 많네요" |
| 버튼·CTA | 동사형 명령 아닌 청유·진행형 | "데이터 옮기기" "내일 묵상 시작하기 →" |
| 마이크로카피 (토스트·확인) | 부드러운 권유 `~할까요?` | "계속할까요, 멈출까요?" "한 번만 더 새로고침(F5) 해볼까요?" |
| 에러 | 평서문 + 명확한 다음 액션 | "여기서는 열 수 없어요. 웹 주소로 접속해 주세요." |
| 빈 상태 | 사실 진술 + 가벼운 안내 | "준비됐어요. [진단 시작]을 눌러볼까요?" |

### 4) 좋은 카피 (Do)
- "3일째 묵상이 비어있어요"
- "오늘은 빨강 도트가 많네요"
- "계속할까요, 멈출까요?"
- "조금 늦어지고 있어요"
- "한 번만 더 새로고침(F5) 해볼까요?"
- "말씀을 곱씹다 떠오른 생각을 한 줄씩 적어 보세요"
- "시간표에서 도트 평가를 채워가면, 오늘의 결이 여기에 자동으로 정리돼요."

### 5) 금기 카피 (Don't)
- "진짜 그리스도인이라면…" *(영적 우월감)*
- "오늘도 안 했네요?" *(죄책감 자극)*
- "최고예요! 대단해요!" *(자기계발 응원 톤)*
- "주님이 기뻐하실 거예요" *(종교 마케팅)*
- "🔥 7일 연속 달성! 레벨업!" *(게이미피케이션)*

### 6) 이모지 / 유니코드
- **사이드바·섹션 헤더에서만 1개**. 의미를 가진 표지로 사용 (`📖 오늘의 말씀`, `🌙 저녁 회고`, `🎯 나의 목표`, `📌` 핀, `🔒` 잠금).
- **본문·CTA·마이크로카피에는 절대 안 씀.** 느낌표·축하·박수 이모지 금지.
- 화살표는 유니코드(`→`)를 평서문에 한 번 끼움 정도. 데코는 없음.

### 7) 숫자·통계
- 절대 평가하지 않는다. "3일째 비어있다"는 사실이지, 잘잘못이 아니다.
- 퍼센트·랭킹·연속 N일 배지 금지. 대신 "이번 주는 빨강이 많네요" 같은 결(texture) 진술.

---

## 시각 펀더멘털 (Visual Foundations)

### 컬러
- **표면**: 종이 노트북 같은 따뜻한 오프화이트 `#FAFAF7`. 순백(`#FFF`)은 카드에서만 1단 위로 올라올 때.
- **잉크**: 거의 검정(`#2C2C2E`)이지만 살짝 따뜻. 절대 `#000` 안 씀.
- **브랜드**: `#3E5C76` 차분한 슬레이트 청. 자주 안 씀 — 액티브 탭·1차 버튼·핀 띠에만.
- **도트 6색**: 라이트·다크 동일. 시멘틱이며 장식 아님. 색 자체가 사실 진술이다.
- **다크는 곁다리가 아님**: `#1A1A1C` 캔버스 + `#6B8AA8` 살짝 밝아진 브랜드. 다크에서도 동일한 위계와 여백이 살아 있어야 함.

### 타이포
- Pretendard Variable (CDN, jsdelivr). 한글·영문·숫자 한 폰트.
- 스케일: `30 / 24 / 22 / 18 / 15 / 13 / 11`.
- 행간: 본문 `1.65`, 제목 `1.2~1.3`.
- 자간: 제목 `-0.01em`, 본문 `0`.
- **굵기 4단계만**: 400(본문) / 500(라벨·강조) / 600(소제목) / 700(제목).

### 배경
- 단색만. **그라데이션 금지**. 단, 다음 두 경우 예외:
  - 스크롤 페이드 (`linear-gradient(180deg, transparent, var(--bg-card) 40%)`)
  - 저녁 회고 종료 카드 1군데 (`linear-gradient(135deg, var(--accent-soft), var(--bg-card))`)
- 텍스처·일러스트·풀블리드 이미지 없음. 종이의 비어 있음이 곧 배경.

### 모션
- **단일 토큰**: `200ms ease-out` (`--ease`).
- 페이드 인 외에 바운스·이즈인아웃·스프링 안 씀.
- 단 두 가지 예외만 직접 정의:
  - `pendingPulse 2.4s ease-in-out infinite` — 노란 도트(보통/미평가 슬롯) 숨쉬듯
  - `spin 1s linear` — 로딩 스피너

### 호버 / 프레스
- **호버**: 배경에 `--hover` (`rgba(55,53,47,0.05)`) 깔기. 컬러는 안 바꾸거나 `--brand-primary`로 살짝 또렷해짐.
- **카드 호버**: `transform: translateY(-1px)` + `box-shadow: var(--shadow-sm)`. 1px만 들어올림.
- **프레스**: opacity 0.9. 스케일 축소 안 함.
- **선택/액티브 칩**: 배경 `--brand-primary` + 흰 글자. 또는 `--brand-soft` 배경 + 브랜드 글자.

### 보더 / 그림자
- 보더 한 가지: `1px solid var(--line)` (`#E8E8E5`).
- 카드 좌측 컬러 보더는 **의미가 있을 때만** (저녁 루프 팁, 모바일 타임라인 슬롯 — 색이 도트 평가를 전달).
- 그림자 두 단계만: `--shadow-sm` (카드 기본), `--shadow-lg` (모달·토스트).
- inner shadow / glow / neon 없음.

### 코너 반경
- `sm 8px` (작은 칩·인풋 보조), `12px` (기본 — 버튼·카드·인풋), `lg 16px` (큰 카드·모달), `pill 9999px` (필터 칩·인디케이터 도트).
- 카드의 기본 모양은 `radius-lg + shadow-sm + border`.

### 카드의 정의
```
background: var(--surface-card);
border: 1px solid var(--line);
border-radius: var(--radius-lg);          /* 16px */
padding: var(--sp-5);                     /* 24px */
box-shadow: var(--shadow-sm);
```

### 투명도 / 블러
- 모달 오버레이만 `backdrop-filter: blur(4px)` + `rgba(0,0,0,0.45)`.
- 본문 컴포넌트엔 글래스모피즘·블러·반투명 카드 없음.

### 레이아웃
- 좌측 사이드바 240px 고정. 컨텐츠 영역은 max-width `1080px`. 좌우 패딩 `40px / 64px`.
- 768px 이하 모바일: 사이드바는 오프캔버스 + 백드롭. 터치 영역 44×44px 최소.
- 그리드 / 플렉스 + `gap`만. 인라인 마진 금지.

### 피해야 할 시각 무드 (다시 한 번)
- 트렌디 SaaS 그라데이션 / 게이미피케이션 (별 5개·배지·콘페티·레벨업) / 종교 마케팅 (스테인드글라스·광선·비둘기) / 자기계발 (빨강 폭탄 CTA·굵은 산세리프·느낌표).

---

## 아이코노그래피 (Iconography)

### 현재 상태
- 코드베이스의 모든 아이콘은 **이모지**로 렌더링됨 (`📖 🌙 🎯 📊 📜 📈 👥 🏢 ⚙ 📌 🔒 👁`).
- 별도 아이콘 폰트·SVG 스프라이트·Lucide 같은 라이브러리 사용 흔적 없음.
- 별도 아이콘 이미지 파일 없음.

### 왜 이렇게 두었나
- 단일 개발자 빌드. 이모지 1개를 의미 표지로 두는 게 절제·차분의 톤에 맞음.
- 이모지를 컬러 장식이 아니라 **글리프**로 사용 — 사이드바 아이콘 폭은 `22px`로 잡혀 텍스트 옆에 작게 들어간다.

### 디자인 시스템 차원 권장
- 이모지를 그대로 유지하되, **본문·CTA·마이크로카피에는 절대 추가하지 않는다.**
- 더 정돈된 그래픽이 필요하면 **Lucide** (stroke-width 1.5, rounded corners) 또는 **Phosphor (regular)** 가 톤이 가장 가까움. 컬러는 `--ink-secondary` 한 가지로 통일하고, 액티브일 때만 `--brand-primary`.
- 새로 SVG를 그릴 경우: **stroke만, 1.5px, line-cap round, fill 없음.** Heroicons solid·Material filled 류의 단단한 fill 아이콘은 톤을 깨므로 피한다.
- **CDN 대안 (제안)**: `lucide@latest` (https://lucide.dev). 코드에 도입 시 README와 SKILL.md에 그 사실을 명시.

### 유니코드 글리프
- 화살표 `→ ←`, 점 `· •`, 핀 `📌`만 본문에서 허용. 그 외 기호로 장식 안 함.

---

## 미해결 항목 / 사용자 확인 필요

1. **로고 파일** — 업로드된 `Sanctum_logo_sketch.svg.svg`는 빈 패턴만 들어 있어요 (실제 이미지 픽셀이 임베드 안 됨). 임시로 워드마크·거울 마크 두 개를 만들어 두었어요. 진짜 로고가 있으면 PNG·SVG로 다시 올려 주세요.
2. **폰트 파일** — Pretendard Variable을 CDN으로 가져오고 있어 별도 폰트 파일을 `fonts/`에 두지 않았어요. 오프라인 배포가 필요하면 https://github.com/orioncactus/pretendard 에서 받아 와 넣을 수 있어요.
3. **아이콘 시스템** — 현재는 OS 이모지 그대로. Lucide 같은 stroke 아이콘 세트로 통일할지 결정이 필요해요.
