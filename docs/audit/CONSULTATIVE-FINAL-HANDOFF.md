# TappyAI Web — Agent / Consultative Final Handoff

**FINAL ARCHITECTURE:** bounded Agent architecture (Luna 6.0 as the driver, bounded tools, guards as capabilities, presentation separate).

**WEB BASELINE:** `2a276ad` (Phase 7 Web baseline). This document and nothing else is added on top of it; **no source file changed** in this finalization.

**FINAL COMMIT / REMOTE SHA:** a commit cannot contain its own hash. The final SHA is the commit that adds this file (`git log -1 --format=%H --diff-filter=A -- docs/audit/CONSULTATIVE-FINAL-HANDOFF.md`), its message is `feat(web): finalize agent consultative handoff`, and its single parent is `2a276ad`. The full 40-character local and remote SHAs are reported with the push (they must be identical).

**LEGACY CONSULTATIVE:** intentional **rollback path only**.
**CANONICAL:** the `TAPPY_AGENT=1` Agent path.

| Flag | Meaning |
|---|---|
| `TAPPY_AGENT=1` | CANONICAL AGENT PATH (`route.ts` `agentOn`; the agent decides the turn). |
| `TAPPY_AGENT` unset / `0` | INTENTIONAL LEGACY ROLLBACK PATH (the Consultative pipeline, unchanged). Default of the code. |

**PRODUCTION AGENT STATE: UNVERIFIED.** Evidence examined (names only, no secret values): the code default is OFF (`src/lib/ai/agent/index.ts:23`); `TAPPY_AGENT` is absent from `vercel.json` and from every tracked deployment file (only `.env.local.example` and `.vercelignore` mention it); it is not set in the three local env snapshots available to this session (the main checkout `.env.local` and `.env.production.local`, and the g1-place-guard `.env.local`); only the UAT launchers set it. Vercel production settings are not readable from the repository and were **not** changed. Owner action: confirm in the Vercel dashboard (Production + Preview) that `TAPPY_AGENT=1` is set before relying on the Agent path in production.

---

## 1. Agent contract (verified)

| # | Contract | Evidence |
|---|---|---|
| 1 | Agent is the canonical path when `TAPPY_AGENT=1` | `route.ts:374` `agentOn`; `route.ts:3126` `result = agentOn ? await agentTurn(...) : AI.stream(...)`; live smoke: every turn emits one `tappyai_agent_trace` |
| 2 | Legacy Consultative is only the explicit rollback | `route.ts:425` `consult = agentOn ? null : …`; live smoke on `TAPPY_AGENT=0`: no agent trace, Consultative pick answer |
| 3 | Bounded agent loop | `loop.ts` `runBoundedAgent`: rounds ≤ `maxToolCalls + 3`; `agent.test.ts` (no infinite loop, step timeout) |
| 4 | Max 3 agent-level tool invocations | `AGENT_LIMITS.maxToolCalls = 3`; excess answered `tool_budget_exhausted`; tests R, “exactly 3 tool calls then FORCED final step”; live J turn: 3 calls, `answered_after_tool_budget` |
| 5 | No recursive agent | tools receive only `(args, {toolCallId})`; `security.test.ts` “no provider/tool module imports the agent loop”; only `route.ts` and `agent/index.ts` reference `startAgentTurn`/`runBoundedAgent` |
| 6 | Bounded provider fan-out | one tool may spend ≤ `serperCreditsPerTool = 8`; turn budget 8 normal / 10 travel (`serperToolBudget.ts`); `get_trip_data` bundle = 3 parts × 3 credits; live: `serper_turn.spent` 6 of limit 8 (J), 0 refused |
| 7 | Rule of Two for side effects | `SIDE_EFFECT_TOOLS = {save_price_watch}` never given to the model; `request_action` only parks a `PendingAction`; execution only on the user's next-turn confirmation, revalidated (known action, ≤10 min, schema, exact `argsHash`, idempotency id); tests G/H/I; live: a guest cannot park or run it |
| 8 | Security guards | `guards.ts` (`guardToolInput`, `guardToolOutput`, `cutSecrets`, `redactForTrace`), leak detector over `AGENT_SYSTEM`, settle-path evidence/price/place-claim guards (answer held until they run) |
| 9 | External content untrusted | tool output is stripped of instruction-like text, free-text URLs and credential keys, bounded to 24,000 chars and fenced; app state goes in a user-role DATA block, never the system message; tests A–E; live H turn refused a prompt/key dump |
| 10 | Secret isolation | provider credentials are server-side only and never in tool results or trace (tests E, K, L; `agent.route.test.ts` key-in-query test); `redactForTrace` |
| 11 | Context / state reuse | `ChatSessionState` (`cards`, `candidates` + `at`, `rejected`, `pendingAction`, `executedActions`, flight/movie/plan context) + `carriedEvidence.ts`; live: “quán số 2 mở tới mấy giờ?” and “quán thứ hai khác gì…” answered with **0 tool calls** from the carried cards |
| 12 | Tool-result validation | `guardToolOutput`; unknown/disallowed tool and invalid arguments refused (tests O, P); `travelData.ts` contract for future provider data |
| 13 | Honest unverified-data handling | `verificationLead.ts`, `labelFlightVerification`; live: fare “hiện chưa xác minh được”, showtimes/ticket price “chưa xác minh được từ nguồn dữ liệu đang có”; tool failure (invalid Serper key) → “chưa tìm được … chưa thể xác minh”, nothing invented |
| 14 | Luna writes the final natural answer | the final step is a Luna (`consult`/`plan` role) model step; presentation (cards, map, actions) is rendered from tool data, not from reasoning |
| 15 | No unintended fallback from Agent into the legacy engine | an Agent failure returns `502 ai_error` and refunds the quota (`route.ts:3127-3138`); there is no switch to the Consultative generator |
| 16 | No hidden parallel Consultative execution on the Agent path | the model-calling legacy steps are gated `!agentOn` (Luna intent `route.ts:407`, consult brain `:418`, presearch `:1268`, flight presearch `:1355`); live: on all 14 agent turns `usage.llmCalls == trace.model_calls` and `usage.toolCalls == trace.tool_calls` |

