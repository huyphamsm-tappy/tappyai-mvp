# Phase 8 M7: Agent Runtime finalization audit (TAPPY_AGENT=2, web)

Branch `p8/agent-runtime` (worktree `wtagent8`), base `83bd21a` (M6). Web only. Method: read the code paths, then lock them with tests
(`runtime/m7ArchitectureLock.test.ts`, `app/api/chat/agentRuntimeM7.route.test.ts`) and mutation checks.

## A. Entry points

| Entry | Where | What decides |
|---|---|---|
| `POST /api/chat` | `src/app/api/chat/route.ts` | `agentOn = tappyAgentEnabled() && !hasImage && !clipRef`; `agentV2 = agentOn && agentRuntimeV2Enabled()` |
| Phase 8 runtime | `agent/runtime/index.ts` `startAgentRuntimeTurn` | only when `agentRunTrace` exists (`agentV2`) |
| Phase 7 bounded agent | `agent/index.ts` `startAgentTurn` | `TAPPY_AGENT=1` only (else branch) |
| Legacy Consultative | `AI.stream(streamOpts)` | `TAPPY_AGENT` unset: **production** |

- **Flag:** `TAPPY_AGENT === '2'` exactly (`agentRuntimeV2Enabled`); `'1'`, `'true'` or unset never reach the runtime (lock test).
- **Production:** the Vercel production env **names**, read on 08/10 (no values read, nothing changed), are 61 variables with **no
  `TAPPY_AGENT`, no `HAIKU_FALLBACK`, no `LLM_*`**. Production runs the legacy path.
- **Image turns and Explore clip turns** are not agent turns (`!hasImage && !clipRef`). Compatibility, unchanged.

## B. Runtime path (TAPPY_AGENT=2)

1. **Session and task:**
   - the chat-session state (Upstash KV, keyed by sha256 of owner + `chatSessionId`) is loaded;
   - the task is loaded or created (`loadTask`: validates, rejects foreign / corrupt state, archives stale tasks after 7 days);
   - no `chatSessionId` → the task lives for the turn only.
2. **Context:**
   - `agentContext`: trusted system instructions plus a fenced DATA block (app state, task lines) placed before the latest user message;
   - `AGENT_SYSTEM_V2` = Phase 7 voice + task + research + ranking sections.
3. **Tools:**
   - route tools (production implementations, with their hard gates);
   - agent tools (now showing, showtimes, trip bundle, request_action);
   - the research `web_search` and `read_page` (M3);
   - **M6 selection, once per turn:** core + preselected deferred schemas + `use_tool`.
4. **Loop:** `runtime/loop.ts` `runAgentRuntime`:
   - per round, Luna answers, asks (`ask_user`), or calls tools;
   - `resolveCall` (M6 proxy → real tool) → input guard → budgets / de-duplication → Serper scope → timeout / cancellation → output guard
     → frames → next round;
   - ceilings: 6 rounds, 8 tool calls, 85 s, final reserve, 4 page reads.
5. **Task tracker:** one structured Luna call, run in parallel with the loop and applied after the reply (M2), owned by the runtime.
6. **Evidence:** the M3 ledger; `onGuardEvidence` hands it to the settle path (M4).
7. **Stream settle path** (`streamEnrichment.ts`, buffered on agent turns):
   - ranking line extracted and applied to the cards (M5);
   - hard guards: egress / marketplace / leak;
   - M4 evidence shield → factual guards → restore;
   - citations → links;
   - card / plan presentation.
8. **Persistence and trace:**
   - the task is saved after the last byte (`mergeForSave`, conflict-aware);
   - one `tappyai_agent_run_trace` line plus one allow-listed Cloud Logging event (`tappyai_agent_run`) per turn.

## C. Legacy paths

