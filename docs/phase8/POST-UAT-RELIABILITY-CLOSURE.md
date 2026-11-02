# Phase 8 — Post-UAT Reliability Closure (2026-10-09)

**Branch** `p8/agent-runtime` · **Baseline** `1d59607` (WS2 final) · **Scope** Web only, `TAPPY_AGENT=2`, dev / UAT only.
**Input** the real Web UAT `artifacts/phase8/uat/no-fabrication-2026-10-09/` (25 scenarios, 0 fabrication, 6 FAIL-QUALITY, 6 BLOCKED).
**Rerun** `artifacts/phase8/uat/post-fix-2026-10-09/`.

## Summary

The six fix groups are implemented. The rerun on the real Web UI found more defects of the same kind (guards removing correct content); they were traced through an opt-in, local-only guard-diff log and fixed (§A, rows 7–14).

**Final rerun** (22 scored items = 19 UAT questions + 2 mobile-width variants, with UAT-04 / 05 / 06 scored separately):

| | PASS | PASS w/ limitation | FAIL-QUALITY | FAIL-FABRICATION | FAIL-SAFETY | BLOCKED |
|---|---|---|---|---|---|---|
| Before (09/10 UAT, 25 scenarios) | 6 | 7 | 6 | 0 | 0 | 6 |
| After | **8** | **7** | **1** | **0** | **0** | **6** |

- Every BLOCKED item is blocked by a provider: Serper returns HTTP 400 "Not enough credits".
- The one remaining FAIL-QUALITY is UAT-10: Luna still asks instead of explaining the selection criteria.
- **Gates:**
  - full suite **18,336 passed / 0 failed** (1,104 files), plus 118 new tests;
  - `tsc` clean;
  - lint: 0 errors.
- **Mutations — all caught:**
  - post-UAT **51/51**;
  - WS2 final 20/20;
  - WS2 24/24;
  - M7 13/13;
  - M6 11/11.
- **Not verified on the final code:** the Make Plan card. Providers failed in both probes, so the contract could not be satisfied (§J).

## A. Root causes (audited against the UAT evidence and the code before any edit)

