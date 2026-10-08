# Phase 8 — Agent Runtime Rebuild: AUDIT + TARGET ARCHITECTURE + MIGRATION PLAN

Status: **AUDIT ONLY — no code changed.** Base: `origin/main` @ `f9f2b12` (Phase 7 release, PR #265), worktree `D:/TappyAI-wt/wtagent8`, branch `p8/agent-runtime` (local).
Date: 2026-10-08.

---

## 0. Executive summary

1. **Tappy already has an agent loop.** Phase 7 shipped a *bounded agent* (`src/lib/ai/agent/`, ~1,100 LOC + 10 test files) behind `TAPPY_AGENT=1`:
   Luna → answer | tool calls → loop executes (dedupe, timeouts, input/output guards) → feeds results back → forced tool-less final step.
   It already follows the shape of the target architecture. **The rebuild should *evolve* this loop, not write a third engine.**
2. **The agent is not yet the orchestrator.** It is a branch inside a 3,449-line `route.ts` that still runs most of the Consultative pipeline on every turn.
   - Deterministic rank/pick/brief/relaxation runs *inside the tools* the agent calls.
   - `routeConsult` still runs (only to detect a "reject").
   - Image and explore-clip turns always take the legacy path.
3. **The default is OFF and production state is UNVERIFIED.** `TAPPY_AGENT` must be the literal `'1'`, and `docs/audit/CONSULTATIVE-FINAL-HANDOFF.md:17` says "PRODUCTION AGENT STATE: UNVERIFIED". Unless Vercel sets it, production runs the Luna **Consultative** path.
4. **The main gaps against the Phase 8 target:**

| Requirement | Today | Gap |
|---|---|---|
| Answer / Ask / Tool | Answer + Tool; "ask" is just prose | No structured ask action; clarify gate is consult-only |
| Iterative research | ≤ 3 tool *invocations*/turn; hidden **8 s** consult-role timeout per step | Too small for search → inspect → search again; timeout does not abort (double billing) |
| Web search first-class | `web_search` = Serper snippets `{title, link, snippet}` | No page reading, no date/recency, no news endpoint, no source ledger |
| Conversation state | `chatSessionState` slots (flight/movie/plan/cards/pick/rejected/pending action), KV 30 d | No task object; each turn restarts the loop; `known`/`domains` never updated under the agent; **no user memory/preferences in agent context**; iOS sends no `chatSessionId` → no state |
| Evidence FACT/INFERENCE/UNKNOWN/CONFLICT | `EvidenceType FACT/REVIEW_SUPPORTED/INFERRED/UNKNOWN` (consult tools), `not_verified` labels, many sentence-deleting guards | No CONFLICT; no evidence ledger the model can cite; guards *delete* reasonable inference (documented empty-reply incidents) |
| Deterministic vs Luna split | Code also does ranking + pick + brief inside tools | Pick and trade-offs must move to Luna; code keeps hard filters, validation and math |
| Dynamic tool discovery | Hard-coded conditional subsets | No catalog / deferred loading |
| Tracing | One console line `tappyai_agent_trace` + ~60 other console types; Cloud Logging buffer for usage only | No run id, no spans, no guard-action trace, no persisted run record |
| Eval | Scripted-model unit tests (agent), replay harness **on the consult path only**, golden/c40 scripts need live keys; no CI eval | No agent trajectory eval, no regression gate on agent quality |

5. **The output contracts are clean and can be kept unchanged.** The agent already emits the AI SDK data stream (`9:`/`a:`/`0:`/`e:`/`d:`), and the server adds `8:` annotations. Cards, Make Plan (`[TAPPY_PLAN]`), maps, CTA and `request_action` work on both paths.

---

## A. Current AI architecture map

```
Client (Web ChatInterface / Android RealChatRepository / iOS ChatService)
   │  POST /api/chat  {messages, userLocation, chatSessionId?(web, android only)}
   ▼
route.ts (3,449 lines, one POST handler)
   ├─ rate limits, body cap, compactRequestMessages, validateClientInput
   ├─ deterministic readers: classifyIntent, budget, location/movie intent, resolveReplyLanguage,
   │  detectForcedTool, travelIntent, planningIntent, statedDistrict
   ├─ agentOn = TAPPY_AGENT==='1' && !hasImage && !clipRef            (R:374)
   ├─ routeConsult (rules) — always when CONSULT_V2                      (R:385)
   ├─ [legacy only] runLunaIntent (AI.extract) + runConsultBrain          (R:408/419)
   ├─ canned / clarify / film / planner gates                           (R:565–692)
   ├─ auth, 18+, quotas, memory/identity/calendar/subscription load       (R:726–976)
   ├─ needProfile / decisionFrame / situation (both); presearch (legacy)   (R:1195–1359)
   ├─ history trim + collapseClarifyTurns + sanitize + compactHistory     (R:1761–1799)
   ├─ buildSystem (legacy prompt; computed always)                       (R:1996)
   ├─ routeTools = gateTools(timeTools({...10 tools}))                   (R:2245–2631)
   │      each tool execute = provider → filters → rankForModel(rank/pick/brief/relax) → commerce links → fence
   ├─ agentOn ? startAgentTurn(...)  :  AI.stream(streamOpts)              (R:2837–2903, R:3134)
   ▼
applyPlaceEnrichmentStreamFilter (streamEnrichment.ts, 3,768 lines) — cards, photos, maps, ~25 guards
   → luxury filter → askAfter/emptyResult (legacy) → stepRepeatGuard → turnCostStream → logUsage
   ▼
Client renders text + 8: annotations (tappy.places.v1 / progress / turn) + [TAPPY_PLAN] / [CTA_BUTTONS] / [FOLLOWUPS] / [TAPPY_SHOPPING]
```

Two orchestrators share one route:
- **Legacy Consultative:** Intent → (Luna intent / brain) → presearch → retrieval → filter → score → pick → V1 prompt → `AI.stream` (multi-step) → guards.
- **Bounded agent:** `AGENT_SYSTEM` + `agentContext` → `runBoundedAgent` (≤ 3 tools) → the same guards.

## B. Entry points

| Endpoint | LLM use | Through agent? |
|---|---|---|
| `src/app/api/chat/route.ts` | Chat: intent (`extract`), brain (`generate`), answer (`stream`), plan completion (`generate`), memory extraction (`memoryService.ts:263`) | only when `agentOn` |
| `api/translate` :48, `api/viet-content` :81, `api/group/[id]/suggest` :49 | `AI.generate` (smart) | no (out of scope) |
| `api/scan` :39 | `AI.vision` (OCR) | no |
| `api/scam-shield/analyze` → `scam-shield/message/ai/analyzer.ts` | generate + vision | no (out of scope) |
| `api/explore/process` → `explore/contentProcessor.ts` | 2× generate + vision | no |
| crons: deal-notifications, morning-brief, price-check, weekly-recap | `AI.generate` (fast) | no |
| `src/app/r/[slug]/PublicResultClient.tsx` | calls `/api/chat` | same as chat |

Clients:
- **Web** sends `chatSessionId`.
- **Android** sends `chatSessionId` + `x-tappy-surface` / `x-tappy-caps`.
- **iOS** sends only `messages` + `userLocation`, so it gets **no server-side session state** (`ios/.../ChatModels.swift:148`).

**Scope of Phase 8:** only the chat route's orchestration. Other AI endpoints stay as they are.

## C. Luna integration

- Facade: `src/lib/ai/llm/ai.ts`. Methods: `generate`, `step` (`generateText`, `maxSteps: 1`), `stream`, `extract` (`generateObject`, strict JSON schema), `vision`.
- Roles: `fast | smart | planning | vision | consult | intent | plan`.
- Provider: `LLM_PROVIDER` defaults to `openai` → `gpt-6-luna` for every role (`providers/openai.ts:20`). `claude` (Haiku 4.5) is the rollback; Anthropic is out of credit.
- **API:** Chat Completions via `@ai-sdk/openai` 1.3.24 `provider.chat()`; `ai` 4.3.19 (pinned 4.3.x by a lock test). **The Responses API is not used.**
- **Luna quirk:** it refuses function tools unless `reasoning_effort = none`, so `effortForCall` forces `none` on any call that has tools (`openai.ts:92-94`).
  - Every agent *tool step* therefore runs at effort none.
  - Only the tool-less final step can use reasoning (`plan` role defaults to `low`).
- **Parallel tool calls:** on only when `providerMetadata.tappy.parallelTools` is set (the agent sets it). Never sent on tool-less calls.
- **Caching:** `systemShared` comes first and is byte-stable; OpenAI uses automatic prefix caching.
- **Cost:** hardcoded Luna prices in `openaiCallCost`; uncached input is priced as cache-write. The cost is attached as `providerMetadata.tappy.cost`.
- **Fallback (`registry.ts:116-143`, `fallback.ts`):** `HAIKU_FALLBACK` is off → one Luna retry.
  - Timeouts: `consult` and `intent` = **8 s for the whole generate**; `plan` = 30 s; others = 40 s.
  - ⚠ The timeout is a `Promise.race` and **does not abort** the primary call. A slow agent step keeps billing while the retry runs, and any agent step longer than 8 s is silently re-run.
- **Agent call:** `agent/index.ts:161-181` → `AI.step({ role: final ? finalRole : 'consult', systemShared: AGENT_SYSTEM, tools: schema-only, parallelTools: true, maxTokens: 4096 plan / 1500 })`.
  - Earlier tool calls and results are replayed as `assistant`(tool-call) + `tool`(tool-result) messages.
  - No streaming: the final text is emitted after the loop.

## D. Current agent / tool loop

`src/lib/ai/agent/loop.ts` `runBoundedAgent`, patterned on the OpenAI Agents SDK loop:
- One model step per round; tools are schemas only, and **the loop executes them**.
- Limits (`AGENT_LIMITS`): `maxToolCalls` 3 (invocations, not rounds), `toolTimeoutMs` 15 s, `stepTimeoutMs` 30 s, `finalReserveMs` 20 s, `serperCreditsPerTool` 8. Rounds are capped at `maxToolCalls + 3`.
- Turn deadline = start + 85 s (`maxDuration` 120).
- Serper turn budget = 8 credits, or 10 for a trip (`withSerperTurnBudget`).
- Each round runs in three phases:
  1. Sequentially: input guard, budget, dedupe (stable-JSON key), allow-list.
  2. Read-only tools run concurrently; `request_action` runs sequentially.
  3. Output guard → trace event → client `9:`/`a:` frames → `tool` message.
- When the budget or time runs out, a **forced final step** is told which parts were not checked ("never fill a gap from memory"). The final step has no tools, so a turn always ends in text.
- The model's `why` argument is logged (redacted) and stripped before the tool and before any client frame.
- Agent-only tools:
  - `get_now_showing` and `get_movie_showtimes` (Serper + CCP film links; showtimes and prices `not_verified`).
  - `get_trip_data`: hotels + attractions + food in one parallel call, no model call inside.
  - `request_action`: side effects are parked as a `PendingAction` (args hash, 10 min TTL); the user confirms next turn; then revalidation and idempotent execution.
- Route-level pre-agent gates:
  - `plannerNeedsDestination`: a trip with no destination gets one canned question, 0 tools.
  - `planNeedsNoRetrieval`: a plan-only turn gets no tools.
  - canned chit-chat.

## E. Conversation state / context

- **History:** only the client-sent `messages`; the server never loads chat history from the DB. Clients persist via `/api/conversations`.
  - Agent: last 10 messages → `collapseClarifyTurns` → `sanitizePriorAssistantContent` → `compactHistory` (prose outside the last 3).
- **`chatSessionState`** (`consultative/chatSessionState.ts`):
  - Storage: Upstash KV, key `chatstate:v1:sha256(owner\0session)`, TTL 30 d, 64 KB cap, 800 ms timeout.
  - Fields: `domains, known, pick, shown, cards, evidence, candidates{args, rows, at}, stay, products, pendingAction, executedActions, flight, movie, plan, rejected, updatedAt`.
  - It needs an owner and a UUID `chatSessionId`.
- **Agent context** (`agent/prompt.ts:172`) is split by trust:
  - `system`: code-computed clock, 14-day calendar, resolved relative dates, GPS city.
  - `data`: a fenced DATA user message just before the latest user turn, carrying `AgentAppState`: cards in order, card facts with `verifiedAt`, pick, rejected, known, pending action / outcome, flight/movie/plan lines.
- **State patch** (`statePatchFrom`): flight, movie and plan come from successful tool calls. Cards and evidence are saved by the enrichment `onEvidence` callback.
- **Gaps:**
  - **No task object.** A follow-up starts a fresh loop over trimmed history plus state slots; nothing records the goal, constraints, open questions or research done so far.
  - Under the agent, `consult` is null, so `known` and `domains` are **never updated** and the agent reads stale slots.
  - **User memory, preferences, identity, calendar and style are loaded but never given to the agent** (only used to sanitize queries).
  - `consultativeArchitecture.test.ts` *asserts* that need profile, stage and trip context are re-derived every turn and **never stored**. This is a policy conflict with "conversation state is first-class" (see Decision D3).

## F. Tools and registration

There is no registry: tools are inlined in `route.ts:2245-2631` and wrapped by `timeTools` + `gateTools` (hard-constraint gate + DATA fence).

| Tool | Provider | Notes |
|---|---|---|
| `search_places` | Serper `/maps` (OSM fallback), price snippets, VnExpress editorial, CCP | geography guard → budget filter → constraint filter → relax → **rankForModel (rank + pick + shortlist + relaxation + brief)** → trim |
| `search_products` | Serper `/shopping` + ≤ 4 `/search` + `/images`, CCP | shopping synthesis (`[TAPPY_SHOPPING]`) |
| `web_search` | Serper `/search` (DuckDuckGo HTML fallback), CCP event links | **free query; returns `{title, link, snippet}` ×6; date, position and sitelinks dropped** |
| `get_news` | RSS (VnExpress, Tuổi Trẻ, Dân Trí), top 5 | no Serper |
| `get_weather` | wttr.in | |
| `get_gold_price` | vang.today | |
| `get_flight_prices` | none, links only (Trip.com/Traveloka/VNA/Vietjet) | fare/time/status `not_verified` |
| `get_hotel_prices` | Serper `/maps` + `/search` + OSM, CCP | |
| `get_transport_options` | Serper ×2, Nominatim, fixed taxi rate, Vexere link | |
| `save_price_watch` | Supabase | **side effect**; agent reaches it only via `request_action` |
| *agent:* `get_now_showing`, `get_movie_showtimes`, `get_trip_data`, `request_action` | | see D |

- Every agent step sends all of these as schemas: about 13 tools, estimated 2–3 k tokens per step (not measured).
- Subsets are hard-coded conditionals (`noToolTurn`, `movieRecommend`, `locationIntent`, `authedUserId`, `noRetrieval`).

## G. Web / search / Serper

- **Single client:** `serperPost` (`tools/serperClient.ts:96`).
  - Endpoints: `maps` (3 credits), `search`, `shopping`, `images` (1 each). **`news` is not used.**
  - Daily ceiling 15 k credits; per-turn and per-tool budgets via AsyncLocalStorage (`serperToolBudget.ts`).
- **Sanitisation:**
  - `serperUntrusted.ts` cleans every response (URLs out of free text, injection markers cut).
  - The agent's `guardToolOutput` then drops sensitive keys, removes instruction-like sentences and free-text URLs, caps size and fences the result as DATA.
- **Caches:** L1 in memory (5–30 min); L2 Upstash, 24 h; `serperCacheV2` (freshness TTLs by kind) is **off**.
- **Page reading:** there is **no model-callable page reader.** Pages are fetched only in fixed internal cases: VnExpress travel extracts, `og:image` from `<head>` via `safeGetText`, and Ticketbox (disabled).
- **Citations:** source URLs survive as `link` fields, so the model *could* cite. Only the film tools ask it to ("Nguồn: [host](url)"); the general prompt says "never write URLs".

## H. Evidence and guards

- **In-loop (agent only):** `guardToolInput`, `guardToolOutput`, `prepareArgs` (query sanitising, code-resolved dates).
- **Post-stream (both paths, `streamEnrichment.ts`):** with `agentMode`, the stream is **fully buffered** and then about 25 guards run. In order: egress/links, marketplace, leak, plan repair/price/tips/items/trip facts, money, spec, travel/ticket, snippet price, proximity, **placeClaim (deletes whole sentence)**, hours, budget-fit, format, district, unsupported claim, clarification, search/atmosphere claims, grounding gate (drops ungrounded venues), orphaned enrichment, G1b fallback, risk backstop, verificationLead.
- **Evidence sources:**
  - this turn's `a:` frames;
  - on no-tool follow-ups, carried facts: for the agent, the card rows from `carriedEvidence.ts` (`verifiedAt`; "open now" ≤ 30 min).
- **Existing labels:**
  - `evidenceProvenance.ts:23` `EvidenceType FACT | REVIEW_SUPPORTED | INFERRED | UNKNOWN` + `EvidenceScope entity | area`;
  - `normalizedEvidence` / `decisionEvidence` sentinel `UNKNOWN`;
  - moneyGuard `VERIFIED | UNVERIFIED | ACCESSORY | AMBIGUOUS`;
  - `_tappy_verification` / `fare_status: not_verified`;
  - `verificationLead` sentences.
  - **There is no CONFLICT label.**
- **Over-strictness, documented in the repo:**
  - empty reply on a card-#2 follow-up (`carriedEvidence.ts:3-7`);
  - recipe cut from 10 to 6 sentences (`agentOwnsProse.test.ts`);
  - 7 of 30 turns kept ≤ 35 % of the answer (`docs/audit/phase2-g1-guard-fix-design.md`);
  - a compare reply ending empty (`streamEnrichment.ts:3095`).
  - Root cause: guards *delete sentences*, and the agent lacks the consult `empty_reply_fallback`.

## I. Output contracts (must stay)

- **Stream:**
  - one `9:`+`a:` pair per tool result (the guards and cards read them; sub-calls of `get_trip_data` go out as the original tools' frames);
  - `0:` text; `e:` / `d:`.
- **Server-added `8:` annotations:** `tappy.places.v1` (place cards, `PlaceDecision.tsx`), `tappy.progress.v1`, `tappy.turn.v1`, and `tappy.sponsored.v1` (defined, unused).
- **Prose conventions:**
  - `**Bold**` venue names, pick first (card order and fold);
  - no URLs in prose (the system attaches links);
  - `[FOLLOWUPS]a|b[/FOLLOWUPS]`;
  - `[CTA_BUTTONS]` (validated);
  - `[TAPPY_SHOPPING]` (server marker);
  - `[TAPPY_ASK]` (consult brain only).
- **Make Plan:** `[TAPPY_PLAN]{type, title, people?, budget_total?, days[{label, items[{time, emoji, category, name, …}]}], cost_breakdown?, share_text?, local_tips?[{text, basis, place?}]}[/TAPPY_PLAN]`.
  - Parsed by `structuredContent/parsePlan.ts`, `TripPlanCard.tsx`, `planner/derivePlans.ts`, `/api/plans/share`, Android `DerivedPlan.kt`, iOS `ContentParser.swift`.
- **Actions:** `request_action` → `PendingAction` → confirm next turn → `runAiWriteAction` (`src/lib/ai/actions/`).
- **Maps:** `google_maps_search` / `maps_link` from the provider rows + `buildActions`.
- **Clients:** Web `ChatInterface.tsx`; Android `ChatStreamFrames.kt` (reads `0:`/`8:`); iOS `StreamingClient.swift`.
  - Android and iOS rely on prose-injected photos and links.

## J. Deterministic logic embedded in the AI path

- **Should stay deterministic:**
  - geography guard, budget hard filter, constraint filter (`placeConstraintFilter`, `foodConstraints`, `shoppingConstraints`);
  - dedupe, distance (`haversineKm`), dates (`agentCalendar`, `codeResolvedDate`, `afterOutbound`), `planBudgetMath`;
  - commerce link authority (CCP), egress/link guard, secret cut, quotas, Serper budgets, action revalidation, plan JSON repair/parse.
- **Should move to Luna** (code currently decides meaning or recommendation):
  - `rankForModel` → `rank.rankCandidates`, `pick.derivePickOrState`, `shortlist`, `relaxation.proposeRelaxation`, `consultativeBrief` (inside `search_places` / `get_hotel_prices` / `search_products`);
  - `placeTypeGate.gatePlacesByActivity` (meaning);
  - `routeConsult` reject detection under the agent;
  - `plannerNeedsDestination` / `planNeedsNoRetrieval` (regex gates on meaning; the agent should ask or answer itself);
  - stream-time `modelPick` / `pickBackstop` / `alignEmphasisToModelPick`.
  - Ranking can still return a **neutral, deterministic sort** (distance / rating / price as data) without a code "pick".

## K. Consultative Engine components

Import graph built from 64 non-test modules in `consultative/` + top-level `ai/*.ts` + `searchIntel/`.
- **Consult-only (replaced by the agent runtime):**
  - routing and intent: `consultRouter`, `consultBrain`, `luna.ts` (intent), `intentGate`, `actionability` (gate), `refinement`, `searchNow`, `presearch.planPresearch` / `planFlightPresearch`;
  - prompts: `domainFrames`, `leanConsultPrompt`, `consultativeV1Prompt`, `adviceBlock`, `styleLuna6`, `promptBuilder`;
  - stream wrappers and helpers: `askAfter`, `emptyResultStream`, `echoQuestion`, `moreFromSet`, `planIntent`, `tripContext`, `tripFacts`, `localShop`, `eveningPlan`, `planCompletion`, `clarificationGuard`, `exploreClipContext` / `Target`.
  - These stay **alive** because image and clip turns use them; they can be retired only once the agent handles those turns.
- **Engine running inside the tools on agent turns:** `candidate`, `rank`, `pick`, `shortlist`, `decisionFrame`, `needProfile`, `situationFrame`, `hardConstraintGate`, `hardConstraints`, `upscale`, `placeTypeGate`, `shoppingConstraints`, `relaxation`, `modelPayload`, `consultativeBrief`, `synthesis`, `synthesisView`, `decisionEvidence`.
- **Coupling:**
  - `agent/index.ts:17` imports `searchingFrame` from `consultative/presearch.ts`, which drags about 10 consult modules into the agent closure.
  - `plannerGate → tools/travel → food → evidenceProvenance → decisionEvidence → pick`.
- **Dead (tests only):** `ai/clarification.ts`, `consultative/claimScope.ts`, `consultative/replyAnalysis.ts` (the last is listed in `architectureLock.test.ts`).
- **Duplicated concepts:**
  - three evidence vocabularies (`evidenceProvenance`, `normalizedEvidence`/`decisionEvidence`, moneyGuard verdicts);
  - two system prompts per turn (`buildSystem` is still computed under the agent);
  - two ask mechanisms (`[TAPPY_ASK]` + clarify gate vs. agent prose).

## L. Tests and regression coverage

- 304 test files in `src/lib/ai/**` (93 consultative, **10 agent**), 15 in `api/chat/**`, 1,008 repo-wide (~17.5 k tests). CI (`regression.yml`) runs the full `npm test` + tsc + lint + SQL grants; `architecture-guard.yml` runs `scripts/architecture/check.mjs`.
- **Agent tests** (scripted model, no keys):
  - `agent.test.ts` (32: loop, limits, policy);
  - `security.test.ts` (22: attacks A–S);
  - `followups.test.ts` (17);
  - `agentOwnsProse` (12), `carriedEvidence` (11), `tips` (9), `returnLegDate` (8), `streaming` (5), `plannerGate` (2), `nowShowingLinks` (2);
  - `api/chat/agent.route.test.ts` (route-level, `TAPPY_AGENT=1`).
- **Lock tests a rebuild will trip** (owner approval needed to change them):
  - `consultative/architectureLock.test.ts`:
    - exactly one `AI.stream(` in the route, no `AI.step(` in the route;
    - the literal `const tools = noToolTurn && !agentOn ? undefined : gateTools(timeTools({`;
    - `.execute(` counts;
    - `ai` 4.3.x;
    - no `toolChoice` / `prepareStep`;
    - model-free modules list.
  - `ai/consultativeArchitecture.test.ts`:
    - need profile / stage / trip context **never stored**;
    - named D3 modules (`conversationState`, `stateContext`, …) **must not exist**;
    - single `AI.stream`; no tool forcing.
  - About 30 tests regex-assert on `route.ts` source text.
  - `scripts/architecture/check.mjs`:
    - vendor SDKs only in `llm/providers/`;
    - no `generateText` / `streamText` outside `llm/`;
    - no vendor `providerOptions` outside providers.
- **Eval / replay (none run in CI):**
  - `scripts/consult/replay` (real POST, Serper recordings ×2,008, suites scenarios/owner59/androidR/injection/realTyping/planHard). **It sets no `TAPPY_AGENT`, so it measures the legacy path**, and it needs model keys.
  - `scripts/audit/goldenSet.mjs` (24 lines), `eval40.mjs` (c40), `__measure__/*` (`MEASURE=1`), Luna probes.
  - No Playwright.

## M. Reusable as-is (or near)

| Asset | Why keep |
|---|---|
| `agent/loop.ts` skeleton (3-phase rounds, dedupe, timeouts, forced final, error-as-result) | correct pattern, 32 tests |
| `agent/guards.ts` (input/output/trace guards, DATA fence) | security boundary, 22 attack tests |
| `agent/dataStream.ts` (AI SDK frame contract) | clients and guards unchanged |
| `agent/prompt.ts` `agentContext` trust split, `agentCalendar`, date helpers | deterministic dates, injection-safe state |
| `request_action` / `PendingAction` / revalidation / idempotency | side-effect boundary |
| `carriedEvidence.ts` | field-level carried facts with freshness |
| All production tool executors, Serper client, budgets, caches, `serperUntrusted`, CCP / commerce links, `toolResultSplit.forModel` | data layer + link authority |
| `chatSessionState` storage (KV, owner-hashed key, TTL, caps) | extend, don't replace |
| `llm/` facade + providers + fallback | Luna integration; needs 2 fixes (role and timeout, abort) |
| Output-side guards that check *facts* (money, hours, placeClaim, travel, plan*, egress, grounding) | keep, but switch to the evidence ledger and hedge instead of delete (§N) |
| `turnCost`, `cloudLogging` sink, `goldenCapture`, replay harness + Serper recordings | observability and eval base |

## N. Must be replaced / changed

1. **Orchestration location.** The agent must stop being a branch inside `route.ts`.
   - Extract the turn into `src/lib/ai/agent/runtime/` (`runAgentTurn`), and have the route only do auth / quota / input → runtime → stream filter.
   - Under the new flag, drop the per-turn consult work: `routeConsult`, `needProfile`/`situation` for the agent, `buildSystem`, presearch imports.
2. **Loop budgets → iterative research.**
   - Replace "3 invocations" with **rounds + credits + time**, for example ≤ 6 model rounds, ≤ 8 tool invocations, Serper ≤ N credits, deadline. All configurable, with guard-rail defaults.
   - Add a dedicated `agent` model role with its own timeout and a **real abort** on timeout (fixes double billing and the 8 s silent retry).
3. **Control actions.** Add schema-only control tools that the loop intercepts:
   - `ask_user` (question + why it changes the decision + optional choices → ends the turn and renders as text + `[FOLLOWUPS]`/ask chips);
   - `update_task` (see 4).
   - No `toolChoice` is needed, which stays compatible with the lock.
4. **First-class task state.** Add `task` to `chatSessionState` (v2):
   - `{ id, goal, domain, constraints{…}, decided{…}, openQuestions[], researchLog[{query, tool, at, evidenceIds}], candidates refs, rejected[], status: active | answered | abandoned, updatedAt }`.
   - Luna proposes deltas via `update_task`; **code validates and normalizes** (types, lengths, dates, budget parsing, dedupe).
   - Follow-ups render the active task into the DATA block, so the model continues it instead of restarting.
   - Task switch = new task; the previous one is kept (≤ 3).
5. **Search as a capability.**
   - Enrich `web_search` results: `date`, `position`, `host`, `sitelinks`; add Serper `/news`.
   - Add **`read_page(url)`**: an SSRF-safe fetch through the existing `safeGetText`, with size/time caps, HTML → text, injection sanitising, DATA fence, own per-turn budget. Allowed only for URLs that came from a search result this turn.
6. **Evidence ledger.**
   - Normalise every tool result into `EvidenceItem { id, entity?, field?, value, kind: FACT | INFERENCE | UNKNOWN | CONFLICT, source{ provider, url?, host?, retrievedAt }, scope: entity | area }`.
   - CONFLICT is computed **by code** (same entity + field, differing values from different sources).
   - The model reads a compact ledger with ids, and guards check claims against the ledger.
   - It unifies the three existing vocabularies (it extends `evidenceProvenance`).
7. **Guards: from delete to downgrade.**
   - When a claim is unsupported but reasonable (inference), rewrite it as hedged inference ("có thể…", "theo kinh nghiệm chung"); delete only fabricated *facts* (prices, hours, ratings, availability, links).
   - Add an agent empty-reply floor.
   - Record every guard action in the trace.
8. **Ranking/pick out of tools** (agent flag only):
   - Tools return filtered, deduped, neutrally sorted rows with evidence.
   - Luna picks and explains the trade-offs.
   - The card order still follows the bold-name order Luna writes (existing mechanism).
9. **Agent context completeness:** add user memory / preferences / style (fenced DATA, existing `memoryBlock` source) and the active task.
10. **Tool catalog + deferred discovery:**
    - one registry module (name, group, schema, executor factory, cost class, side-effect flag);
    - a core set always exposed;
    - `find_tools(need)` returns further schemas, which are enabled for the next round.
    - Replaces the hard-coded subsets.
11. **Tracing:**
    - `AgentTrace { runId, turnId, sessionHash, flags, steps[ {model, role, effort, ms, tokens, usd, fellBack} ], tools[ {name, why, args (redacted), ms, outcome, credits, evidenceIds} ], task delta, guards[ {name, action, sentencesRemoved, hedged} ], final {status, stopReason, chars}, latency, cost }`.
    - Emitted as one structured record to Cloud Logging (existing sink).
    - `runId` is added to `tappy.turn.v1` for support and debugging.
    - A DB table is optional (Decision D6).
12. **Eval:**
    - an agent trajectory harness: scripted-model unit tests in CI, plus a replay suite with `TAPPY_AGENT_V2=1` on Luna with recorded Serper;
    - metrics: tool selection, rounds, ask rate, guard deletion rate, empty replies, contract validity (`[TAPPY_PLAN]` parses, card fold), latency p50/p90, cost/turn;
    - an LLM-judge rubric is optional and offline only.

**Do not** adopt OpenAI hosted `web_search`:
- it needs the Responses API (the adapter is `.chat()` only);
- it bypasses `guardToolOutput`, the Serper budgets and the link allow-list;
- Luna's acceptance of it at non-`none` effort is unverified.

Our Serper search + `read_page` gives the same capability inside the security boundary.

---

## Target architecture (maps onto the requested flow)

```
                 ┌──────────────────────── route.ts (thin) ────────────────────────┐
request ──► auth · quota · rate limit · input validation · language · GPS · memory load
                 │                                                                   │
                 ▼                                                                   │
        Conversation State  = chatSessionState v2 { task, cards+facts, pending action, flight/movie/plan, rejected }
                 │            + client history (trimmed) + memory/prefs (DATA)         │
                 ▼                                                                   │
        runAgentTurn (src/lib/ai/agent/runtime)                                      │
          system  = AGENT_SYSTEM (stable, cached) + code context (clock, calendar, GPS city)
          data    = fenced DATA: task, app state, memory, evidence ledger summary
          loop ┌────────────────────────────────────────────────────────────┐
               │ Luna step (role agent, effort none w/ tools)                │
               │   → text  (answer)                → finish                  │
               │   → ask_user{q, why, choices}      → finish (ask)           │
               │   → update_task{delta}            → code validates → state │
               │   → tool calls (web_search, read_page, search_places, …)   │
               │        input guard → budget/dedupe → execute (deterministic │
               │        filters inside) → output guard → Evidence Ledger     │
               │        → 9:/a: frames → tool message                       │
               │   budgets (rounds/credits/time) exhausted → forced final   │
               └────────────────────────────────────────────────────────────┘
          final step (no tools; may use reasoning effort low)  → Decision + Response
                 │
                 ▼
        Stream filter (existing) — ledger-aware guards (hedge > delete), cards, maps, plan, links
                 │
                 ▼
        Tappy Card / Make Plan / Map / Actions / Text   (contracts unchanged)
                 │
                 ▼
        AgentTrace record (Cloud Logging) · state patch saved · cost line
```

**Ownership:**
- **Luna:** meaning, whether to search, which tool, queries, when to search again, when to ask, task deltas, trade-offs, pick, tips, explanation.
- **Code:** schemas, validation and normalisation of task deltas, dates, distance and budget math, hard filters, dedupe, evidence typing and CONFLICT detection, link authority, security guards, budgets, quotas, side-effect confirmation, trace.

**Flags and rollback:**
- New runtime behind `TAPPY_AGENT=2` (or `TAPPY_AGENT_V2=1`). `TAPPY_AGENT=1` stays the Phase 7 agent; unset stays legacy Consultative.
- Rollback is an env change only.
- Image and clip turns keep the legacy path until the agent gets vision (a later, separate step).

---

## O. Migration plan (minimal, each step its own reviewable commit, all behind the new flag)

| Step | Change | Touches | Done when |
|---|---|---|---|
| **M0 Baseline** | Agent trajectory eval harness (scripted + replay with `TAPPY_AGENT=1`); define metrics; record Phase 7 agent baseline. Fix the `presearch` import coupling (move `searchingFrame` to `progressAnnotation`). | `scripts/consult/replay` (agent mode), `agent/index.ts` import | baseline numbers stored; 0 behaviour change; full suite green |
| **M1 Runtime core** | `agent/runtime/`: loop v2 (rounds + credits + time budgets), control tools `ask_user`, `update_task` (intercepted), `agent` LLM role with real abort on timeout, `AgentTrace` record + `runId` in `tappy.turn.v1` | `agent/`, `llm/registry.ts`, `llm/fallback.ts` (abort), `turnCost.ts` | new loop unit tests (iterate, ask, budgets, abort, trace); existing agent tests still pass on v1 |
| **M2 Task state** | `chatSessionState` v2 `task` (+ migration of reader, size cap); validation/normalisation; DATA rendering; memory/prefs into DATA | `chatSessionState.ts`, `agent/prompt.ts`, route wiring | multi-turn tests: follow-up mutates task, task switch, constraint change, rejected carry |
| **M3 Search** | `web_search` enrich (date/host/position, `/news`); `read_page` (SSRF-safe, budgets, sanitize); Evidence Ledger builder (code), CONFLICT detection | `tools/common.ts`, `serperClient`, new `agent/evidence.ts`, `agent/guards.ts` | tests: search → read → search again; injection in page text; conflict detection; budget refusals |
| **M4 Guards → ledger** | Agent-mode guards consult the ledger; unsupported inference → hedge rewrite; facts still deleted; empty-reply floor; guard actions traced | `streamEnrichment.ts` (agentMode branches only), placeClaim / hours / unsupportedClaim | prior incident fixtures (card #2, recipe, c40) keep ≥ 90 % of text; no fabricated fact passes (existing guard suites green) |
| **M5 Ranking out of tools** | Agent-flag tools return filtered + neutral-sorted rows; no code pick/brief; Luna picks | `route.ts` `rankForModel` call sites (flag-gated) | card fold/order tests; replay quality ≥ baseline |
| **M6 Tool catalog** | Single tool registry; core set + `find_tools` deferred discovery | new `agent/catalog.ts`, route tools moved behind factories | schema tokens per step measured and reduced; same tool behaviour |
| **M7 Cutover prep** | Route slimming for flag 2 (skip consult work); replay + eval gate; owner UAT on preview | `route.ts` | eval ≥ baseline on all suites; latency/cost within guard rails; owner OK |
| *later, separate* | Vision/clip turns via agent → retire consult-only modules (§K) + update lock tests | | owner decision |

Not in scope (other Phase 8 features): payments, now-showing links (already landed), scam scenarios, Android/iOS changes, streaming tokens of the final answer (possible later: the guards buffer anyway).

---

## Addendum 2026-10-08 — Spec v2 (WEB ONLY) comparison, decisions recorded, risks

### Decisions resolved by the spec v2

| # | Decision | Resolution |
|---|---|---|
| D1 | Production `TAPPY_AGENT` | **Inspected (names only, `vercel env ls production`): `TAPPY_AGENT` is NOT set, and no `LLM_*` or `CONSULT_*` variable is set.** Production runs the **legacy Consultative path on Luna** (all code defaults). `SERPER_CACHE_V2` is set (value not read). Nothing was changed. |
| D2 | Lock tests | Allowed when they protect obsolete Phase 7 behaviour. Each change records original expectation → why obsolete → new expectation → reason. |
| D3 | Stored task state | **Required** (spec §10, §23). |
| D4 | Budgets | Hard ceilings: rounds ≤ 6, tool calls ≤ 8, Serper ≤ 12 (travel ≤ 15), deadline ≤ 85 s. These are ceilings, not targets. |
| D5 | `read_page` | Any public page, with strict SSRF/DNS-rebinding/redirect/size/time/content-type protection; no small allow-list. |
| D6 | Trace sink | Cloud Logging only for M1–M7; no DB table. |
| D7 | Hosted OpenAI web search | Not used. Tappy keeps its own search stack. |
| D8 | iOS `chatSessionId` | Not touched. Web uses `chatSessionId`; mobile is a future reference item only. |
| — | Flag | New runtime = `TAPPY_AGENT=2`; `1` = Phase 7 agent; unset = legacy (production). |

### Spec v2 vs current Web implementation

| Spec § | Requirement | Current | Reuse / replace |
|---|---|---|---|
| 3–4 | One loop: answer / ask / tool → result → "đủ chưa?" → respond | `runBoundedAgent` has answer + tool + forced final; no ask action; legacy Consultative path also live | **Reuse** the loop skeleton; **add** `ask_user`; **replace** budgets |
| 5 | Search first-class, optional | `web_search` (Serper `/search`, 6 snippet rows) + domain tools; the prompt already says "don't search for static knowledge" | Reuse; enrich results (date, host, position, news) |
| 6 | Iterative search → open → evaluate → search again | ≤ 3 tool invocations, no open/read | **Replace** budgets; **add** `read_page` |
| 7 | Practical intelligence and proactive advice | `MẸO THỰC TẾ` prompt section; tips guard; no page reading, so research depth is shallow | Prompt and capability (no engine); measured in eval (topic coverage) |
| 8 | Evidence ledger (source + FACT/INFERENCE/UNKNOWN/CONFLICT + claim/confidence) | 3 vocabularies; no CONFLICT; no source reliability | **New** `agent/evidence.ts`, extending `evidenceProvenance` |
| 9 | Code = hard constraints and integrity; Luna = semantic ranking | Code `rank` / `pick` / `shortlist` / `brief` inside tools | **Replace** under flag 2 (filter + neutral sort only) |
| 10, 23 | Persistent task state, distinct from conversation | Slots only; "never stored" lock | **New** `task` in `chatSessionState` v2 |
| 11 | `chatSessionId` | Web sends it; route stores state only with it | Reuse; flag 2 without an id → task lives for the turn only (no guessing) |
| 12 | Budgets + real cancellation | 3 calls; 8 s consult timeout via `Promise.race`, no abort | **Replace**: `agent` role, abort on timeout, no blind retry after a partial |
| 13 | Secure page reading | `security/safeFetch.ts` `safeGetText`: one pinned DNS resolution (`createSafeLookup` refuses if ANY address is disallowed), redirects validated hop by hop, credentials-in-URL refused, `maxBytes`/`stopAt`, `agent:false`; `addressPolicy.isAllowedDestinationAddress` | **Reuse** the core. **Add:** content-type allow (html/text/json/xml), connect/read timeouts, http:// support through the same pinned lookup (today HTTPS only), HTML→text extraction, injection sanitising + DATA fence, per-turn page budget, no crawl chains (only URLs from this turn's search results or the user's own message) |
| 14 | Ask only when material | Agent prompt rule + regex `plannerNeedsDestination` gate; legacy clarify gate | Luna decides via `ask_user`; the regex gate is retired under flag 2 |
| 15 | Registry + deferred tools | Inline in `route.ts`; ~13 schemas on every step | **New** catalog (M6) |
| 16 | Card / Plan / Map / Actions preserved | Contracts in §I; work from the agent | Keep; cards still come from tool frames + bold-name order |
| 17 | Structured trace (trace / conversation / task / message ids, per-tool hash, query, result count, evidence count, decision, latency, tokens, cost, errors, output type) | `tappyai_agent_trace` has a subset; no ids, no evidence, no guard actions | **Replace** with an `AgentTrace` record (Cloud Logging) |
| 18 | M0 baseline … M7 gate | No agent eval | M0 = `scripts/agent-eval` (this addendum) |
| 21 | Security layer | input/output guards, DATA fences, side-effect confirmation, quotas, Serper ceilings | Reuse; add page-content fencing, loop/cost ceilings, tests |
| 24 | General purpose | Agent prompt lists domains as examples; tools are domain tools + `web_search` | Keep the general prompt; `web_search` + `read_page` cover "anything else" |

### Migration risks (new)

1. **The legacy path is production.** Any change to SHARED code (tools, `streamEnrichment` guards, `chatSessionState`, `llm/` fallback) reaches production on the next deploy, so every behavioural change in shared code must be gated on `TAPPY_AGENT=2`.
   - The `llm/fallback` abort fix is the single exception worth shipping to all paths (it is a correctness and cost fix). It still needs owner OK before any deploy.
2. **Luna tool steps run at `reasoning_effort=none`** (API constraint). Research strategy is decided by the cheapest reasoning tier, so "đủ chưa?" quality depends on the prompt plus evidence summaries. Mitigation to measure in eval: allow the tool-less final step (and an optional mid-loop reflection without tools) at `low`.
3. **Guards rely on `9:`/`a:` frames.** New tools (`read_page`) must emit frames whose evidence shape the guards understand, or the guards will treat page facts as unsupported.
4. **Card fold depends on bold names matching tool rows.** If Luna picks semantically, it must still bold the exact row names (existing contract).
5. **About 30 tests regex the `route.ts` source.** Route slimming (M7) will touch many of them; each needs the D2 change record.
6. **KV is absent locally and in tests** (in-process Map fallback), so task persistence must be tested against the Map and the KV adapter separately.
7. **Page reading cost and latency:** a slow page can eat the turn. It needs a per-page timeout of ≤ 8 s and a per-turn page budget, counted inside the 8 tool calls.
8. **Eval cost:** a live baseline uses Luna + Serper. It is kept small: Serper recordings are replayed, and only new queries hit Serper once.

---

## Owner decisions needed before coding (original list — see resolutions above)

- **D1. Production `TAPPY_AGENT` value.** Is production on the Phase 7 agent or on the legacy Consultative path? Please check Vercel. This decides the baseline for M0.
- **D2. Lock tests.** May I update `architectureLock.test.ts` and `consultativeArchitecture.test.ts` (the `AI.step`/route literals, the "never stored" rule, the D3 module names) where the new runtime requires it? Each change would be listed in its commit.
- **D3. Stored task state.** This reverses the current "need profile / stage / trip context never stored" policy for the agent path (stored per session in KV, 30 d TTL, owner-hashed key). OK?
- **D4. Budgets.** Proposed defaults: ≤ 6 model rounds, ≤ 8 tool invocations, Serper ≤ 12 credits per turn (15 for trips), `read_page` ≤ 3 per turn, turn deadline 85 s, p50 target ≤ 8 s for no-tool turns. Please adjust.
- **D5. `read_page`.** Outbound fetch of arbitrary result URLs (SSRF-guarded, text-only, size-capped). OK, or allow-listed hosts only?
- **D6. Trace sink.** Cloud Logging only (no migration), or also a Supabase `agent_runs` table (needs a migration; you apply it)?
- **D7. Hosted OpenAI web search.** Recommendation: **no** (it bypasses the guards and budgets, and needs the Responses API).
- **D8. iOS `chatSessionId`.** Without it iOS gets no task state. iOS is frozen, so this is noted only, not part of this task.
