# Phase 8 M6: tool registry, Step 0 audit

Branch `p8/agent-runtime` (worktree `wtagent8`), base `77e8563` (M5). **Web only.** Read-only audit; no product code was changed for it.

## 1. How tools reach Luna today (TAPPY_AGENT=2)

- **Definitions (one canonical source each):**
  - the route builds the production tools (`src/app/api/chat/route.ts`, `tools = gateTools(timeTools({...}))`);
  - `buildAgentTools` (`agent/index.ts`) adds the agent-only tools: `get_now_showing`, `get_movie_showtimes`, `get_trip_data`, `request_action`;
  - the runtime (`agent/runtime/index.ts`) replaces `web_search` with the research version (M3) and adds `read_page` and the control tool `ask_user`.
- **Schemas:** `toModelSchemas` copies each tool's description + Zod parameters (+ `why`). Side-effect tools (`save_price_watch`)
  are never offered.
- **Every non-final model round receives ALL of them** (`runAgentRuntime({ schemas })`, `AI.step({ tools })`). The final round
  receives none.
- **Execution (`runtime/loop.ts`):**
  - by name against the full tool map;
  - `guardToolInput` (disallowed / side-effect, length caps, secret shapes);
  - budgets (8 calls, deadline), de-duplication;
  - `runTool` (Serper per-tool scope), timeout / cancellation;
  - `guardToolOutput` (keys, instruction text, fencing);
  - `onToolResult` → the `9:` / `a:` frames the cards, guards (M4) and ranking (M5) read by **tool name**.
- **Permissions:** the route's tool set already depends on the turn (`locationIntent`, flags); `request_action` parks a side effect
  for user confirmation (`canConfirmActions`); `SIDE_EFFECT_TOOLS` are never executable by the agent.
- **No deferred mechanism exists.**

## 2. Measured per model round (real route, direct question "15% của 800 là bao nhiêu?")

Schema size = tool description + its JSON schema as the AI SDK serialises it (`asSchema(parameters).jsonSchema`, includes `why`), in characters.

| Tool | Current file | Purpose | Schema size | Always needed? | Security sensitivity | Candidate for deferred loading | M6 action |
|---|---|---|---:|---|---|---|---|
| `web_search` | route.ts + runtime/researchSearch.ts | web search, 1–3 queries, opens pages (M3) | 1,272 | **yes**: the general research path | read; Serper budget; result sanitising | no | **core** |
| `read_page` | runtime/readPage.ts | read 1–3 pages from this research (M3) | 1,261 | **yes** (research; user links) | read; SSRF-safe fetch, URL allow-list | no | **core** |
| `ask_user` | runtime/controlTools.ts | clarifying question (control) | 974 | **yes** (offered unless a question is pending) | control | no | **core** |
| `search_places` | route.ts | places / food / venues near the user | 892 | most frequent tool (34 of 90 agent eval turns) | read; constraint filter, hard gates | no | **core** |
| `search_products` | route.ts | products / prices / shops | 513 | no (8 of 90) | read; shopping validity | yes | deferred |
| `get_hotel_prices` | route.ts | hotels | 711 | no (5) | read; budget filter | yes | deferred |
| `get_flight_prices` | route.ts + agent fare labels | flights / fares | 1,036 | no (4) | read; fare verification labels | yes | deferred |
| `get_transport_options` | route.ts | coach / train / taxi estimates | 1,028 | no (0) | read | yes | deferred |
| `get_trip_data` | agent/index.ts | trip bundle (hotels + sights + food) | 798 | no (3) | read; per-part Serper caps | yes | deferred |
| `get_weather` | route.ts | weather | 540 | no (2) | read | yes | deferred |
| `get_gold_price` | route.ts | gold price | 461 | no (1) | read | yes | deferred |
| `get_news` | route.ts | news | 391 | no (1) | read | yes | deferred |
| `get_now_showing` | agent/agentTools.ts | films showing today | 674 | no (1) | read | yes | deferred |
| `get_movie_showtimes` | agent/agentTools.ts | a film's showtimes | 857 | no (0) | read | yes | deferred |
| `request_action` | agent/agentTools.ts | propose a confirmed side effect (save / watch) | 690 | no (0) | **side-effect gateway**: parked until the user confirms | yes | deferred; its own confirmation gate unchanged |
| **total** | | **15 schemas** | **12,098** | | | | |

For comparison, the shared system prompt is 13,547 characters. Tool schemas are ≈ 47 % of the fixed per-round prefix.

## 3. Constraints that shape the design

1. **Prompt cache.** OpenAI caches the request prefix (tools → system → messages). A tool list that changed from round to round
   would miss the cache every time it changed. So the tool set is chosen **once per turn** and kept for every round of that turn.
2. **Tool names drive the product.** Cards, M4 guards and M5 ranking read results by tool name (`9:` / `a:` frames), and the trace
   and task research log record tool names. A deferred tool must still execute and report under its OWN name.
3. **No extra model round for discovery** (spec Step 9): Luna must be able to call any deferred tool in the same step it decides to.
4. **One canonical schema:** the registry may hold metadata only; the call's arguments are validated against the tool's own Zod
   parameters.

## 4. Decision

- **Core (full schema every round):** `web_search`, `read_page`, `ask_user`, `search_places`.
- **Per-turn preselection (no model call):** deferred tools whose capability hints match this turn's message, the user's recent
  messages, or the tools the task used last turn get their full schema for this turn.
- **The rest:** one core tool `use_tool` whose description lists each remaining tool as a one-line capability with a compact signature
  **derived from its canonical schema**. Luna calls `use_tool({ tool, args })` in the same step.
- The runtime **resolves** the call to the real tool **before** any guard:
  - the tool must be a deferred tool in this turn's tool map;
  - its arguments must pass its own Zod schema;
  - it then goes through the same input guard, budgets, de-duplication, Serper scope, timeout, output guard and frames, under its
    own name.

  A failure (unknown / unavailable / not allowed / invalid arguments) returns a structured `tool_unavailable` /
  `invalid_arguments` result with the signature; nothing is fabricated.
