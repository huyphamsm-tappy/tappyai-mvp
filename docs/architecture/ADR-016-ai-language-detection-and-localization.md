# ADR-016 — AI Response-Language Detection & Localization

**Status:** Accepted — Owner-approved in production · **Date:** 2026-07-31 · **Scope:** Web backend (authoritative), Android, iOS (inheriting clients)
**Origin incidents:** 2026-07-29 (`f68836d`) and 2026-07-30/31 (`33eb188`) — both Owner-reported in production, both false-PASSed by prior AI verification before being fixed.
**Companion docs:** `AI_PLATFORM.md` §8 · `docs/Localization_Architecture.md` (2026-07-31 addendum) · `docs/ios/14_BACKEND_CLIENT_BOUNDARY.md` §2 · `docs/ios/04_API_CONTRACT.md` §2.1 · `android/docs/adr/0004-ai-language-consistency.md` · Engineering Constitution Amendment 002 (Article VII).

---

## 1. Context — what actually happened (two incidents, opposite directions)

The product rule has always been: **the AI answers in the language of the user's latest message** (explicit requests like "Answer in English" / "Trả lời bằng tiếng Việt" always win; UI locale, browser language, profile, and earlier turns are never consulted). The rule was correct. The *heuristic implementing it* failed twice, in mirror-image ways:

### Incident 1 — 2026-07-29 (fixed in `f68836d`)
`detectLang()` treated **any non-ASCII codepoint** that wasn't a recognized Asian script as Vietnamese. Autocorrect's curly quotes/dashes/ellipsis and ordinary loanwords ("café", "naïve") silently flipped fully-English messages to `vi`, which suppressed the language-override block in `promptBuilder.ts` and let the Vietnamese-language base prompt answer in Vietnamese.

### Incident 2 — 2026-07-30 (fixed in `33eb188`)
The Incident-1 fix over-corrected: it flagged `vi` on the **presence of a single Vietnamese-accented character anywhere** in the message. Real users correctly spell Vietnamese destinations and dishes with diacritics inside English sentences, so every one of these answered entirely in Vietnamese, across **every capability** (Travel, Food, Shopping, Entertainment, Spa, and General Chat — one shared function):

- `Phú Quốc itinerary, 4 days, 2 people, 8M budget`
- `Đà Nẵng hotels`
- `Best bún chả in Hà Nội?`
- `i wanna fo to eat Phở`

**The shared root defect of both incidents: treating a single character as proof of a language.** A character is not a language; a sentence is.

### Why proper nouns must not determine conversation language
"Phú Quốc", "Đà Nẵng", "Phở", "Hội An" are the *correct spellings* of the entities this product exists to talk about. An English speaker asking about Vietnam will — and per product spec **should** — write them with diacritics; the spec explicitly requires proper nouns to be preserved unchanged in responses. Any detector that lets a proper noun decide the reply language therefore guarantees the bug for exactly the product's core queries. Proper nouns are **topic signal, not language signal**.

## 2. Decision — the final detection strategy (as shipped in `33eb188`)

`detectLang()` in `src/lib/ai/intent.ts` — the **single** language-detection function in the system — evaluates the **whole message**, in this order:

1. **Script scan (whole string):** kana → `ja` · hangul → `ko` · CJK Unified/fullwidth → `zh` (non-short-circuiting) · Arabic → `ar` · Thai → `th`. These scripts are unambiguous at the character level; Latin-script languages are not — which is the entire lesson of both incidents.
2. **Latin analysis (word-level, not character-level):** split into words containing letters, then:
   - **a. All-accented shortcut:** every word carries a Latin diacritic → `vi` (a bare Vietnamese phrase or place name standing alone: "Đâu?", "Đà Nẵng").
   - **b. Function-word signal:** ≥1 *lowercase* accented word **and** ≥2 Vietnamese function words (diacritic-stripped match against a curated list: `toi, muon, khong, duoc, xem, cho…`) → `vi`. This catches genuine Vietnamese with sparse tone marks ("Cho tôi xem menu"). The list **deliberately excludes** every syllable occurring in Vietnamese place names (`noi/ha, da/nang, phu/quoc, minh, can/tho, hon, quan, gia, hoi/an, pho…`) and every English collision (`a, an, in, to, may, hay…`) — a single careless entry reintroduces Incident 2.
   - **c. Ratio rule:** share of **lowercase** accented words ≥ 0.4 → `vi`, else `en`. Lowercase is the load-bearing distinction: Vietnamese proper nouns inside an English sentence are capitalized (Phú Quốc, Phở); ordinary Vietnamese vocabulary mid-sentence is not (bún, ngon, ở). This is what separates "Đà Nẵng hotels" (English) from "quán ăn ngon ở đây" (Vietnamese).
