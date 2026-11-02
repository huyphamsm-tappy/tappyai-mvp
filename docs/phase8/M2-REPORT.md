# Phase 8 — M2 Report: persistent task state (WEB, `TAPPY_AGENT=2`)

Date 2026-10-08 · worktree `D:/TappyAI-wt/wtagent8` · branch `p8/agent-runtime` (local) · on top of M1 `2d88ba6`.

**ANDROID: NOT TOUCHED · iOS: NOT TOUCHED · PRODUCTION ENVIRONMENT: NOT MODIFIED**

## A. What changed

1. **A persistent TASK per conversation** (`src/lib/ai/agent/runtime/task.ts`) for `TAPPY_AGENT=2` only.
   - Turn 1 creates it. Every later turn loads, updates and persists the same task.
   - It is stored with the chat-session state under `sha256(owner ‖ chatSessionId)`.
   - It is kept separate from the conversation: no message text is stored in the task.
2. **Luna interprets, code merges.**
   - A **task tracker** (`runtime/taskTracker.ts`) makes one structured Luna call per turn, *in parallel* with the agent's first step. It reads the compact task, the cards on screen, the end of the previous reply and the new message, and returns a delta: goal / type, constraints set / removed, preferences, entities, selection, status, new task.
   - Code validates, cleans, caps and merges the delta deterministically (`applyTaskDelta`).
   - No rule engine parses "dưới 300k", "thôi đổi sang Quận 1" or "chốt quán đầu tiên"; that is Luna's job.