| Path | Active? | Reachable on TAPPY_AGENT=2? | Required? | Decision |
|---|---|---|---|---|
| Legacy Consultative `AI.stream` (+ intent / consult-brain model calls, pre-search, flight pre-search, evening plan, plan completion) | yes (production) | **no**: each is gated `!agentOn` (locked by tests; removing the pre-search gate makes the behavioural test search before Luna) | yes, it is production | keep; isolated |
| Phase 7 bounded agent `runBoundedAgent` | `TAPPY_AGENT=1` | **no** (else branch; never imported by the runtime) | rollback | keep; compatibility only |
| Consultative ranker `rankCandidates` / `derivePick` / shortlist / `_tappy_ranking` | legacy, agent1 | **no** (agent branch returns before scoring, M5; locked) | yes for legacy | keep; isolated |
| `relaxEmptyPlaces` (drops a hard budget, widens the area) | legacy, agent1 | **no** (M5; locked) | legacy owner decision | keep; isolated |
| `cannedChitchat` (greeting / thanks / ack / bye under 40 characters) | all paths | **yes**: a code-written short reply with no model call | Phase 7 product behaviour (cost) | compatibility; **Future**: let Luna answer |
| `v1PickBackstop` | legacy | no (`!agentMode`) | — | isolated |
| `g1bFallback` (evidence-only pick sentence when the body is under 40 letters) | all paths | yes, as a backstop | integrity | **fixed in M7 (P1):** on agent turns it no longer writes a second "Mình chọn …" under a reply that already states Luna's pick |
| Post-turn **memory extraction** (`extractMemoryFromConversation`, role `fast` → Luna) | signed-in users | yes, after the reply | user-memory product feature | not orchestration (does not affect the turn); compatibility |
| Card media enrichment (photos, TikTok lookups via Serper / Places media) | card turns | yes, after the reply | presentation | not research or reasoning; presentation layer |
| `_LENH_BAT_BUOC` on hotel results (budget filter + "do not name luxury brands outside the filtered rows") | hotel tool | yes | hard budget | code-owned hard constraint; recorded |
| Places quota budget (3 distinct intents per agent turn) | agent turns | yes | Google quota protection | code-owned budget; **Future**: read it from `RUNTIME_LIMITS` instead of the Phase 7 constant |

## D. Ownership boundary

**Code owns**
- **Validation, normalisation, schema integrity:** tool Zod schemas, `resolveUseTool`, `guardToolInput` / `guardToolOutput`, task delta validation.
- **Hard constraints:** `candidateSet` (`hardFilter`, a band entirely above a hard budget), `placeConstraintFilter` (explicit exclusions,
  named district, closed rows last), shopping validity, the hard-constraint gate.
- **Date / time math:** `codeResolvedDate`. **Price arithmetic:** `planBudgetMath`, `tripBudgetEstimate` (labelled).
- **Security:** SSRF-safe fetchers, egress / link / marketplace guards, leak check, injection stripping.
- **Permissions:** `SIDE_EFFECT_TOOLS`, `request_action` confirmation.
- **Rate limits / quota, budgets, timeouts, cancellation.**
- **Evidence integrity:** the M4 guards.

**Luna owns**
- Interpreting the request, clarifying (`ask_user`), planning, choosing tools and research strategy (search / read / when to stop).
- Reasoning over evidence (FACT / INFERENCE / UNKNOWN / CONFLICT), semantic ranking and recommendation (`[TAPPY_RANK]`), trade-offs,
  practical and proactive advice, and the final answer.

**Violations found and status**
- `g1bFallback` writing a second pick sentence under Luna's own reply. **Fixed (P1).**
- Everything else is classified in the table above: none is semantic choice by code on the agent path.

## E. Runtime duplication

| Search | Finding |
|---|---|
| duplicate / nested agent loops | one runtime loop (`runAgentRuntime`, called once, only from `runtime/index.ts`); the Phase 7 loop is unreachable on TAPPY_AGENT=2 (locked) |
| model calls outside the runtime on an agent turn | task tracker (runtime-owned, parallel); post-turn memory extraction (product memory). No intent, consult, plan-completion or evening call (gated, locked) |
| search calls outside the runtime | none before or around Luna's decision (no pre-search, locked behaviourally); card media lookups after the answer (presentation) |
| recommendation logic outside Luna | none on the agent path (M5; route lock) |
| duplicate tool registries | one canonical implementation per tool; `toolRegistry.ts` is metadata only (M6) |
| duplicate task-state writers | one writer: the route persists the runtime's `TaskBox` after the last byte; the tracker writes into the same box |
| duplicate tracing | `tappyai_agent_trace` (the Phase 7 one-line format, kept for its dashboards) is emitted beside the full `tappyai_agent_run_trace`. Intentional compatibility |

