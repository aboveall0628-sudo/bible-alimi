---
name: sanctum-os-design
description: Use this skill to generate well-branded interfaces and assets for Sanctum OS — a quiet personal Christian meditation, time-tracking, and goal-management web app for a Korean audience. Contains essential design guidelines (color tokens, Pretendard typography, 6-color semantic dot palette, voice/tone rules), assets (wordmark, mirror mark), and a UI kit recreating the app's core screens. Use for prototypes, mocks, slides, or production code that needs to look and feel like Sanctum OS.
user-invocable: true
---

Read `README.md` first — it covers brand identity ("거울, not 비교"), content fundamentals (voice, allowed/forbidden copy, no gamification, no religious marketing tone), and visual foundations (light + dark equally important, dot palette is semantic).

Then explore:
- `colors_and_type.css` — every CSS token (--brand-primary, --dot-*, --fs-*, --ease).
- `assets/` — wordmark + mirror mark. Logo file from user was empty; flag if a real logo is needed.
- `preview/` — small specimen cards for color, type, components, voice do/don't.
- `ui_kits/sanctum-app/` — JSX components and a click-thru index.html showing Sidebar + Today view + Timeline + Quick Review modal.

When building visual artifacts (slides, mocks, throwaway prototypes), copy assets out and write self-contained HTML files. When working on production code, import `colors_and_type.css` directly and reuse the UI kit components as references.

If the user invokes this skill without other guidance, ask:
1. What surface — full app screen, single component, slide, marketing one-pager?
2. Light or dark? (Both must look equally finished.)
3. Korean (default) or another language?
4. Any of the 6 dot colors central to this piece?

Then design as an expert in this brand. Remember the floor: 평서문, 사실 진술, 거울. Avoid: gamification, religious marketing imagery, gradient SaaS aesthetics, self-help shouting.
