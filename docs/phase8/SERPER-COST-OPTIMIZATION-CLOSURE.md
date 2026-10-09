# Phase 8 — Serper cost control, caching & request efficiency — closure (2026-10-09)

**Mode:** implementation inside the existing architecture. **No live Serper request was sent in this task** (every test runs on a stubbed `fetch`); no production, Android or iOS change; nothing pushed, merged or deployed.

## 1. Baseline and files

- Worktree `D:/TappyAI-wt/wtagent8`, branch `p8/agent-runtime`, baseline **HEAD `6b7d958`**.
- The read-only audit (`docs/phase8/SERPER-COST-AUDIT-READONLY-2026-10-09.md`, in the `g1-growth` worktree) was checked against this worktree's code.
- No other process was editing source (checked: no dev server, no test run).
- **Left untouched and NOT part of this commit** (the unfinished UAT-10 / `specGuard` work): `agent/runtime/controlTools.ts`, `agent/runtime/prompt.ts`, `agent/runtime/postUatPlanResearch.test.ts`, `consultative/specGuard.ts`.

| File | Change |
|---|---|
| `tools/serperMeter.ts` | One cost model (`SERPER_COST`, with provenance) and a request ledger (attempted / ok / http_error / timeout / aborted / refused / provider-reported / reconciled), L1 hit and L2-bypass counters |
| `tools/serperClient.ts` | Outcomes recorded per request; provider-reported credits read from the response body; account failure halts the turn; reservation released only for requests that were never sent |
| `tools/serperToolBudget.ts` | `haltSerperScope`, `serperHaltedReason`, `releaseToolBudget`; a halted scope admits nothing |
| `tools/common.ts` | `serperFlight` (in-flight dedup) on search, shopping and images; L1 hits counted |
| `tools/serperPlaces.ts` | In-flight dedup on `/maps` (price-retry mode is part of the key); L1 hits counted |
| `tools/serperCache.ts` | L2 read with no store configured is counted as a bypass (cold cache is reported, never hidden) |
| `tools/shopping.ts` | Fan-out reduction (see §3) |
| `agent/runtime/toolState.ts` | Product provider runs in its own cancellation scope; a timeout cancels what it has not sent |
| `agent/runtime/index.ts` | `serper_ledger` budget event in the run trace |
| `tools/serperCostControl.test.ts` (new, 21 tests) | Mock-only proofs |
| *(post-commit, `e001afe`)* `tools/serperAbortDedup.test.ts` (13 tests) + fixes in `common.ts`, `serperClient.ts`, `serperMeter.ts`, `serperPlaces.ts`, `toolState.ts` | See §12 |

## 2. Credit model — before / after

| Endpoint | Before (code) | After | Basis | Status |
|---|---|---|---|---|
| `/search` | 1 | 1 | observed in the owner's Activity Log | observed, not an official price list |
| `/shopping` | **1** | **2** | observed in the Activity Log (Num=40 → 2 credits) | observed; whether it depends on `num` is **unknown** |
| `/maps` | 3 | 3 | observed (3 for 20 rows) | observed |
| `/images` | 1 | 1 | **none** — conservative working value | **UNVERIFIED**: never treated as free; reported separately as `estimated_unknown_basis` |

- **Single source.** The same table feeds the tool/turn budget (reserved BEFORE sending), the daily ceiling, the trace and the meter. The previous code under-counted every product search by 1 credit in all of them.
- **Not official.** None of this is Serper's published price list. Serper also states the credits it charged in each response body (`credits`); the ledger records that figure next to the estimate (`provider_reported`).
- **`reconciled` is always 0.** Only the owner can match credits against the Activity Log. `serperCredits` in a trace is an estimate and is no longer presented as money spent.
- **Ledger fields:**
  - *attempted:* a request was sent.
  - *outcomes:* ok / http_error / timeout / aborted.
  - *refused:* stopped before sending.
- **Rules (each has a test):**
  - every retry is a new attempted request;
  - a client timeout does NOT give the reservation back;
  - only a request that was never sent (refused by the daily ceiling, cancelled before sending) releases its reservation;
  - an unknown-cost request cannot bypass the budget (images use the conservative value and stay inside the per-tool and per-turn caps).
- **Ceilings unchanged** (turn 12 / 15 travel, tool 8, 85 s, daily 15,000). Shopping now costs 2 against those caps; the fan-out reduction below keeps a product search within the 8-credit tool cap (2 + 1 + ≤ 3 images = 6).

## 3. Request flow — `search_products`

