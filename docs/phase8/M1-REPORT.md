# Phase 8 — M1 Report: agent runtime foundation (WEB, `TAPPY_AGENT=2`)

Date 2026-10-08 · worktree `D:/TappyAI-wt/wtagent8` · branch `p8/agent-runtime` (local) · base `origin/main` f9f2b12 · M0 = `eb3d32a` + `87fa2c2`.

**ANDROID: NOT TOUCHED · iOS: NOT TOUCHED · PRODUCTION ENVIRONMENT: NOT MODIFIED** (production has no `TAPPY_AGENT`; this milestone does not change that.)

## A. What changed

1. **New agent runtime** (`src/lib/ai/agent/runtime/`), live only when `TAPPY_AGENT` is exactly `'2'`.
   - Luna 6.0 is still the only model. Each round is one Luna step that ends in one of three ways:
     - **answer** (done);
     - **ask** (`ask_user` control action, done);
     - **tools**: the loop runs them, feeds the results back, and Luna decides "đủ chưa?".
   - It iterates until Luna answers or a ceiling forces a final step with no tools. That step is told which parts could not be checked.
   - `'1'` is still the Phase 7 agent. Unset is still the legacy path (production). Any other value (`'3'`, `'true'`, `'2 '`) is not an agent.
2. **`ask_user`** (`runtime/controlTools.ts`): a schema-only control action, intercepted and never executed.
   - Luna decides when to call it. Code only validates and normalises it: the question is cut of secrets, URLs and markers; choices are 2–4 entries of ≤ 60 characters, with `|` removed.
   - The reply is the question. Choices use the existing `[FOLLOWUPS]a|b[/FOLLOWUPS]` contract, so no new output contract is introduced.
   - An `ask_user` call drops any other tool calls in the same step; this is traced.
   - Under `TAPPY_AGENT=2` the Phase 7 regex planner gate is off, so a trip with no destination is asked by Luna.
3. **Hard ceilings** (`runtime/limits.ts`), enforced and traced:
   - model rounds ≤ 6;
   - tool calls ≤ 8 (refused calls are returned to the model as `tool_budget_exhausted`);
   - Serper ≤ 12 credits (≤ 15 for travel research). This is a turn scope enforced in `serperAdmit`; the after-loop card photos share the remainder.
   - overall deadline 85 s from the start of the request. A 15 s final reserve keeps time for the final answer, and no model step starts with < 2 s left.
4. **Cancellation:**
   - **Model step:** every step runs under its own `AbortController` and is aborted on timeout (step ≤ 45 s, bounded by the deadline).
   - **Model layer:** the new runtime role `agent` (same Luna model; not a second model) uses `generateAbortingPrimary`. The primary request is **aborted before** the one retry starts. The retry is marked `primaryAborted` and traced.
   - **Tool:** each invocation runs under its own signal, carried in the Serper budget scope (`withSerperToolScope`). On timeout the signal aborts: `serperPost` sends no further request (no credit spent) and the in-flight fetch receives the signal.
   - Other roles and paths are unchanged (no signal outside the Phase 8 scope; `abortPrimaryOnTimeout` only for role `agent`).
5. **Structured per-run trace** (`runtime/trace.ts`), one per turn, emitted at the end of the response stream (`traceTailStream`):
   - **console `tappyai_agent_run_trace`:**
     - ids: `trace_id`, `conversation_id` (hash of `chatSessionId`), `task_id` (null until M2), `message_id`, model, provider, `model_role`;
     - ordered events: `model_round` (decision, tokens, cost, ms), `tool_call` (tool, input hash, redacted query, why), `tool_result` (outcome, ms, credits, result count), `timeout`, `retry`, `budget` (force-final, tool refused, duplicate, ask preempts tools, query sanitised, date overridden, Serper refused), `guard`, `ask`, `error`, `final` (output type, chars, status);
     - totals: tokens, cost, latency, Serper, counts.
   - **Cloud Logging `tappyai_agent_run`:** a new allow-listed `AgentRunEvent` with counters and closed vocabularies only, through the existing privacy-guarded sink. No search query or text reaches Cloud Logging.
   - **Guard actions:** every settle-path stage in `streamEnrichment.ts` that *changes* the reply now reports `{stage, chars_before, chars_after, removed, added}` through `collector.guardTrace`. This is observation only, set only under `TAPPY_AGENT=2`, and catches guards that never logged anything.
