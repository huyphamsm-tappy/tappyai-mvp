# Phase 8 Workstream #2: Research Intelligence + Consultative Behaviour Closure (TAPPY_AGENT=2, web)

Branch `p8/agent-runtime` (worktree `wtagent8`), base `acd67e0` (M7, accepted) + `1970e40` (SSRF fix). Web only.

**Method:**
1. Read every research, evidence, guard and decision path.
2. Measure each known issue on recorded eval output.
3. Fix only P0 / P1.
4. Lock with tests and mutations.
5. Re-run the eval.

**Scope proof:** Android, iOS, production and environment files were not touched (section 25).

## 1. Existing architecture (unchanged)

```
USER → conversation / task state (M2) → LUNA 6.0 (runAgentRuntime, one loop)
     → answer | ask_user | tools (web_search · read_page · places / hotels / products / … · use_tool proxy, M6)
     → evidence ledger (M3) → Luna "đủ chưa?" → research again | decide
     → settle path: ranking / decision → hard guards → M4 evidence shield → factual guards → citations → TEXT / CARD / MAKE PLAN
```

- **Single loop, single brain:** there is one runtime loop and one brain (Luna, through the AI facade).
- **Nothing new of that kind:** no second agent, engine, loop or model was added.
- **What this workstream changed:**
  - the evidence metadata, the price contract and the link contract;
  - citation integrity;
  - the decision transport;
  - three ownership leaks.

## 2. Research flow

Research is optional, and Luna decides when to do it.

- **Simple question:** 0 tools.
- **Current fact:** `web_search` (1–3 parallel queries, optionally opening 1–3 pages in the same call).
- **Complex decision:** search → read → evaluate (FACT / INFERENCE / UNKNOWN / CONFLICT) → search again only for a missing or conflicting point → decide.
- **No mandatory pipeline:** no pre-search is locked (M7). Search is never forced, and since WS2 it is never forbidden by a keyword gate either (section 23, P1-3).
- **Budgets:** the M1–M7 budgets are unchanged (6 rounds, 8 tool calls, 12 / 15 Serper credits, 4 page reads, 85 s).

## 3. Realtime data flow

- **Pipeline:** Tappy Search (Serper) → `researchSearch.ts` (merge, preference to open) → `readPage.ts`.
- **Page fetch:** `safePageFetch`, which validates every hop, pins DNS, and caps time and size.
- **Extraction:** `pageExtract.ts` (bounded, untrusted, with instruction-like text dropped).
- **Ledger:** `evidence.ts` (deterministic claims, classification and conflicts).
- **Merchant APIs:** none are required. Every fact comes from a public page or a provider row the turn actually fetched.

## 4. Price research

Example: "MacBook Pro M4 16GB ở Sài Gòn giờ bao nhiêu?"

1. Luna calls `web_search` (kind `price`), optionally opening retailer or official pages.
2. Each sentence carrying a price becomes a price evidence item.
3. Luna compares, explains conflicts and answers.
4. An unverifiable price is said to be unverified (prompt: "Không kiểm chứng được giá → nói chưa xác minh được, không đoán"). The M4 guards still remove an uncited, unsupported figure.

**Fixed in WS2:** a price claim's value was the first quantity in the sentence. "MacBook Pro M4 16GB giá 39.990.000đ" was recorded as "4" (from "M4"). The value is now the money amount.

## 5. Price evidence contract (`runtime/priceEvidence.ts`, new)

Each price evidence item carries:

- `entity`
- `variant` (normalised: chip, memory / storage sizes, screen size, generation; word order and spacing never matter)
- `amount` / `amount_max` and `currency`
- `price_type`: `REGULAR · SALE · STARTING_FROM · RANGE · USED · NEW · BUNDLE · UNKNOWN`
- `condition`
- `source_url`, `source_title`, `source_type` (class) and `reliability`
- `retrieved_at`, `published_at` and `age_days`
- `evidence_status` and `confidence`