| Case | Before | After | Why the removed requests were unnecessary |
|---|---|---|---|
| Usable `/shopping` answer + merchant rows | 1 shopping + 1 `site:` search + **1 `/images` per unclaimed merchant row (≤ 6)** → up to 8 requests / 9 credits | 1 + 1 + **≤ 3 `/images`** (cap = the cards the UI shows, `CARDS_SHOWN` = 3, and Luna recommends ≤ 3) → ≤ 5 requests / 6 credits | The ranking dropped most of the rows that had been photographed |
| …and a merchant row is the same product as a Shopping row of another seller | one `/images` call per row | **0** — the Shopping row's photo is reused (identity checked both ways, so the photo is certainly the right object) | An image already in hand was searched again |
| Out of credits / bad key on the first `/shopping` (HTTP 400 "Not enough credits", 401, 402, 403) | 1 shopping + shopping retry + 3 organic searches + the web fallback (≈ 5+ requests) | **1 request**: the turn's scope is halted; nothing else is sent; the result is `product_data: none, provider_status: error, halted: …` (not cached) | Every further request would only be refused the same way |
| Nothing found (all empty) | shopping + 3 organic searches (incl. "địa chỉ facebook" shop-info) | shopping + 2 organic; the shop-info enrichment is asked only when something was found | Enrichment of a product that does not exist |
| The product provider times out | its not-yet-sent requests kept running while the fallback search started on top | the provider call runs in its own cancellation scope: on timeout the unsent requests are cancelled and the in-flight one aborted | Spend after the tool had already been abandoned |
| Same request twice at once (2 users, or `Promise.all` in one turn) | 2 paid requests | **1** (in-flight dedup on search, shopping, maps, images) | — |

- **Kept deliberately:**
  - the `site:` merchant search after Shopping (Shopping rows link to a Google intermediary, so it is the only source of real buy links);
  - the organic fallback when `/shopping` is empty or failed (it is the data fallback);
  - the web fallback on timeout, partial data or error (B4).
- **Images:**
  - the shared (L2) cache is NOT extended to images (owner decision, unchanged); only L1 and in-flight dedup apply.
  - Organic-fallback rows still get one `/images` call each (≤ 8): a previous measurement found that a top-N cap left the rows Luna picked without a photo. This path only runs when `/shopping` returned nothing, and the per-tool budget refuses any call beyond what is left.

## 4. Cache coverage

| Path | L1 (process) | L2 (shared KV) | In-flight dedup | Hit / miss visibility |
|---|---|---|---|---|
| `serperSearch` | yes, 5 min | yes, needs a store | **new** | L1 hits **new**; L2 hits (existing); no-store reads counted as `l2_bypass` (**new**) |
| `serperShopping` | tool result 15 min | yes, needs a store | **new** (key includes `n<num>`) | same |
| `serperPlaces` (maps) | 30 min | yes, needs a store | **new** (key includes the price-retry mode) | same |
| `/images` | 15 min | **no (decision kept)** | **new** | L1 hits **new** |

- **Unchanged:**
  - TTLs;
  - the `SERPER_CACHE_V2` flag;
  - the rule that errors, timeouts and empty answers are never cached;
  - the exact-request keys (the shopping `n<num>` variant is kept: a 12-row answer never serves a 20-row request).
- **Not implemented (not asked to guess):**
  - serving a larger cached result to a smaller request;
  - a "fresh" bypass when the user asks to re-check;
  - entity-level reuse of a product listing across turns (it touches runtime task state);
  - semantic caching.
- **UAT cache status.** The UAT launcher removes every `KV_*` / `UPSTASH_*` variable on purpose, so L2 is inert there and every dev-server restart empties L1. A cold cache in UAT is a cache that was not available, not a measured low hit rate. The trace now says `cache_l2: not_configured`. No production cache or KV was used.

## 5. Timeout, cancellation, fallback