## F. Findings classified

| Class | Finding | Action |
|---|---|---|
| **P0** | The accepted SSRF fix `2b1b4d5` (validate every `safeGetText` redirect hop, including IP literals) is on branch `fix/safefetch-redirect-ip-literal`, **not** in `p8/agent-runtime`. `safeGetText` is reachable from agent tools (`tools/common.ts` website media, `eventSchedule.ts`, CCP adapters). | **cherry-picked into the runtime branch** (same base `f9f2b12`, 7 lines + its test) |
| **P1** | Code-written duplicate pick sentence on agent turns (`g1bFallback`). | fixed + route test + mutation |
| **P1** | **M6 proxy: the AI SDK rejected `use_tool` calls before the runtime saw them.** Luna sometimes routes a tool that is already exposed (preselected or core, e.g. `get_hotel_prices`, `search_places`, `web_search`) through `use_tool`. The schema's tool-name **enum** listed only the not-exposed tools, so the SDK failed the whole model step and the runtime forced the final answer ("tra cứu bị lỗi"). Measured: 6 of 134 proxy-enabled turns in the M6 A/B (0 in the arms without the proxy), 3 of 99 in the first M7 eval. Missed in the M6 review, which counted only runtime refusals. | fixed: the name is a plain string and `args` optional (the runtime decides); an exposed tool proxied through `use_tool` resolves to itself (same guards). Side-effect, control, unknown and not-offered tools are still refused with a structured result. 2 tests + 2 mutations (X9, X10); M6 mutations still 11/11 |
| **P1** | **The legacy situation frame still wrote cautions on agent turns.** On TAPPY_AGENT=2 the Consultative V1 settle stage appended "Mình chưa thấy bằng chứng về <gap> …" and the budget line, computed from its OWN parse of every user turn (it does not know the task state). Measured SR-G1 t3: the user replaced "yên tĩnh" with "gần biển", and code still appended the "yên tĩnh" caution. That is a second interpreter of the user's needs beside Luna. | fixed for the agent runtime only (`semanticRanking` flag; Phase 7 and legacy unchanged): Luna owns what to caution about, and facts stay with the guards. Test + mutation (X11) |
| **P1** | **The atmosphere guard deleted the agent's own honest hedge.** "Mình chưa xác minh được quán nào thật sự yên tĩnh…" and "mình ưu tiên gần biển và bỏ tiêu chí yên tĩnh" were read as unsupported venue claims and cut (SR-F1, SR-G1 t2 / t3). Once the legacy caution above was removed, the user lost the "unverified" warning entirely, which breaks the honesty contract ("say what is unknown"). | fixed for the agent runtime only (`agentHedges`): unverified / re-prioritisation sentences are not claims. A real unsupported atmosphere claim is judged exactly as before (test). Legacy and Phase 7 unchanged (stream-level contrast test). Mutations X12 / X13 |
| P2 | `snippet_price` cuts a pick sentence carrying the row's own band (M5 follow-up card). | untouched |
| P2 | An orphaned `[S#]` link remains when a guard removes the cited sentence (RS-C1). | untouched |
| P2 | `*.danang.gov.vn` typed `other`, not `government`. | untouched |
| P2 | The ledger builds text-vs-text conflicts between long sentence values (M3). | untouched |
| P2 | Ranking line written on ~50 % of recommendation turns (no badge / reason without it; honest). | untouched |
| Future | `cannedChitchat` bypasses Luna for greetings. | recorded |
| Future | Places quota budget reads the Phase 7 constant. | recorded |
| Future | `HAIKU_FALLBACK` is an ops switch that would let a vendor fallback answer on Luna failure. It is unset in production and must stay unset in UAT for "Luna only" (lock test pins the default). | recorded |

