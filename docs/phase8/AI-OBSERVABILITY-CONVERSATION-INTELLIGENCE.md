# Phase 8 — AI Observability / Conversation Intelligence (workstream design, NOT implemented)

Status: DESIGN + DEPENDENCIES. Nothing here is built by the Agent Runtime work. It is a separate workstream attached to Tappy Controller (`docs/controller-v2/`), with its own owner decisions. It adds no agent, model or domain-agent: Luna 6.0 stays the only brain; this workstream only observes, labels and evaluates.

## 1. What already exists (reuse, do not rebuild)
| Building block | Where | What it already gives |
|---|---|---|
| Agent run trace | `src/lib/ai/agent/runtime/trace.ts` (`AgentRunTrace`, log type `tappyai_agent_run_trace`) | per turn: trace/conversation/task/message ids, flag, provider/model/role, every model round (decision, tokens, usd), tool calls (hashed + redacted query), tool results (state, count), timeouts/retries/budget refusals, ask, guard changes, claims/ranking summaries, Serper ledger, final output type, answer-first check |
| Turn cost | `tappyai_turn_cost` / `tappyai_usage` logs | tokens, model usd (estimated from usage), `serperCalls`, cache hits |
| Serper request ledger | `tools/serperMeter.ts` | per endpoint attempted / ok / error classes / refused, estimated vs provider-reported credits (never billing-reconciled automatically) |
| Event + sink | `@/lib/observability` (`recordEvent`, `cloudLogging` sink) | structured events with redaction (`sanitizePayload`) |
| Eval assets | `goldenCapture`, replay harness (`scripts/consult/replay`, 4,332 Serper recordings), `scripts/agent-eval` | regression datasets and scorers |
| Controller V2 | `docs/controller-v2/` (audit chain, event bus contract, RBAC, typed config) | the place for governed access, retention and event transport |

## 2. Required capabilities (target) and gap
1. **Identifiers**: conversation id, message id, turn id, task id, trace id. *Exists in the trace; no durable store.*
2. **Prompt/response trace per turn with sensitive data protected**: prompt versions (hash + version label), tool schemas hash, assistant text, redacted user text. *Today only hashes/short redacted queries are logged; full text storage is a consent/legal decision (E4).*
3. **Model/provider, intent, entities/slots**: *model/provider exists; task state (constraints, preferences, entities) exists in `task.ts`, not exported for analysis.*
4. **Tools, retrieval/evidence references, cache hits**: *tool calls/results + evidence refs + L1/L2 hit counters exist; not joined into one record.*
5. **Latency, tokens, estimated / provider-reported / billing-reconciled cost, errors**: *first two exist; reconciliation needs the Serper Activity Log (manual today).*
6. **User feedback and behaviour signals** (thumbs, regenerate, follow-up, correction, abandonment): *`user_events` exists on Phase 7 main for product analytics; no link to a trace id.*
7. **Failure-pattern classification**: taxonomy (ask-first, tool-first-no-advice, duplicate lookup, unverified claim, guard-removed content, timeout, wrong-card…) — *already named in UAT reports; no automatic labeller.*
8. **Review/labeling workflow**: a queue for a human reviewer (Controller admin) with verdict + failure label + note.
9. **Optimization dataset/lab**: promote labelled turns into replay/eval sets; run prompt/orchestration variants offline (as the model-only probe did by hand) and compare ASK/ANSWER/TOOL rates and quality.

## 3. Proposed shape (for owner review)
- A single append-only `ai_turn_trace` record per turn (JSON, schema versioned) written from the existing `AgentRunTrace.final` hook, plus child rows for tool calls and feedback, keyed by the existing ids. Redaction at write time (reuse `sanitizePayload`, `cutSecrets`, URL/e-mail/number stripping used by the probe harness); user text stored only as a salted hash + length + coarse features unless consent allows more.
- Retention and access through Controller V2 (RBAC + audit chain); no raw-prompt access for roles without a reason code.
- Labeling UI in the existing admin area; labels feed an `eval_case` table that the replay harness reads.
- Cost: provider-reported credits and estimates stored separately; a `billing_reconciled` field is filled only by an explicit import of the provider's log.

## 4. Dependencies / owner decisions (block build, not design)
- Storage: Supabase table vs. log sink + warehouse (volume, retention, cost).
- Consent / legal (E4 analytics consent): what conversation text may be stored, for how long, who may read it.
- PostHog keep/remove (E1) — decides the product-analytics side.
- Which environment hosts the lab (UAT/audit only first).

## 5. Out of scope here
No second agent or model for observability, no storage of secrets/private identifiers, no implementation in the Agent Runtime diff. First deliverable after approval: schema + redaction policy + the single write hook, behind a flag, UAT environment only.

## 6. Definition of done for the workstream
Every Agent turn in UAT yields exactly one redacted, versioned trace record joinable to feedback; failure labels can be applied by a reviewer; a labelled set can be replayed against a prompt/orchestration variant and produce an ASK/ANSWER/TOOL and quality comparison without live Serper spend.