- A tool timeout aborts its scope: requests not yet sent are never sent; the one in flight is aborted. An abort is **not** a refund: a request that was sent keeps its reservation, because the provider may have processed it. *(Corrected after the post-commit review, see §12-A: at `c1bcfb8` the runtime's own cancellation did not reach these requests; fixed in `e001afe`.)*
- Account-level failures (400 with "credit", 401, 402, 403) halt the whole turn scope, so the parallel requests that have not started are never sent. A plain 400 (bad parameters) does not halt. Outside a turn / tool scope (the legacy path) nothing is halted, so legacy behaviour is unchanged.
- A failed leader is never shared or cached: the next call asks again.
- ~~A follower of a cancelled leader sees "no result" (as on a miss) and never spends extra.~~ *(Corrected, see §12-B: at `c1bcfb8` this took the shared result away from callers that were not cancelled; since `e001afe` cancellation is per caller.)*
- Not unit-tested: the narrow case of a request cancelled between the admit and the send (the before-admit case is tested).

## 6. Quality — evidence

- **Cards, Map, Make Plan and their contracts:**
  - no code that builds them changed, and the request-flow changes sit behind the tool results;
  - their existing tests pass inside the full suite.
- **Luna, Agent Runtime, guards, No-Fabrication Gate, citations:** not changed.
- **Ranking and answers:**
  - the product results keep the same rows and the same fields; only the photo lookup count changed;
  - one deliberate data change: when a product search finds nothing at all, `shop_info_results` is now empty (the "địa chỉ facebook" enrichment query is not sent for a product that was not found);
  - a photo is used only when the product identity matches both ways.
- **Regression:** the post-UAT, WS2, M7 and M6 mutation suites (§7) exercise the guards, the product states / fallback, citations and the runtime loop, and all were caught again.
- **Not run:** a live UAT of UAT-07 / 09 / 10 / 11 / 13 / 15 / 23 / 25 (that needs Serper, which this task forbids).

## 7. Gates (final source, fingerprint `2cb55bc228d4`, untracked tests `0095389190b7` at gate time)

- **`npx vitest run`:** 18,356 passed, **4 failed** (1,101 files). **The suite was not green.**
  - **Three route tests** (`agent.route`, `agentRuntime.route`, `agentTask.route`) time out at the 5 s default on one test each. *Correction (post-commit review): when first written this section said the failure reproduced on baseline, but only `agentRuntime.route` had been re-run there. All three have since been run on baseline `6b7d958` in a separate detached worktree, twice each (default timeout): each fails 2 / 2 with the same test and ~5.0 s, so they are not caused by `c1bcfb8`.*
  - **Why they are slow.** They call `html.duckduckgo.com` (the free `web_search` fallback), not `google.serper.dev`: with `fetch` blocked and logged in the baseline worktree, the files contacted only DuckDuckGo (1–2 requests each) and then passed in 3.4–4.0 s in total (11/11, 25/25, 9/9). With `--testTimeout=60000` all 48 tests of the three files pass on the current source too. No Serper key exists in the test environment.
  - **`controlBytes`** timed out in the full run only (load). It passes alone on baseline `6b7d958` and on the current source, so it does **not** reproduce on baseline; it is a load timeout and nothing more can be claimed.
  - No test was excluded.
- **After the full run:** one test file gained two dedup tests (21 tests in `serperCostControl.test.ts`) and one assertion; `tsc` and ESLint were re-run on it, and the file passes. The source files are unchanged.
- **Where each result comes from.** *Mock tests:* every Serper behaviour in this document (cost model, ledger, budgets, halting, dedup, cache counters, fan-out) is proven on a stubbed `fetch`. *Baseline runs:* the route-test timeouts above. *Not verified with real requests:* the actual credit cost of any endpoint or `num`, the `credits` field matching the Activity Log, the shared (L2) cache, and any hit rate. Nothing here claims real cost or L2 behaviour.
- **`tsc --noEmit`:** clean. **ESLint on changed files:** 0 errors, 0 warnings.
- **Architecture locks:** part of the full suite (one runtime, one fallback call, no retry loop) — passed.
- **Mutations (run alone, never alongside a test or build):**
  - **new `serper_mutate.py`:** 20 in the batch (19 caught, 1 equivalent mutation replaced); S17 replaced, S21 / S22 added, and all three caught individually → **22 / 22**;
  - post-UAT 51/51;
  - WS2 final 20/20;
  - WS2 24/24;
  - M7 13/13;
  - M6 11/11.
- Source fingerprints taken before and after the mutation runs are identical: every file was restored. `docs/audit/*.json` (rewritten by `npm test`) were restored with `git restore`.

## 8. Simulated savings (stubbed fixtures and code reading — NOT money)

| Scenario | Requests before → after | Estimated credits before → after |
|---|---|---|
| Usable shopping, 6 merchant rows with no photo | 8 → 5 | 9 → 6 |
| Usable shopping, merchant row = same product as another seller's Shopping row | 3 → 2 | 4 → 3 |
| Out of credits on `/shopping` | ≈ 5 → **1** (measured in a test) | ≈ 7 → 2 (upper bound; a refused request may not be billed) |
| Nothing found | 4 → 3 | 5 → 4 |
| 3 identical concurrent searches | 3 → 1 (measured in a test) | 3 → 1 |

"Before" figures come from reading the pre-change code; "after" figures are measured by the new tests. Real savings need the owner's Activity Log.

## 9. Live smoke test — PLAN ONLY (not run; needs the owner's explicit approval and credit budget)

**Hard cap 40 estimated credits; stop at the cap.** After each step, read the trace `serper_ledger` event and ask the owner to compare `provider_reported` with the Activity Log.

| # | Request (one each) | Conservative cost | What it must prove |
|---|---|---|---|
| 1 | One direct `/shopping` request for the UAT-11 product at `num` = 10, 20, 40 (3 requests, outside the app) | ≤ 6 | Whether credits depend on `num` (the audit's open question) and that the model says 2 |
| 2 | UAT-11 once through the UI (`search_products`) | ≤ 6 (2 + 1 + ≤ 3 images) | Ledger attempts per endpoint; images ≤ 3; no organic fan-out; `provider_reported` vs Activity Log |
| 3 | The same question again in the same server session | 0 | L1 hit counted, no provider request |
| 4 | UAT-10 once (not 5×) | ≤ 12 (turn ceiling) | Research loop stays inside the turn ceiling; the UAT-10 prompt work can be judged separately |
| 5 | One `get_trip_data` probe (Make Plan on the final code) | ≤ 9 (3 parts × 3) | Partial results and the cards contract |
| 6 | (optional, needs an owner-provided TEST KV namespace) one `/search`, restart, the same `/search` | ≤ 1 | L2 shared hit across instances |

Total ≈ 33 (+1 optional); the cap leaves ~7 credits of slack.

## 10. Limitations / not verified

- **Real credit cost per endpoint and per `num`**, and whether `/images` costs 1: unverified (open items 1–2 of the plan).
- **Activity Log:** not available to this session; no figure here is reconciled.
- **Production:** KV configuration and the `SERPER_CACHE_V2` value were not read.
- **Hit rate:** not measurable in UAT (no L2, L1 reset on restart).
- **Cache compatibility, fresh bypass, entity reuse:** not implemented (§4).
- **UAT-10:** its uncommitted prompt / `specGuard` work is untouched and separate; its quality is still open.
- **`/images`:** organic-fallback rows still use up to 8 lookups (§3).
- The three route tests above stay slow at the 5 s default on this machine today; it is independent of this change.

## 11. Confirmations

No live Serper request was sent (the only provider the tests touch is a stubbed `fetch`); no production, Android or iOS change; no push, merge or deploy; no source file outside this task was edited or staged.

## 12. Post-commit review and fixes (added after `c1bcfb8`)

A review of `c1bcfb8` found three defects inside it. They were reproduced with a temporary probe (stubbed `fetch`) and fixed in the separate code commit **`e001afe`**. The original sections above are kept; the statements they corrected are marked.

| # | Defect in `c1bcfb8` | Fix in `e001afe` |
|---|---|---|
| A | The product-provider scope's own signal shadowed the runtime's, so a runtime cancellation (earlier than the wrapper's 8 s limit) no longer reached the requests inside `search_products`: a later request was still sent | The runtime signal is linked into the scope. After a runtime cancellation no request is started and no fallback search is launched (`fallbackState: skipped_cancelled`). A request already sent keeps its reservation; only an unsent one is released |
| B | A follower of a cancelled leader received `null` although it was not cancelled | Per-caller cancellation: a cancelled caller leaves at once with its own cancelled value, the others get the real shared result, the shared request is aborted only when no caller is left, and a late caller starts a fresh request |
| C | A network error (`fetch failed`) was labelled `timeout` | Ledger outcomes `timeout` / `aborted` / `network_error` / `http_error` / `account_error`; the credit estimate does not depend on the label (every attempted request is estimated at the model price) |

- **Tests:** 13 new tests in `serperAbortDedup.test.ts` (stubbed `fetch` that honours `signal`). Run against `c1bcfb8` (C part removed) 5 of the A/B tests fail; on `e001afe` all pass.
- **Mutations:** 11 of 12 caught. The survivor (B6, "a settled shared request stays in the map") is an equivalent mutation: the guard that refuses to join a request everyone left already prevents the observable effect.
- **Gates:** `tsc` clean; ESLint 0 problems on the changed files; full suite 18,371 passed with the same four timeouts as above (no new failure).
- **Still open — not fixed in `e001afe`:**
  - **D** an identical `/shopping` request is re-sent when the first one times out or is aborted (up to 2 + 2 credits; pre-existing);
  - **E** the shop-info enrichment is now sequential, which can add up to ~6 s of latency when a product is found in the organic fallback (a credit/latency trade-off for the owner);
  - **F** cached rows carry no `retrieved_at`, so a cached price can be shown as current for up to 15 min (L1), 6 h (L2 v2) or 24 h (L2 v1). **This is a freshness blocker for any feature that presents price data as current information and must be resolved before such a release.** A proposal that touches the tool-result contract is kept separate (not part of `e001afe`).
- **Not tested:** a request cancelled between the budget reservation and the send (the before-reservation case is tested). Still no live Serper request has been made: cost, `/images` price and L2 remain unverified.