3. **Explicit request precedence:** `detectExplicitLangRequest()` runs **before** `detectLang()` at the one call site (`src/app/api/chat/route.ts`). "Answer in English" / "Trả lời bằng tiếng Việt" / "Please respond in Japanese" always override detection.

### Why sentence-level, structurally
A single Unicode character can only ever prove *which alphabet* produced it — never *which language the author is writing*. For Latin-script languages (English and Vietnamese share the alphabet), language identity lives in the **distribution** of features across the sentence: how many words carry Vietnamese tone marks, whether they are vocabulary or capitalized names, whether Vietnamese grammar words are present. Any future change to detection MUST preserve this whole-sentence property; a reviewer seeing a `return 'vi'` reachable from a single character match should reject the change on sight.

### Known limitations (accepted, documented)
1. **Fully-undiacritized Vietnamese** ("cho toi xem menu") carries zero signal and reads as `en`. Accepted: the input is genuinely ambiguous; the user can add diacritics or say "trả lời bằng tiếng Việt".
2. **Other accented Latin languages** (a fully French/Spanish sentence) can exceed the ratio and read as `vi`. Out of scope for a Vietnam-first product whose supported set is `vi/en/ja/ko/zh/ar/th`; the explicit override covers it.
3. **Boundary sentences** near the 0.4 ratio can flip on small wording changes. The regression suite (§6) pins the canonical cases on both sides.
4. Detection is **stateless per message** — by spec, not limitation: a user switching languages mid-conversation gets each reply in that message's language.

## 3. Prompt localization (promptBuilder rules — binding)

- **Every capability receives the detected language.** `lang` is computed once per request in `/api/chat` and flows into `buildSystem()` / `buildSystemSimple()` / `buildPlanningBlock(planType, lang)`. No capability may compute its own.
- **No prompt template may contain a hardcoded fixed-language example ANSWER.** Incident 2's Travel amplification came from `buildPlanningBlock`'s literal Vietnamese sample sentences, which outweighed the top-of-prompt language override. All such literals were replaced with **described-intent meta-instructions** ("write one short natural sentence in the response's language stating your assumptions…") — the same pattern the CTA-label rule already used safely. Structure examples may exist; sentences the model could copy verbatim may not.
- **No system prompt block may override the detected language.** The language-override block has highest priority; every other block (planning, budget, scope-refusal, disclosure lines) must be language-neutral in its output instructions.
- **Prompt builders are language-aware by signature.** A builder that emits user-visible instruction text and does not accept `lang` is a defect.

### Architecture flow

```
User message (latest turn only)
   └─ /api/chat (single entry point — src/app/api/chat/route.ts)
        ├─ detectExplicitLangRequest(lastText)   ← explicit request wins
        ├─ detectLang(lastText)                  ← whole-sentence heuristic (§2)
        └─ lang ─┬─ promptBuilder.buildSystem(...lang) / buildSystemSimple / buildPlanningBlock
                 ├─ every tool execute(): searchPlaces/getNews/searchProducts/webSearch/
                 │    getWeather/getGoldPrice/getFlightPrices/getHotelPrices/getTransportOptions(..., lang)
                 │    └─ messages.ts (single localization source for tool strings)
                 ├─ tool cache keys (lang-scoped — cached results never leak across languages)
                 └─ TTS voice selection (lib/tts/voiceSelection.ts, same code set vi/en/ja/ko/zh/ar/th)
   └─ Streamed response → rendered verbatim by Web / Android / iOS clients
```

