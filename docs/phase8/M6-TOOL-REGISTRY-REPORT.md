# Phase 8 M6: deferred tool schemas by capability (TAPPY_AGENT=2, web only)

Branch `p8/agent-runtime` (worktree `wtagent8`), base `77e8563` (M5). Committed locally, not pushed. Audit: `M6-TOOL-REGISTRY-AUDIT.md`.

## 1. Current tool architecture (before M6)

- The route builds the production tools.
- `buildAgentTools` adds the agent-only tools (now showing, showtimes, trip bundle, request_action).
- The runtime swaps in the research `web_search`, adds `read_page` and the control action `ask_user`.
- `toModelSchemas` copies each description and Zod schema.
- **Every non-final round sent all 15 schemas (≈ 12.1k characters).**
- Execution is by name in `runtime/loop.ts`: input guard → budgets / de-duplication → Serper scope → timeout → output guard →
  frames read by name (cards, M4 guards, M5 ranking, trace, task log).

## 2. Tool audit

Full table in the audit: 15 tools, size, frequency, sensitivity. Usage over 90 agent eval turns: `search_places` 34, `web_search` 9,
`search_products` 8, `get_hotel_prices` 5, `get_flight_prices` 4, `get_trip_data` 3, `read_page` 2, `get_weather` 2, the rest ≤ 1.

## 3. Core tools (full schema every round)

- `web_search` and `read_page` (M3 research);
- `search_places` (the most used);
- `ask_user` (control; offered as before);
- `use_tool` (the deferred-tool proxy).

## 4. Deferred tools

`search_products`, `get_hotel_prices`, `get_flight_prices`, `get_transport_options`, `get_trip_data`, `get_weather`, `get_gold_price`,
`get_news`, `get_now_showing`, `get_movie_showtimes`, `request_action`.

## 5. Metadata registry (`runtime/toolRegistry.ts`)

**Metadata only:** name, tier (core / deferred), category, security class (read / side-effect proposal), one-line capability, and
capability hints (folded phrases). Implementations and schemas stay where the tools are defined; there is no second schema anywhere.

- The `use_tool` list is **derived** from each tool's own Zod schema, e.g. `get_flight_prices(origin, destination, departDate?)`.
- **Schema version** = a hash of the description plus a fingerprint of the Zod definition, computed without a vendor SDK
  (architecture rule `no-vendor-sdk-imports`).

## 6. Discovery mechanism (no extra model call)

1. **Per-turn preselection, deterministic:** a deferred tool gets its full schema this turn when a capability hint matches the user's
   message (or their previous one), or when the task used it last turn (follow-ups such as "cái nào rẻ hơn" keep `search_products`).
   - Hints are phrases, not single words: folding merges "mua" (buy) and "mưa" (rain). Measured, and pinned by a test.
2. **`use_tool`:** every other deferred tool is listed with its signature and capability. Luna calls `use_tool({ tool, args })` **in
   the same step** it decides; there is no discovery round.
3. **One tool set per turn:** the list is part of the provider's cached prompt prefix, so it never changes between the rounds of a turn.
   A test pins this.

## 7. Security boundary

`use_tool` never executes as such. The runtime resolves it in the loop (`resolveCall`) **before** the input guard:
- the tool must be deferred, in this turn's catalog, and present in this turn's route tools;
- side-effect tools, control tools, core tools and unknown tools are **refused** with a structured `tool_unavailable` result (nothing runs);
- arguments must pass **the tool's own Zod schema**; otherwise a structured `invalid_arguments` with the signature (nothing runs).

The resolved call then takes the **same** path as a direct call, under its own name:
- input guard (secret shapes cut), budgets, de-duplication (a direct and a proxied identical call are one lookup);
- the route's argument preparation (e.g. `checkIn` from the code-resolved date), Serper per-tool scope, timeout;
- output guard, `9:` / `a:` frames, trace (`via: use_tool`), task research log.

`request_action` keeps its own confirmation gate. `SIDE_EFFECT_TOOLS` remain unexecutable.

## 8. Tool loading / cache

- **Per turn:** the selection is a pure function of the turn's input (no cross-session state). Loaded tools are not re-serialised
  mid-turn.
- **Per process:** the signature cache is keyed `<tool>@<schema version>`, so a changed schema is a new key and a signature is never
  stale. It holds no user data. A test proves that a changed schema produces a new signature.

## 9. Schema size before / after (real route, round 1)

