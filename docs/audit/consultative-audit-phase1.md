# TappyAI — AI Consultative Pipeline · Phase 1 Root-Cause Audit (PARTIAL — SAFETY STOP)

**Date:** 2026-09-17 · **Branch:** `design/v3-phase4` @ `f6712b8` (worktree `v3-phase4-design`, uncommitted pre-existing changes preserved — see `git-before.txt`)
**Status:** `AUDIT STOPPED — SAFETY REQUIREMENT NOT SATISFIED.` Code-path audit complete; **NO BASELINE EXECUTED**; **NO APPLICATION CODE CHANGED**.

Legend used throughout: **[FACT]** observed in code/config/existing measurements · **[CODE]** code-path evidence with file:line · **[MEASURED-PRIOR]** a measurement that already exists in the repo (not made by this audit) · **[HYPOTHESIS]** plausible, not established · **NO DATA** could not be verified without the baseline or without access.

> **PHASE 1B (2026-09-17, after the baseline) — READ §S FIRST.** §S carries the baseline analysis (J–N filled), a new P0 (post-model guards strip the decision sentence → empty/fragmentary replies; #15-r1 reproduced offline) and the updated classification; it supersedes §K/§L/§M/§R.4.
>
> **REVIEW v1.1 (2026-09-17) — READ §R FIRST.** A second read-only pass re-traced every important conclusion below against source. §R (at the end of this document) supersedes §A's headline classification and §M: the three "P0" mechanisms are **code-proven but their causality on the dump symptom is NOT TESTED** (baseline blocked) and are reclassified **P1**; two statements in §H/§J about mobile clients were **UNSUPPORTED** and are corrected; one additional code-proven evidence limitation (places carry no price into the ranker) is added. Sections A–N are kept as written for the historical record, with inline `[REVIEW v1.1]` markers where a sentence is corrected.

---

## A. Executive Summary

1. **The consultative pipeline exists and is largely deterministic, not model-driven.** The route makes exactly ONE `AI.stream()` call per turn (`route.ts:917`); intent, language, decision stage, need profile, ranking, shortlist, pick and evidence grading are all pure functions that run either before the model call or inside the tool's `execute()`; the model is instructed to *explain* a decision the engine already made (`_tappy_ranking`, `_tappy_shortlist`). The target architecture in §0 of the brief ("Haiku decides → tool → Haiku evaluates") is **not** how the system is built: Haiku only decides *whether/which tool to call* (`toolChoice: auto`) and then *verbalises* a pre-ranked payload.

2. **The "USER → SEARCH → DUMP" symptom has three code-proven enabling conditions (P0) and several strong contributors (P1)** — none of them is a single parameter: `[REVIEW v1.1: "P0" here is superseded — these are code-proven MECHANISMS whose causal contribution is NOT TESTED; reclassified P1 in §R.4]`
   - **P0-A · The decision engine is silently absent on a large class of turns.** `isDecisionDomain` (`route.ts:788`) gates the *Tappy's Pick* instruction block on `needProfile.domain ∈ {places, hotel, shopping}`. The deterministic probe (`docs/audit/route-signals.json`) shows **6 of the 15 spec queries resolve `domain = null`** (#1, #2, #4, #8, #13, #14 — including "Tìm cho tôi một quán Nhật ngon và yên tĩnh"). On those turns the model receives `_tappy_ranking` data with **no instruction telling it what that field means**, and the web `GIAO DIEN DA HIEN THI THE` composition rule is also not sent. `[REVIEW v1.1: OVERSTATED. `_tappy_shortlist` is still attached on those turns and its rule R1b — including the DECISION-FIRST OPENING — is in the shared prompt (since #195, 2026-08-27). Only the `_tappy_ranking` explanation and the web composition block are missing, and `_tappy_ranking` is attached only when a Pick exists (decidable need: #1, #2, #8, #13 — not #4/#14). See §R.3-A.]`
   - **P0-B · The evidence cannot carry the user's stated need.** For "quiet" the need profile records a priority (`quiet`), but no provider row carries any ambience attribute and `quiet` is not in the ranker's `SCOREABLE` list (`rank.ts:99`); `cuisine` is scoreable only from the OSM fallback's `cuisine` tag (`candidate.ts:151`) — Google and Serper `/maps` rows carry `place_types`, not `cuisine`. A "quán Nhật yên tĩnh" is therefore ranked on rating / review count / distance only. The reply then has nothing user-specific to reason with beyond social proof → a rating-ordered list is the natural fallback.
   - **P0-C · Follow-up turns have no evidence in context.** Conversation history sent to the model is user text + prior assistant *text* only; `validateClientInput` strips `toolInvocations` by construction (`clientInput.ts:196-199`) and `sanitizePriorAssistantContent` strips markers/images (`route.ts:756`). On the web surface the prior reply was additionally told **not** to write hours/rating/address because the card shows them (`buildRenderedDecisionBlock`). So "Quán này mở cửa mấy giờ?" reaches the model with the venue's hours in *neither* the history *nor* a tool result; the only ways out are a fresh search (which the engine will re-rank and the UI will re-card) or an unsupported answer. Shopping has ADR-024 evidence carry-forward; **places has none** (`priorEvidence` is only written by `freezeShoppingEvidence`, `route.ts:697`).
   - **P1** factors: the shared rulebook mandates per-place metadata lines (rating line "NGAY TRUOC DIA CHI o dong RIENG", address, maps link, hours, cuisine — review block 1)/6), rule 3, 4) and per-place CTA button sets ("cho TUNG quan"), which are enumeration-shaped instructions that compete with R1/R1b/R4; the web card renders **all** ranked candidates (up to 8, `MAX_ITEMS = 8`, 3 visible + "Tất cả (n)") regardless of what the prose chose, so the *screen* is a list even when the prose is a decision; no-diacritic Vietnamese is detected as English (2 of 12 language cases FAIL); `search_products` is silently removed on any `locationIntent === 'offline'` turn.

3. **Parameter hypotheses A/B/C (temperature, thinking, maxSteps=5) are NOT supported as root causes.** `maxSteps` is 5 on tool turns; the only existing measurement (Phase B baseline, 2026-08-10) shows tool turns averaging **2.0 steps and 1.24 tool calls** with no evidence of step exhaustion. Temperature is unset (provider default) and thinking is off — both are true, but nothing in code or prior measurement ties them to the dump symptom. Rated **P2 — open, warrants testing only after P0s are addressed**.

4. **Safety stop.** The only local environment (`.env.local`) points at Supabase project `fwznnobrdctuskgrvuik`, which the repo's own reports name as **production** (`docs/backoffice/phase-reports/ANALYTICS_STEP2_ENV_VERIFICATION.md:44`), and at a distributed KV store that is the **production AI-question quota store** (`aiQuestionQuota.ts:140-146`). Running the baseline there would spend production quota (guest tier: 5 **lifetime** per IP — the owner's IP), write memory/evidence rows for whichever account was used, and a dedicated isolated test user does not exist. See §K.

---

## B. Actual Current AI Pipeline (traced)

All paths relative to `src/`. Execution order as the code runs.