| Group | Evidence | Root cause | Files | Fix | Regression risk |
|---|---|---|---|---|---|
| 1 · Gate false positive (B2) | UAT-07: trace `claims FABRICATED 1 price`, no tools; total 105 triệu removed; note "chưa xác minh được giá hiện tại" appended | `derived()` only combined USER / evidence values, never values the reply itself had derived; "100 tr + 5 tr" needed the 5 tr from the previous sentence. Shown arithmetic was never evaluated. The note said "from the sources checked" on a turn with no tool | `noFabricationGate.ts` | Gate walks the reply in order and adds every FACT / INFERENCE amount to the known set (chaining); `a × (1 ± p%)`; a deterministic evaluator checks "expression = result" (right ⇒ INFERENCE, contradicted ⇒ FABRICATED, even if the figure exists elsewhere); allocation shares `(60%)` are factors for their line; note wording depends on whether anything was looked up | Could accept an invented input → each money amount is still its own claim (test: iPhone price × 2) |
| 2 · Budget removed by snippet_price (B3) | UAT-09 t2 −468 chars, UAT-25 −243/−424/−183/−284; dangling "Chia ngân sách tham khảo như sau:" / "Đây là khung phân bổ sơ bộ…" | On a place-intent turn every money claim with no venue was judged as an AREA price and needed a snippet; a budget split has none ⇒ deleted | `snippetPriceGuard.ts`, `noFabricationGate.ts`, `citationIntegrity.ts`, `streamEnrichment.ts` | Scope rule `allocationItems`: an amount is an allocation item only when its sentence names no venue (scope names, identity, bold Title-Case names), the sentence or its lead-in frames a split / budget / estimate, it is not presented as THE total (unless it is the sum of the block's own items), it is ≤ the user envelope, and it is not the user's own number (F-086). Same rule (place-name aware) in the gate. `dropOrphanLeadIns` removes a ":" lead-in left with nothing under it | Opening a merchant-price hole → venue-named lines, totals, above-envelope amounts and the F-086 echo stay judged (tests + mutations P6–P11) |
| 3 · Product state lie (B4) | UAT-11/12/23: `search_products` → `{note, links, shop_info_results: []}` read `SUCCESS`; fallback never ran | `toolStateOf` only knew row keys (`results`, `search_results`…); the links-only failure shape has none ⇒ SUCCESS. Same result cached 15 min. Fallback had no deadline of its own | `tools/shopping.ts`, `agent/runtime/toolState.ts`, `agent/runtime/index.ts` | The provider says `product_data: 'none'` + `provider_status: 'error' \| 'empty'` (error when both organic searches returned null); not cached. `toolStateOf` → ERROR / EMPTY. New metadata `data_usability: usable \| partial \| none` (public enum unchanged). Fallback also on PARTIAL (rows, no price); bounded by the remaining tool budget (skipped under 2.5 s, raced against the rest) | Fallback on partial costs one search → only when rows carry no price; never on usable data or a genuine EMPTY |
| 4 · Markdown (B1) | UAT-01 raw ``` ; UAT-08 raw pipes | `formatMessage` had no fence / table / inline-code handling | `components/ChatInterface.tsx` | Code (fenced + inline) lifted out first into private-use placeholders, rendered escaped with a language label, restored last (nothing inside code becomes a link, bold, image); an unclosed fence mid-stream renders as code; GFM tables → one-line scrollable `<table>` (alignment, inline formatting in cells) | XSS → content escaped (mutation P26); existing link / image / bold tests unchanged |
| 5A · Unrelated cards (B5) | UAT-13/15/21/24/25: trace `ranking none:true cards:0`, UI "Tất cả (8)" | The `preliminary` place frame (engine rows, sent at the tool result) was never superseded when the decision had no card; the client reader skips empty frames and kept the preliminary | `streamEnrichment.ts`, `recommendation/liveView.ts` | The decision always closes the preliminary: no card ⇒ an explicit `{items: [], cleared: true}` frame (only if a preliminary card frame was actually sent); the web reader drops the view on `cleared` | Android ignores the empty frame (no crash) and still shows the preliminary — out of scope (Web only), recorded in J |
| 5B · Source link missing (B6) | UAT-13: VnExpress `travel_editorial` (url, publishedAt) used for the Sơn Trà warning, no link | Citation links exist only for pages READ (ledger); an article a tool returned whole never became a source | `agent/runtime/editorialSources.ts` (new), `agent/runtime/index.ts` | Articles under editorial / news keys are matched to the ONE sentence that restates them (≥ 3 title/summary word pairs incl. a proper-name pair); that sentence gets `[S#]` → the existing citation step renders the article's real URL. No match ⇒ nothing | Wrong attribution → conservative match; tests for no-restatement and non-article URLs (P20, P21) |
| 5C · Over-asking (B7) | UAT-09 t1, 10, 13 t1: `ask` on round 1 where the user asked to EXPLAIN / LIST | Luna's judgement; the prompt did not say an explain / list request IS the answer | `agent/runtime/prompt.ts` | Two prompt lines (Luna decides; no keyword gate): explain / list requests are answered with assumptions; optional details never block an answer; essential questions still allowed | Prompt-only; measured live (G) |
| 6 · Trip timeout (B8) | UAT-25 t1/t4: `get_trip_data` TIMEOUT 15 015 ms (cancelled), no data, no plan card | `tripDataTool` awaited `Promise.all` of 3 parts with no per-part deadline; one hanging part (Serper out of credits) pushed the bundle past the runtime's 15 s tool timeout and the loop discarded the parts that HAD finished | `agent/index.ts` | Each part raced against `TRIP_PART_TIMEOUT_MS = 11 s`; a late part is `TIMEOUT` (never "none"), finished parts are returned and emitted; late finishers are dropped; all three failed ⇒ the bundle is TIMEOUT / ERROR; a `parts_note` tells Luna to plan with what arrived | None found (tests with fake timers) |

### A2. Found by the live rerun

Every row below was located through `TAPPY_UAT_GUARD_DIFF` (off by default, never in production) — it logs which sentences a guard removed.

| # | Evidence (post-fix run) | Root cause | Fix |
|---|---|---|---|
| 7 | UAT-09 t1: `clarification` cut the requested "information I need" list to its first question, leaving a bare "1." | The one-question cap (built for reflex taste questions on place turns) treated a requested checklist as a form | `guardClarifications(…, { checklist })` on agent turns: list-item questions under an information lead-in ("mình cần biết:", "bạn cho (mình) biết:") in a reply that already answered (≥ 3 statements) are ONE question unit; free-form questions keep the cap; a question-only reply stays capped |
| 8 | UAT-09 t2: "Giữ tối thiểu khoảng 30 triệu làm vốn lưu động" removed | Capital-allocation words (vốn lưu động, quỹ / khoản dự phòng, để riêng, giữ lại) were not a split frame; "vốn" was not a budget word | Added to the split frame (guard + gate) and to the budget frame |
| 9 | UAT-25 t3 / t4: "Với ngân sách 700.000 đồng/người…" removed | `snippet_price` saw only the CURRENT user message; the envelope was given two turns earlier | Agent turns pass the whole conversation's user messages (the gate already did) |
| 10 | UAT-25 t2: itinerary slot allowances ("- **16:00–17:00:** Cà phê: **40–70 nghìn**") removed | The splitter cuts these lines at ":" so span-based item detection failed; slot lines carry no split word | Shared line-based `allocationContext` (guard + gate): slot lines in a plan whose envelope the user gave are allowances; a place named on the slot's own line is still judged; sibling items and headers are not a slot's subject |
| 11 | UAT-25 t1: "10:30–12:00 … hoạt động miễn phí" judged as opening hours; the "Ngân sách dự kiến: ăn uống 410.000đ + … = 910.000đ" line removed as a market fee; "Ngày 1:" read as 1:00 | (a) a slot label is not a venue's hours; (b) "chi phí" (expense) matched the market word "phí"; (c) labelled sums were not evaluated; (d) `clockTimes` accepted a colon with no minutes | Slot labels stripped before hours extraction; `(?<!chi\s)phí`; labelled "+" chains summed and checked; a colon needs its minutes |
| 12 | UAT-25: "điểm tham quan có vé", "nhớ xem giá trước khi gọi món"; UAT-09: "Chi phí … gồm … giao hàng" removed by `place_claim` | Ticket / ordering vocabulary matched an attribute ("ticketed attraction"), advice to the user, and a list of cost categories | Narrow exemptions in `isTicketSaleClaim` / `isOrderingClaim`; possession claims ("quán có giao hàng", "rạp có vé suất tối") still caught |
| 13 | UAT-13: the cited Sơn Trà warning removed by `travel_ungiven_date` / `plan_trip_facts` | "8/10" read as a travel date the user did not give | A sentence bound by code to a source (`[S#]`) states the source's date |
| 14 | UAT-13 / UAT-25: honest disclosures removed ("…chưa thể khẳng định tổng chi phí sẽ nằm trong 4 triệu", "giữ tổng chi khoảng 1 triệu") | F-086 (envelope restated as a cost) matched disclosures and constraints | Disclosure and constraint wording ("chưa xác minh", "giữ tổng chi", "không vượt", "trần") are not cost claims; "Tổng chi phí khoảng 4 triệu" still judged |
| 15 | Mutation P5: "85.000đ" passed as "≈ 12 % of the 700k budget" | The gate's percent forms used every generic factor 2–12 at 2 % tolerance (a coincidence path, pre-existing) | Percent forms only with STATED percentages; generic × / ÷ at 1 % |

## B. Files changed

| File | Why |
|---|---|
| `src/lib/ai/noFabricationGate.ts` | B2 chaining, expression evaluator (`evalExpression`, `arithmeticIn`), wrong-math detection, honest note wording; B3 allocation rule (place-name aware) |
| `src/lib/ai/snippetPriceGuard.ts` | B3 `allocationItems` scope rule in v1 and v2; `allocation` stat |
| `src/lib/ai/citationIntegrity.ts` | B3 `dropOrphanLeadIns` |
| `src/lib/ai/streamEnrichment.ts` | B3 orphan lead-in pass on agent turns; B5 clear frame |
| `src/lib/recommendation/liveView.ts` | B5 client reader honours `cleared` |
| `src/lib/ai/tools/shopping.ts` | B4 explicit `product_data` / `provider_status`; failure not cached |
| `src/lib/ai/agent/runtime/toolState.ts` | B4 `product_data` state, `productDataUsability`, fallback on partial, deadline-bounded fallback |
| `src/lib/ai/agent/runtime/index.ts` | B4 usability in the trace; B6 editorial attribution in the citation step |
| `src/lib/ai/agent/runtime/editorialSources.ts` (new) | B6 |
| `src/lib/ai/agent/runtime/prompt.ts` | B7 two lines |
| `src/lib/ai/agent/index.ts` | B8 per-part deadline, partial bundle |
| `src/components/ChatInterface.tsx` | B1 code blocks, inline code, tables; no empty line painted around a block (pre-wrap body) |
| `src/lib/ai/clarificationGuard.ts` | A2-7 information checklist |
| `src/lib/ai/placeClaimGuard.ts` | A2-12 ticket attribute, advice and cost-list exemptions |
| `src/lib/ai/planTripFactsGuard.ts` | A2-13 source-bound dates |
| `src/lib/ai/agent/runtime/claimConflict.ts` | A2-11 `clockTimes`: a colon needs its minutes |
| `src/lib/ai/agent/runtime/controlTools.ts` | B7 `ask_user` description (explain / list requests are answered) |
| `src/app/api/chat/route.ts` | Local-UAT diagnostics only: `TAPPY_UAT_GUARD_DIFF=1` and `NODE_ENV !== 'production'` |
| tests (new, 118) | `postUatGate`, `postUatBudget`, `postUatProduct`, `postUatPlanResearch` (runtime), `formatMessageMarkdown` (components) |

No existing test was weakened or edited. The architecture locks (one runtime, one fallback call: `await webSearch(` ×1, no retry loop) still pass unchanged.

## C. Behaviour changes

- **Calculations:**
  - a calculation the user can check is kept: shown arithmetic is evaluated by code;
  - a wrong result is removed even if it is written as a sum;
  - an invented input is still judged as its own claim.
- **Budgets:**
  - a split of the user's envelope, labelled estimates and itinerary allowances stay;
  - venue-named prices, totals without parts, above-envelope amounts and the envelope restated as THE cost (F-086) are judged as before.
- **Product search:**
  - "links only" = no product data: ERROR on provider failure, EMPTY on a real empty answer, never cached;
  - partial rows (no price) keep their rows and get the fallback;
  - the fallback is skipped when under 2.5 s remain, and is otherwise raced against the tool's remaining budget.
- **Rendering:**
  - fenced code (with a language label), inline code and GFM tables render;
  - content inside code is escaped and never linked or bolded;
  - a fence still open mid-stream renders as code.
- **Cards:** when the decision has no card, the preliminary set is retracted with a `cleared` frame.
- **Sources:**
  - a restated news / editorial item gets a real link through the existing `[S#]` path;
  - nothing is attached without a restatement.
- **Planning:**
  - a slow provider part no longer loses the bundle;
  - TIMEOUT is reported at about 11 s instead of being cancelled at 15 s.

## D. Before / after evidence

`artifacts/phase8/uat/post-fix-2026-10-09/before-after/`: UAT-07, 09, 25 (four turns), 01, 08, 15, 13 (before / after), plus mobile shots for 01 and 08. A per-scenario table is in `report.md` §3–4.

## E. Tests (final code)

- `npx vitest run`: **18,336 passed / 0 failed**, 1 expected-fail, 84 skipped (1,104 files).
- Includes 118 new post-UAT tests; the P33 settle-path test was added after the full run (29/29 in its file).
- Earlier full runs showed 3 timeouts (control-byte scan, JSON-LD page, flight-source scan) under machine load; all pass in isolation and in the final run.
- `tsc --noEmit` clean.
- ESLint on changed files: 0 errors (5 pre-existing warnings in untouched lines).

## F. Mutations

| Suite | Result |
|---|---|
| post-UAT P1–P47 (51 items) | **51/51 caught**. The first runs exposed six survivors (P5 / P5b / P5c / P9b / P9c / P12), then P33; each was closed with a sharper test, and P5 led to the percent-coincidence fix (A2-15). |
| WS2 final F1–F20 | 20/20 (F17 re-targeted to the renamed `bare` line: same safeguard) |
| WS2 W1–W24 | 24/24 |
| M7 X1–X13 | 13/13 |
| M6 M1–M11 | 11/11 |

The source fingerprint after the mutation runs equals the final code (`cd79eca723c1`): every file was restored.

## G. Live UAT

Per scenario: `artifacts/phase8/uat/post-fix-2026-10-09/report.md` and `results.json` (question, reply transcript, screenshot, tool states, guard removals, latency, cost, verdict, remaining limitation).

- **Runs:**
  - final-2: all scenarios, diff fingerprint `6d699f86bbd5`;
  - final-3: UAT-09 and UAT-13 on the final `cd79eca723c1`.
- **Scoring:** 8 PASS · 7 PASS with limitation · 1 FAIL-QUALITY (UAT-10) · 6 BLOCKED (providers) · 0 FAIL-FABRICATION · 0 FAIL-SAFETY.

## H. Provider health (09/10/2026)

| Provider | Status |
|---|---|
| Serper | HTTP 400 "Not enough credits": every Serper search ERROR |
| DuckDuckGo fallback | Intermittent: one intermediate run read viettelstore.vn; the final runs got nothing |
| `search_products` | ERROR (correct now); fallback ran and was also ERROR |
| `search_places` | OpenStreetMap: SUCCESS / EMPTY / TIMEOUT |
| `get_trip_data` | SUCCESS or TIMEOUT within its budget |
| `get_gold_price` | SUCCESS (vang.today) |
| `get_news` | SUCCESS, but the headlines are not query-filtered |

## I. Performance (n = 27 turns, final runs)

| Measure | Value |
|---|---|
| Server | p50 8.6 s · p90 18.9 s · max 35.5 s |
| No-tool turns (n = 7) | p50 2.5 s |
| UI (driver settle included) | p50 13.2 s · p90 23.8 s |
| Cost | $0.040 total ($0.0015 per turn) |
| Before (n = 33) | server p50 7.6 s · p90 17.9 s |

No budget or ceiling was raised.

## J. Remaining limitations

| Item | Class |
|---|---|
| B1 Markdown code / table | FIXED |
| B2 arithmetic false positive | FIXED |
| B3 budget removal (incl. A2-8…14) | FIXED |
| B4 product state / fallback | FIXED (live price still blocked by Serper) |
| B5 unrelated cards (web) | FIXED |
| B5 Android still shows the preliminary cards when Luna chooses none | BLOCKED (out of scope: web only; Android ignores the `cleared` frame) |
| B6 editorial source link | FIXED |
| B7 over-asking | PARTLY FIXED. UAT-09 / 13 now answer first; **UAT-10 still asks** (prompt-level, Luna's judgement; no keyword gate by design) |
| B8 trip-data timeout | FIXED (the bundle answers inside its budget) |
| Make Plan card on the final code | **BLOCKED**: both probes had failing providers, so the contract (real places only) could not be satisfied and a text plan was correctly produced. The card rendered on an intermediate build (plan block in `server.log`), but that screenshot was overwritten and is not counted. |
| Live research (prices, conflicts, news) | BLOCKED (Serper credits) |
| `get_news` relevance | INTENTIONALLY RETAINED (headline feed; Luna refuses unrelated items) |
| Pre-research turn may suggest a place that has since closed (UAT-13 t1) | INTENTIONALLY RETAINED (no lookup on that turn; turn 2 corrects it with a source) |
| 25 scenarios do not prove the absence of fabrication | — |

## K. Git

The commit is made locally on `p8/agent-runtime` after this verification; the hash is reported in the session summary. No push, merge or deploy. UAT artifacts stay untracked (as with the 09/10 UAT).

## L. Scope confirmation

- Web only: no Android or iOS file changed (Android was read, never edited).
- Production untouched: the launcher refuses any non-audit Supabase; no production environment variable, database or deploy.
- The agent runtime is preserved (one loop, one fallback call); Luna 6.0 remains the reasoning, planning and ranking layer.
- Card and Make Plan contracts are preserved: the `cleared` frame is additive; the plan contract is unchanged.
- Quota, subscription and billing are unchanged: the guest counter was reset only by restarting the local dev server between UAT batches.