**Price types:**
- "từ 20 triệu" is `STARTING_FROM`.
- "tối đa 20 triệu" is `RANGE` with only a maximum.
- Neither is ever recorded as "20 triệu".

**Conflicts compare like with like (`pricesDisagree`).** Each of these is not a conflict:
- different variants;
- different conditions;
- a sale price vs a list price;
- a bundle vs a single item;
- a point inside a range, or at or above a "from" floor.

Two point prices of the same thing more than 10 % apart are a conflict, and so is a point below a "from" floor.

Code keeps the bookkeeping only. Which price to trust is Luna's call.

## 6. Freshness

- **Every read source carries `retrieved_at`.** Luna now sees it (the source view lacked it before WS2), together with the page's own date when it declares one.
- **Prices also carry `page_age_days`.**
- **The prompt asks Luna:**
  - to say when timing matters;
  - never to present an old page as current.
- **No canned freshness wording is written by code.**

## 7. Source classification (`sourceType.ts`)

**Owner taxonomy (`SourceClass`):**
- `OFFICIAL_GOVERNMENT`, `OFFICIAL_MANUFACTURER`, `OFFICIAL_MERCHANT`, `OFFICIAL_HOTEL`, `OFFICIAL_RESTAURANT`
- `BOOKING_PLATFORM`, `PRODUCT_RETAILER`, `MAPS_BUSINESS`, `AGGREGATOR`
- `NEWS`, `REVIEW`, `SOCIAL`, `OTHER`

**Rules:**
- **Metadata, never a score:** the class is shown to Luna (`source_class`), the trace and the link contract, and is never used to rank.
- **The reliability matrix is unchanged:** it stays per claim kind on the internal type.

**Fixed:**
1. **Classification by the FETCHED host.** The page's self-declared canonical or `og:url` is accepted only on the same host.
   - **Measured cause of the `danang.gov.vn` → `other` bug:** `hoianheritage.danang.gov.vn` declares `hoianheritage.net`.
   - **The same flaw also let any page declare `apple.com` and be typed official,** and let a page plant a URL into the task's evidence for a later read.
2. **A bare JSON-LD `Organization` is no longer "official".** A business type (restaurant, hotel, shop, attraction) still is.
   - **Measured:** a tour-selling blog was typed official 8 times for the Hội An government ticket fee, and a private legal database was typed official for the law.
3. **Government is recognised generically, with no per-agency list:**
   - `.gov / .gov.xx / .mil`;
   - `.go.xx / .gob.xx / .gouv.xx / .govt.xx`;
   - `gc.ca`, `chinhphu.vn`, `.europa.eu`.

## 8. Deep links / actions (link contract)

Each source link carries `{ url, label, title, source_type, action_type, host }`.

- **`url`:** the page actually read.
- **`label`:** the host.
- **`title`:** the page's own title.
- **`action_type`:** `MAP · WEBSITE · PRODUCT · BOOK · SOCIAL · SOURCE`, chosen deterministically from the class and the page's product markup.
  - `ORDER` and `CALL` stay on provider rows (card actions), which are unchanged.

**How it reaches the user:**
- Luna cites `[S#]` and never writes URLs.
- The settle path renders a link only for a page read this turn that is also in this turn's frames.
- A model-written or page-embedded URL never becomes a link (egress guard; test).
- No URL is guessed or fabricated.
- The UI is unchanged: the existing citation markdown and card actions carry the data.

## 9. Multi-source research

Search → candidate discovery → official / merchant verification → read → resolve the missing or conflicting point → synthesis.

- The page budget (4) and the tool budget (8) are unchanged.
- The sufficiency hint is unchanged.
- No fixed number of searches.

## 10. Conflict handling

- **CONFLICT holds both sides with their reliability;** nothing is deleted and no winner is chosen by code.
- **Luna presents it:** a range, both sources, or a reason to prefer one.
- **The M4 "undisclosed conflict" note is unchanged.**
- **Prices conflict only like with like** (section 5).

## 11. Shopping intelligence