## 4. Tool localization (binding)

Every server-built string a tool returns to the model — **notes, errors, warnings, fallback messages, helper text, ratings, planning text, summaries** — must come from `src/lib/ai/messages.ts`, keyed by `lang`. Established in the `a078244` localization pass (all nine tools). Rules:

1. **No hardcoded Vietnamese (or any fixed-language) string** in any tool result field. A literal user-language string in `src/lib/ai/tools/*` is a defect, regardless of field name.
2. **New tools must take `lang`** and source every language-dependent string from `messages.ts`. `'vi'` has hand-written strings; every other code resolves to the English base (safe for the model to translate onward — English never competes with the override block the way Vietnamese did).
3. **Cache keys include `lang`.** A tool result cached under one language must never be served for another.
4. Search-query strings sent to *external providers* (Serper `hl=vi`, Overpass, Nominatim) are **data-retrieval parameters**, not user-visible text — they stay as-is and are explicitly out of scope.

## 5. Mobile parity rule (binding — Android & iOS)

**Android and iOS MUST NOT implement language detection.** Per `docs/ios/14_BACKEND_CLIENT_BOUNDARY.md` §1 ("clients render and capture; the backend decides") and `13_PARITY_GOVERNANCE.md` §5 (backend/shared bug → fix once server-side, all clients inherit):

- The Web backend (`/api/chat`) is the **single source of truth** for response language. Both incidents were fixed once, server-side, with **zero client changes** — that is the structural guarantee this rule preserves.
- Mobile clients **display backend responses exactly as streamed** — no translating, re-detecting, "correcting", filtering, or re-rendering text into another language. Client UI chrome (buttons, labels) follows the client's own i18n; AI content language is backend-owned.
- Clients never send UI locale, device locale, or profile language as an input to response-language selection (the backend does not read them; adding such a parameter requires a new ADR).
- **If client-side detection is ever genuinely required** (e.g., a future offline mode), it must be a **verified port of the same shared algorithm** (`intent.ts` semantics) shipping **with the same regression suite** (§6), changed only when Web changes — the same rule `14_BACKEND_CLIENT_BOUNDARY.md` §3 applies to fortune/split-bill ports.

## 6. Permanent regression suite

Normative for all platforms and all future refactors of detection. The executable form lives in `src/lib/ai/intent.test.ts` (Web repo — 21 cases as of `33eb188`); rows marked ◇ are normative additions from this ADR not yet in the executable suite — they behave correctly under the shipped algorithm and **must be added in the next test-only change** (this ADR is documentation-only by Owner instruction). Removing any row is forbidden without a superseding ADR (regression tests are permanent — standing project rule).

### 6.1 English expected (`en`)
| Input | Note |
|---|---|
| `Phú Quốc itinerary, 4 days, 2 people, 8M budget` | Incident-2 Owner repro #1 |
| `Đà Nẵng hotels` | place-name-dominant short query |
| `Best bún chả in Hà Nội?` | lowercase dish name + place |
| `i wanna fo to eat Phở` | Incident-2 Owner repro #2 (verbatim, incl. typo; suite uses "go") |
| `Top restaurants in Hồ Chí Minh City` | place syllables collide with VI function words |
| `Hội An walking tour` | place-name-dominant |
| `Plan a 3-day trip to Đà Nẵng` · `Phú Quốc resorts` · `Where can I try bánh mì near me?` · `Weekend trip to Cần Thơ from Sài Gòn` · `Is Hòn Thơm island worth visiting?` | additional coverage in suite |
| `What's a good restaurant near me?` · `any good café nearby?` · `I want food — something spicy` | Incident-1 cases (autocorrect punctuation, loanwords) |