Remaining *pure-code* legacy dependencies on the Agent path (no model call, no tool call, explicitly required): the rules router result `routedRaw` is read for the rejection signal (`route.ts:2863`), `chatSessionState` load/save, `lunaSafety` leak detector, `referenceResolver` ordinal resolution, `consultTravel` relative-date helpers, `presearch.searchingFrame` (UI progress frame), `intent.ts` (`detectPlanningIntent`, `normalizeVN`), `streamEnrichment` / `toolResultSplit` settle-path guards. These are why `consultative/` is not physically removed (owner decision: option (a)).

**Scope exception of the canonical path (baseline behavior, not changed — frozen):** `agentOn = TAPPY_AGENT==='1' && !hasImage && !clipRef` (`route.ts:374`). With `TAPPY_AGENT=1`, a turn that carries an **image** or an **Explore clip reference** is still served by the legacy pipeline, because the Agent path has no image / clip-context handling. This is an explicit, existing routing rule (not a fallback after an Agent failure) and no test pins it. Mobile must treat text turns as the Agent contract and must not assume that image or clip-reference turns follow it until the owner decides otherwise.

Known cosmetic quirk (not changed — frozen): in `tappyai_agent_trace`, per-tool `credits` is keyed by tool *name*, so repeated calls of the same tool each show the combined total. The real spend is `serper_turn.spent`.

## 2. Tool contract

* Model-visible tools = the route's tool registry as **schema-only copies** with an optional `why` (≤12 words, stripped before execution, never shown), plus three agent-owned tools: `get_now_showing`, `get_movie_showtimes` (film links through the commerce registry; showtimes and ticket price have no source → `null`), and `request_action`.
* `get_flight_prices` = booking hand-off only (Trip.com / Traveloka / airline pages); fare, time and status are `not_verified`. No fare provider exists (Travelpayouts/Aviasales removed).
* Limits: 3 tool calls/turn, tool timeout 15 s, model step 30 s, 20 s reserved for the forced final answer, turn deadline `min(TURN_DEADLINE_MS − 25 s, 85 s)`, tokens 1,500 (4,096 for a plan), identical calls executed once, independent reads may run concurrently but each counts against the budget, `request_action` never runs concurrently with reads.
* A code-resolved date overrides a model-written relative date before a fare tool runs. A trip plan without a destination gets exactly one destination question before any external call (`plannerGate.ts`).

## 3. Context behavior

Follow-ups reuse carried state instead of re-searching: cards in display order, their verified facts with `verifiedAt`, rejected places, pending/executed actions, and the flight/film/plan the conversation is about. A rejection turn marks the current pick rejected and the next search excludes it. Carried facts older than their freshness window are not presented as current.

## 4. planNegation decision — LEGACY, left out

`planNegation.ts` exists only as uncommitted work in `wtfinal` (dated 02/10, before the agent). It feeds `intent.ts` → `planningIntent`, which on the Agent path only sets: the destination gate, the Serper cap (10 vs 8), the final role (`plan`) and the token ceiling (4,096). It does not select a plan template, and Luna decides whether to answer with a plan. Measured against the baseline `detectPlanningIntent` on 7 phrases: reference case #21 («một chuyến đi thật chill, không lịch trình») is already `null` without it; the only phrase it changes is «không cần kế hoạch, gợi ý chỗ ăn ở Đà Nẵng thôi» (`trip → null`), which on the Agent path would only change a budget/gate. Its own header cites “reference case #21” of the retired 35-prompt benchmark. It is not required by the Agent contract, so it is **not** part of the final implementation. The rest of the `wtfinal` WIP (deleting `adviceFloor.ts` / `tripBudgetEstimate.ts`, the `adviceBlock.ts` / `luna.ts` / `domainFrames.ts` prompt rewrite and their test/unhooking edits) belongs to the legacy path only and was **not merged**; `wtfinal` was not modified.

## 5. Files that form the Agent path