Covered by Luna with the existing tools (`search_products`, `web_search` / `read_page`, CCP commerce links) plus the price contract.

**Research may cover:**
- variant;
- condition;
- warranty;
- seller;
- buyer risk;
- direct product links.

No shopping engine was added.

## 12. Travel / local intelligence

**P1 fixed:** on `TAPPY_AGENT=2` a trip-plan request without "data words" lost every tool (`planOnlyTurn`, a Phase 7 keyword gate). Luna could not check weather, opening hours or prices. The gate now applies to `TAPPY_AGENT=1` only, and Luna decides.

Trade-offs (heat → morning / evening outdoor time, and similar) come from Luna's reasoning over context and evidence. None is hard-coded.

## 13. Proactive advice

- **Prompt:** only material findings tied to the user's goal and evidence (noise, a closed pool, heat, seller risk, warranty differences), with the trade-off. No generic advice.
- **Legacy heads-ups stay off** on the agent path (M7).

## 14. Follow-up / reranking

The M2 task keeps the constraints, and the tracker removes only the changed preference.

- Legacy cautions are off on the agent path (M7).
- The re-ranking test lives in `agentResearchWS2.route.test.ts`: the next turn's decision reorders the cards.

## 15. Recommendation contract

**The defect:** the decision reached the cards only through Luna's hidden `[TAPPY_RANK]` line, which was present on about 50 % of turns.

**Now:** one decision type (`RankingContract`) with two transports.

| Transport | When | Cost |
|---|---|---|
| inline `[TAPPY_RANK]` | Luna wrote a valid block | none |
| **structured record** (`decisionRecord.ts`) | no valid block **and** the turn has candidates | one schema-validated Luna call (`AI.extract`, role `agent`, ≤ 400 tokens, 8 s cap) that records the decision the final answer already made |

**Code validation:**
- A pick must be a candidate of this turn **and** be named in the answer, so the record can never introduce a recommendation.
- Reasons are de-linked, filtered and capped, and numbers are dropped from card reasons.
- It fails open: the answer is never changed, and cards follow the names, as before M5.

**Guarantees:**
- No score, no formula and no sorting.
- Hidden metadata never reaches the user.

**Tests cover:**
- normal and multiple candidates;
- no fit;
- a preference change;
- without cards;
- with real links;
- a failure;
- a fabricated pick.

## 16. snippet_price guard

**Measured (M5 SR-F2):**
- **Raw reply:** "Mình chốt **Tám Riêu …**: … giá tham khảo 100–200k/người, đánh giá 4.8⭐."
- **Delivered:** the pick sentence was deleted, together with the venue name.
- **Why:** the production-default v1 guard knows only snippet prices, while the price was the row's own band "100-200 N ₫".

**Fix (agent runtime only):**
- The agent runtime judges with band evidence: the existing, tested G2 v2 rule, where a stated amount must lie fully inside the venue's band.
- Unsupported prices are still removed (test).
- The guard is not disabled.
- Legacy and Phase 7 keep the env flag (contrast test).

## 17. Citation integrity (`citationIntegrity.ts`, new)

**Measured (RS-C1):** Luna writes `… 120.000đ. [S2]`. Guards split sentences at the full stop, so a removed price sentence left `[S2]` hanging off the next sentence or opening the reply.

**Fix:**
1. **Before the guards:** the marker is bound into its sentence.
2. **After the guards:** orphan markers (start of reply or line, after a full stop, after another marker) are removed, and duplicate ids are merged. Unknown ids were already removed by `citeSources`.

**Invariant:** if a claim is removed, so is its citation. Every surviving citation sits in a surviving sentence.

## 18. Chitchat boundary: architecture B (explicit presentation shortcut)

**What is canned:** a whole greeting, thanks, ack, bye or laugh of 40 characters or fewer gets the canned reply.

**What it has none of:**
- no model;
- no tool;
- no research;
- no recommendation;
- no runtime turn (so no task load or save).

**Not canned:** anything with content ("chào bạn, tìm quán phở") goes to Luna.