### 6.2 Vietnamese expected (`vi`)
| Input | Note |
|---|---|
| `Quán bún bò ngon ở TP.HCM?` | canonical VI control |
| `Cho tôi lịch trình Đà Lạt 3 ngày` ◇ | VI request containing a place name |
| `Tôi muốn ăn phở gần đây` ◇ | VI sentence around a dish name |
| `Cho tôi xem menu` · `cho minh xem quán nào ngon` | sparse tone marks (function-word signal) |
| `đâu` · `ăn gì` · `Đà Nẵng` *(alone)* | all-accented shortcut |

### 6.3 Mixed-language cases
| Input | Expected | Note |
|---|---|---|
| `Tôi muốn book khách sạn ở Đà Nẵng` ◇ | `vi` | VI sentence with an English loanword |
| `Please suggest some good quán cà phê spots in District 1 for me` ◇ | `en` | EN skeleton quoting a VI noun phrase |

### 6.4 Explicit language override (always wins)
| Input | Expected | Note |
|---|---|---|
| `Answer in English` / `…tra loi bang tieng Anh nhe` | `en` | EN + diacritic-stripped VI forms both recognized |
| `Trả lời bằng tiếng Việt` | `vi` | |
| `Please respond in Japanese from now on` | `ja` | message itself English |
| `Quán bún bò ngon ở TP.HCM? Answer in English` ◇ | `en` | override beats a fully-VI message |
| `Plan a 3-day trip to Da Nang, please answer in Vietnamese` | `vi` | verified E2E on Preview 2026-07-30 |

## 7. Lessons learned — why prior verification falsely reported PASS

Recorded so the failure mode is structurally recognizable (feeds Engineering Constitution Amendment 002):

1. **Insufficiently real test inputs.** Vietnamese test phrases were scripted *without diacritics* ("Banh mi ngon o Ha Noi") for encoding convenience — which, under the then-current algorithm, never exercised the `vi` code path at all. Every "VI → VI" PASS was coincidental model behavior, not verified code behavior.
2. **Proper nouns with diacritics were never tested inside foreign-language sentences** — the single most common real-world query shape for this product, and precisely the failing class.
3. **Anonymous-only testing.** All AI verification ran anonymously; the Owner tests logged in (memory/preference blocks active). Not causal for these incidents, but an untested execution-path difference that Article IV already declares material.
4. **Preview/self-verification PASS is not closure.** Both incidents shipped after green gates, green E2E, and a green self-run production check. **A language bug is closed only by Owner verification on Preview or Production** (Constitution Article III / Article VI §1; ratified as Amendment 002). AI evidence is input to the Owner's verdict, never a substitute.

## 8. Alternatives considered

| Alternative | Rejected because |
|---|---|
| LLM-based detection (ask the model / a classifier) | Adds latency + cost per message to every request; non-deterministic, so the regression suite cannot pin it; the failing cases are fully solvable deterministically. |
| Library detectors (CLD3/franc) | Heavyweight for two-language discrimination; poor on short queries ("Đà Nẵng hotels" is 3 tokens); another dependency in the request hot path; still needs the proper-noun rule layered on top. |
| Whitelist of Vietnamese place/dish names to ignore | Unbounded, unmaintainable list; fails on every name not yet listed — the capitalization signal generalizes without enumeration. |
| Per-user stored language preference | Changes the product rule (spec: latest message decides); breaks mixed-language conversations; adds schema for a solved problem. Explicit override already covers "pin my language". |

## 9. Consequences

**Positive** — one deterministic function, one localization module, one regression suite; all three clients inherit fixes with zero client edits; the two known failure directions are pinned by permanent tests; mobile teams have an explicit "do not build this" boundary.

**Accepted costs** — undiacritized Vietnamese reads as English (§2 limitation 1); the function-word list needs curation discipline (its exclusion rule is documented in code and here); threshold tuning requires an ADR + suite update, not a quick edit.

**Compliance signals** — any PR touching `detectLang`/`detectExplicitLangRequest`/`messages.ts`/prompt-builder language blocks must: keep the whole-sentence property (§2), keep every §6 row green, add new incident cases to §6 rather than replacing rows, and update this ADR if the strategy changes. Any client PR implementing language detection or response translation is rejected on sight per §5.
