/**
 * themeManager.js — 다크모드/라이트모드 제어
 *
 * 설정 페이지의 토글(#theme-setting-toggle)로 켜고 끔.
 * 켜짐 = dark, 꺼짐 = light. 페이지 진입 시점에 index.html의 FOUC 가드
 * 스크립트가 이미 data-theme를 박아두므로 여기서는 토글/저장만 담당.
 */

const STORAGE_KEY = 'sanctum-theme';

function readSavedTheme() {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
        saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return saved;
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(STORAGE_KEY, theme);
}

export function initThemeManager() {
    // 1) 저장된 테마를 즉시 적용 (FOUC 가드와 동일 결과)
    const initial = readSavedTheme();
    applyTheme(initial);

    // 2) 설정 페이지 토글에 연결
    const input = document.getElementById('theme-setting-toggle');
    if (!input) return;

    input.checked = initial === 'dark';
    input.addEventListener('change', () => {
        const next = input.checked ? 'dark' : 'light';
        applyTheme(next);
        // (2026-05-20 v95) theme_change 미션 트리거 — 다크/라이트 토글 1회.
        //   markMissionComplete idempotent 자리라 중복 호출 안전. dynamic import 결로 의존 분리.
        (async () => {
            try {
                const uid = window.currentUserId;
                if (!uid) return;
                const { getDEK } = await import('./lockScreen.js');
                const dek = getDEK();
                if (!dek) return;
                const { markMissionComplete } = await import('../data/personRepo.js');
                await markMissionComplete(dek, uid, 'theme_change', { signal: 'theme:' + next });
            } catch (e) {
                console.warn('[mission] theme_change(theme) 자리잡지 실패:', e?.message || e);
            }
        })();
    });
}