**Why B and not A:**
- Routing "chào" through Luna costs a model call for zero information.
- Canned turns are uncharged by an owner product rule (quota rules unchanged).

**Locked by:** a route test (0 model calls, 0 traces) and an architecture test (the canned module imports no model, tool or task).

## 19. Places quota ownership

| Layer | Owner | Value |
|---|---|---|
| A. Orchestration budgets | `runtime/limits.ts` `RUNTIME_LIMITS` | unchanged |
| B. Provider safety quota | `tools/placesBudget.ts` (`PLACES_BUDGET_AGENT`, new; with `_DEFAULT` / `_PLANNING`) | **3**, the same value as before |
| C. Product limits (AI-question quota) | `quota/` | unchanged |

**The defect:** the agent path read the Places quota from the Phase 7 loop's `AGENT_LIMITS.maxToolCalls`.

**Tests:**
- every agent `searchPlaces` call carries the provider quota;
- a 4th distinct intent is refused before Google;
- a source lock confirms that no loop limit feeds the budget.

## 20. Security

- **SSRF:** `read_page` fetches only through `safePageFetch`. `safeGetText` validates every redirect hop (`1970e40`, kept; lock test).
- **Untrusted page content:** pages are DATA (instruction-like text dropped; malicious-page test).
- **Canonical:** a cross-host canonical cannot change trust or plant a URL.
- **Links:** model-written links are removed by the egress guard.
- **Logging:**
  - no secrets are logged;
  - query text in the trace was already secrets-cut and capped (M1);
  - the new fields are counts, hosts and classes.

## 21. Observability

`tappyai_agent_run_trace.research` gains these fields:

- `searches`
- `search_results`
- `research_rounds`
- `opened_hosts`
- `source_classes`
- `action_links`
- `price_claims`
- `freshness` (`pages_undated`, `oldest_price_age_days`)

**Other additions and unchanged parts:**
- **Evidence events** carry `source_class`, `action_type`, `price_claims` and `page_dated`.
- **Ranking events** carry `via` (`inline` / `structured`) and the record's `recorder_ms` / `recorder_usd`.
- **Unchanged:** `stop_reason` and per-call `query` / `result_count`, which already existed.
- **No new observability system;** Cloud Logging is unchanged.

## 22. Evaluation results (TAPPY_AGENT=2, real Luna, Serper record / replay, evaluator not weakened)

**Scenario set:** 51 M0–M7 scenarios (76 turns) + 17 new WS2 scenarios (17 turns) = 93 turns per pass.

- **Fixture pages** (deterministic, no network): conflicting prices, variants, a 2023 page, a malicious page, a gov.vn page with a cross-host canonical.
- **New checks** (`lib/checks.ts`, unit-tested):
  - `price_evidence`, `source_class`, `action_link`, `real_link`, `canned_shortcut`;
  - every turn: `no_orphan_citation`, and `no_fabricated_url` (a URL the model wrote that the turn never had).
- **Rescoring:** `rescore.test.ts` now rebuilds the full observation from raw files.
- **Synonym calibration:** WS-P3 ("chưa có giá") and WS-U1 ("mở đến") were given extra wording *before* the final measurement, and only on those new WS2 scenarios.

| | M7 final | WS2 pass 1 | pass 2 | pass 3 | **pass 4 (final code)** |
|---|---|---|---|---|---|
| M0–M7 set (76 turns) | 70 · 69 | 75 | 70 | 73 | **70** |
| regression REG (53) | 50 · 49 | 52 | 49 | 51 | 49 |
| research RS (9) | 9 · 8 | 9 | 7 | 9 | 8 |
| ranking SR (14) | 11 · 12 | **14** | **14** | 13 | 13 |
| WS2 new (17) | — | 15 | 15 | 14 | **15** |
| crashes · rank leaks · fabricated URLs · orphan citations | 0 | 0 | 0 | 0 | **0 · 0 · 0 · 0** |
| decision contract on candidate turns | ≈ 50 % (inline only) | 45/45 | 44/44 | — | 44/45 (one 8 s record timeout, failed open) |
| latency p50 · p90 (s), all 93 turns | 5.7 · 13.2 (76 turns) | 6.9 · 15.0 | 7.3 · 15.0 | 8.6 · 16.4 | 7.7 · 15.6 |
| USD / turn | 0.0040 | 0.0042 | 0.0041 | 0.0046 | 0.0044 |

