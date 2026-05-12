# Sanctum OS — App UI Kit

원본: GitHub `aboveall0628-sudo/sanctumos`의 `index.html` + `style.css` + `ui/*.js` (v2.1).
Sanctum OS는 단일 웹앱 — 별도 마케팅 사이트·모바일 앱 없음.

## 파일
- `index.html` — Today 뷰 클릭스루 프로토타입 (Sidebar + 핀 띠 + 말씀 + 묵상 노트 + 결단 + 통합 타임라인 + Quick Review 모달, 라이트/다크 토글)
- `Sidebar.jsx` — 좌측 240px 사이드바, 액티브 탭, 다크 토글, 잠금 타이머
- `TodayView.jsx` — 오늘 화면 컨테이너
- `Timeline.jsx` — 24h × 96슬롯 계획/실제 2열 그리드 + now-line
- `DecisionCard.jsx` — 결단 카드 (드래그 핸들, 인라인 편집, 시간 슬롯 뱃지)
- `QuickReviewModal.jsx` — 4 큰 버튼 + 만족도 슬라이더 + 단축키 1~9

## 다루지 않은 화면
- 저녁 통합 루프(스크롤 wizard) · 인물/조직 카드 · 7계층 목표 탭 · 8 카테고리 원칙 · 대시보드 히트맵 — 모두 코드는 GitHub에 있으니 필요할 때 같은 토큰·동일한 카드 정의로 추가 가능.
