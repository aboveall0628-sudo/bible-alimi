/**
 * suProxy.ts — 매일성경(성서유니온) 오늘 본문·해설 프록시
 *
 * 클라이언트는 sum.su.or.kr:8888을 직접 호출할 수 없음 (CORS, 다른 출처 + 비표준 포트).
 * Functions가 대신 fetch → HTML 파싱 → JSON으로 돌려줌.
 *
 * 호출 (클라이언트):
 *   const result = await httpsCallable(functions, 'suProxy')({});
 *
 * 응답:
 *   { ok: true, source: 'su', date, title, passageHtml, commentaryHtml, sourceUrl, fetchedAt }
 *   실패 시: { ok: false, reason, sourceUrl }
 *
 * 주의:
 *   - SU 페이지에 안정적인 class/id가 없어 휴리스틱 파싱. SU가 마크업을 바꾸면 깨질 수 있음.
 *   - 그래서 항상 sourceUrl을 함께 돌려줘 클라이언트가 "외부에서 보기" 폴백을 띄울 수 있게 함.
 *   - 결과는 외부 데이터 그대로 — 사용자 개인정보·DEK와 무관.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as cheerio from "cheerio";

const SU_URL = "https://sum.su.or.kr:8888/bible/today";

interface SuRequest {
    /** 선택: 특정 날짜를 요청하고 싶을 때. 기본은 SU 사이트의 "오늘". */
    date?: string;
}

interface SuResponse {
    ok: boolean;
    source: "su";
    date: string | null;
    title: string | null;
    /** 본문 구절을 <p data-verse="N">텍스트</p> 형태로 정규화 */
    passageHtml: string;
    /** 해설 문단들을 안전한 단순 <p>로 정규화 */
    commentaryHtml: string;
    sourceUrl: string;
    fetchedAt: string;
    /** 파싱이 거의 빈손인 경우 클라이언트가 폴백 안내를 띄울 수 있도록 */
    parseConfidence: "high" | "low";
    reason?: string;
}