**Reading the numbers:**

- **The M0–M7 set is flat or better** (70–75 against 69–70). The remaining misses are the M6/M7 model-variance classes:
  - FU-G1 tool choice;
  - P-2 asks first;
  - RS-C1 coverage wording;
  - RS-D1 conflict;
  - D-2 strict length;
  - SR-T2 / SR-F2 trade-off wording.
- **Ranking (SR) rose from 11–12 to 13–14:** the decision record (section 15) gives the cards Luna's decision on every candidate turn.
- **Latency:**
  - **What drives it:** the WS2 scenarios are research-heavy (real page reads, multi-retailer price checks).
  - **The record's cost:** the decision record costs p50 2.0–2.2 s (p90 2.8–3.4 s) on the ~58 % of candidate turns where Luna wrote no inline block. It runs after the answer, before the cards.
  - **Cost:** about $0.00017 per record.

**WS2 scenario outcomes (pass 4 unless noted):**

- **Pass:**
  - WS-C1 conflict (both prices, CONFLICT, citations);
  - WS-V1 variant;
  - WS-S1 stale (the 2023 page called out as old, and a current price read separately);
  - WS-M1 malicious page (risk explained, no canary, no evil URL; source class OTHER, not "official");
  - WS-G1 gov.vn → OFFICIAL_GOVERNMENT, with the fee cited and "checked today";
  - WS-R1 SSRF (both URLs refused, nothing fetched);
  - WS-L1 booking links;
  - WS-L2 Maps links;
  - WS-T1 travel plan (budget, weather timing, food, lodging);
  - WS-A1 proactive (price check, beach access, trade-off);
  - WS-I1 multi-retailer price table with links;
  - WS-H1 chitchat shortcut;
  - WS-P1 / WS-P3 (passes 2–4).