| Turn | Before: schemas · characters | After: schemas · characters |
|---|---|---|
| direct ("15% của 800") | 15 · 12,098 | **5 · 6,018 (−50 %)** |
| simple search (gold price) | 15 · 12,098 | 6 · 6,419 |
| product research (used MacBook) | 15 · 12,098 | 6 · 6,432 |
| event ("tối nay có sự kiện gì") | 15 · 12,098 | 6 · 6,362 (+ `get_news`) |
| social / trending | 15 · 12,098 | 5 · 6,018 |
| place (quiet café) | 15 · 12,098 | 5 · 5,919 |
| weather | 15 · 12,098 | 6 · 6,501 |
| trip plan (plan-only turn) | 1 · 974 | 1 · 974 (unchanged path) |

**Prompt tokens per round, live eval: ≈ 8.7–8.8k → ≈ 7.5–7.6k (−13 %)** on every set.

## 10. Latency before / after

**Fair comparison:** same code, same time window, an interleaved A/B with two repetitions per arm. Arm A = M5 exposure (all
schemas, no `use_tool`); arm B = M6.

| | A (M5 exposure) | B (M6) |
|---|---|---|
| schemas per round | 14.3 | **5.3** |
| prompt tokens per round | 8.7–8.8k | **7.6k** |
| **M5 set (28 turns)** per-round p50 / p90 | 2.58 / 5.67 s | **2.20 / 3.45 s** |
| M5 set first-round p50 | 2.28 s | **1.88 s** |
| M5 set turn p50 / p90 / max | 8.85 / 12.13 / 24.5 s | **7.08 / 11.12 / 16.3 s** |
| M5 set cost / turn | $0.0066 | **$0.0056 (−15 %)** |
| **regression (106 turns)** per-round p50 / p90 | 2.15 / 4.32 s | 2.14 / 4.30 s |
| regression turn p50 / p90 / max | 5.18 / 10.69 / 19.8 s | **4.75** / 13.51 / 22.8 s |
| regression rounds mean · tool calls mean | 1.69 · 0.70 | 1.70 · 0.70 |
| regression cost / turn | $0.0036 | $0.0037 |

Reading:
- Per-round latency improves on the recommendation-heavy set (−15 % p50, −39 % p90) and is unchanged on the regression set. Rounds
  and tool calls are unchanged.
