# Phase 8 agent eval (WEB)

M0 baseline and the regression gate for the Phase 8 agent runtime. One scenario set (`scenarios.json`) is run through the
**real** `POST /api/chat` on every path:

| mode | flag | what it is |
|---|---|---|
| `legacy` | `TAPPY_AGENT` unset | the Luna Consultative path — **what production runs today** (verified 08/10 by listing Vercel production env NAMES: no `TAPPY_AGENT`, no `LLM_*`, no `CONSULT_*`) |
| `agent1` | `TAPPY_AGENT=1` | Phase 7 bounded agent |
| `agent2` | `TAPPY_AGENT=2` | Phase 8 runtime (from M1 on) |

## Run (paid — Luna + new Serper queries)

```sh
AGENT_EVAL=1 AGENT_EVAL_MODES=legacy,agent1 npx vitest run scripts/agent-eval/agentEval.test.ts
AGENT_EVAL=1 AGENT_EVAL_MODES=agent2 AGENT_EVAL_ONLY=P-1,L-1 npx vitest run scripts/agent-eval/agentEval.test.ts
```

- Keys: `SERPER_API_KEY` from the AUDIT env file (refuses any other Supabase ref) and the OpenAI key from
  `D:/TappyAI-backups/openai-key.txt`. Neither is printed.
- Network: the replay fetch stub (`scripts/consult/replay/lib/serperReplay.ts`). Serper requests are recorded into the
  shared `scripts/consult/replay/recordings/`; a recorded query never costs again. OpenAI passes through. **Every other host
  gets `{}` locally**, so weather (wttr.in), gold (vang.today), RSS news and any page fetch return nothing in this harness.
  Scores for those tools measure *behaviour* (did it pick the right tool, did it say honestly that data is missing), not data.
- Flags: production defaults (no `LLM_*`, `CONSULT_LUNA*` unset ⇒ ON, `CONSULT_V2=1`, `CONSULTATIVE_V1=1`; the vitest
  setup pins these OFF for old suites, so the harness sets them back). KV is off (in-process session state).
- Pre-guard text: the golden-capture header (non-production sink) records the model's raw reply, so the report shows how
  much of the model's answer the guards kept.
- Output: `scripts/agent-eval/out/eval-<ts>/` (git-ignored): `summary.md`, `results.json`, `raw/<mode>-<id>-t<n>.json`.

## What is scored (`lib/checks.ts`, pinned by `lib/checks.test.ts`, which runs in CI)

Behaviour from the Phase 8 spec, the same on every path:

- `tool_choice`: no tool for static knowledge, a tool for current data, the right tool family.
- `asks_when_material` / `no_needless_ask`: ask only when it matters.
- `task_continuity`: follow-ups keep earlier constraints (reply or tool args).
- `no_reask`: don't re-ask what is known.
- `practical_coverage`: the points a careful researcher surfaces (e.g. used MacBook: battery cycles, Activation Lock, MDM…).
- `output_kind`: text / cards / plan / ask.
- `plan_contract`: `[TAPPY_PLAN]` parses with `days[]`.
- `no_canary`: injected text never obeyed.
- `non_empty`, `no_crash`.

Plus per-turn metrics: tools, model calls (agent trace), latency, first-text time, USD, Serper calls, guards that changed
the reply, and the share of the model's text the guards kept.

The scenario expectations are deliberately coarse (folded substrings). Fine-grained quality judgement stays with owner UAT.