| # | Stage | Where | What actually happens |
|---|---|---|---|
| 1 | Client (web) | `components/ChatInterface.tsx:820-846` | Vercel AI SDK `useChat({ api: '/api/chat', headers: {'x-tappy-surface':'web'}, body: { userLocation?, userPreferences?, responseStyle?, decisionEvidenceId?, context? } })`. Sends the **full client-held message list** every turn (server caps at 100, then trims to last 10). Cards are rendered from the `8:` annotation (`readPlacesLiveView`, line 1399). |
| 1b | Client (Android) | `android/app/.../chat/data/RealChatRepository.kt:41-44`, `ChatRequest.kt` | POST `/api/chat` with **`messages` only** — no `userLocation`, no `responseStyle`, no `decisionEvidenceId`, no surface header. Parses only `0:` text frames (line 147); markers (`CTA_BUTTONS`, `FOLLOWUPS`, `TAPPY_PLAN`, `TAPPY_SHOPPING`, images) parsed client-side in `ChatResponse.kt:71-116`. |
| 1c | Client (iOS) | `ios/TappyAI/Features/Chat/Data/ChatService.swift:15-18` | Same as Android: `messages` only. Markers parsed in `ContentParser.swift`. |
| 2 | Route entry | `app/api/chat/route.ts:62-100` | `flushPending` (telemetry), IP flood guard 30/min, JSON parse. |
| 3 | Trust boundary | `route.ts:113-127` → `lib/ai/security/clientInput.ts:146+` | Messages **rebuilt from an allowlist**: role ∈ {user, assistant}; `content` string or parts. `toolInvocations`, `parts`, `annotations`, `data`, `id` **dropped by construction**. Empty assistant turns dropped. |
| 4 | Pre-model classification (pure) | `route.ts:171-243` → `lib/ai/intent.ts`, `consultative/*` | `classifyIntent` (chitchat vs tool, regex) · `extractBudget` · `detectLocationIntent` · `detectPlanningIntent` · `detectMovieRecommendationIntent` · `lang = detectExplicitLangRequest ?? detectLang` · `detectForcedTool` (**logging/memory-gate only — it does not force a tool**, lines 182/190/367/1446) · `detectTravelIntent` · `resolveDecisionStage(messages)` · `classifyTurnIntent` · later `deriveNeedProfile(messages, {storedPreferences, gps})` (line 531). |
| 5 | Identity / quota / memory | `route.ts:250-386` | `getRequestUser` (Supabase JWT). Anonymous session → `consumeAiQuestion` (5 lifetime). Account → restriction check, then parallel: `buildChatPromptContext` (memory + prefs), calendar, subscription; then quota spend 15/day unless Pro. No identity → guest quota by IP (5 lifetime). **Quota spend happens before any model/tool work**, against the distributed KV when `KV_REST_API_URL` is set. |
| 6 | Prior evidence (ADR-024) | `route.ts:400-455` | `decision_evidence_load(p_id)` RPC — **shopping only** in practice (only `freezeShoppingEvidence` writes it). Carried forward under a fresh id each turn. |
| 7 | Prompt assembly | `route.ts:743-819` → `lib/ai/promptBuilder.ts:249-484` | `noToolTurn = !clip && (chitchat ‖ stage==='confirmation')`. Else `buildSystem(...)` → `{ shared, dynamic }`. `consultativeBlock` = [clip block] + [ranking instruction if `isDecisionDomain`] + [rendered-decision block if `isDecisionDomain && surface==='web'`] + [shopping grounding + synthesis if shopping] + [prior evidence / missing-evidence] + [transport mode] + [movie]. Appended to `dynamic` as `pickBlock`, followed by `closingBlock`. `styleBlock` (tone/length) appended last. |
| 8 | Model call | `route.ts:917-1200` → `lib/ai/llm/ai.ts:56` → `providers/claude.ts` | `streamText({ model: haiku-4-5-20251001, messages:[system(shared, cache_control ephemeral), system(dynamic), ...last-10 sanitized messages], maxTokens, maxSteps, tools, onFinish, onChunk, onStepFinish, abortSignal })`. No `temperature`, no `toolChoice`, no `maxRetries`, no thinking. |
| 9 | Tool decision | SDK | `toolChoice` = SDK default `'auto'` (confirmed by the repo's own analysis: the old `prepareStep` was dead code, `route.ts:944-955`). |
| 10 | Tool execution | `route.ts:961-1210` | 9 tools (10 with `save_price_watch` when authenticated). `search_places` dropped on movie-recommend turns; `search_products` dropped when `locationIntent==='offline'`. Each `execute` is timed (`timeTools`). |
| 11 | Search | `lib/ai/tools/food.ts:655` `searchPlaces` | Module-level cache (30 min, keyed on query/location/type/bias/lang). Provider chain: Google Places (New) Text Search (5 s race, breaker) → Serper `/maps` → OSM/Overpass. Output rows (§E). Then, gated on the *user's words*, extra Serper `/search` calls for price snippets (`wantsPriceDetail`) and food-order pages; entity/area scoping via `placeNamedBy`; `review_actions`; TappyAI community rating from prod `reviews` table. |
| 12 | Result transformation (deterministic engine) | `route.ts:587-676` `rankForModel` | `normalizePlaces` → (shopping: `validateShoppingCandidates`) → `rankCandidates(candidates, needProfile)` → relaxation proposal if all filtered → `_tappy_shortlist` (1–3, places/hotel) → **reorder the `results` array the model reads** by rank → `derivePick` → `_tappy_ranking = buildPickPayload(pick)`. Places are **not trimmed** (up to 8/10 rows stay); shopping is trimmed by `shortlistShopping`. |
| 13 | Split for the model | `lib/ai/toolResultSplit.ts:140` | Photos, `order_links`, `platform_links`, `tiktok_review_url`, `photo_names` are **carved out** of the model's view and replaced by capability booleans; everything else (name, address, rating text+numbers, hours, phone, website_uri, place_id, price band, types, distance, `review_actions`, `_tappy_*`) goes to the model. |
| 14 | Model step 2+ | SDK | Model reads the tool result and writes the reply (≤ `maxSteps`). |
| 15 | Post-processing | `lib/ai/streamEnrichment.ts:778` `applyPlaceEnrichmentStreamFilter` | Place/travel/ticket turns **buffer** the whole reply; run guards (`guardMoneyClaimsInText`, `guardTravelClaimsInText`, `guardPlaceClaimsInText`, `suppressUngroundedVenues`, snippet-price guard); resolve photos for named places; inject photo/link blocks positionally; strip model CTA only if `SERVER_AUTHORED_CTA` (**false**); append `[TAPPY_SHOPPING]` marker; `[TAPPY_PLACES]` marker gated **off** (`EMIT_TAPPY_PLACES=false`); emit the places **annotation** (`8:` frame, `EMIT_PLACES_ANNOTATION=true`) once after the prose. Luxury filter if budget < floor. |
| 16 | Client render | web `PlaceDecision.tsx` | Renders `items` (engine order, lead first, up to 8), `VISIBLE = 3`, filter chips incl. "Tất cả (n)". Mobile: prose + markers only (no annotation consumer). |
| 17 | onFinish | `route.ts:1177-1229` | Usage accounting; memory extraction (**second LLM call**, `extractMemoryFromConversation`) when authenticated and `shouldExtractMemory` — writes `user_memory` via admin client. |

**Model calls per turn:** 1 stream (1..maxSteps provider round-trips) + 0/1 memory extraction. There is **no separate "understand intent" model call and no separate "evaluate evidence" model call** — both jobs are either regex/heuristics (pre-model) or the deterministic ranker (post-tool).

---

## C. System Prompt Audit

Source: `lib/ai/promptBuilder.ts` (`SYSTEM_BASE` lines 64-174, `reviewBlock`, `ctaBlock`, `scopeBlock`, `safetyBlock`, `renderEvidencePolicyBlock`) + dynamic blocks; consultative blocks in `consultative/pick.ts`, `consultative/synthesis.ts`. Measured shape (`docs/audit/prompt-shape.json`): **shared segment 38,158 chars** (cached prefix); dynamic **4,191 chars** on a first-reply web places turn, **12,121 chars** on a shopping turn; chitchat prompt 964 chars. Counts in the shared segment: 35 × "TUYET DOI KHONG", 38 × "PHAI/BAT BUOC", 14 × "liet ke/tom tat", 19 × "nghieng ve/vi sao/ly do", 37 mentions of "hoi".

**Order as the model reads it:** `SYSTEM_BASE` (persona, tools, style, R1–R7, rules 1–20) → review/photo block → CTA block → scope block → safety block → evidence-provenance block ‖ *cache breakpoint* ‖ language override → clock → memory → prefs → stage block → planning → camera → word limit → budget → location → GPS → **consultative block(s)** → closing "one question" check → style block.

### C.1 Does it address each consultative concern? [FACT]

| Concern | Addressed? | Where |
|---|---|---|
| Intent understanding | Partly — the *stage* (refinement/comparison/decision/rejection/confirmation) is stated in a dynamic block when the regex detector fires; no instruction to restate/interpret intent otherwise | `stageBlock` |
| Explicit constraints | Yes — R1(h) hard constraints, budget block, shopping constraint validation | `SYSTEM_BASE` R1(h), `budgetBlock` |
| Implicit context | Memory/prefs/GPS blocks; R7 "khong hoi lai thu da biet" | dynamic blocks, R7 |
| Tool necessity | "LUON goi tool khi user hoi ve dia diem…" (rule 1) — **always search**, no instruction to *decide not to* except chitchat | rule 1, 2, 8 |
| Evidence evaluation | R1(c)(d)(f), evidence-provenance block, shopping grounding block | yes |
| Matching evidence to intent | R1b "EVIDENCE → REASONING (NOT DUMPING)", ranking block "gan vao dung dieu user da noi" | yes, but only on decision-domain turns for the ranking block |
| Ranking | Delegated to engine: "QUYET DINH LA DETERMINISTIC ENGINE, KHONG PHAI BAN" (R1b), "DA CHON SAN, BAN CHI GIAI THICH" | R1b (shared), ranking block (dynamic, gated) |
| Recommendation / lean | R1(e), R4 (end with recommendation), decision stage block, R1b decision-first opening | yes |
| Explain why | R1(c), R1b, ranking block | yes |
| Avoid raw dumps | R1(a) 2-4 options, R1b "KHONG mo rong len 5-8", R2 ≤3 bullets, web rendered-decision block, shopping "KHONG PHAI DE LIET KE" | yes |
| Avoid unsupported claims | safety block 2-3, evidence block, shopping grounding, 16b location must be real | yes, extensively |
| Useful clarification | R7 ladder, closing block ≤1 question | yes |
| Insufficient evidence | R1(i), rule 5, `no_results_instruction` in the tool result | yes |
| Selecting among candidates | R1b shortlist, pick block, decision stage block | yes — when present |

**Verdict [FACT]:** the *intent* of the prompt is unambiguously consultative. The prompt is not the primary cause of a summarizer style; it is, however, very long, and it carries enumeration-shaped mandates that compete with the consultative rules (C.2).

### C.2 Instructions that encourage listing / metadata repetition / search-engine language [CODE]

| Instruction | Effect |
|---|---|
| Rule 3: "Neu tool tra ve du lieu: hien thi ten, dia chi, link ban do cu the" | per-place metadata |
| Rule 4: "LUON hien thi link [google_maps_search] … BAT BUOC" | a search-results link in every places reply (web block later says *don't* — conflict) |
| Review block 1): rating line **bold, on its own line, before the address, for every place** ; 6): mention cuisine/hours/vegetarian per place | metadata per candidate — the classic "listing" shape |
| Rule 9 (web_search): "tom tat 2-3 ket qua dau (title + snippet) roi cung cap link [Xem them ket qua tim kiem]" | literal search-result summarising |
| Rule 12/13/15/16: "PHAI liet ke NGAY … vai chuyen bay", "tom tat NGAY … ten khach san", "PHAI tom tat NGAY … ten san pham va gia", "nhac them 1-2 ten khac" | mandatory enumeration for flights/hotels/products/transport |
| CTA block: "tao bo nut cho TUNG quan (uu tien 2-3 quan dau neu liet ke nhieu)", "Neu liet ke nhieu khach san: … cho 2-3 khach san dau" | assumes a multi-candidate list; JSON block adds tokens |
| R6: `[FOLLOWUPS]` line "HAY them" on every suggestion reply | automatic follow-up chips (three) — contradicts "follow-up only when useful" as a *product* behaviour, though it is UI chips not a question |
| Tool descriptions expose provider names ("Google Search (Serper)", "OSM") and rule f) says to cite "theo Google Maps" | encourages search-engine-style attribution language |

### C.3 Conflicts and probable dominance [CODE + HYPOTHESIS]

- **R1(a) "2-4 lua chon" vs R1b "chi viet ve `_tappy_shortlist` (1..3)" vs web block "2-3 lua chon thay the".** Three different counts. R1b is conditional on the field existing; when the shortlist is absent (domain-null turns, or `rankable=false`) R1(a) governs → 2-4 options.
- **Rule 4 (always print the maps search link) vs web rendered-decision block ("KHONG viet lai link Google Maps tong hop").** The web block is later in the prompt and more specific; on a non-web surface rule 4 stands.
- **Word limit 150 words (first reply) vs the per-place mandatory lines (rating line + address + hours + cuisine + CTA JSON).** Arithmetic: three places × (rating line + address + one-line why) already consumes most of 150 words, leaving little room for the "why for this user" that the consultative rules ask for. [HYPOTHESIS] this squeeze pushes replies toward terse metadata lines.
- **R4 "end with your recommendation" vs R6 "`[FOLLOWUPS]` on the LAST line".** Resolved by the parser (chips are stripped), but the model's *last written line* is the chips.
- **Dominance:** the language override is placed first in `dynamic` and the closing block last, both by design ("last thing read"). The shared rulebook precedes both. Empirical dominance between R1b and the metadata rules is **NO DATA** without the baseline.

### C.4 Rule R1b is in the *shared* prompt but the *Pick* explanation is gated [CODE]

`_tappy_shortlist` semantics are in `SYSTEM_BASE` (always sent). `_tappy_ranking` semantics (`buildRankingInstructionBlock`) are only sent when `isDecisionDomain` (`route.ts:788-790`, comment: "only carried on turns that can actually produce a ranked result"). But `rankForModel` runs and attaches `_tappy_ranking` **whenever the tool runs and ≥2 candidates are rankable** (`route.ts:1035`), independent of `needProfile.domain`. So on a domain-null turn the model sees `_tappy_ranking: { pick, decided_by, not_chosen… }` with **no rule explaining it** (it is not mentioned anywhere in `SYSTEM_BASE`; verified by grep).

---

## D. Model / Tool Configuration Audit [FACT]

| Parameter | Current value | Where |
|---|---|---|
| Provider | Claude (`LLM_PROVIDER` default) | `llm/registry.ts:36` |
| Model (all roles) | `claude-haiku-4-5-20251001` for fast/smart/planning/vision (env override `LLM_*_MODEL` — value in the running env: **NO DATA**; not in `.env.local`) | `providers/claude.ts:37-42` |
| SDK | `ai@4.3.19`, `@ai-sdk/anthropic@1.2.12` | `package-lock.json` |
| `toolChoice` | not passed → SDK default `'auto'` | `ai.ts:56-68`, route comment 944-955 |
| `maxSteps` | no-tool turn **1**; planning **8**; image **3**; otherwise **5** | `route.ts:943` |
| `maxTokens` | no-tool **300**; planning **4096**; image **1024**; otherwise **3072** | `route.ts:942` |
| `temperature` | **not passed** (provider default; Anthropic API default is 1.0 when omitted) | `ai.ts` `stream()` does not forward one; `AIStreamOptions` allows it but route never sets it |
| Reasoning / thinking | **off** (no `providerOptions.anthropic.thinking`) | `providers/claude.ts` |
| Prompt caching | on: `anthropic-beta: prompt-caching-2024-07-31`, `cache_control: ephemeral` on the **first** system message (`systemShared`) | `providers/claude.ts:47,78-86` |
| Streaming | yes, `toDataStreamResponse()` → transformed by enrichment filter | `route.ts:1249` |
| Retries | not set → SDK default (`maxRetries: 2`) | grep: no `maxRetries` in `src/lib/ai/llm` or route |
| Timeout | Vercel function `maxDuration = 60`; tools: Places 5 s race, Serper `serperSearch` 4 s, og:image 1.8 s, others per `common.ts:359` | `route.ts:60`, `food.ts:711`, `common.ts:302` |
| Tools offered (tool turn) | `search_places` (unless movie-recommend), `get_news`, `search_products` (unless `locationIntent==='offline'`), `web_search`, `get_weather`, `get_gold_price`, `get_flight_prices`, `get_hotel_prices`, `get_transport_options`, `save_price_watch` (authenticated only) | `route.ts:961-1176` |
| Tool schemas | `search_places { query, location?, type? enum(9) }` · `search_products { query }` · `web_search { query }` · `get_hotel_prices { location, checkIn?, checkOut? }` · … | same |
| Response style | client `responseStyle {tone,length}` → `styleBlock` appended last | `route.ts:135-146` |

### D.1 `maxSteps` — actual behaviour

- **[MEASURED-PRIOR]** `docs/perf/PHASE_B_BASELINE_2026-08-10.md` §2: 21 tool turns → **42 LLM calls (2.0 steps/turn)**, **26 tool calls (1.24/turn)**; 3 chitchat turns → 1 step. No turn is reported as reaching 5 steps; no repeated-tool loop is reported. Caveat recorded there: Places/Serper keys were empty in that run, so tool payloads were smaller than production.
- **[CODE]** `usageAcct.llmCalls = steps.length`, `toolCalls` summed per step (`route.ts:1207-1208`) are logged on every turn as `tappyai_usage` — production values: **NO DATA** (not accessible from this audit; `GCP_LOGGING_ENABLED` not set locally).
- **[CODE]** A chitchat-classified turn runs `maxSteps: 1` with **no tools**; the repo documents that a mis-classified chitchat turn used to return an empty reply (`intent.ts:9-21`).
- **Verdict:** no evidence that `maxSteps=5` truncates consultative synthesis. **P2 / NO DATA** for production.

---

## E. Search Result → Haiku Context Audit [CODE]

What the model receives for `search_places` (after `splitToolResult`), by provider:

| Field | Google Places (New) | Serper `/maps` | OSM |
|---|---|---|---|
| `name`, `address`, `maps_link`, `place_id` | ✔ | ✔ | ✔ |
| `google_rating` (formatted text) + `rating_value`, `rating_count` | ✔ | ✔ | — |
| `opening_hours` (today) / `open_now` / `opening_hours_week` | ✔ / ✔ / — | ✔ / ✔ / ✔ | OSM tag when present |
| `phone`, `website_uri` | ✔ | ✔ | sometimes |
| `price_level` (0-4) / `price_range {low,high}` | ✔ | `price_range_text` ("1-100.000 ₫") | — |
| `lat`,`lng`; `distance_km` (**only when centred on the user, never for a remote destination**) | ✔ | ✔ | ✔ |
| `place_types` | ✔ | ✔ | — |
| `cuisine`, `vegetarian`, `wifi`, `outdoor` | — | — | OSM tags |
| **ambience / noise / "quiet" / "view" / "chill"** | **—** | **—** | **—** |
| `review_actions[]` (kind,label,url,attributed), `has_tiktok_review` | ✔ (food/spa/ent.) | ✔ | ✔ |
| photos, order/platform links | **carved out** → `can_order` etc. booleans | same | same |
| Root: `source`, `count`, `location`, `google_maps_search`, `_tappy_place_domain`, `place_search_status`, `no_results_instruction` (on empty), `price_search_results[]` (+`evidence_scope`), `price_evidence`, `order_search_results[]`, `_tappy_shortlist[]`, `_tappy_ranking{}`, `_tappy_relaxation{}` | | | |

**Observations**
- Rows are **8** (Google) / **10** (Serper) / OSM count — **not trimmed** for places ("places are left whole", `route.ts:654`). The model sees the full candidate table, ordered by the ranker, plus the shortlist and pick on top. **[FACT]** Nothing in the payload itself says "list these"; but the shape (8-10 uniform rows each with rating/address/hours) is the canonical listing shape, and R1(a) allows 2-4.
- **Duplicates:** NO DATA (provider-dependent; the clip path dedupes on canonical id, the generic path does not).
- **Evidence sufficiency for the spec's needs:** for *quiet / chill / đẹp (view) / thư giãn, sạch sẽ* there is **no attribute** anywhere in the payload → the model can only (a) infer from names/types, (b) borrow the user's wish back as a claim (which the shopping grounding block forbids, but no equivalent block exists for places), or (c) fall back to rating. **This is the code-proven half of hypothesis G.**
- `price_search_results` are area-level listicle snippets unless `placeNamedBy` ties them to one venue; the model is told to treat them as area evidence.
- `web_search` result contract (rule 9) is *literally* "summarise the top 2-3 results + link" — for #4/#14-type open questions, if the model picks `web_search`, a search summary is what the prompt asks for.

---

## F. Candidate-Key Audit [CODE]

- **There is no C1/C2/C3 candidate-key contract anywhere in the model-facing payload.** Candidates are identified by **name** (`_tappy_shortlist[].name`, `_tappy_ranking.pick` is a name, `not_chosen` is a name) and by `id` = provider place id in `_tappy_shortlist` and in the annotation (`liveView.ts`). Grep for `C1|C2|C3|candidate_key|candidateKey` in `src/lib/ai` and clients: no such contract.
- Where keys are created: `normalizePlaces` (`candidate.ts`) builds `Candidate { id, name, attrs, raw }`; `shortlistCandidates` dedupes on canonical id; the annotation (`buildPlacesLiveView`) carries `LivePlace` items with ids and action URLs.
- Enrichment: photos/links resolved **after** the model wrote the reply, by matching the **names the reply mentions** (`selectPlacesNeedingEnrichment(places, mainText)`), so the reply's wording decides which cards get photos — name fidelity matters, keys do not.
- Canonical URLs: hidden from the model (carved), re-attached positionally by the stream filter; `review_actions[].url` **is** visible to the model and it is told to copy it verbatim.
- Ranking occurs **before** model selection (in `execute()`), and the model is told not to re-rank.
- Contradictory candidate data: `buildPickPayload` explicitly annotates the case where the runner-up leads on the same attribute (`pick.ts:257-270`).
- Web vs mobile interpretation: web reads the annotation (engine order); mobile reads prose + CTA JSON only. A future key-based contract would need to be added to three parsers.
- **Do keys encourage list style?** Not applicable — there are none. The shortlist/pick contract explicitly discourages lists. **Hypothesis "candidate keys cause enumeration": not supported.**

---

## G. Conversation History Audit [CODE]