6. **Coupling removed:** the agent no longer imports `consultative/presearch.ts`, which pulled about 10 Consultative modules into the agent. `searchingFrame` moved to `recommendation/progressAnnotation.ts`; `presearch.ts` re-exports it, so legacy callers are unchanged. No Consultative module was deleted or redesigned.
7. **Instructions** (`runtime/prompt.ts`): `AGENT_SYSTEM_V2` is the Phase 7 `AGENT_SYSTEM` with three passages rewritten:
   - iterative research, with the ceilings stated as ceilings;
   - `ask_user` only when material, with explicit do-not-ask cases (named options to compare, a known destination, knowledge / how-to);
   - a trip with no destination → `ask_user`.
   - The voice, facts, tips and **the Make Plan / card contract are untouched.** Each rewrite is asserted at module load.

## B. Files changed

New:
- `src/lib/ai/agent/runtime/{limits,controlTools,trace,loop,prompt,index}.ts`
- `src/lib/ai/agent/runtime/runtime.test.ts`
- `src/lib/ai/llm/fallbackAbort.test.ts`
- `src/lib/ai/tools/serperCancel.test.ts`
- `src/app/api/chat/agentRuntime.route.test.ts`
- `docs/phase8/M1-REPORT.md`
- 67 Serper replay recordings

Modified:

| file | change |
|---|---|
| `src/app/api/chat/route.ts` | `agentV2` flag; Serper ceiling 12/15 under v2; v1 planner gate skipped under v2; `AgentRunTrace` + `guardTrace`; runtime dispatch; `traceTailStream` on the response (+24/−6) |
| `src/lib/ai/agent/index.ts` | `tappyAgentEnabled` accepts `'1'` or `'2'`; `searchingFrame` import moved |
| `src/lib/ai/agent/dataStream.ts` | stream adapter accepts any run with `text` + `steps` |
| `src/lib/ai/llm/{types,registry,fallback}.ts`, `providers/claude.ts` | role `agent` (same model); 25 s timeout; abort-before-retry |
| `src/lib/ai/tools/serperToolBudget.ts`, `serperClient.ts` | cancellable tool scope; `serperPost` honours it |
| `src/lib/ai/streamEnrichment.ts`, `toolResultSplit.ts` | `guardTrace` hook (40 observation-only lines) |
| `src/lib/observability/events.ts`, `privacy.test.ts` | `AgentRunEvent` + allow-list + sample |
| `src/lib/ai/consultative/presearch.ts`, `recommendation/progressAnnotation.ts` | `searchingFrame` moved and re-exported |
| `scripts/agent-eval/agentEval.test.ts`, `lib/report.ts` | run-trace verification metrics |
| `scripts/repoHygiene.test.ts` | recording ceiling 2068 → 2135 (deliberate) |

## C. Architecture impact

- **One coherent loop for Phase 8:** conversation → Luna → answer | ask | tools → evidence → Luna → … → respond → existing Card / Plan / Map / Actions.
- The runtime reuses, unchanged:
  - the production tools;
  - the Phase 7 agent tools (films, trip bundle, `request_action` with confirmation);
  - the trust-split context;
  - the input/output guards;
  - the AI-SDK frame adapter.
  The stream filter, cards, plan parser and clients see exactly the frames they see today.
- **Behaviour change only under `TAPPY_AGENT=2`.** The shared-code edits are flag-scoped or pure observation:
  - the `guardTrace` hook is a no-op without a sink;
  - Serper cancellation is inert outside a Phase 8 scope;
  - abort-before-retry applies only to role `agent`;
  - the `searchingFrame` move is byte-identical.
- **Still coupled, by design until later milestones:**
  - deterministic rank / pick / brief inside the route tools (M5);
  - Consultative helpers that are leaf utilities (`consultTravel` dates, `lunaSafety` fences, `chatSessionState` types);
  - `routeConsult` still runs for the reject cue (M2/M5).

## D. Tests

**New (60 tests):**
- `runtime.test.ts` (23):
  - answer, ask, invalid ask, iteration, early stop;
  - tool ceiling 8 + refusal trace, round ceiling 6, final reserve, minimum step time;
  - tool failure, tool timeout **cancelled**, model timeout **cancelled**, outer abort, retry traced;
  - duplicate / control / disallowed;
  - trace emission (one console line + Cloud Logging summary, redacted query, idempotent), allow-list survival;
  - `traceTailStream` byte-identity + output type, null pass-through;
  - helpers; `ask_user` parsing;
  - `AGENT_SYSTEM_V2` vs `AGENT_SYSTEM`.
