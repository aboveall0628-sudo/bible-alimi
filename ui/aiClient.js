/**
 * aiClient.js — Cloud Function `llmProxy` 호출 래퍼 + 로컬 fallback
 *
 * 보안 원칙
 * - 클라이언트는 Gemini API 키를 절대 직접 보지 않음
 * - 모든 호출은 Firebase Cloud Function `llmProxy`를 경유
 * - 호출 직전에 가명화(crypto/pseudonymizer)로 사람·금액·장소 치환
 *
 * 현재 상태
 * - llmProxy 배포 전: 항상 generateLocalFallback 으로 폴백
 * - 배포 후: callLLM이 실제 Gemini 응답 반환, 실패 시도 fallback
 *
 * 캐싱
 * - 같은 task + 같은 가명화 페이로드면 IndexedDB에 결과 캐시 (24h)
 *   → 동일 인사이트 반복 호출로 비용 낭비 방지
 */

import { generateLocalFallback } from '../infra/cloudFunctionProxy.js';
import { pseudonymize, depseudonymize } from '../crypto/cryptoService.js';

const CACHE_DB = 'SanctumAICache';
const CACHE_STORE = 'llm';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

let _functionsInstance = null;

async function getCallable() {
    if (_functionsInstance) return _functionsInstance;
    try {
        // Firebase Functions SDK 동적 로드 (옵션)
        const fn = await import('https://www.gstatic.com/firebasejs/10.11.1/firebase-functions.js');
        const { auth } = await import('../data/firebase.js');
        const functions = fn.getFunctions(auth.app, 'asia-northeast3');
        _functionsInstance = fn.httpsCallable(functions, 'llmProxy');
        return _functionsInstance;
    } catch (e) {
        // Cloud Functions가 배포 안 됐거나 SDK 로드 실패 → fallback 모드
        console.info('[ai] llmProxy unavailable, using local fallback. Reason:', e?.message);
        return null;
    }
}

/**
 * LLM 호출 진입점
 * @param {string} task - 'dayReport' | 'weekReport' | 'monthReport' | 'briefing' | ...
 * @param {Object} plain - 원본 데이터 (가명화 전)
 * @param {Object} opts - { deep: boolean (true=Pro, false=Flash), stats: 폴백용 }
 * @returns {Promise<{text: string, fallback: boolean}>}
 */
export async function callLLM(task, plain, opts = {}) {
    const { masked, mapping } = pseudonymize(JSON.stringify(plain), plain.context || {});

    // 캐시 확인
    const cacheKey = await hashKey(task, masked);
    try {
        const cached = await getCachedLLM(cacheKey);
        if (cached) return { text: depseudonymize(cached, mapping), fallback: false };
    } catch { /* IndexedDB 사용 불가 시 무시 */ }

    // Cloud Function 호출 시도
    const callable = await getCallable();
    if (callable) {
        try {
            const model = opts.deep ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
            const res = await callable({ task, payload: JSON.parse(masked), model });
            const text = res?.data?.text;
            if (text) {
                setCachedLLM(cacheKey, text).catch(() => {});
                return { text: depseudonymize(text, mapping), fallback: false };
            }
        } catch (e) {
            console.warn('[ai] llmProxy call failed:', e?.message);
        }
    }

    // 폴백
    const fb = generateLocalFallback(opts.stats || {});
    return { text: fb.aiSummary, fallback: true };
}

// ─── IndexedDB 캐시 ───
function openCache() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(CACHE_DB, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(CACHE_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getCachedLLM(key) {
    const db = await openCache();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const get = tx.objectStore(CACHE_STORE).get(key);
        get.onsuccess = () => {
            const v = get.result;
            if (!v) return resolve(null);
            if (Date.now() - v.ts > CACHE_TTL_MS) return resolve(null);
            resolve(v.text);
        };
        get.onerror = () => reject();
    });
}

async function setCachedLLM(key, text) {
    const db = await openCache();
    return new Promise((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        tx.objectStore(CACHE_STORE).put({ text, ts: Date.now() }, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

async function hashKey(task, masked) {
    const enc = new TextEncoder().encode(task + '|' + masked);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 타임박싱 모달용 브리핑 — 4섹션
 */
export async function getBriefingForTask(taskKeywords, principles = [], pastStats = {}) {
    const result = await callLLM('briefing', {
        taskKeywords,
        principles,
        pastStats,
        context: { persons: [], amounts: [] },
    }, { stats: pastStats });

    if (result.fallback) {
        return {
            sections: [
                { icon: '📖', title: '관련 원칙', body: principles.length > 0
                    ? principles.map(p => `· ${p.title}`).join('\n')
                    : '아직 핀 원칙이 없어요. 나의 원칙에서 한 줄 적어 보세요.' },
                { icon: '📊', title: '지난 패턴', body:
                    `완료 ${pastStats.doneCount || 0} · 만족도 ${pastStats.avgSatisfaction || '-'}` },
                { icon: '⚠️', title: '주의할 점', body: '비교는 거울이지 채찍이 아니에요. 한 걸음만 더.' },
                { icon: '🙏', title: '묵상 점검', body: '이 시간이 오늘 말씀과 어떻게 이어지나요?' },
            ],
            fallback: true,
        };
    }

    // Gemini 응답을 4섹션 파싱 (간단 분리)
    return { sections: parseBriefingResponse(result.text), fallback: false };
}

function parseBriefingResponse(text) {
    // Gemini가 4섹션으로 응답하지 않을 수 있어 단순화: 전체를 한 섹션으로
    return [{ icon: '🌟', title: 'AI 브리핑', body: text }];
}