Core (`src/lib/ai/agent/`): `index.ts` (wiring, `startAgentTurn`, travel bundle), `loop.ts` (bounded loop, `AGENT_LIMITS`), `agentTools.ts` (tool schemas, `request_action`, Rule of Two, film/showtime tools), `guards.ts`, `prompt.ts` (`AGENT_SYSTEM`), `dataStream.ts`, `carriedEvidence.ts`, `plannerGate.ts`.
Support: `src/lib/ai/tools/serperToolBudget.ts`, `src/lib/ai/verificationLead.ts`, `src/lib/ai/searchIntel/{filmSearch,movieShowtimes}.ts`, `src/lib/ai/tools/travel.ts`, `src/lib/providers/travelData.ts` (data contract; not wired), `src/lib/ccp/` (links, allowlists), `src/lib/ai/streamEnrichment.ts` + `toolResultSplit.ts` (settle-path guards), `src/lib/ai/placeClaimGuard.ts`.
Wiring: `src/app/api/chat/route.ts` (`agentOn`, `agentTurn`, plannerGate, quota refund).
Directly imported from `consultative/` (kept, required): `chatSessionState`, `lunaSafety`, `referenceResolver`, `consultTravel`, `presearch`.
Tests: `agent/{agent,security,streaming,followups,tips,plannerGate,carriedEvidence}.test.ts`, `app/api/chat/agent.route.test.ts`, `tools/{flightSource,serperToolBudget}.test.ts`, `consultative/architectureLock.test.ts`, `consultativeArchitecture.test.ts`.

## 6. Legacy modules intentionally retained for rollback

All of `src/lib/ai/consultative/` (63 non-test files, including `consultRouter`, `consultBrain`, `luna`, `adviceBlock`, `adviceFloor`, `pick`, `rank`, `shortlist`, `presearch`, `synthesis`, `needProfile`, `situationFrame`, `domainFrames`, `planIntent`, …), `src/lib/ai/tripBudgetEstimate.ts`, and the `route.ts` sections gated by `!agentOn` / `consult` (Luna intent, consult brain, presearch, flight presearch, trip prefetch, advice block). They run only when `TAPPY_AGENT` is not `1`. Nothing was removed.

## 7. Focused smoke (real Luna + Serper, audit database, production build)

Not the 35-prompt benchmark. Evidence: `D:/TappyAI-wt/p7-uat/final-smoke/` (not in git).

| Case | Result |
|---|---|
| A general | 0 tools, 1 model call, direct answer |
| B local discovery | `search_places` ×1, three real venues |
| C context follow-up | 0 tools, answered from the carried card |
| D correction/rejection | rejects #1, new search, different venue offered; next follow-up 0 tools |
| E multi-step | one `get_trip_data` bundle; says dates/budget are missing, no invented prices |
| F tool failure (invalid Serper key, separate server) | honest “lượt tra cứu bị lỗi, chưa thể xác minh”, no data invented |
| G unverified/current data | fare, showtimes and ticket price all “chưa xác minh”; tracked booking links only |
| H prompt-injection | refused to print the prompt/keys; next normal turn unaffected |
| I side-effect | guest cannot park/execute `save_price_watch`; “xác nhận” with nothing pending executes nothing |
| J tool limit | exactly 3 calls, `answered_after_tool_budget`, Serper 6/8 |
| Rollback (`TAPPY_AGENT=0`) | no agent trace; Consultative pick answer |

## 8. Validation (code identical to baseline `2a276ad`)

Compared with the canonical Web baseline `2a276ad`: **no regression** (identical totals; no source file changed).

| Check | Result |
|---|---|
| Full suite (`npm test`, includes the required-suite gate) | **17,451 passed, 0 failed**, 1 expected fail, 81 skipped, 1 todo (1,049 files passed, 17 skipped); required suites: 84 executed, gate OK |
| Agent tests (`agent/`, `agent.route`, `flightSource`, `serperToolBudget`) | 133/133 (10 files) |
| Architecture lock (`architectureLock`, `consultativeArchitecture`) | 51/51 (2 files) |
| Security (`src/lib/security`, `safety`, `auth`) | 571/571 (28 files) |
| CCP (`src/lib/ccp`) | 126/126 (15 files) |
| `tsc --noEmit` | 0 errors |
| ESLint (`next lint`) | 0 errors (47 pre-existing warnings) |
| Production build (`next build`, audit env, `TAPPY_AGENT=1`) | OK, 202/202 static pages |
| Focused smoke (§7) | 11/11 cases as expected |

`npm test` regenerates four `docs/audit/*.json` files (timestamps / ±1-char prompt sizes); they were restored to their committed content and are not part of this commit.

## 9. Mobile handoff

Android and iOS **must** use the final SHA of this commit and this contract as the source of truth.

Mobile **must not**:
* port the old Consultative architecture;
* recreate the old router / template logic;
* use `final/consult-rework` WIP (`wtfinal`) directly;
* infer behavior from the 35 old prompts;
* create a parallel Agent architecture;
* modify the Web contract independently.

> UAT deployment trigger for TAPPY_AGENT verification — 2026-10-06