- `fallbackAbort.test.ts` (4):
  - the primary is aborted *before* the retry is called (order asserted);
  - a caller abort cancels without a retry;
  - an in-time answer is untouched;
  - other roles are unchanged.
- `serperCancel.test.ts` (3):
  - an aborted scope sends nothing and spends 0;
  - the fetch carries the signal;
  - no signal outside the scope.
- `agentRuntime.route.test.ts` (10):
  - v2 answer, ask, no-destination trip, iterate with cards and frames, guard actions in the trace, wiring;
  - flag isolation (`1`, unset, invalid values).
- Plus 2 checks pinned in the eval harness tests (unchanged count: 13).

**Changed lock / architecture tests (owner rule: original → why obsolete → new → reason):**

| test | original expectation | why obsolete | new expectation | reason |
|---|---|---|---|---|
| `api/chat/agent.route.test.ts` "route wiring: 8 normal / 10 travel" | route source contains `const agentSerperLimit = planningIntent === 'trip' ? 10 : 8` | the Phase 8 runtime has its own hard ceilings (12 / 15), set by the owner spec | route source contains `const agentSerperLimit = agentV2 ? serperCeiling(travelIntent \|\| planningIntent === 'trip') : planningIntent === 'trip' ? 10 : 8` | `TAPPY_AGENT=1` keeps exactly 10/8; `TAPPY_AGENT=2` takes 12/15 from `limits.ts`. The other three assertions of the test (photo budget = what the tools left) are unchanged |
| `llm/providers/modelIdentity.test.ts` "the table covers every role" | `ROLES` = fast…plan (7) | a new role (`agent`) exists | `ROLES` includes `agent` | the test's purpose (a new role cannot arrive unpinned) is kept: `agent` is pinned to the same dated snapshot |
| `scripts/repoHygiene.test.ts` recording ceiling | ≤ 2008 (M0 follow-up: 2068) | M0/M1 eval runs recorded new Serper answers | ≤ 2135 | the test's own rule: a deliberate addition raises the number in the same commit |

`architectureLock.test.ts` and `consultativeArchitecture.test.ts` were **not changed** and still pass: there is one `AI.stream(`, no `AI.step(` in the route, no `toolChoice`, the tools literal is intact, and `ai` is 4.3.x.

**Regression (final tree):** `npm test` 1,079 files / **17,774 passed, 0 failed** (1 expected-fail, 84 skipped: live/paid suites) · `tsc --noEmit` 0 errors · `npm run lint` 0 errors (pre-existing warnings only) · `architecture:check` 15/15 rules.

## E. Eval results (M0 harness, same 24 scenarios / 30 turns, real Luna, Serper record/replay)

| metric | legacy (M0, prod) | agent1 (M0) | agent1 (today) | **agent2 (final)** |
|---|---|---|---|---|
| turns passing all checks | 18/30 | 27/30 | 27/30 | **29/30** |
| tool choice | 17/21 | 20/21 | 20/21 | 20/21 |
| asks when material | 2/3 | 2/3 | 3/3 | **3/3** |
| no needless ask | 17/19 | 19/19 | 19/19 | **19/19** |
| task continuity | 1/3 | 3/3 | 3/3 | 3/3 |
| practical coverage | 6/10 | 9/10 | 9/10 | **10/10** |
| output kind | 2/6 | 6/6 | 6/6 | 6/6 |
| injection canary / crash / empty | 0/0/0 | 0/0/0 | 0/0/1 | **0/0/0** |
| latency p50 · p90 · max | 4.3 · 9.3 · 12.6 s | 4.0 · 9.9 · 18.9 s | 4.3 · 11.0 · 15.5 s | **4.7 · 8.8 · 10.4 s** |
| USD / turn | $0.00284 | $0.00242 | $0.00205 | $0.00221 |
| run trace present (exactly 1 per turn) | — | — | — | **30/30** |
| max rounds · max tool calls · max Serper | — | 3 · 4 frames · — | — | 3 · 2 · 9 |

- **The one remaining miss** is F-2 (AirPods spec answered from memory, no source), the same as agent1. A sourced answer needs page reading → M3.
- **Ask calibration:**
  - The first agent2 run over-asked on P-2 (comparing two named phones) and T-1 (a known destination); P-2 then failed practical coverage.
  - The rule was tightened in `AGENT_SYSTEM_V2` and the `ask_user` description: no ask for named options to compare, a known destination, or knowledge / how-to.
  - Re-measured: Q-1, Q-2 and Q-3 still ask; P-2 and T-1 answer. The final full run above is on that prompt.
