# Phase 8 — M0 Baseline (WEB)

Date 2026-10-08 · worktree `D:/TappyAI-wt/wtagent8` · branch `p8/agent-runtime` (local, from `origin/main` f9f2b12) · **no runtime code changed**.

## What M0 is

A behavioural eval harness for the web chat route, plus a recorded baseline of the two paths that exist today:
- **legacy:** `TAPPY_AGENT` unset. This is **production today**: listing the Vercel production env NAMES on 08/10 showed no `TAPPY_AGENT`, `LLM_*` or `CONSULT_*`. No value was read or changed.
- **agent1:** `TAPPY_AGENT=1`, the Phase 7 bounded agent.

The same harness will score `agent2` (`TAPPY_AGENT=2`) from M1 on and is the gate for M7.

Harness:
- `scripts/agent-eval/` (README there).
- 24 scenarios / 30 turns across: direct knowledge, current data, local + multi-turn task, clarification, practical decision support (used MacBook, phone comparison, used motorbike, Wi-Fi troubleshooting), travel + task, factual research, and security (injection planted in search results, a prompt-leak request).
- Real route, real Luna (production defaults), real tools, Serper record/replay.
- Run: `results/` at `scripts/agent-eval/out/eval-2026-10-08T01-53-18-523Z/` (git-ignored; 30 turns × 2 modes, 5.5 min).
- Cost of the run: 58 real Serper calls (now recorded), 114 Luna calls, **$0.158 total** by the route's meter.

## Baseline

| metric | legacy (prod) | agent1 (Phase 7) |
|---|---|---|
| turns passing all checks | **18/30** | **27/30** |
| tool choice (no tool for knowledge, tool for current data) | 17/21 | 20/21 |
| asks when material | 2/3 | 2/3 |
| no needless ask | 17/19 | 19/19 |
| task continuity on follow-ups | 1/3 | 3/3 |
| no re-ask of known slots | 3/3 | 3/3 |
| practical coverage (topics a careful researcher surfaces) | 6/10 | 9/10 |
| output kind as expected | 2/6 | 6/6 |
| injection canary / crash / empty | 0 / 0 / 0 | 0 / 0 / 0 |
| tools per turn mean · max · zero-tool turns | 0.53 · 2 · 15 | 0.70 · 4 · 13 |
| model calls per turn mean · max | n/a | 1.66 · 3 |
| latency p50 · p90 · max | 4.3 · 9.3 · 12.6 s | 4.0 · 9.9 · 18.9 s |
| USD per turn (model + Serper) | $0.00284 | $0.00242 |
| guards changed the reply (turns) | 4 | 3 |
| share of model text kept by guards: mean · min · turns < 60 % | 0.96 · 0.17* · 1 | 0.91 · 0.35 · 2 |

\* legacy T-3 t2: the "cut" is the egress guard turning a raw link into its label (length only, not content loss).

## Findings that drive M1–M5

1. **Legacy (production) fails the general-agent behaviours.**
   - It searches places for a static question (D-1, "phở bò vs phở gà" → `search_places` + cards).
   - It asks instead of acting when GPS and the area are known (L-1, L-2).
   - It turns a 3-day trip request into a question (T-1).
   - It loses constraints on follow-ups ("Quận 1" lost in L-1 t2; "1 triệu" lost in T-1 t2).
   - It misses practical coverage (P-2, P-4, T-2).
   - It answers the Wi-Fi troubleshooting question with a question (P-4).
2. **The Phase 7 agent is the right base.** 27/30, cheaper, same latency. Its misses:
   - **Q-1 "Mua laptop nào tốt?":** it searched products and showed cards instead of asking about use and budget. The guards then cut 29 %.
   - **P-2 phone comparison:** one product search, 18.9 s, little trade-off content (no battery / OS / updates). **There is no research iteration and no page reading;** comparisons need more than shopping rows.
   - **F-2 manufacturer spec:** answered from memory with no source. For a spec question a sourced answer is better (read the manufacturer page). This needs `read_page` and source-aware evidence.
3. **Research depth is shallow on both paths.**
   - At most 3 model calls and 4 tool frames per turn.
   - No page was opened in any of the 60 turns: no tool exists to open one.
   - No scenario could exercise CONFLICT, because evidence has no source dimension → M3.
4. **Destructive and silent guards (M4 + M1 tracing):**
   - **agent1 L-1 t2:** the model's useful sentence (two options in the 200–300 k band plus "call to confirm the air conditioning") was **deleted**, and only the hedge survived (36 % kept). **No guard logged the removal.** `place_claim` already saw a 1-sentence text, so an untraced guard upstream of it cut the sentence: likely the snippet-price or money guard, to be confirmed in M4. This is both a destructive-guard case and a tracing gap.
   - **agent1 Q-3:** `place_claim` deleted "cho mình biết giờ đến và số người…" as an *ordering* claim (a false positive), so the clarifying question lost its substance (35 % kept).
5. **Clarification is not a first-class action.** The only reliable ask is the canned regex planner question (Q-2). Q-1 shows the model will not ask on its own when a tool is available → M1 `ask_user`.
6. **Harness limits (stated, not hidden):**
   - Weather, gold, RSS and page fetches are stubbed to `{}`, so those turns score behaviour only.
   - Checks are coarse, folded substrings.
   - One run per mode, so the variance is not measured yet. M7 gate runs will repeat ×2.

## M0 deliverables

| file | purpose |
|---|---|
| `scripts/agent-eval/lib/checks.ts` | pure behavioural checks (tool choice, ask, continuity, re-ask, practical coverage, output kind, plan contract, canaries, kept ratio) |
| `scripts/agent-eval/lib/report.ts` | per-mode aggregation and markdown report |
| `scripts/agent-eval/lib/checks.test.ts` | 13 unit tests (CI, no keys) |
| `scripts/agent-eval/scenarios.json` | 24 scenarios / 30 turns |
| `scripts/agent-eval/agentEval.test.ts` | live runner (`AGENT_EVAL=1`, paid, opt-in; skipped in CI) |
| `scripts/agent-eval/rescore.test.ts` | re-score a finished run without re-buying replies |
| `scripts/agent-eval/README.md` | how to run, what is real, what is scored |
| `.gitignore` | `/scripts/agent-eval/out/` |
| `docs/phase8/AGENT-RUNTIME-AUDIT.md` | audit + spec v2 addendum (decisions D1–D8 resolved, risks) |

During M0 one checker false negative was found and fixed: a question followed by an offer counts as asking. It is pinned by a test, and the baseline was re-scored offline.

## M1 gate targets (agent2 vs agent1 on this set)

- `asks_when_material` 3/3.
- No regression on `no_needless_ask`, `tool_choice`, `task_continuity`, `no_canary`.
- Every guard action traced: 0 silent removals.
- Model rounds ≤ 6, tool calls ≤ 8, Serper ≤ 12 (≤ 15 travel), deadline ≤ 85 s, enforced and visible in the trace.
- No duplicate model billing on a timeout (unit-tested abort).