- **Included:** last **10** messages (`route.ts:729`), roles user/assistant only, assistant text with `[TAPPY_PLAN]`, `[TAPPY_SHOPPING]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`, markdown images **stripped** (`sanitizePriorAssistantContent`).
- **Excluded:** all prior tool calls/results (stripped at the trust boundary), annotations, structured cards, the prior turn's `_tappy_*` payloads. Prior recommendations survive **only as prose**.
- **Shopping exception:** ADR-024 `decision_evidence_*` RPCs re-inject the prior shopping listing table as a block (`renderDecisionEvidenceBlock`), keyed by the id the *web* client stores in `sessionStorage`. Mobile clients never send `decisionEvidenceId` → no carry-forward on mobile.
- **Places:** no equivalent. A place follow-up (#1 hours, #5 compare, #7 cheaper) has only prose to work from; on web that prose was instructed to omit rating/hours/address. The stage block for #7 ("refinement") tells the model to "GIU NGUYEN nhiem vu … PHAI dua ra lua chon NGAY" — which it can only do by searching again. For #5 ("comparison") the block says "Tra loi dung ve cac phuong an ho vua neu ten" — the names exist in prose, the attributes do not.
- **Does prior list style reinforce list style?** [HYPOTHESIS] plausible (in-context imitation), **NO DATA**. What *is* code-proven is that the *content* needed for a non-list follow-up is absent.
- **Web vs mobile history construction:** both send the full thread; web's `useChat` also holds `toolInvocations` locally but they are dropped server-side; mobile never had them. Mobile sends no `decisionEvidenceId`. Effective model context is the same shape on both, minus the shopping evidence block on mobile.

---

## H. UI / Client Contract Audit [CODE]

- **Web:** structured place decision comes from the `8:` annotation (`PlacesLiveView { domain, ranked, items[≤8], mapsSearchUrl }`), built from **every** ranked recommendation, lead first (`liveView.ts:337-390`). `PlaceDecision.tsx` shows `VISIBLE = 3`, a filter row with "Tất cả (n)", and the full set on demand. **The card list exists whether the prose picked one venue or eight.** The `[TAPPY_PLACES]` text marker is off; `[CTA_BUTTONS]` JSON is still model-authored (`SERVER_AUTHORED_CTA=false`) and parsed on all three clients; `[FOLLOWUPS]` chips parsed on all three.
- **Mobile:** prose is the entire decision surface; CTA/FOLLOWUPS/SHOPPING/PLAN markers parsed by regex; images injected by the server as markdown. No annotation consumer, no location, no evidence id, no surface header → mobile always gets the non-web prompt variant (rating line + address + hours in prose, maps link mandatory). `[REVIEW v1.1: two corrections. (1) Both mobile clients DO parse the `8:` places annotation — but only into a SHARE artifact (`ios/…/ChatViewModel.swift:408-412, 253`; `android/…/RealChatRepository.kt:46-49`, `MessageActionBar.kt:136-137`), never as an in-chat card; "prose is the entire decision surface" stands. (2) iOS DOES send `userLocation` (and `userPreferences`) via `chatWithContext` (`ios/…/ChatViewModel.swift:376-380`, `ChatService.swift:176-187`); Android does not. Neither sends `x-tappy-surface` or `decisionEvidenceId`.]`
- **Does AI → structured → UI force enumeration?** Partly: the annotation is engine-driven and always multi-item; the *prose* is not forced. The observed "dump" on web is therefore a **combination**: prose that lists (model/prompt) + a card list that always lists (UI contract). On mobile it is prose-only, so any dump there is model/prompt/payload.
- **Backward compatibility if the backend changes** (Phase 2 consideration only, no change made): all three clients parse `[CTA_BUTTONS]{json}` and `[FOLLOWUPS]a|b|c`; Android/iOS also parse `[TAPPY_PLAN]`/`[TAPPY_SHOPPING]`. Changing those marker formats breaks mobile. Changing the annotation payload (`v: 1`) affects web only. Adding fields to tool results is invisible to clients. Removing the maps link / rating line from mobile prose changes what mobile users see (there is no card there).

---

## I. Language Detection Audit [FACT — direct function tests, `docs/audit/lang-detect-results.json`]

Path: `route.ts:180` → `detectExplicitLangRequest(lastText) ?? detectLang(lastText)` (`lib/ai/intent.ts:123,244`). No LLM. Result feeds `LANG_NAMES[lang]` into the language override block and `messages.*` localisation of tool text.

| # | Case | Input | Detected | Expected | Verdict |
|---|---|---|---|---|---|
| 1 | VI + EN brand | Tìm quán cafe Highlands Coffee gần đây | vi | vi | PASS |
| 2 | VI + EN place | Có quán ăn nào ngon gần Landmark 81 không? | vi | vi | PASS |
| 3 | VI + EN restaurant term | Tìm nhà hàng buffet seafood ở Quận 1 | vi | vi | PASS |
| 4 | VI + URL | Quán này có ngon không https://shopeefood.vn/… | vi | vi | PASS |
| 5 | VI + product | Tìm cho tôi tai nghe Sony WH-1000XM5 giá tốt | vi | vi | PASS |
| 6 | short VI | quán cafe đẹp | vi | vi | PASS |
| 7 | normal VI | Cuối tuần này đi đâu chơi được nhỉ? | vi | vi | PASS |
| 8 | clearly EN | Find me a quiet Japanese restaurant nearby. | en | en | PASS |
| 9 | mixed | Find giúp tôi một quán cafe chill gần đây. | vi | vi | PASS |
| 10 | VI + EN proper noun | Tối nay đi Bitexco Sky Deck có gì vui không? | vi | vi | PASS |
| 11 | no-diacritic VI | tim quan cafe gan day | **en** | vi | **FAIL** |
| 12 | no-diacritic VI + brand | quan an gan Vincom | **en** | vi | **FAIL** |
| 13 | loanword | menu | en | AMBIGUOUS | impl has no AMBIGUOUS → returns `en` |
| 14 | loanword | spa | en | AMBIGUOUS | impl has no AMBIGUOUS → returns `en` |

Explanation: the detector scores lowercase-accented-word share + a small VI/EN function-word list; with zero diacritics there is no Vietnamese signal, and `gan`/`quan`/`an`/`day` are deliberately excluded from the VI list to avoid flipping English sentences that name Vietnamese places (`intent.ts:83-100`). The code documents this as a **KNOWN LIMITATION** (`intent.ts:118-121`). Consequence [CODE]: on such input the language override says "User is writing in English → ENTIRE response MUST be in English". All 15 spec queries carry diacritics and resolve correctly (§J table), so **F is not a factor for the spec set**, but it is a real production factor for undiacriticked typing.

---

## J. Web / Mobile / Backend Endpoint Audit [FACT]

| Client | Endpoint | Base URL (release) | Body fields | Backend |
|---|---|---|---|---|
| Web | `POST /api/chat` | same origin (`www.tappyai.com`) | messages, userLocation?, userPreferences?, responseStyle?, decisionEvidenceId?, context?; header `x-tappy-surface: web` | Vercel (Next.js route, `maxDuration 60`) |
| Android | `POST /api/chat` | `https://www.tappyai.com/` (`android/app/build.gradle.kts:33,64`; debug `http://10.0.2.2:3000/`; staging placeholder) | **messages only** | same Vercel deployment |
| iOS | `POST /api/chat` | `https://www.tappyai.com` (`ios/Config/Release.xcconfig:8`; debug `localhost:3000`) | ~~messages only~~ `[REVIEW v1.1: UNSUPPORTED — the live path is `chatWithContext`: messages + userPreferences? + userLocation? (when location context is enabled); no surface header, no decisionEvidenceId]` | same |

- **Cloud Run:** no Dockerfile, no Cloud Run config in `infra/` (only `infra/gcs` for log storage) or `vercel.json`. All clients reach the **same Vercel deployment and the same pipeline**. Prod web version per memory/`/api/version`: NO DATA for this audit (not probed — prod is out of scope).
- **Mobile client-side AI logic:** none found — no prompt fragments, no language detection, no tool decisions, no ranking, no candidate selection. Mobile-only logic is limited to **marker parsing / stripping / partial-marker trimming** (`ChatResponse.kt`, `ContentParser.swift`) and image-run segmentation. It **can** affect what the user sees (a malformed marker leaks as text) but cannot change what the model produced.
- **Mobile behavioural differences that the backend baseline would not cover:** (1) no GPS → nearby queries (#8, #10, #11) are impossible from mobile as built `[REVIEW v1.1: true for ANDROID only; iOS sends GPS when the user enabled location context]`; (2) no `x-tappy-surface` → prose variant with metadata lines; (3) no `decisionEvidenceId` → no shopping evidence carry-forward. **Separate mobile verification required** for these (not performed).

---

## K. Controlled DEV Baseline Results — NOT EXECUTED (safety stop)

### K.1 Verification performed before deciding

| Requirement (§3) | Finding | Verdict |
|---|---|---|
| Supabase project | `.env.local` → `NEXT_PUBLIC_SUPABASE_URL=https://fwznnobrdctuskgrvuik.supabase.co` | **PRODUCTION** — named as the production project in `docs/backoffice/phase-reports/ANALYTICS_STEP2_ENV_VERIFICATION.md:44-45`, `docs/AI_Personalization_Architecture.md:6`, `AUTH_SETUP.md:3`; Android/iOS release configs point at the same product |
| Database / environment separation | No second Supabase ref anywhere in the repo or env; `supabase/` holds migrations/tests only (unit tests use embedded-postgres, not the app) | **No DEV database exists** |
| Env vars / configuration | `.env.local` also carries `KV_REST_API_URL/KV_REST_API_TOKEN` → `isDistributedStoreConfigured()` true → `consumeAiQuestion` spends in the **shared production KV** (`aiQuestionQuota.ts:140-155`, `distributedRateLimit.ts:130`); `SUPABASE_SERVICE_ROLE_KEY` present (used by `createAdminClient` for memory writes) | production stores |
| Model / search endpoints | `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY` present — production vendor accounts (no dev keys exist) | shared with prod; inherent, cost only |
| Memory/profile persistence | writes to prod `user_memory` (authenticated), prod `decision_evidence` RPC (identified), prod `user_events` (clip); reads prod `reviews`, `subscriptions`, `account_status` | production |
| Dedicated test user | none provisioned; creating one is an owner action (account creation), and an anonymous session mints a row in prod `auth.users` | **not available** |
| Quota feasibility | guest = **5 lifetime per IP**, anonymous session = 5 lifetime, account = 15/day, Pro exempt | 36 runs impossible on any non-Pro identity within the cap; a 5-run guest attempt would permanently exhaust the owner's IP on production |

**Decision:** STOP before baseline (§4). Not mitigated by editing env locally (that would still exercise the production database and is a configuration change the brief forbids) nor by using the owner account (forbidden §3).

### K.2 What was prepared instead
- `scripts/audit/baselineRunner.mjs` — the full 15×2 (+3×2 setup = **36 = cap**) runner with parsing, sanitisation and the cap, which **refuses to start** when the target is the production ref or when `.env.local` carries the production ref / a distributed KV URL (dry-run refusal verified: exit 2). Location for #8/#10/#11 is supplied via the existing `userLocation` body field (the mechanism the web client already uses) — no source change needed.
- `docs/audit/route-signals.json` — deterministic pre-model routing of all 15 queries (below), which the baseline would otherwise have been the first to reveal.

### K.3 Deterministic routing of the 15 primary queries (pure functions; no LLM)

| # | lang | intent | stage / turn | need.domain | prio | model role · steps | notable |
|---|---|---|---|---|---|---|---|
| 1 hours (after setup) | vi | tool | null / follow_up_question | **null** | quiet, cuisine:japanese; loc "quan 1" | smart · 5 | no ranking block; no prior evidence for places |
| 2 quán Nhật yên tĩnh | vi | tool | null / new | **null** | quiet, cuisine:japanese | smart · 5 | **no ranking/web block despite being a decision turn** |
| 3 <500k, 2 người, yên tĩnh | vi | tool | null / new | places (restaurant) | quiet; budget 0-500k | smart · 5 | budget block on; `quiet` unscoreable |
| 4 cuối tuần đi đâu | vi | tool | null / new | null | — | **fast** · 5 | no location; `forcedTool=web_search` (logging only) |
| 5 so sánh 3 quán (after setup) | vi | tool | **comparison** / refinement | places (cafe) | — | smart · 5 | attributes of the 3 cafés not in context |
| 6 5 quán cafe Thảo Điền | vi | tool | null / new | places (cafe) | — | smart · 5 | user asked for 5; R1(a) says 2-4; shortlist ≤3 |
| 7 rẻ hơn (after setup) | vi | tool | **refinement** / refinement | places (restaurant) | price ×2; loc "quan 1" | smart · 5 | `locationIntent=offline` → **search_products removed** |
| 8 gần tôi (GPS) | vi | tool | null / new | **null** | distance | fast · 5 | `locationIntent=unknown` ("gần tôi" not in `offlineRe`); GPS block on |
| 9 gần Landmark 81 | vi | tool | null / new | places (cafe) | distance | smart · 5 | distance not computable (no GPS, not a city) |
| 10 EN quiet Japanese nearby | **en** | tool | null / new | places (restaurant) | quiet | smart · 5 | `cuisine:japanese` **not** extracted from English |
| 11 mixed chill gần đây | vi | tool | null / new | places (cafe) | distance | smart · 5 | "chill" not a priority key |
| 12 tai nghe <2tr | vi | tool | null / new | shopping (headphones) | budget 0-2M | fast · 5 | shopping blocks on; ADR-024 evidence freeze |
| 13 Đà Lạt cuối tuần | vi | tool | null / new | **null** | loc "da lat"; explicitChoiceRequest | smart · 5 | `planningIntent=null`, `travelIntent=false` → no planning block, no travel guard |
| 14 tối nay TP.HCM | vi | tool | null / new | null | — | fast · 5 | no planning ("tối nay" without multi-activity); time block gives VN clock |
| 15 spa thư giãn sạch giá hợp lý | vi | tool | null / new | places (spa) | — | smart · 5 | "thư giãn/sạch sẽ/giá hợp lý" → **no priorities extracted** |

`role: fast` and `smart` resolve to the same model id today.

---

## L. Two-Run Variance — NO DATA (baseline not executed)

Deterministic components that **cannot** vary between runs: intent/lang/stage/need profile, ranker order for identical tool rows, `_tappy_shortlist`/`_tappy_ranking`, guards. Components that **can**: model text (temperature default), tool choice (`auto`), tool arguments (`query`/`location`/`type` are model-written — the `searchPlaces` cache key includes them, so a different phrasing = a different provider call), provider rows (Google/Serper breaker state, cache), snippet searches. Attribution of any observed variance: NO DATA.

---

## M. Root-Cause Classification

`[REVIEW v1.1: THIS SECTION IS SUPERSEDED BY §R.4. The "P0" label below meant "mechanism proven from source"; the brief's P0 requires demonstrated causality on the behaviour, which no artifact here establishes. Kept for the record.]`

### P0 — PROVEN (code-path evidence)
- **P0-A · Decision-engine instruction gap on domain-null turns.** `isDecisionDomain` false on 6/15 spec queries (incl. #2) → no `_tappy_ranking` explanation, no web composition rule, while the payload still carries `_tappy_ranking`. (`route.ts:788-802`, `needProfile.ts` domain lexicon, `route-signals.json`.)
- **P0-B · Evidence cannot represent the stated need** (quiet/chill/đẹp/thư giãn/sạch sẽ; Japanese cuisine on Google/Serper rows). Ranker falls back to rating/reviews/distance; the prompt has no places-grounding rule equivalent to the shopping one, so the model must either borrow the user's wish or list by rating. (`rank.ts:99`, `candidate.ts:151`, `serperPlaces.ts:288-330`, `food.ts:760-800`.)
- **P0-C · No place evidence in follow-up context.** Tool results stripped from history; prior prose stripped of markers and (web) of facts; ADR-024 carry-forward is shopping-only. (`clientInput.ts:196-199`, `sanitizePriorAssistantContent.ts`, `route.ts:697-712`, `buildRenderedDecisionBlock`.)

### P1 — STRONG CONTRIBUTING FACTORS
- **Enumeration-shaped mandates in the shared rulebook** (rule 3/4/9/12/13/15/16, review block 1)/6), per-place CTA sets) competing with R1/R1b/R4 inside a 150-word first-reply limit. (§C.2–C.3)
- **Web card always lists** every ranked candidate (≤8) independent of the prose decision. (§H)
- **Search-always policy + `auto` tool choice with no "should I search" instruction** other than chitchat/confirmation gating; open questions (#4, #14) have `web_search` whose contract is literally "summarise 2-3 results". (rule 1/2/9)
- **Need-profile lexicon misses** (Japanese not a domain hint in VI; no cuisine from EN; #15 adjectives; "gần tôi" not offline) so priorities/blocks are silently absent. (`route-signals.json`)
- **`search_products` removed on `offline` turns** — #7 refinement and any "quán … gần đây" turn loses the shopping tool; harmless for the spec set but a silent capability drop.
- **No-diacritic Vietnamese → English override** (2/12 FAIL) — real for production typing, not for the spec set. (§I)

### P2 — OPEN HYPOTHESES (no evidence either way)
- **A. Temperature unset** — could raise run-to-run variance; no evidence it produces listing.
- **B. Thinking off** — Haiku 4.5 supports extended thinking; whether it would improve evidence→recommendation synthesis is untested here.
- **C. maxSteps = 5** — prior measurement shows 2 steps typical; no evidence of exhaustion. Not a root cause.
- **H. Prior list-style replies reinforce list style** — plausible in-context effect; NO DATA.
- **J. Other:** (i) `wordLimitBlock` 150 words on first reply vs mandatory metadata lines; (ii) ranker weight `distance 0.5` with GPS centring can out-rank a stated cuisine/quiet need on nearby turns (`rank.ts:76-81`); (iii) `search_places` 30-min module cache means run 1 and run 2 of the same query share provider rows within a warm instance — not a cause, but a confound the baseline must record.

---

## N. Parameter Assessment (no change recommended in Phase 1)

| Parameter | Current | Evidence observed | Possible benefit of change | Regression risk | Further testing warranted? |
|---|---|---|---|---|---|
| `temperature` | unset (provider default) | none linking it to the symptom | lower variance between runs | flatter, more templated replies; unknown interaction with the 11k-token rulebook | Only after P0s; A/B in DEV with the two-run design |
| Thinking | off | none | better evidence→decision synthesis on comparison/decision turns | latency (TTFB already the dominant cost per `docs/perf`), cost, streaming shape changes | Yes, but after P0s, DEV only |
| `maxSteps` | 5 (8 planning, 3 image, 1 chitchat) | 2.0 steps/turn measured (Phase B); no exhaustion evidence | none identified | lowering risks empty replies (documented failure mode); raising risks loops/cost | No, unless baseline shows `finishReason` ≠ stop with 5 steps |
| `maxTokens` | 3072 | Phase B: raised from 2048 after `length` finishes; no current evidence | — | — | Record `finishReason` in baseline |
| `toolChoice` | auto | dead `prepareStep` removed; behaviour measured as auto | forcing `search_places` on decision turns would remove one degree of freedom | forced search on turns that need clarification; cost | No — P0s first |
| `isDecisionDomain` gate | domain ∈ {places,hotel,shopping} | 6/15 spec queries excluded | sending the ranking rule whenever `_tappy_ranking` is attached | prompt growth on weather/gold turns (the stated reason for the gate) | Yes (design question for Phase 2) |
| Shared prompt size | 38k chars | cached; 35 prohibitions / 38 mandates | consolidation of enumeration mandates | cache lineage churn; behaviour drift across 20 rules | Yes — but only with a baseline to compare against |
| Places result count to model | 8/10 rows untrimmed | R1b shortlist ≤3 exists | trimming to shortlist for the model | loses "alternatives" and the web card's full set (which is built from the same recs) | Design question, not a parameter |

---

## Git integrity

`git status --short` before and after are recorded in `docs/audit/git-status-before.txt` / `git-status-after.txt`, `git diff --stat` in `git-before.txt` / `git-after.txt`. Files changed by the audit are limited to `docs/audit/**` and `scripts/audit/**` (see final section of the response). Pre-existing uncommitted application changes were left untouched.

## Required to continue (owner actions)
1. Provision a **non-production Supabase project** (or confirm a branch/preview DB) and a `.env` for it; or confirm in writing that a read-only+quota-isolated run against the current project is acceptable (it is not, under this brief).
2. Provision a **dedicated test user** on that project (audit must not create accounts), or accept the guest path with an **isolated quota store** (unset `KV_REST_API_URL` so quota is instance-local) — note guest cap is 5 lifetime, so an account (Pro, or a raised limit in the isolated store) is needed to reach 36 runs.
3. Then: `AUDIT_BASE_URL=… AUDIT_SUPABASE_REF=<nonprod> AUDIT_CONFIRMED_NONPROD_REF=<nonprod> AUDIT_TEST_USER_BEARER=… node scripts/audit/baselineRunner.mjs` (dry-run first with `AUDIT_DRY_RUN=1`).


---

## R. REVIEW v1.1 — validation of the Phase 1 audit (2026-09-17, read-only)

Method: every conclusion in §A–§N was re-traced to source (not to the report). Verdicts use **VALIDATED**, **CORRECTED**, **UNSUPPORTED**, **NO DATA**. Nothing outside `docs/audit/**` and `scripts/audit/**` was touched; no LLM/search was executed; git state before/after in `git-status-review-before.txt` / `git-status-review-after.txt`.

### R.1 Safety stop — **SAFETY STOP VALIDATED**

| Check | Evidence | Verdict |
|---|---|---|
| Supabase project targeted | `.env.local` `NEXT_PUBLIC_SUPABASE_URL` ref `fwznnobrdctuskgrvuik`; the **only** ref that appears anywhere in the repo (7 occurrences, all this ref); `android/app/build.gradle.kts:230` comment: "single-project setup — no evidence of separate staging/prod Supabase projects" | production; no alternative exists |
| Is it production? | `docs/backoffice/phase-reports/ANALYTICS_STEP2_ENV_VERIFICATION.md:44-45`, `docs/AI_Personalization_Architecture.md:6`, `AUTH_SETUP.md:3`; Android/iOS release configs point at `www.tappyai.com`, which is served by the same project | yes |
| Memory writes reach production? | `route.ts:1213-1224` → `updateMemory(authedUserId, …, createAdminClient())`; `lib/supabase/admin.ts:6-7` builds the client from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (both present in `.env.local`) | yes, for any authenticated run |
| Quota usage reaches production? | `aiQuestionQuota.ts:138-146`: `isDistributedStoreConfigured()` → `distributedRateLimit` when `KV_REST_API_URL`/`KV_REST_API_TOKEN` set (`distributedRateLimit.ts:130-131`); both are set in `.env.local` | yes |
| AI-question quota store is production? | same KV URL as the deployed app's (Vercel KV variables in `.env.local`); no second store configured | yes |
| Quota limits (code) | `bucket()` `aiQuestionQuota.ts:85-91`: `user` → `FREE_DAILY_LIMIT` 15 / VN day; `anon` and `guest` (keyed by **IP**) → `ANON_LIFETIME_LIMIT` 5 / **10-year window**; Pro exempt at `route.ts:377` | 36 runs unreachable on any non-Pro identity; guest run would exhaust the operator's IP on prod |
| Dedicated isolated test user exists? | none referenced in env, docs, or scripts | no |
| Non-production Supabase project exists? | none (see row 1); `supabase/tests/**` use `embedded-postgres` for migration tests — a local Postgres, **not** a Supabase project (no GoTrue/auth, no PostgREST, no RPC via `supabase-js`) | no |
| Non-production quota store exists? | none; instance-local fallback exists in code only when KV env is absent | no |
| Baseline safe in current env? | | **NO** |

### R.2 Pipeline reconstruction — **VALIDATED** (§B stands)

Confirmed from source, with the two mobile corrections: entry `src/app/api/chat/route.ts:62` `POST`; single model invocation `AI.stream()` at `route.ts:917` → `streamText` at `lib/ai/llm/ai.ts:56`; model `claude-haiku-4-5-20251001` for every role (`providers/claude.ts:37-42`; env override value NO DATA); `toolChoice` not passed → SDK `'auto'`; `maxSteps` 1/8/3/5 and `maxTokens` 300/4096/1024/3072 (`route.ts:942-943`); `temperature` not passed — the adapter forwards `temperature` as given (`@ai-sdk/anthropic/dist/index.mjs:467,522`), so `undefined` is omitted and the vendor default applies (the value of that default is vendor documentation, not repo evidence); thinking is supported by this SDK version (29 references in the adapter bundle) but **not configured** — a code choice, not an SDK limitation; `maxRetries` default 2 (`ai/dist/index.mjs:268`). Model calls per turn: 1 stream of ≤`maxSteps` round-trips (+1 memory-extraction `generateText` when authenticated and `shouldExtractMemory`). Order of model calls: tool-planning step → tool `execute()` (ranking/shortlist/pick inside) → answer step(s). Search path, result transformation, post-processing and client handling as in §B rows 11–17 (re-verified).

### R.3 The three key findings, re-validated

**A — `need.domain = null` (6/15).** *Code-proven routing behaviour.* `deriveNeedProfile` sets `domain` only from `SUBJECTS` (`needProfile.ts` — venue/product nouns: `nha hang|quan an|restaurant|quan nhau`, `cafe|ca phe|coffee`, `spa|massage`, hotel/shopping/transport nouns) or, failing that, `DOMAIN_HINTS` (`an gi|do an|an ngon|mon an` + a dish-name list). "quán Nhật", "chỗ ăn", "đi đâu", "đi Đà Lạt", "có gì vui" match neither → `null` (`route-signals.json` #1, #2, #4, #8, #13, #14). `isDecisionDomain` (`route.ts:788-790`) is then false → `buildRankingInstructionBlock()` and `buildRenderedDecisionBlock()` are not appended (`route.ts:802-803`).
Downstream, **corrected**: `rankForModel` is not gated on domain (`route.ts:1035`). When `search_places` runs and ≥2 rows are rankable: `_tappy_shortlist` is attached (`route.ts:625-637`) **and explained** by R1b in the shared prompt (`promptBuilder.ts`, 3 occurrences of `_tappy_shortlist`; rule added in `6a5719c` #195, 2026-08-27, together with the dish lexicon). `_tappy_ranking` is attached only when `derivePick` returns a Pick — requiring `hasDecidableNeed` (priorities/mustHave/budget/explicit-choice/implicit-purchase; `pick.ts:163-170`), ≥2 ranked, grounded reasons, margin > 0. Per the probe: decidable on #1, #2, #8, #13; **not** on #4, #14 (no priorities, no purchase intent). So the "field with no rule" situation is `_tappy_ranking` on ≤4 of the 6 turns, never `_tappy_shortlist`. The web card annotation is built regardless of domain (`route.ts:1044-1047`), so on web the absence of the composition block means the prose is under the generic rules (rating line, address, maps link) **while the card is still rendered** — a code-proven duplication, not a proven dump.
Corroboration: the source itself records (`needProfile.ts:95-112`, 2026-08-27) that a null domain "silently disabled … the block that tells the model 'the system already picked'… and does what an unguided model does: lists the options. This is the 'AI trả lời như liệt kê' report." That is a **prior team observation written into a comment**, made before R1b existed in the shared prompt; it is not a trace and does not establish today's behaviour.
**Classification: code-proven routing behaviour → likely causal mechanism, causality NOT TESTED (P1).**

**B — `quiet` / ambience evidence.** *Code-proven evidence limitation.* Model-visible place fields (§E, re-verified against `serperPlaces.ts:288-330`, `food.ts:760-800`, `toolResultSplit.ts:170-200`): name, address, rating text + `rating_value`/`rating_count`, `opening_hours`/`open_now`, phone, `website_uri`, `place_id`, `price_level`/`price_range` (Google) or `price_range_text` (Serper), lat/lng, `distance_km` (only when centred on the user), `place_types`, `review_actions`, capability booleans; OSM adds `cuisine`/`wifi`/`outdoor_seating`/`vegetarian`. **No provider row carries ambience, noise, "quiet", "view", "chill" or "clean".** `needProfile` extracts `quiet` as a priority (`needProfile.ts:156`) but `rank.ts:99` `SCOREABLE` has no `quiet` → the priority never scores and never filters; `unverifiedMustHave` only covers `mustHave`, and `quiet` is a priority, not a must-have. **Cuisine:** scoreable only from OSM `cuisine` (`candidate.ts:151-154`); `normalizePlaces` does **not** read `place_types`, so a Google/Serper "Japanese restaurant" type is visible to the **model** (in `place_types`) but invisible to the **ranker**. Fields vary by provider (Google → Serper → OSM degrade), not by domain. For "Tìm cho tôi một quán Nhật ngon và yên tĩnh": the ranker orders by rating/review-count (+distance if GPS); the model can verify "Japanese" from `place_types` and "ngon" from rating, and has **nothing** for "yên tĩnh" — a defensible recommendation on quietness is not possible from this evidence; the model must hedge or borrow the wish.
**New (found in review), code-proven:** `normalizePlaces` never sets `priceVnd` (`candidate.ts:120-122`, stated in its own doc comment) → the ranker's price term and the budget hard-filter are **inert for places**; `applyBudgetFilter` for a place result only filters `price_search_results`/`search_results` snippet lists (`budget.ts:193-212`), and the price-snippet search runs only when the **model's** tool `query` (not the user's text) matches `wantsPriceDetail` (`food.ts:941-945`). For #3 ("dưới 500k") and #7 ("rẻ hơn") nothing deterministic enforces the budget; only the model can, from `price_level`/`price_range_text`.
**Classification: P1 (strong contributing factor) — evidence limitation proven; its share of the dump symptom NOT TESTED.**

**C — does the stack structurally encourage SEARCH → LIST?** Layer by layer (all code-proven; none measured):

| Layer | Pushes toward LIST | Pushes toward SELECT/EXPLAIN |
|---|---|---|
| 1 Explicit prompt (shared) | rule 3 (name/address/maps link per place), rule 4 (maps search link "BAT BUOC"), review block 1)/6) (bold rating line per place, hours/cuisine per place), rule 9 (web_search: summarise 2-3 results), rules 12/13/15/16 ("liet ke NGAY", "tom tat NGAY"), CTA "cho TUNG quan", R6 follow-up chips | R1(a-e,h,i), R1b shortlist + DECISION-FIRST OPENING + "EVIDENCE → REASONING (NOT DUMPING)", R2 ≤3 bullets, R4 end with recommendation, R7 ladder, safety/evidence blocks |
| 2 Dynamic instructions | absent on domain-null turns (§R.3-A); stage blocks only when the regex fires | ranking block, web composition block, stage blocks, closing ≤1 question |
| 3 Tool result shape | 8-10 uniform rows, untrimmed for places (`route.ts:654`), each with the same metadata fields | `_tappy_shortlist` (1-3) and `_tappy_ranking` on top; `no_results_instruction`; `_tappy_relaxation` |
| 4 Deterministic ranking | cannot score quiet/ambience/price for places; falls back to rating/reviews/distance | reorders rows; shortlist with roles; pick with grounded reasons and trade-off |
| 5 Model-visible evidence | metadata-only rows invite metadata-shaped prose | `review_actions`, `place_types`, hours, price band are enough for factual grounding |
| 6 UI rendering (web) | annotation → card list of every ranked item (≤8, 3 visible + "Tất cả (n)"), independent of prose | `ranked` flag, lead first |
| 7 Client processing (mobile) | none — regex marker parsing only | none |

**Verdict:** the *shared prompt* contains both a strong consultative rule set and a set of per-item metadata mandates written for the listing era; the *tool payload* is a uniform table; the *web UI* always lists. Which layer dominates the observed prose is **NOT TESTED**. No single layer is proven responsible.

### R.4 Reclassification (evidence only)

| Finding (Phase 1 label) | Evidence tier | New class |
|---|---|---|
| A · domain-null turns lose the ranking/web blocks (P0) | code-proven mechanism; prior team observation in a source comment; causality untested | **P1** |
| B · quiet/ambience unscoreable; cuisine ranker-blind on Google/Serper (P0) | code-proven evidence limitation; effect untested | **P1** |
| B' · places carry no price into the ranker; budget for places enforced by nothing deterministic (new) | code-proven | **P1** |
| C · no place evidence in follow-up context; shopping-only carry-forward (P0) | code-proven (`clientInput.ts:196-199`, `sanitizePriorAssistantContent.ts`, `route.ts:697-712`); effect on #1/#5/#7 untested | **P1** |
| Enumeration-shaped mandates competing with R1/R1b/R4 (P1) | code-proven presence; dominance untested (§R.5) | **P1** |
| Web card always lists all ranked items (P1) | code-proven (`liveView.ts:141,337-390`, `PlaceDecision.tsx:31`) — amplifies/duplicates; does not create the prose | **P1 (amplifier)** |
| Search-always + `auto` + web_search "summarise" contract (P1) | code-proven presence; behaviour untested | **P1** |
| Need-profile lexicon misses (P1) | code-proven (`route-signals.json`) | **P1** (same mechanism as A) |
| `search_products` dropped on `offline` turns (P1) | code-proven (`route.ts:1062`); irrelevant to the spec set's symptom | **P2** (capability drop, not a dump cause) |
| No-diacritic Vietnamese → `en` (P1) | proven by direct test (2/12 FAIL); documented limitation; not in the spec set | **independent limitation** — P1 for production typing, not for this symptom |
| A. temperature unset (P2) | KNOWN FROM CODE: not passed; NOT YET TESTED | **P2** |
| B. thinking off (P2) | KNOWN FROM CODE: not configured though SDK supports it; NOT YET TESTED | **P2** |
| C. maxSteps = 5 (P2) | KNOWN FROM CODE: 5; OBSERVED IN PRIOR TRACES (2026-08-10, pre-#195 prompt): 2.0 steps/turn, no exhaustion; current NOT YET TESTED | **P2 — no supporting evidence** |
| H. history reinforces list style (P2) | theoretical only | **P2** |
| J(ii) distance weight vs stated need on GPS turns (P2) | code-proven weights (`rank.ts:76-81`); effect untested | **P2** |
| "candidate keys encourage enumeration" | no such contract exists (§R.7) | **INVALID** |
| §H "mobile has no annotation consumer" | wrong — consumed for share artifact | **UNSUPPORTED → corrected** |
| §J "iOS sends messages only" | wrong — `chatWithContext` sends location/prefs | **UNSUPPORTED → corrected** |

No finding qualifies as **P0** under the brief's definition: no artifact demonstrates causality on the behaviour, because the only behavioural evidence available is a 2026-08-10 cost baseline that predates most of the consultative prompt and reports no quality metrics.

### R.5 System-prompt conflicts — real vs interpretive

| Alleged conflict | Quoted (sanitised) | Blocks / order | Real? |
|---|---|---|---|
| Option count | R1(a) "dua 2-4 lua chon phu hop nhat, KHONG liet ke 5-10" · R1b "chi viet ve nhung ung vien co trong '_tappy_shortlist' … KHONG mo rong len 5-8" (1..3) · web block "2-3 lua chon thay the" | all shared except web block (dynamic, later) | **Interpretive**: R1b is conditional on the field and more specific; the only true inconsistency is the 4th option R1(a) allows and R1b forbids |
| Maps search link | rule 4 "LUON hien thi link [google_maps_search] … BAT BUOC, khong duoc bo qua" · web block "KHONG viet lai link Google Maps tong hop" | shared vs dynamic (web only, later) | **Real** on web when both are present; resolved by specificity/position, dominance untested; on mobile only rule 4 applies |
| Rating line per place | review block 1) "LUON in dam va dat NGAY TRUOC DIA CHI o dong RIENG" · web block "DUNG liet ke lai nhung thong tin do" | shared vs dynamic (web) | **Real** on web (same pair as above); on domain-null web turns the web block is absent, so the rating-line mandate stands beside the card |
| First-reply word limit | "toi da 150 tu (chi tinh van ban CHU …)" vs per-place rating line + address + hours + why | dynamic vs shared | **Interpretive/arithmetical** — a squeeze, not a contradiction |
| End with recommendation vs chips | R4 "KET THUC REPLY BANG KHUYEN NGHI" · R6 "[FOLLOWUPS] … o DONG CUOI CUNG" | both shared | **Not a conflict** for the user (chips are parsed out); the model's last written line is the chips |
| Search-summary language | rule 9 "tom tat 2-3 ket qua dau (title + snippet) roi cung cap link [Xem them ket qua tim kiem]" | shared | **Real by design** for `web_search` — the contract for that tool *is* a search summary; matters only if the model picks `web_search` on open queries (#4, #14) — untested |

### R.6 Language detection — **VALIDATED**

All 14 rows in `lang-detect-results.json` re-derived by reading `intent.ts:123-217`: cases 1–10 PASS by the lowercase-accent ratio / VI function-word rules; 11–12 return `en` because zero diacritics leave no Vietnamese signal and `gan/quan/an/day` are deliberately excluded from `VI_FUNCTION_WORDS` (`intent.ts:83-100`); `menu`/`spa` are single unaccented words with no function-word hit → `scoredWords=1`, ratio 0 → `en`. The function's return set is `vi|en|ja|ko|zh|ar|th`; **AMBIGUOUS cannot be produced** by the current implementation. Classification: **independent limitation** (documented as KNOWN LIMITATION in source); a contributing factor for undiacriticked production input, not for the 15 spec queries (all resolve correctly).

### R.7 Candidate keys — **VALIDATED**

No `C1/C2/C3`, `candidate_key`, or ordinal-key contract exists (grep over `src/lib/ai`, `src/lib/recommendation`, clients). The equivalent mechanism is: `Candidate { id, name, attrs, raw }` built in `candidate.ts`; `_tappy_shortlist[].{rank,id,name,role}` and `_tappy_ranking.{pick,not_chosen}` **by name**; the annotation's `LivePlace` items carry provider ids and action URLs; enrichment matches by **name mentioned in the reply** (`selectPlacesNeedingEnrichment`). Canonical URLs are carved from the model's view and re-attached positionally; `review_actions[].url` is model-visible and copied verbatim. A selection mechanism exists (shortlist/pick) but it does not use keys the model must echo — so "keys encourage enumeration" is **INVALID**, and a future key-based contract would be a new contract for three parsers.

### R.8 Conversation history — **VALIDATED**; reinforcement is **P2**

Surviving: last 10 messages, user text, assistant text minus `[TAPPY_PLAN]`/`[TAPPY_SHOPPING]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]`/images. Stripped: tool calls/results (`clientInput.ts:196-199`, "toolInvocations … dropped by construction"), annotations, `_tappy_*`. Shopping: prior listing table re-injected via `decision_evidence_load` when the **web** client presents the id. Places: nothing. Prior assistant prose **is** fed back (sanitised), so list-shaped prose persists as text. Whether that reinforces list output is **theoretical — P2**.

### R.9 UI / client — **VALIDATED with corrections**

Web: annotation-driven card, `MAX_ITEMS = 8`, `VISIBLE = 3`, filter row; markers parsed; evidence id in `sessionStorage`; GPS from the browser when enabled. Mobile: prose + regex-parsed markers; annotation → share artifact only; iOS sends GPS/prefs, Android sends messages only; neither sends surface header or evidence id. Verdict: the web UI **amplifies/duplicates** (a list is on screen whatever the prose says) and **renders what the backend decided** (engine order); it does not create the prose dump. Mobile renders the prose as-is.

### R.10 Baseline runner review (`scripts/audit/baselineRunner.mjs`) — not executed

| Requirement | Status | Note |
|---|---|---|
| Refuses production Supabase | ✔ | hard-coded prod ref; also scans `.env.local` for the ref and for a KV URL; refusal verified in Phase 1 (`exit 2`) |
| Requires explicit non-prod confirmation | ✔ | `AUDIT_CONFIRMED_NONPROD_REF === AUDIT_SUPABASE_REF` |
| 36-run cap, setup runs counted | ✔ | plan = 30 primary + 6 setup = 36; checked before any request and again in the loop |
| Excludes direct language tests | ✔ | separate vitest files, never called by the runner |
| Two runs per primary | ✔ | |
| No silent retry; failures recorded | ✔ | one `fetch` per run; exceptions → `status: 0`, `errors[]` |
| Does not fabricate context | ✔ | setup reply carried forward is the real streamed `0:` text |
| Real pipeline setup for #1/#5/#7 | ✔ | one setup turn per run, through `/api/chat` |
| Mock District 1 for #8/#10/#11 | ✔ | via the existing `userLocation` body field (`route.ts:129-133` reads lat/lng numbers) — no source change |
| Timestamp/timezone for #14 | ✔ partial | ISO-8601 UTC timestamp + note that the server clock block is Asia/Ho_Chi_Minh; no separate VN-local string |
| Sanitises secrets | ✔ | headers/bearer never written; result keys matching `url|link|photo|uri|token|key|cookie|auth` redacted |
| Modifies application code | ✔ no | |

**Weaknesses found (report only, not fixed):**
1. The production check trusts an **operator-typed** ref; it cannot read what the server process actually loaded. The `.env.local` scan is relative to the runner's cwd and is silently skipped from another directory.
2. Without a bearer the guest path is capped at **5 lifetime** even on the instance-local store (`bucket()`), so runs 6–36 would be recorded as 401 failures; with a free-tier account, runs 16+ would be 429. The runner records these honestly but the baseline would be incomplete — a **Pro test user** (or an isolated store with a raised limit, which is a config change the owner must make) is required.
3. If a setup run fails, its primary still runs with an empty (server-dropped) assistant turn and is counted; the primary is not flagged as "context invalid".
4. `AUDIT_SURFACE` defaults to unset (mobile-shaped prompt). Web and mobile prompts differ materially (composition block); one 36-run budget covers **one** surface. The owner must choose which surface the baseline measures (or split the budget).
5. `searchPlaces` has a 30-minute in-process cache keyed on the model-written query; run 1 and run 2 of the same query on a warm server may share provider rows. The runner does not restart the server between runs; variance attribution must account for this.

### R.11 Exact requirements for a safe controlled DEV baseline (documented only; nothing created)

1. **Non-production Supabase project** with the repo's migrations applied (`supabase/migrations/**`; the `embedded-postgres` suite proves they apply cleanly to an empty Postgres) — needed for auth (JWT verification in `getRequestUser`), `subscriptions`, `account_status`, `user_memory`, `user_preferences`, `reviews` (read by `searchPlaces`), `decision_evidence_*` RPCs, `user_events`.
2. **Environment variables** for that project in the server's env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (memory writes), `PLATFORM_OWNER_USER_ID` (if any route reads it), `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL` (localhost).
3. **Isolated quota store**: either **no** `KV_REST_API_URL`/`UPSTASH_*` (→ instance-local, limits unchanged) or a **dedicated** non-prod KV/Upstash instance. Never the production KV.
4. **Dedicated test user** on the non-prod project, created by the owner (the audit must not create accounts), with a bearer token the runner receives via `AUDIT_TEST_USER_BEARER`.
5. **Tier**: `subscriptions` row `status='active'`, `current_period_end` in the future → Pro → quota-exempt; otherwise 15/day makes 36 runs a 3-day exercise (and the guest path is capped at 5 lifetime).
6. **Search credentials**: `GOOGLE_PLACES_API_KEY` and `SERPER_API_KEY` — the same vendor accounts as production (no dev keys exist); cost is bounded by 36 turns (each place turn = 1 Places/Serper `/maps` call, up to 2 extra Serper `/search` calls, 1 TikTok batch search, photo resolution ≤3 places). Without them the run degrades to OSM/DuckDuckGo and does **not** represent production evidence (this is exactly the Phase B caveat).
7. **Model credentials**: `ANTHROPIC_API_KEY` — production vendor account, no alternative; `LLM_*_MODEL` unset so the pinned default is exercised.
8. **Location mocking**: existing `userLocation` body field (as the web/iOS clients send it) — no code change.
9. **Conversation setup**: real setup turn through `/api/chat`, reply carried as assistant text (implemented in the runner).
10. **Backend**: a local `next dev`/`next start` of this branch with the env above. **Vercel Preview is not sufficient** as-is: Preview shares the project's env (which is production-shaped — NO DATA whether Preview-scoped overrides exist) and is behind Vercel SSO (`docs/perf/PHASE_B_BASELINE_2026-08-10.md` §1: `401 vercel_auth_enabled`), needing a Protection-Bypass token. **Cloud Run is not used** by this product (no Dockerfile/Cloud Run config); not required.
11. **Schema/data in non-prod**: schema yes (migrations); **seed data**: none required for the 15 queries (memory/prefs empty is the anonymous-shaped state; `reviews` may be empty → no `tappy_rating`, which is the common production case — NO DATA on production coverage).
12. **Memory tables**: isolated by virtue of the separate project; **quota store**: isolated per item 3.
13. **Surface decision** (§R.10-4): `AUDIT_SURFACE=web` vs unset; and whether to disable the `searchPlaces` cache between runs (server restart between run 1 and run 2 — an operational choice, not a code change).
14. **Runtime evidence to capture alongside**: the server's `tappyai_usage`, `tappyai_intent_gate`, `tappyai_model`, `tappyai_tool_called`, `tappyai_places_debug` console lines (`GCP_LOGGING_ENABLED` unset → console only), joined to `run_id` by timestamp — these carry `llmCalls`, `toolCalls`, `finishReason`, cache counters, `firstStepFinishMs`.

### R.12 Can the baseline proceed once the environment is supplied?

**Yes**, with the runner as written plus the owner's decisions on items 5, 13 and the weaknesses in §R.10 (which are reporting gaps, not safety gaps). The refusal guard rejects the production ref unconditionally (typing it as "confirmed" does not bypass it), so the runner cannot reach production without editing the script — which this review did not do.


---

# S. PHASE 1B — Baseline analysis (2026-09-17, analysis only; no code changes)

Inputs: `docs/audit/baseline-before.json` (36 runs: 30 primary + 6 setup, two passes, server restarted between passes, surface `web`, dedicated Pro audit user on `zdaprdfgpbpnxyofagmc`), `baseline-server-log-run1.jsonl` / `run2.jsonl` (`tappyai_usage`, `tappyai_tool_called`, `tappyai_places_debug`, `tappyai_intent_gate`), `baseline-metrics.json` (derived), `p15-truncation-repro.json` (offline reproduction with the real guard code). Sections J–N below **supersede** the "NO DATA" placeholders in §K/§L and the classification in §M/§R.4.

**Tóm tắt tiếng Việt.** Baseline chạy sạch (36/36, 0 lỗi HTTP, mọi lượt `finishReason: stop`, tối đa 2 bước/lượt). Kết quả đảo ngược một phần giả định ban đầu: với prompt hiện tại trên surface web, **triệu chứng "liệt kê" gần như không xuất hiện** — 15/30 reply giữ được câu "Mình chọn X" (luật R1b hoạt động), 6 lượt là hỏi lại/không có dữ liệu, 8 lượt còn lại đã bị guard xoá mất câu quyết định — nhưng **không lượt nào là danh sách kết quả tìm kiếm**. Cái người dùng gặp thay vào đó là: **(1) câu trả lời bị guard hậu xử lý cắt cụt** (13/36 lượt có dấu vết câu bị xoá, 7 lượt chỉ còn dưới 35% chữ, #15-r1 còn đúng câu mở đầu) — nguyên nhân đã tái hiện offline: tên quán không có "token phân biệt" hoặc chứa địa chỉ/dấu gạch → mọi câu về quán đó bị coi là "không gán được thực thể" và bị xoá; **(2) bịa thuộc tính** ("yên tĩnh", "sạch sẽ", "chính cống", "giá hợp lý") ở 19/30 lượt primary dù không có dữ liệu; **(3) không tìm lại ở lượt hỏi tiếp** (#1: tên quán có trong lịch sử nhưng model không search, r2 còn nói dối "vừa tìm lại"); **(4) xếp hạng chỉ theo rating/số review** ("rẻ hơn" → chọn quán 4.9⭐, không có giá). `maxSteps`/`temperature`/thinking: không có bằng chứng liên quan. Chi tiết và bảng dưới đây.

## S.1 First: the #15-r1 truncated reply — root cause found and reproduced

| Fact | Evidence |
|---|---|
| The model **did** write a full answer | server `tappyai_usage` for P15-r1: `llmCalls: 2`, `toolCalls: 1`, `finishReason: stop`, **`completionTokens: 583`** (step 2 alone: 441 tokens); the tool returned 10 spa rows, `_tappy_shortlist` of 3, `_tappy_ranking.pick = "MASSAGE HẠ SPA QUẬN 1"`, `place_search_status: has_results` |
| The client received 141 chars | `"Mình sẽ tìm spa thư giãn ở TP.HCM cho bạn nhé.\n\n[FOLLOWUPS]…"` — the 46-char preamble is the text the model emitted **before** the tool call (step 1, 142 tokens, released early by the A5-P1 flush); **everything from step 2 was removed**; the `8:` places annotation (card) was still emitted (web users saw cards with no prose; mobile users would see only the preamble) |
| Where it was removed | server-side, in `applyPlaceEnrichmentStreamFilter` → `emitReconstructed` (`streamEnrichment.ts:1195-1290`): the chain `injectPlaceEnrichment → guardMoneyClaimsInText → guardSpecClaimsInText → guardTravelClaimsInText → guardSnippetPricesInText → guardPlaceClaimsInText → stripModelScaffolding → suppressUngroundedVenues`. **None of these guards logs what it removes**, so the server log is silent |
| Mechanism (reproduced offline, `scripts/audit/p15Truncation.audit.test.ts` → `p15-truncation-repro.json`) | `guardPlaceClaimsInText` attributes a sentence to a venue with `placeTokensFor` / `textNamesPlace` (`lib/links/placeAttribution.ts:135-160`): a venue is nameable only through **distinctive tokens** (tokens that occur in exactly one name of the result set, ≥ min length), and all of them must sit in **one clause**. In the P15-r1 result set the pick **"MASSAGE HẠ SPA QUẬN 1"** shares every token with "MASSAGE HẠ SPA Tân Bình", "Lụa Spa Quận 11", "Massage & Hair Spa Quận 3", "Massage Quang Thư Quận 10" → **`distinctive = []`**, `textNamesPlace() = false` for any sentence. Every sentence carrying a rating / review-count / phone / hours claim about it is therefore "unattributable" and stripped; the price sentence is stripped by `guardSnippetPricesInText` (the `price_search_results` were `evidence_scope: area`). The synthetic r2-shaped sentence about the r1 pick shrinks 242 → 102 chars under the guard alone. In r2 the pick "Sunyata Retreat Hill Spa" has `distinctive = [sunyata, retreat, hill]` → nothing stripped (236 → 236) |
| Same mechanism elsewhere in the baseline | **P8-r1** (91 chars of body): pick "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM" — the name embeds an address with " - ", "," and "." so its distinctive tokens never share one clause → not nameable (reproduced: 275 → 165). **P3-r1 / S7-r1 / S7-r2 / P7-r1 / P7-r2**: picks "QUÁN ĂN NGON - Nguyên Sinh Bistro - est. 1942", "Truyền Thuyết ChamPong Quận 1 - 전설의짬뽕 1군점", "Nhà hàng chay Phương Mai" — replies keep only orphan fragments that start with a space (" Quán mở từ 6h-21h…", " Đây là lựa chọn tốt nhất…", " 😋"), i.e. the sentence before them ("Mình chọn **X** … 4.x⭐ (N đánh giá)") was removed. **P9-r2**: a sentence removed mid-paragraph leaves "…lựa chọn ổn định.nhưng RuNam có nhiều review hơn". **P12-r1/r2** (shopping): the pick/spec sentences removed by the money/spec guards leave " Gợi ý: trước khi mua…" / " Tuy nhiên tôi chưa có đủ thông tin…" |
| Scale | `baseline-metrics.json`: 13/36 turns show removal evidence (orphan fragment and/or delivered body ≤ 35 % of the answer-step token count); **7/30 primary turns** are in the severe band (P3-r1 0.29, P7-r1 0.30, P8-r1 0.19, P15-r1 0.10, P7-r2 0.28, plus setups S5-r1 0.33, S7-r2 0.28). Intact replies sit at 0.8–1.6 chars/token |
| **Could production be affected?** | **YES — same code, same providers.** The guard chain runs on every place turn on production; Serper `/maps` (the provider serving production place turns, per project notes; Google Places returned 403 here as well) routinely returns chain names ("MASSAGE HẠ SPA QUẬN 1 / Tân Bình"), names with embedded addresses, and near-duplicates. Nothing in the baseline environment is specific to the audit. The web surface partly masks it (the card still renders); Android/iOS render prose only, so those users receive the preamble and nothing else. This is more severe than the list-style symptom the audit set out to explain |

> **ERRATUM (2026-09-17, found at the G1 "diff main vs branch" gate).** The row "Could production be affected? YES — same code" is **wrong**. `git diff origin/main HEAD` shows `src/lib/ai/placeClaimGuard.ts`, `src/lib/links/placeAttribution.ts` and `src/lib/ai/groundingGate.ts` **do not exist on `origin/main`** (842379b; merge-base with this branch `f16a71f` = the production web build): they were added on the V3 branch in `f8dca88` (2026-09-10), unreleased (75 commits ahead of main). Production's post-model chain is `moneyGuard → specGuard → travelGuard → snippetPriceGuard → stripModelScaffolding` only. Therefore: (1) the G1 truncation mechanism is a **V3 pre-release blocker, not a production defect**; (2) production can still lose *price* sentences to `snippetPriceGuard` (sentence-scope redaction exists on main) — scale unknown, not measured; (3) **this whole baseline measured the V3 branch (`f6712b8`), not production** — findings A/B/C/M rest on code that *is* on main (`isDecisionDomain`, R1b `_tappy_shortlist`, `SCOREABLE`, `priceVnd` note, `toolInvocations` stripping, shopping-only evidence, user-only memory extractor all verified present on `origin/main`), but the web composition block (`buildRenderedDecisionBlock`) is V3-only, and production's replies were never sampled. A short baseline against `main` in the audit environment is needed before any statement about what production users see.

## S.2 Per-query quality notes (J–K)

Legend: **F** = fidelity failure (claim with no evidence in the tool result), **T** = truncation/fragment by guards, **M** = memory carry-over (the authenticated audit user accumulated `user_memory` across all 36 turns because `memoryExtract: 1` on every turn; later turns say "phong cách của bạn", "bạn hay ăn Nhật", "gần Landmark 81", "you usually go on weekends with one other person"), **A/B/C** = confirms finding.

| # | Query | r1 | r2 | Notes |
|---|---|---|---|---|
| 1 | Quán này mở cửa mấy giờ? (setup: quán Nhật yên tĩnh Q1) | 0 tools; "chưa có thông tin… xem Google Maps / gọi quán"; guesses "thường mở 17–18h" | 0 tools; **"Mình vừa tìm lại thông tin"** (no tool was called) + same guess | **C confirmed twice**: the venue name **was** in the prior assistant text ("Izakaya Kamura") and `search_places(query: 'Izakaya Kamura', location: 'Quận 1')` was available, yet the model chose not to search; both replies push the work to the user (violates R1(i)); r2 **claims a re-search that did not happen (F)**; the "17–18h" figure is a guess presented as experience (F). Tool-decision problem, not only missing data. Stage `null`, turnIntent `clarification_response` (the setup reply ended with "?"). |
| 2 | quán Nhật ngon và yên tĩnh | pick Unatoto 4.9⭐/7.103; "không gian yên tĩnh, chính cống" | same pick; "yên tĩnh… phù hợp lắm với phong cách của bạn" (M) | **B confirmed**: decision-first (R1b works even with `domain=null` → **A's "no instruction" effect not visible**), but the only evidence used is rating/count; "yên tĩnh", "chính cống" are **F**. Identical pick across runs (deterministic ranker on the same Serper rows). |
| 3 | quán ăn tối < 500k, 2 người, yên tĩnh | 1 tool; **T** (pick sentence stripped; body = " Quán mở từ 6h-21h, không gian yên tĩnh…") | 2 tools (model re-queried "quán ăn Nhật" first because of memory: "Vì bạn hay ăn Nhật" (M)); **T** | **B/B′ confirmed**: budget never enters the ranker (`priceVnd` absent for places); both picks are rating-driven; "yên tĩnh" **F**. r2's extra tool call is memory-induced, not a loop. |
| 4 | Cuối tuần đi đâu được? | 0 tools; asks 2 questions (city vs outside; activity) | 0 tools; asks 2 questions (M: "Quận 1 (nơi bạn hay ở)") | Reasonable clarification for an open ask (R7c); minor: two questions in one turn despite the closing "≤1 question" rule (both runs). `role: fast`. Not a listing case. |
| 5 | So sánh 3 quán này (setup: 3 cafe đẹp Thảo Điền) | 1 tool (re-search same query, cache hit); compares 3 on rating/count/hours; **T** (3 fragments: "Phù hợp nếu…" lines lost their headers) | 3 tools (one per named café + one generic); balanced comparison; **T** (Wego's header line stripped: "Điểm yếu: Đóng cửa sớm nhất…" orphaned) | **C confirmed, with the model's workaround**: no evidence in history → it re-searches (1 vs 3 calls = **meaningful behavioural variance**, not a loop; `maxSteps` never binding: 2 steps). Comparison content is rating/hours only — "yên tĩnh" leans are **F**. Setup S5-r1 itself was truncated to one fragment (user "asked for 3, got 1 line"). |
| 6 | 5 quán cafe đẹp Thảo Điền | 1 tool; **T** (pick sentence stripped); mentions Wego/SOO | 1 tool; pick Wego "yên tĩnh và đẹp" (**F**); names only 1 of 5 | User asked for 5; R1b/R1(a) cap the reply at 1–3 — by design, but the reply never acknowledges the mismatch. Shortlists differ across runs (r1 served from the 30-min cache of S5, r2 fresh Serper rows) → **provider variance**, not model variance. |
| 7 | Có chỗ nào rẻ hơn không? (setup: 300–500k/người Q1) | 1 tool ("nhà hàng quán ăn rẻ"); pick **Nhà hàng chay Phương Mai** (4.9⭐); **T** ("Giá rẻ mà chất lượng tốt…" fragment) | 1 tool ("nhà hàng rẻ Quận 1 dưới 300k"); same pick; **T** | **B′ confirmed hard**: "cheaper" is answered with the highest-rated venue; no price exists in the rows and the price snippets are area-level → the guards then strip every price sentence → the user gets fragments. Stage `refinement` detected correctly. |
| 8 | Tôi đang ở đây, tìm chỗ ăn gần tôi (GPS D1) | 1 tool, `hasLocationBias: true`, `centeredOnUser: true`; **T severe** (91 chars: "Mình chọn **Vua Chả Cá** cho bạn! 😋") | same pick; distances shown (0.6 km, 1.7 km); "giá hợp lý cho 2 người" (**F**, M) | GPS mechanism works; **T mechanism reproduced** (address-in-name). The ranker's distance term is visible in r2's alternatives. |
| 9 | cafe gần Landmark 81 | pick RuNam Vincom Landmark 81 (name match); "không gian yên tĩnh" (**F**); mentions Starbucks | same pick; **T** (mid-paragraph sentence removed → glued fragment); asks "yên tĩnh hay wifi?" | Location resolved to "Quận 1" although Landmark 81 is in Bình Thạnh; the pick is right by name, not by geometry (no GPS, `distance_km` absent). |
| 10 | Find me a quiet Japanese restaurant nearby (GPS, EN) | EN reply; pick Unatoto 0.7 km; "intimate and calm" (**F**); "Since you usually go on weekends with one other person" (**M**) | EN reply; same pick; "calm, intimate izakaya vibe you're after" (**F**) | Language correct both runs (§I). `cuisine:japanese` was not extracted from English (route-signals), yet the model's own query "quiet Japanese restaurant" made Serper return izakayas — the model, not the engine, carried the cuisine constraint. |
| 11 | Find giúp tôi một quán cafe chill gần đây (GPS) | VI reply; pick Hoff 0.1 km; "rất gần Landmark 81" (**F + M** — Landmark is ~3 km from Lý Tự Trọng; the phrase leaked from #9's memory) | same pick; "không gian yên tĩnh phù hợp với phong cách của bạn" (**F, M**) | Mixed-language detection correct (vi). Distance evidence real; ambience claims not. |
| 12 | tai nghe tốt dưới 2 triệu | `search_products`; `[TAPPY_SHOPPING]` marker + card; prose reduced to " Gợi ý: trước khi mua…" (**T** by spec/money guards) | same pick (ASUS ROG Cetra II Core); "chưa có đủ thông tin chi tiết về cấu hình" (honest) | Shopping path behaves as designed (grounding block + guards); the card carries the decision, prose is thin. Pick identical across runs. |
| 13 | Cuối tuần này tôi muốn đi Đà Lạt, gợi ý giúp tôi | 0 tools; one clarifying question (what to look for) | 0 tools; same question + memory hint (M) | Defensible per R7(c) (no party size/budget/purpose); `planningIntent=null` so no trip block; consistent across runs. Not a fidelity or listing issue. |
| 14 | Tối nay ở TP.HCM có gì vui? | 3 tools (bar/karaoke, cinema, cafe) in one step; 3 categories, leans karaoke; ends with a 3-way question | identical 3 tools; same structure | The only multi-tool fan-out; **not a loop** (3 parallel calls in step 1, 2 steps total). Content is rating-led; the "3 hướng" structure is the closest thing to a list in the whole baseline, and it is a reasonable answer to an open question. |
| 15 | spa thư giãn, sạch sẽ, giá hợp lý | **T total** (46 chars body) — §S.1 | pick Sunyata; "không gian yên tĩnh" (**F**); price "theo ước tính… 300–500k" (hedged estimate, area-level; guard let it through because it is worded as an estimate); phone number quoted | Different picks across runs because the model's tool query differed ("…giá hợp lý" vs "…TP.HCM") → different Serper rows → different ranker output: **search-query variance**, not temperature per se. |

**Fidelity failures (unsupported claims) — count:** 19 of 30 primary replies contain at least one attribute the evidence cannot support (`baseline-metrics.json` `unsupportedTerms` > 0 on 17 primary runs + the "vừa tìm lại" false statement in P1-r2 + the "rất gần Landmark 81" claim in P11-r1). The recurring forms: **ambience** ("yên tĩnh/quiet/calm/intimate", "chill", "đẹp"), **cleanliness** ("sạch sẽ"), **authenticity** ("chính cống"), **price adequacy** ("giá hợp lý", "giá phải chăng", "phù hợp giá"), **proximity to a landmark** carried from memory, **process claims** ("vừa tìm lại"). All of them are exactly the user's own wish words handed back as venue facts — the pattern the shopping grounding block forbids for products and nothing forbids for places.

## S.3 Two-run variance (L)

| # | Tool count r1→r2 | Tool selection / query | Pick / shortlist | Reply structure | Classification | Consistent with |
|---|---|---|---|---|---|---|
| 1 | 0→0 | none | — | same (no data + guess) | minor wording | prompt/context (no evidence → no search) |
| 2 | 1→1 | same tool, query "…ngon yên tĩnh Quận 1" vs "…yên tĩnh Quận 1" | same pick | same | minor wording | — |
| 3 | 1→2 | r2 adds a Japanese-first query | different pick (Nguyên Sinh vs Kamura) | both truncated | **meaningful** | memory carry-over (M) changing the model's query |
| 4 | 0→0 | none | — | same | minor wording | — |
| 5 | 1→3 | r1 generic re-search (cache hit); r2 one search per named café + generic | r1 shortlist Dangdo/Wego/SOO; r2 no shortlist (3 results merged) | both compare 3; both truncated somewhere | **meaningful** | model behaviour (how to recover missing context) |
| 6 | 1→1 | same query | different shortlist (cache vs fresh rows) | both truncated | **meaningful** (data) | provider/data variability |
| 7 | 1→1 | "quán ăn rẻ" vs "rẻ … dưới 300k" | same pick | both truncated | minor | — |
| 8 | 1→1 | "quán ăn ngon gần đây" vs "quán ăn ngon" | same pick | r1 truncated, r2 intact | **meaningful** (delivered text) | guard behaviour on the same pick name (r2 wrote a sentence the guard could keep) |
| 9 | 1→1 | same | same pick | r2 has a glued fragment | minor | guard |
| 10 | 1→1 | same | same pick | same | minor wording | — |
| 11 | 1→1 | same | same pick | same | minor wording | — |
| 12 | 1→1 | same | same pick | both thin prose | minor | — |
| 13 | 0→0 | none | — | same question | minor wording | — |
| 14 | 3→3 | identical 3 queries | same shortlist | same | minor wording | — |
| 15 | 1→1 | "…giá hợp lý" vs "…TP.HCM" | **different pick** | r1 empty, r2 full | **meaningful** | search-query wording → different rows → different pick → guard outcome |

Summary: 5/15 meaningful behavioural variations; **none attributable to temperature alone** — each has an observable cause (memory carry-over, model's recovery strategy for missing context, provider row variance/cache, guard sensitivity to the pick's name). `llmCalls` was 2 on every tool turn and 1 on every no-tool turn: **`maxSteps = 5` was never reached** (max steps used = 2). `finishReason: stop` on all 36 turns (never `length`).

Confound to record for future baselines: the audit user is authenticated, so `memoryExtract` ran after every turn and later turns were personalised by earlier ones ("phong cách của bạn", "bạn hay ăn Nhật", "gần Landmark 81", "usually go on weekends with one other person"). This is production-realistic for a returning user but makes the two passes non-independent; a clean design needs a fresh user per pass (or a memory reset between passes).

## S.4 Quality analysis (K, per the brief's axes)

| Axis | Observation |
|---|---|
| Intent understanding | Good on cold starts; the regex stages fired where expected (`refinement` on #7, `comparison` on #5). #1's `clarification_response` label (because the setup reply ended with "?") is wrong — the user asked a factual follow-up. |
| Tool decision | Sound on cold starts (right tool, sensible query). **Poor on follow-ups**: #1 never searched (both runs) although the name was in context; #5 either re-ran the original query or split it into 3 — the model has no instruction for "the evidence you need is in the previous turn's tool result, which you no longer have". |
| Evidence quality | Serper `/maps` rows only (Google 403): name, address, rating, count, hours, phone, `price_range_text`, types, distance when GPS. **No ambience, cleanliness, noise, atmosphere, or per-person price.** Price snippets always `area` scope. |
| Evidence usage | Ratings and counts are used correctly and cited; hours/distance used when present. Everything the user actually asked about beyond that is answered by assertion. |
| Recommendation behaviour | A surviving decision sentence ("Mình chọn X" / "I'd lean toward X") in **15/30** primary replies; of the other 15, **6** are clarification/no-data turns (#1 ×2, #4 ×2, #13 ×2), **1** is a comparison (#5-r1), and **8** are turns whose decision sentence was stripped by the guards (#3 ×2, #6-r1, #7 ×2, #12-r1, #15-r1, #5-r2's header). **Not one reply is a search-result list**: the "search dump" symptom was not reproduced on this surface with this prompt. |
| Personalization | Present (memory), sometimes wrong (#11 "gần Landmark 81"). |
| Evidence fidelity | 19/30 replies with unsupported claims (§S.2). |
| Search-result dumping | Not observed; the nearest is #14's three-category answer. |
| Naturalness | Good where intact; **broken where guarded** (orphan fragments, sentences glued after a deletion, replies that are one preamble line). |
| Language consistency | 30/30 correct (EN for #10, VI elsewhere, mixed → VI for #11). |
| Tool efficiency | 1 call on 22/30 primary turns; 0 on 6; 2–3 on 2 (#3-r2, #5-r2) and 3 on #14 (both) — no loops, no retries. |
| Follow-up usefulness | Every suggestion reply ends with a question or chips; #4 asks two questions; #10-r1 ends "Which one appeals to you more?" after already leaning — mostly harmless, occasionally redundant. |

## S.5 Root-cause classification updated with baseline evidence (M)

| Finding | Before (§R.4) | After baseline | Evidence |
|---|---|---|---|
| **New — G1 · Post-model guards strip the decision sentence when the pick's name is not attributable (no distinctive token / address in name / clause-split), leaving fragments or an empty reply** | not identified | **P0 — PROVEN ROOT CAUSE** of the empty/fragmentary replies | code path (`placeAttribution.ts:135-160`, `placeClaimGuard.ts:497+`, `streamEnrichment.ts:1195-1290`) + offline reproduction on the real rows (P15-r1, P8-r1) + 13/36 turns with removal evidence; production shares the code and the provider |
| B · Evidence cannot carry the stated need (ambience/cleanliness/price) | P1 | **P0 — PROVEN** for the *fidelity* failure: with no attribute to check, the model asserts the wish (19/30) | tool rows + reply text |
| B′ · No place price in the ranker; budget for places enforced by nothing deterministic | P1 | **P0 — PROVEN** for #3/#7: "cheaper" → highest-rated pick; budget ignored | rows, picks, `candidate.ts:120-122` |
| C · No place evidence in follow-up context; shopping-only carry-forward | P1 | **P0 — PROVEN** for #1 (both runs), with an additional *tool-decision* component: the name was available and no re-search was attempted; r2 fabricated a re-search | replies + server log (`toolCalls: 0`) |
| A · domain-null turns lose the ranking/web blocks | P1 | **downgraded to P2** for the *listing* symptom: #2/#8 (domain null) were still decision-first via R1b; no listing observed. Remains a real gap for the `_tappy_ranking` explanation and the web composition rule (P1 for prompt hygiene) | replies #2, #8, #13, #14 |
| Enumeration-shaped prompt mandates | P1 | **P2** — not observed producing lists on the web surface; they do produce the per-place rating/hours lines the card already shows (duplication), and the CTA JSON inflates answer tokens | replies |
| Web card lists ≤ 8 items regardless of prose | P1 (amplifier) | unchanged (baseline measured the backend only) | — |
| Search-always + `web_search` "summarise" contract | P1 | **P2** — `web_search` was never chosen; #4/#13 clarified instead | server log |
| Memory carry-over produces false personal/location claims | not listed | **P1 (new)** — "rất gần Landmark 81" (#11), "giá hợp lý cho 2 người" (#8), "bạn hay ăn Nhật" (#3-r2 changing the search) | replies; `memoryExtract: 1` every turn |
| `search_products` dropped on `offline` turns | P2 | unchanged (not exercised) | — |
| No-diacritic Vietnamese → `en` | independent | unchanged (all spec queries carry diacritics) | — |
| A. temperature unset | P2 | **P2 — still no evidence**: every meaningful variance has a concrete non-temperature cause | §S.3 |
| B. thinking off | P2 | **P2 — untested**; nothing in the baseline points at reasoning depth | — |
| C. maxSteps = 5 | P2 | **REFUTED as a cause**: max 2 steps used on all 36 turns; never binding | server log `llmCalls` |
| H. history reinforces list style | P2 | **P2 — no list style to reinforce** was observed | — |

## S.6 Parameter assessment updated (N)

| Parameter | Baseline evidence | Assessment |
|---|---|---|
| `maxSteps` 5 | `llmCalls` ≤ 2 everywhere; `finishReason: stop` ×36 | not a factor; no test warranted |
| `maxTokens` 3072 | max `completionTokens` 998 (P5-r2) | not a factor |
| `temperature` unset | 5 meaningful variances, each with an identified non-temperature cause | no evidence; a low-temperature A/B would only be informative after G1/B/C are addressed, since those dominate what the user sees |
| thinking off | — | untested; not indicated by any observation |
| `toolChoice` auto | correct tool on every cold start; the failure is on follow-ups (#1), where forcing would not help (the model needs to know *what* to search) | not a factor |
| Guard chain (`placeClaimGuard` name attribution, `snippetPriceGuard`, `stripModelScaffolding`) | **the dominant cause of visible damage** | the most important design question for Phase 2 (not a parameter): attribution by distinctive tokens fails on chain names / address-in-name / near-duplicates, and removal is silent (no telemetry) |
| Prompt size (38k shared + CTA JSON) | CTA blocks consume a large share of answer tokens (P3-r1: 582 tokens → 167 chars of prose after stripping) | secondary |
| `isDecisionDomain` gate | no listing effect observed | P1 hygiene only |

## S.7 Explicit answers to the Phase 1B questions

1. **#15-r1**: body removed server-side by the guard chain because the pick's name has no distinctive token in its result set (reproduced offline); **production can be affected** (same code, same provider, same kind of names); web shows an empty prose with cards, mobile shows only the preamble.
2. **Findings A/B/C vs baseline**: B and C confirmed and upgraded to proven for the observed behaviours; A's listing effect not observed (R1b compensates) → downgraded for that symptom.
3. **Every unsupported claim** is flagged as **F** in §S.2 (19/30 primary replies).
4. **#1**: the restaurant name ("Izakaya Kamura") **was** available in the prior assistant text; a re-search by name **was** possible (`search_places(query, location)`); the model did not attempt it in either run and in r2 stated that it had.
5. **P2 hypotheses**: `maxSteps` refuted; temperature and thinking remain untested hypotheses with no supporting observation.

No fix is designed here. Phase 2 ordering implied by the evidence (for the owner's decision, not a proposal): guard attribution/telemetry (G1) → place evidence & wish-vs-fact grounding (B) → place evidence carry-forward and follow-up tool decision (C) → memory-derived claims (M) → prompt duplication/`isDecisionDomain` hygiene (A).