## G. Scope proof

- Since `f9f2b12` (the Phase 8 base), `git diff --name-only` shows **0 Android / iOS files** and **no env / Vercel files** changed.
- Production environment untouched; names only were read.

## H. Final eval gate (TAPPY_AGENT=2, full scenario set ×2, final code)

Runs: `scripts/agent-eval/out/eval-2026-10-08T12-29-20-565Z` and `eval-2026-10-08T12-38-16-172Z`. The evaluator was not changed.

| | M6 (83bd21a) | M7 pass 1 | M7 pass 2 |
|---|---|---|---|
| all turns | 69/76 | **70/76** | **69/76** |
| regression (D/C/L/Q/P/T/E/F/I/FU) | 49/53 | 50/53 | 49/53 |
| research (RS) | 8/9 | 9/9 | 8/9 |
| semantic ranking (SR) | 12/14 | 11/14 | 12/14 |
| crashes · fallbacks · rank leaks | 0 · 0 · 0 | 0 · 0 · 0 | 0 · 0 · 0 |
| SDK `use_tool` rejections | 6 / 134 proxy turns (A/B) | **0** | **0** |
| legacy cautions on agent turns · duplicate pick sentences | present (SR-G1) | **0 · 0** | **0 · 0** |
| one trace per turn | 76/76 | 76/76 | 76/76 |
| latency p50 · p90 (s) | — | 5.72 · 13.22 | 5.69 · 13.94 |
| USD / turn | — | 0.00408 | 0.00391 |

The honest hedge now survives on the live path. SR-F1 keeps "Mình chưa xác minh được quán nào thật sự yên tĩnh…", which M7's earlier
runs deleted.

**Remaining misses: all model-variance classes already present at M6. None is caused by M7 (each differs between the two passes).**
- **Tool choice in FU-G1:** `web_search` / `search_places`.
- **Task continuity:** FU-T1 t4 lost "15tr"; FU-G1 t3 lost "30 min".
- **Trade-off cue wording:** SR-T2, SR-F2.
- **Proactive checklist:** SR-S1, P-2.
- **Needless ask:** T-1.
- **Missing ranking line:** SR-F1 (the P2 ~50 % class).
- **Conflict not raised:** RS-D1.
- **Strict length check on a correct short answer:** D-2 "1 inch = 2,54 cm." (evaluator strictness; left as is).

## I. Gates and mutation (final code)

- **Gates:** `tsc --noEmit` clean · lint 0 errors · architecture 15/15 · `npm test` **18,044 passed / 0 failed** (1,094 files).
- **Mutation, M7 X1–X13:** all caught.
  - X1 duplicate pick sentence
  - X2 pre-search on the agent path
  - X3 intent call
  - X4 scorer before the agent branch
  - X5 flag accepts "1"
  - X6 vendor fallback on by default
  - X7 trace drops the input hash
  - X8 relaxation
  - X9 `use_tool` enum
  - X10 proxy refuses exposed tools
  - X11 legacy heads-ups
  - X12 hedge exemption removed
  - X13 hedge exemption applied to legacy
- **Mutation, M6 M1–M11:** still 11/11 caught.

## J. Lists

- **Fixed in M7:**
  - P0 SSRF redirect hop (cherry-pick `1970e40`);
  - P1 `g1bFallback` duplicate pick;
  - P1 `use_tool` SDK rejection;
  - P1 legacy cautions on agent turns;
  - P1 atmosphere guard deleting the agent's own hedge.
- **Known, pre-existing (untouched):** the P2 rows in section F, and the model-variance eval classes in section H.
- **Deferred (Future):**
  - `cannedChitchat` bypasses Luna;
  - the Places quota budget reads the Phase 7 constant;
  - `HAIKU_FALLBACK` must stay unset.