- The regression **tail** is worse because of a behaviour difference, not schema overhead. On FU-T1 turn 4 ("Ngân sách khoảng
  15 triệu") both M5-exposure runs asked a clarifying question (1 round), while both M6 runs updated the trip plan with tools
  (2–4 rounds). `get_trip_data` was exposed via task continuity in the M6 runs.
- The **earlier non-interleaved comparison** (M6 evals run an hour after M5's) showed per-round p50 up 0.25 s. The interleaved A/B
  shows that was provider-load variance, which is why the A/B is the number reported.
- **Cached prompt tokens per turn** went down (≈ 8.4k → ≈ 6.4–6.6k). The prefix is smaller and each tool combination has its own
  cache lineage. Uncached input tokens did not grow: the total input is smaller.

## 11. M3 regression (research set ×2, M6 code)

| | M6 | M5 |
|---|---|---|
| turns passing every check | **8/9, 8/9** | 7/9, 8/9 |
| page read | 6/6 | 6/6 |
| official source | 4/4 | 4/4 |
| sources cited | 5/5 | 5/5 |
| conflict explained | pass | pass |
| seller claim UNKNOWN | pass | pass |

- Misses: RS-D1 coverage wording in one run, and its numeric ledger conflict in the other (M3 extraction variance, as in M5).
- **Hội An:** Luna wrote 80.000đ with a citation in one run, but the cited extract does not contain the figure.
  - M4 judged it `cited_value_not_in_source` and the travel guard applied, as designed.
  - Pre-existing side effect: the paragraph then starts with the orphaned source link (see §16).

## 12. M4 regression

- `guardEvidence.test.ts` (38) green.
- Live: no ranking-line or guard regression attributable to M6.
- The proxied hotel call produces exactly the direct call's stream, guards included (route test).

## 13. M5 regression (M5 set ×2, M6 code)

| | M6 | M5 |
|---|---|---|
| turns passing every check | **12/14, 12/14** | 14/14, 11/14 |
| `no_rank_leak` | 28/28 | 28/28 |
| `ranking_contract` | 4/4 | 4/4 |
| `no_forced_top_n` | 11/11 | 10/10 |
| `hard_budget_cards` | 4/4 | 4/4 |
| `none_honest` | 2/2 | 1/2 |

Misses:
- SR-F2: quality-cue wording, the same as in M5.
- SR-S1: no Activation Lock / MDM checklist, the same as in M5.
- SR-G1 t3: Luna chose not to search again; `get_hotel_prices` **was** exposed via task continuity.

Regression set: **49/53** (M5 final 48/53). The T-3 t2 miss: `get_flight_prices` **was** exposed (hint); Luna answered with the booking
links from context.

`use_tool` used live: `get_trip_data` ×3, `get_news`, `get_flight_prices`; 0 refusals.

## 14. M6 tests

`runtime/toolRegistry.test.ts` (15) and `app/api/chat/agentToolRegistry.route.test.ts` (3, real route). Mapping to spec Step 13:

| # | Requirement | Covered by |
|---|---|---|
| 1 / 2 / 12 | core only on a direct question; no deferred schema | runtime + route |
| 3 | hint preselection (weather, gold, hotel); `use_tool` lists the rest | covered |
| 4 / 8 | proxied call runs as the real tool: real frames / trace / budget, no extra round; proxied hotel stream == direct stream | runtime + route |
| 5 / 6 | side-effect, control, core, unknown and not-offered tools refused, structured, nothing runs | covered |
| 6 | invalid arguments refused against the tool's own schema | covered |
| 6 | input guard still cuts secrets | covered |
| 7 | registry is metadata only; signatures derived | covered |
| 9 / 10 / 11 | M3 / M4 / M5 suites green (full suite) | full suite |
| 13 | tool failure → structured `tool_failed` | covered |
| 14 | selection is pure per turn | covered |
| 15 | signature cache invalidates on a schema change | covered |

Also covered: buy / rain folding collision; one tool list per turn; de-duplication of a direct and a proxied identical call; task
continuity preselection.

## 15. Mutation tests (11, all caught)

| # | Fix removed | Failing tests |
|---|---|---|
| M1 | deferred filtering (every schema every round) | 3 |
| M2 | hint discovery | 3 |
| M3 | task-continuity preselection | 1 |
| M4 | `use_tool` catalog | 2 |
| M5 | permission check | 1 |
| M6 | schema validation | 1 |
| M7 | version-keyed cache | 1 |
| M8 | resolution before the guard | 3 |
| M9 | result reported under its real name (result contract) | 2 |
| M10 | structured refusal | 1 |
| M11 | per-turn stable tool list | 1 |

## 16. Remaining risks

1. **Hints are vocabulary.** A request worded outside the hints falls back to `use_tool`, which works in the same step but means Luna
   picks from a one-line description instead of a full schema. Measured live: 0 refused or invalid `use_tool` calls.
2. **Cache lineages per tool combination.** Rare combinations start cold. Measured cached tokens per turn ≈ 6.4k (vs 8.4k with the
   larger prefix).
3. **Latency gain is set-dependent:** clear on recommendation turns, neutral on the regression mix. Generation length and Luna's choice
   of rounds dominate the tail.
4. **Pre-existing, not M6:**
   - an orphaned `[S#]` link when a guard removes the cited sentence (RS-C1);
   - `hoianheritage.danang.gov.vn` typed `other` instead of `government`;
   - the `snippet_price` over-cut (M5 follow-up card).

## 17. Cost impact

- Input tokens per round −13 %.
- Cost per turn −15 % on the M5 set and ±0 on the regression mix (A/B).
- No extra model calls.

## 18. Exact files changed

| File | Change |
|---|---|
| `src/lib/ai/agent/runtime/toolRegistry.ts` (new) | metadata registry, per-turn selection, derived signatures + version cache, `use_tool` schema, resolution |
| `src/lib/ai/agent/runtime/loop.ts` | `resolveCall` before the input guard; the resolved name drives guard / budget / execute / trace / frames; the model's tool message keeps its own call |
| `src/lib/ai/agent/runtime/index.ts` | selection, exposed schemas + `use_tool`, `resolveCall`, trace event `tools` |
| `src/lib/ai/agent/runtime/trace.ts` | trace kind `tools` |
| `src/lib/ai/agent/runtime/toolRegistry.test.ts` (new) | 15 tests |
| `src/app/api/chat/agentToolRegistry.route.test.ts` (new) | 3 route tests |
| `scripts/repoHygiene.test.ts` | recording ceiling 3179 → 3465 (M6 eval recordings, deliberate) |
| `docs/phase8/M6-TOOL-REGISTRY-AUDIT.md`, `M6-TOOL-REGISTRY-REPORT.md` | audit and report |

No architecture-locking test changed. No product contract changed: tool names, results, frames and cards are identical for a proxied call.

## Gates

- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors (the hook-name false positive on `useToolSchema` was fixed by renaming it `proxyToolSchema`).
- `node scripts/architecture/check.mjs`: **15/15** (a first draft imported `@ai-sdk/ui-utils` to hash schemas; replaced by a Zod fingerprint).
- `npm test`: **18,010 passed, 0 failed.**

## Confirmation

- **Android: NOT TOUCHED.**
- **iOS: NOT TOUCHED.**
- **Production: NOT MODIFIED.** No environment variables changed anywhere; TAPPY_AGENT=2 stays dev / eval only.
- **M7: NOT STARTED.**
- No push. Committed locally only.