3. **Code-owned task parts:**
   - ids, timestamps, revision;
   - the **research log** (every successful lookup: tool, redacted query, result count, turn);
   - the **pending question** (from `ask_user`; cleared when the user's next turn answers it);
   - the status lifecycle;
   - the concurrent-save merge.
4. **Compact task context:** at most 900 characters, inside the fenced DATA block (never the system prompt). It shows goal, constraints, preferences, entities, the selection, the last 5 lookups, notes, the pending question and the previous task.
   - The instructions (`AGENT_SYSTEM_V2`, NHIỆM VỤ ĐANG LÀM) tell Luna to:
     - continue the task;
     - re-use research the new constraint does not invalidate, and research again when it does;
     - put every live constraint into new lookups;
     - make progress every turn.
5. **Conversation-flow guardrail:** no two asks in a row. On the turn that answers a pending question, `ask_user` is not offered. This was measured as necessary: with the rule only in the instructions, Luna still asked a second question in 4 of 23 follow-up turns.
6. **Trace:**
   - `task_id` on every run trace;
   - `task` events: `created` / `loaded` / `stale_archived` / `invalid_discarded` / `foreign_discarded` / `closed_kept`, then `tracked` (applied / rejected), `end` (status, counts, pending, persisted) and `persist` (merge outcome, rev);
   - tracker timeouts and errors.
7. **Design change made during M2, from measurement.** The first M2 build offered `update_task` as an in-loop control action.
   - Luna always called it *alone* in the first step (one call per step), so every turn paid an extra model round: mean 2.7 rounds against M1's 1.6, worst turn 39 s.
   - The same job moved to the parallel tracker, giving mean 1.8 rounds and at most 2 rounds per turn on the follow-up set.
   - The loop still supports `update_task` interception (tested) but does not offer it. The M6 registry may offer it where a round is free.

## B. Task state schema (`AgentTask`, validated with zod on every load)

| field | meaning | owner |
|---|---|---|
| `task_id` | server UUID; never read from the client | code |
| `conversation_id` | sha256 of `chatSessionId` (32 hex); must match on load | code |
| `task_type` | `local_discovery \| shopping \| travel_planning \| comparison \| troubleshooting \| how_to \| question \| planning \| other` | Luna (validated) |
| `goal` | ≤ 200 chars | Luna (cleaned) |
| `constraints[]` | `{key (folded slug), value ≤ 120, hard, updated_at}` ≤ 16 | Luna (merged by key) |
| `entities[]` | `{name, kind}` ≤ 12 | Luna |
| `preferences[]` | `{key, value, updated_at}` ≤ 12 | Luna |
| `selected_items[]` | `{name, note}` ≤ 8 | Luna (resolved against cards) |
| `research_state` | `{searches[] ≤ 12 {tool, query (redacted), results, turn, at}, findings[] ≤ 8}` | code (searches) |
| `pending_question` | `{text, choices, asked_at}` \| null | code (from `ask_user`) |
| `status` | `active \| waiting_user \| completed \| abandoned` | code + Luna (completed / abandoned) |
| `created_at`, `updated_at`, `turns`, `rev` | lifecycle / optimistic version | code |
| `taskHistory[]` (beside the task) | ≤ 3 summaries `{task_id, task_type, goal, status, updated_at}` of switched / stale tasks | code |

There is no field for message text. A test pins the exact key set.

## C. Lifecycle

| step | where | what |
|---|---|---|
| **create** | `loadTask` | no stored task → fresh task, `turns 1` |
| **load** | route, before the agent | validate (schema) → conversation id must match → stale (> 7 days) archived as abandoned, fresh task → `turns + 1`. Malformed → discarded + fresh (traced, `tappyai_agent_task` warning). Foreign → discarded. Never throws. |
| **use** | agent context | compact lines in the DATA block; `ask_user` withheld when a question is pending |
| **update** | runtime | tracker delta (Luna) → `applyTaskDelta`; then `recordResearch` (executed lookups) and `finishTurn` (ask → pending / waiting_user; otherwise clear the pending question → active) |
| **persist** | route `onEvidence` (after the last byte) | re-read the store → `mergeForSave`: nobody else wrote → ours; same task changed concurrently → field merge (constraints by key, newer wins, our removals kept; lists unioned); other turn switched task → theirs kept |
| **complete / abandon** | Luna (`status`) or `new_task` | the old task becomes a history summary; new work on a closed task reopens it |
| **missing `chatSessionId`** | — | the task lives for this turn only (`persisted: false` in the trace); nothing is guessed |
| **rollback** | `TAPPY_AGENT=1` / unset | never writes `task`; a stored task is kept untouched (no data loss) |

## D. Files changed

New:
- `src/lib/ai/agent/runtime/task.ts`
- `taskTracker.ts`
- `task.test.ts` (24 tests)
- `taskTracker.test.ts` (6)
- `src/app/api/chat/agentTask.route.test.ts` (9)
- `docs/phase8/M2-REPORT.md`
- 236 Serper replay recordings

Modified:
- `src/app/api/chat/route.ts`: load / validate the task, compact context, `taskBox` to the runtime, merge + persist with the session state.
- `src/lib/ai/agent/runtime/index.ts`: `TaskBox`; the parallel tracker with grace and abort; research and ask lifecycle; the `askAllowed` guardrail.
- `runtime/loop.ts`: control-action path for `update_task` (cap 3 per turn, never counted as a tool call).
- `runtime/controlTools.ts`: `update_task` schema (not offered); the `ask_user` description.
- `runtime/prompt.ts`: NHIỆM VỤ ĐANG LÀM section.
- `runtime/limits.ts`: `maxTaskUpdates`.
- `runtime/trace.ts`: `task` kind.
- `runtime.test.ts`: +5 tests.
- `src/lib/ai/consultative/chatSessionState.ts`: opaque `task` / `taskHistory` fields, passed through when a turn does not set them.
- `src/lib/ai/llm/ai.ts`: `AI.extract` accepts `abortSignal` (additive).
- `src/app/api/chat/agentRuntime.route.test.ts`: M1 assertion updated (see E).
- `scripts/agent-eval/*`:
  - 7 new follow-up conversations (22 turns);
  - checks `lookup_carries_constraints` and `replaced_constraint_dropped`;
  - task metrics.
- `scripts/repoHygiene.test.ts`: recording ceiling 2135 → 2371 (deliberate).

## E. Tests

**New: 44 tests.**
- `task.test.ts` (24):
  - create, load, malformed (5 shapes), foreign, stale, no-session;
  - Luna deltas: restaurant mutate + preserve, replace / remove by folded key, shopping preferences, selection survives / replaces, task switch keeps nothing, completed / reopen, rejected types / keys, caps, sanitising (secrets / URLs / markers / instruction-like dropped);
  - research log + survival;
  - pending set / clear, completed kept;
  - concurrency: ours, merged, kept-theirs, `validStoredTask`;
  - compact context (cap, last searches, no ids);
  - schema has no message field.
- `taskTracker.test.ts` (6): fenced prompt with neutralised user markers; nulls → unchanged; fail-safe; delta applied + traced; late tracker **aborted** + traced; no two asks in a row.
- `runtime.test.ts` +5: `update_task` with a lookup / with text / alone / with ask, and the cap.
- `agentTask.route.test.ts` (9), through the real `POST` and the real session store:
  - **E2E A restaurant:** location → budget → air conditioning → follow-up, across 4 turns. Covers the same `task_id`; mutation and preservation; the pending question set then cleared; `ask_user` withheld on the answer turn; the research log; selection surviving; the persist merge in the trace; no conversation text stored.
  - **E2E B shopping:** MacBook → 25 triệu → coding.
  - **E2E C travel:** Đà Nẵng → dates → travellers → budget.
  - Two conversations don't share; a client `task_id` / `task` in the body is ignored; corrupt stored state is handled safely; no `chatSessionId` means nothing is persisted; `TAPPY_AGENT=1` and unset never write a task; rollback keeps the stored task.

**Your 15 required cases → where they are pinned:**
1. create — `task.test` + E2E A t1
2. same task — E2E A–C
3. mutate — `task.test` + E2E A t2 / t3
4. preserve — E2E A t2–t4
5. preferences — `task.test` + E2E B
6. selected items — `task.test` + E2E A t4
7. research state — `task.test` + E2E A
8. pending cleared — `task.test` + E2E A t2
9. status — `task.test` (waiting / active / completed / reopen / abandoned)
10. missing / corrupt — `task.test` + route
11. agent1 unchanged — route
12. unset unchanged — route
13. session → task — route
14. no sharing — route
15. no history duplication — `task.test` + E2E A

**Changed tests:**

| test | original | why obsolete | new | reason |
|---|---|---|---|---|
| `agentRuntime.route.test.ts` (M1, mine) "answers directly…" | `streamCalls + extractCalls === 0` | M2 adds exactly one structured call per turn (the task tracker) | `streamCalls === 0` and `extractCalls === 1` | still asserts no stream / intent path; pins the tracker as the only extra call |
| `scripts/repoHygiene.test.ts` | ≤ 2135 recordings | the M2 eval runs recorded new Serper answers | ≤ 2371 | the test's own rule (deliberate addition in the same commit) |

No architecture lock test changed.

**Regression (final tree):** `npm test` 1,082 files / **17,818 passed, 0 failed** (1 expected-fail, 84 skipped: live/paid suites) · `tsc --noEmit` 0 errors · `npm run lint` 0 errors · `architecture:check` 15/15.

## F. Eval comparison

**New follow-up set:** 7 conversations, 23 turns. They are deliberately different from the E2E test scripts:
- restaurant D1 → ≤ 300k → air conditioning → "which is quieter";
- MacBook → 25tr → coding;
- Đà Nẵng → dates → travellers → budget;
- **change of mind** (Q3 → Q1, quiet kept, Q3 must not be searched again);
- headphones ANC → < 3tr → running;
- a general non-search task (English, 30 min / day, bus commute);
- a **task switch and back** (phở → weather → "quay lại vụ quán phở").

Real Luna, Serper record / replay. All four columns are scored by the same final checks: earlier runs were re-scored offline, and M1 was run from its commit `2d88ba6` in a temporary worktree (since removed).

| follow-up set (23 turns) | Legacy (prod) | Phase 7 agent | Phase 8 M1 | **Phase 8 M2** |
|---|---|---|---|---|
| turns passing all checks | 16/23 | 22/23 | 20/23 | **21/23** |
| task continuity (constraints restated / used) | 7/13 | 12/13 | 10/13 | **13/13** |
| lookups carry every earlier constraint | 6/9 | 11/11 | 7/7 | **12/12** |
| replaced constraint not searched again | 0/1 | 1/1 | 1/1 | **1/1** |
| no re-ask of known slots | 10/10 | 10/10 | 10/10 | 10/10 |
| asks (turns) | 4 | 3 | 10 | **4** |
| conversations on ONE task | — | — | — | **7/7** |
| model rounds mean · max | — | 1.96 · 3 | 1.61 · 3 | 1.78 · **2** |
| latency p50 · p90 · max | 4.7 · 14.0 · 16.6 s | 7.7 · 14.4 · 16.3 s | 6.0 · 11.4 · 14.9 s | 7.0 · 13.4 · 22.8 s |
| USD / turn | $0.0038 | $0.0052 | $0.0036 | $0.0054 |
| Serper calls (metered) | 52 | 71 | 38 | 70 |

- **M2's 2 misses** are both FU-G1 t2 / t3 ("học tiếng Anh, 30 phút / ngày, đi xe buýt"). M2 searched nearby English centres; the scenario expected advice with no tool. It is arguably reasonable, but it counts as a miss.
- **Constraints the tracker recorded** (from traces):
  - FU-R1 ends with `khu_vuc`, `ngan_sach`, `tien_nghi` + preference `khong_gian`;
  - FU-T1 ends with `ngay_di`, `so_nguoi`, `ngan_sach` (destination in goal / entities);
  - FU-C1 *replaced* `khu_vuc` (Q3 → Q1) and kept "yên tĩnh" as a preference.
- **Cost and Serper:** M2 searches more on follow-ups than M1 (70 vs 38 calls). Re-research is now driven by the new constraints (FU-T1 t2–t4 fetch flights / hotels / places for the dates, party and budget), where M1 asked instead (10 asks).

**M0/M1 regression set on M2** (24 scenarios / 30 turns):

| | M0 legacy | M0 agent1 | M1 agent2 | **M2 agent2** |
|---|---|---|---|---|
| turns passing | 18/30 | 27/30 | 29/30 | **28/30** |
| asks when material · no needless ask | 2/3 · 17/19 | 2/3 · 19/19 | 3/3 · 19/19 | **3/3 · 19/19** |
| practical coverage | 6/10 | 9/10 | 10/10 | 9/10 |
| latency p50 · p90 | 4.3 · 9.3 s | 4.0 · 9.9 s | 4.7 · 8.8 s | **3.4 · 7.4 s** |
| USD / turn | $0.0028 | $0.0024 | $0.0022 | $0.0027 |
| run trace exactly 1 per turn | — | — | 30/30 | 30/30 |

The 2 M2 misses:
- **P-2** (iPhone vs S24 came back as shopping cards, with less trade-off content). M1's first run missed it too; it is a variance case.
- **F-2** (manufacturer spec answered from memory; needs M3 page reading).

## G. Performance impact

- **Prompt:** +~520 input tokens per model round (7,197 → 7,800 mean, +7–8%). That is the NHIỆM VỤ section (static, cached prefix) plus the task block, capped at 900 characters. The task object is never injected whole.
- **Tracker:** one structured Luna call per turn, $0.00016 per turn, mean 1.66 s / max 2.4 s. It runs **in parallel** with the first agent step (≈ 2–3 s), so it adds no latency on the critical path. Its grace after the loop is ≤ 4 s, after which it is aborted (traced; 0 timeouts measured).
- **Storage:** the task is at most a few KB inside the existing 64 KB session state. One extra KV read at save, for the concurrency merge, under `TAPPY_AGENT=2` only.
- **Model rounds:** max 2 per follow-up turn after the tracker change (it was 6 with the in-loop `update_task`).

## H. Security / privacy checks

- **Cross-conversation / cross-user leakage:**
  - The store key is `sha256(owner ‖ chatSessionId)`. The owner comes from server auth (`getRequestUser`), never from the body.
  - The task also carries `conversation_id` = sha256(`chatSessionId`), checked on load: a mismatched or foreign task is discarded.
  - Tested: two conversations never see each other's task.
- **Task id substitution:** `task_id` is server-generated. Client `task_id` / `task` body fields are ignored (tested).
- **Privilege escalation:** the task is data only. It cannot invoke a tool or an action; side effects still require `request_action` plus explicit confirmation. The status can only be completed / abandoned by Luna's delta; `waiting_user` is code-owned.
- **Injection through persisted state:**
  - Every persisted string goes through `cleanTaskText`: secrets and contact shapes cut, URLs, markup markers and fence markers removed, **instruction-like values dropped**, length capped.
  - It is rendered only inside the fenced DATA block (`neutralizeFenceMarkers`), never the system prompt.
  - The tracker's own input is fenced too, with the user's fence markers neutralised (tested).
- **Malformed / tampered state:** zod-validated on every load; invalid → discarded and traced, never trusted or thrown.
- **Privacy:**
  - No message text is stored in the task (tested).
  - Research queries are redacted.
  - The run trace logs task counts and outcomes, not task values. The Cloud Logging summary is unchanged (counters only).

## I. Remaining risks

1. **Tracker quality is Luna-dependent and single-run measured.** Key naming varies (`ngay_di` vs `ngay`); code folds keys but cannot unify synonyms. Variance runs are planned for the M7 gate.
2. **Follow-ups are more expensive than M1:** $0.0054 vs $0.0036 per turn and 70 vs 38 Serper calls. Re-research is driven by new constraints, which is correct behaviour. M3's evidence re-use and M5 should rebalance it.
3. **The no-two-asks guardrail is a deterministic policy.** A genuinely ambiguous answer can only be refined by a question at the end of a real answer, not by a second `ask_user`.
4. **The concurrency merge is best-effort** (read-then-write, no compare-and-set in the KV REST API). A narrow race window remains, but it is merged rather than overwritten in the common case.
5. **The task is per conversation (`chatSessionId`).** iOS sends none (frozen; not changed), so iOS turns get a per-turn task only.
6. **`update_task` in-loop support is unused code**, kept and tested for M6.

## J. Next milestone: M3, web research + page reading + evidence ledger (waits for M2 acceptance)

- `read_page` with strict SSRF / DNS-rebinding / redirect / size / type / time limits (building on `security/safeFetch.ts`), with page text as untrusted DATA.
- Richer `web_search` results (date, host, position, news).
- The evidence ledger: FACT / INFERENCE / UNKNOWN / CONFLICT with sources, linked to `task.research_state` (evidence references).