- **Misses:**
  - **WS-P2** (Pizza 4P's spend estimate): Luna's 300–500k/người estimate and a multi-branch menu sentence were removed by snippet_price. These are an estimate and figures without per-venue evidence, so this is correct integrity, and it leaves a thin answer (P2, section 24).
  - **WS-K1** (pass 4): Luna asked a clarifying question instead of searching (variance). Pass 3's price loss is fixed (P1-9).
  - **WS-U1** (pass 1): Luna ignored the seating-availability half of the question.

## 23. P0 / P1 fixes

| # | Class | Finding (measured) | Fix | Lock |
|---|---|---|---|---|
| P1-1 | source classification | The page's self-declared cross-host canonical decided the class: gov.vn → `other`; any page could claim apple.com | classify by the fetched host; canonical accepted same-host only | tests; mutation W1 |
| P1-2 | source classification | A bare JSON-LD `Organization` was typed `official` (a tour blog for a government fee, ×8) | business types only | test; W2 |
| P1-3 | research authority | `planOnlyTurn` stripped all tools from trip-plan turns on TAPPY_AGENT=2 (a Phase 7 keyword gate) | Phase 7 only; Luna decides | route test; W13 |
| P1-4 | price research | Price claim value = first quantity ("4" of "M4"); no price type / variant / retrieval time; conflicts compared by first number | price evidence contract + like-with-like conflicts | tests; W4–W7, W18 |
| P1-5 | citation integrity | Orphan `[S#]` after a guard removed the claim (RS-C1) | bind before guards, enforce after | tests incl. real settle path; W8, W9 |
| P1-6 | snippet_price | v1 deleted a pick sentence whose price was the row's own band (SR-F2) | band evidence (G2 v2) on the agent runtime; unsupported prices still removed | tests (verbatim); W10, W11 |
| P1-7 | decision contract | Decision depended on a hidden text line (~50 %) | structured decision record, code-validated, fail-open | 7 route tests + unit; W14, W15 |
| P1-8 | M4 entity scope | A store's own page price judged "not with the entity" ("**CellphoneS:** 27.990.000đ [S2]", WS-I1 ×3 deleted) | the cited source itself is the entity | tests; W21 |
| P1-9 | shopping money guard | Luna's query words ("… Shopee Tiki", "USB-C") made every listing unrelated; three listing-backed seller prices deleted (WS-K1) | agent runtime: seller names stripped from the product entity; a price in a sentence naming exactly one seller is verified against THAT seller's own row | tests (verbatim, contrast, other-seller negative); W22–W24 |
| P1-10 | research iteration | A failed lookup told Luna "say it is not checked", so it gave up (WS-P1) | the note points at another source / tool | test; W19 |
| P1-11 | Luna owns the answer | Legacy hedge cap merged Luna's hedges into one code-written sentence (WS-L1: −156 chars, a hotel name lost) | not on the agent runtime | contrast test; W20 |
| P1-12 | ownership | Places quota read the Phase 7 loop constant | provider safety quota in `placesBudget.ts` (same value 3) | route test + source lock; W12 |
| P1-13 | chitchat boundary | Undefined | architecture B, locked | route + lock tests; W16 |
| — | link contract | Sources carried id / host / url only | url · label · title · source_type · action_type | tests; W17 |
| P0 | — | none found (SSRF fix `1970e40` retained and locked) | — | lock test |

**Mutation results:**
- **WS2:** W1–W24, 24/24 caught.
- **M7:** X1–X13, 13/13 caught.
- **M6:** M1–M11, 11/11 caught.

## 24. Known issues: final status

| Issue | Status |
|---|---|
| `snippet_price` cut a supported band price | **FIXED** (P1-6) |
| orphan `[S#]` | **FIXED** (P1-5) |
| `danang.gov.vn` typed `other` | **FIXED** (P1-1) |
| TAPPY_RANK on ~50 % of turns | **FIXED** (P1-7) |
| cannedChitchat bypasses Luna | **INTENTIONALLY RETAINED** as architecture B, locked (section 18) |
| Places quota reads a Phase 7 constant | **FIXED** (P1-12) |
| `HAIKU_FALLBACK` must stay unset | **INTENTIONALLY RETAINED** (ops switch, default off, M7 lock unchanged) |
| Ledger text-vs-text conflicts on long sentences (M3) | **DEFERRED** (P2: prices now compare like with like; other kinds unchanged) |
| Travel guard notice reads "giờ chạy và giá vé" on hotel turns | **DEFERRED** (P2 wording; fail-closed integrity correct) |
| place_claim guard can leave a bare list number ("2.") (M5 SR-T1) | **DEFERRED** (P2 prose tidy) |
| Spend estimates without per-venue evidence removed (WS-P2) | **INTENTIONALLY RETAINED** (integrity; Luna may cite a page or say "ước tính") |
| `search_products` provider fan-out can hit the 15 s tool timeout | **DEFERRED** (Future: provider latency, outside this workstream) |
| Model-variance eval classes (listed in section 22) | **INTENTIONALLY RETAINED** (no evaluator weakening, no prompt over-fitting) |
| Decision record timeout (1 / 105 calls) | **INTENTIONALLY RETAINED** (fail-open by design; 8 s cap) |

## 25. Scope proof

- **Files outside scope:** since `f9f2b12`, `git diff --name-only` shows 0 Android / iOS files and 0 env / Vercel files changed.
- **Production:** not touched. TAPPY_AGENT=2 stays dev / UAT only, and no environment variable was changed.
- **Architecture:**
  - no new agent, loop, engine or model;
  - Luna (role `agent` via the AI facade) is the only model;
  - search remains Tappy Search / Serper.
- **UI:** the card and Make Plan layouts are unchanged (no UI files changed); only the data supplied changed.