export const suProxy = onCall<SuRequest, Promise<SuResponse>>(
    {
        region: "asia-northeast3",
        memory: "256MiB",
        timeoutSeconds: 30,
        cors: true,
    },
    async (req) => {
        // 1) 인증 — llmProxy와 동일 정책
        if (!req.auth) {
            throw new HttpsError("unauthenticated", "로그인 후 이용해 주세요.");
        }

        const sourceUrl = SU_URL;
        const fetchedAt = new Date().toISOString();

        // 2) SU 페이지 fetch
        let html: string;
        try {
            const res = await fetch(sourceUrl, {
                headers: {
                    // 일반 브라우저처럼 보이기 — SU가 헤더로 차단하는 경우를 줄임
                    "User-Agent":
                        "Mozilla/5.0 (compatible; SanctumOS/1.0; +https://aboveall0628-sudo.github.io/sanctumos/)",
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "ko-KR,ko;q=0.9",
                },
                // SU는 응답이 보통 1~2초. 25초 안에 못 받으면 폴백.
                signal: AbortSignal.timeout(25000),
            });
            if (!res.ok) {
                return emptyResponse(`SU 응답 ${res.status}`, sourceUrl, fetchedAt);
            }
            html = await res.text();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn("[suProxy] fetch failed:", msg);
            return emptyResponse(`fetch 실패: ${msg}`, sourceUrl, fetchedAt);
        }

        // 3) HTML 파싱 — 안정적인 selector가 없어 휴리스틱
        try {
            const parsed = parseSuHtml(html);
            return {
                ok: true,
                source: "su",
                date: parsed.date,
                title: parsed.title,
                passageHtml: parsed.passageHtml,
                commentaryHtml: parsed.commentaryHtml,
                sourceUrl,
                fetchedAt,
                parseConfidence: parsed.confidence,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn("[suProxy] parse failed:", msg);
            return emptyResponse(`파싱 실패: ${msg}`, sourceUrl, fetchedAt);
        }
    }
);

function emptyResponse(reason: string, sourceUrl: string, fetchedAt: string): SuResponse {
    return {
        ok: false,
        source: "su",
        date: null,
        title: null,
        passageHtml: "",
        commentaryHtml: "",
        sourceUrl,
        fetchedAt,
        parseConfidence: "low",
        reason,
    };
}

/**
 * 휴리스틱:
 *  - 날짜: 본문 어딘가의 YYYY.MM.DD 패턴 (예 "2026.05.12 (화)")
 *  - 제목: 가장 위쪽의 <h3>·<h2>·<h1> 중 텍스트가 짧고 본문이 아닌 것
 *  - 본문 구절: 첫 <ol>의 <li> (구절 번호가 자동 매겨짐)
 *              또는 "1절", "2절"이 본문 안에 직접 등장하는 형태
 *  - 해설: 본문 ol 이후의 <p>·<div> 텍스트 (앵커가 명확하지 않으면 body 전체에서 본문 다음 텍스트)
 */
function parseSuHtml(html: string) {
    const $ = cheerio.load(html);
    // 우선 보일 만한 스크립트/스타일 제거
    $("script,style,noscript").remove();

    const bodyText = $("body").text();

    // 날짜 — YYYY.MM.DD 가장 먼저 나오는 것
    const dateMatch = bodyText.match(/(20\d{2})\.(\d{1,2})\.(\d{1,2})/);
    const date = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
        : null;

    // 제목 — h1~h3 중 가장 짧은(40자 이내) 첫 번째 의미 있는 것
    let title: string | null = null;
    $("h1,h2,h3,h4").each((_, el) => {
        if (title) return;
        const t = $(el).text().trim().replace(/\s+/g, " ");
        if (t && t.length <= 60 && !t.includes("매일성경") && !t.startsWith("20")) {
            title = t;
        }
    });

    // 본문 구절 — 첫 <ol>의 li
    let passageHtml = "";
    const firstOl = $("ol").first();
    if (firstOl.length > 0) {
        const verses: string[] = [];
        firstOl.find("> li").each((i, el) => {
            const text = $(el).text().trim().replace(/\s+/g, " ");
            if (!text) return;
            const verseNum = i + 1;
            verses.push(
                `<p class="su-verse" data-verse="${verseNum}"><span class="su-verse-num">${verseNum}</span> ${escapeHtml(text)}</p>`
            );
        });
        passageHtml = verses.join("");
    }

    // 해설 — 본문 ol 이후의 의미 있는 <p>·<div>
    const commentaryParts: string[] = [];
    if (firstOl.length > 0) {
        // ol 뒤의 형제 + 그 안쪽 들을 훑어가며 길이 30자 이상인 텍스트만 수집
        const after = firstOl.nextAll();
        after.each((_, el) => {
            const t = $(el).text().trim().replace(/\s+/g, " ");
            if (t.length >= 30) {
                commentaryParts.push(`<p>${escapeHtml(t)}</p>`);
            }
        });
        // 형제만으로 부족하면 부모의 형제까지 한 번 더
        if (commentaryParts.length === 0) {
            firstOl.parent().nextAll().each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, " ");
                if (t.length >= 30) {
                    commentaryParts.push(`<p>${escapeHtml(t)}</p>`);
                }
            });
        }
    }
    // 그래도 빈손이면 body의 모든 p 중 60자 이상 텍스트 — fallback
    if (commentaryParts.length === 0) {
        $("p").each((_, el) => {
            const t = $(el).text().trim().replace(/\s+/g, " ");
            if (t.length >= 60) commentaryParts.push(`<p>${escapeHtml(t)}</p>`);
        });
    }
    const commentaryHtml = commentaryParts.slice(0, 50).join("");

    const confidence: "high" | "low" =
        passageHtml && commentaryHtml ? "high" : "low";

    return { date, title, passageHtml, commentaryHtml, confidence };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