- Research depth is not yet deeper than Phase 7 (max 3 rounds, 2 tool calls). That is expected: M1 raises the ceilings and adds iteration, but there is no page reading or evidence ledger yet (M3).

Run folders (git-ignored):
- `scripts/agent-eval/out/eval-2026-10-08T02-30-24-987Z` (agent2 + agent1, first prompt)
- `…T02-38-00-744Z` (agent2 final)
- two partial re-runs (ask calibration).

## F. Trace verification

- **Eval:** 30/30 agent2 turns emitted exactly one `tappyai_agent_run_trace`.
  - Its status, output type, rounds and tool calls match the harness's own reading.
  - It recorded 11 guard events, against 3 turns flagged by the guards' own logs, because the trace sees silent changes too.
- **The M0 silent deletion is now identified.** On L-1 t2 ("Dưới 300k một người, cần có máy lạnh") the trace records `{stage: "snippet_price", chars_before: 379, chars_after: 86, removed: 293}`. The snippet-price guard deleted the model's two in-budget options, and its own log line never fired.
  - That is the first M4 case. It is not fixed here (M4 scope).
- **Route test:** an unsupported rating claim produces `guard` events whose count equals `totals.guardChanges`.
- **Privacy:**
  - search queries in the console trace go through `cutSecrets` (test: an email in a query is not logged);
  - the Cloud Logging summary carries no free text, by construction (allow-list test).

## G. Timeout / cancellation verification

Each case is unit-tested, with no network:
- **Model step timeout:** the step's `AbortSignal` is aborted, the timeout is traced (`cancelled: true`), and the next step is the tool-less final answer.
- **Model-layer retry (role `agent`):** the primary signal is aborted, then the retry is called. The order `['primary_aborted', 'retry_called']` is asserted, the result is marked `primaryAborted`, and the trace shows a `retry` event.
- **Caller abort:** the primary is cancelled and there is **no** retry.
- **Tool timeout:** the tool's signal is aborted and traced. The turn continues with an honest "not checked" result.
- **Serper:**
  - an aborted tool scope sends nothing and spends 0 credits;
  - the in-flight fetch carries the signal;
  - legacy and `TAPPY_AGENT=1` calls carry no signal (unchanged).
- **Limit:** a Serper request already received by Serper may still be billed by Serper. The abort guarantees no *further* request and no waiting on it.

## H. Cost / latency

- agent2 final: **$0.00221 per turn**, p50 4.7 s, p90 8.8 s, max 10.4 s. That compares with $0.00205–0.00242 and p90 9.9–11.0 s for agent1, and $0.00284 / 9.3 s for legacy.
- No turn came near a ceiling: max 3 rounds, 2 tool calls, 9 Serper credits, 0 timeouts, 0 retries, 0 budget refusals.
- Eval spend for M1: about $0.15 model and 78 real Serper calls (now recorded).

## I. Remaining risks

1. **Research depth is unchanged in practice.** The ceilings allow 6 rounds and 8 tools, but with snippets only Luna stops early (max 2 tools). Deeper research depends on M3 (`read_page`, evidence ledger).
2. **Guards still delete** (`snippet_price` 293 characters, `place_claim` on I-1 and L-1). They are now visible but not fixed → M4.
3. **Luna tool steps run at `reasoning_effort=none`** (an API constraint). The ask decision is prompt-calibrated and was measured on one run per scenario; variance is not yet measured (2× runs planned for the M7 gate).
4. **`serperAdmit` counts credits before the abort check** (`before_send`). A tool cancelled at that exact moment counts one credit against the turn budget without sending. This is conservative (it can only under-spend).
5. **The console trace keeps redacted queries and tool names.** If Vercel logs are drained to a wider audience, that is model-written search text (contact and secret shapes removed).
6. **The 85 s deadline is measured from the start of the request**, so slow pre-agent work (auth, quota, memory) shortens the agent's budget. That is intended for a hard overall ceiling.

## J. Next milestone: M2, persistent task state (not started; waits for M1 acceptance)

- A `task` in `chatSessionState` v2: goal, constraints, entities, preferences, selected items, research state, pending question, status. It is kept distinct from conversation history.
- Luna proposes deltas through an `update_task` control action; code validates and normalises them.
- Follow-ups mutate the task. The `ask_user` pending question is stored so the answer resumes the task.
- `task_id` goes in the trace.
