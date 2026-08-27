# ADR-024 — Decision Evidence State

**Status:** Accepted (owner approved 2026-08-24)
**Supersedes:** the KEEP-RC stateless decision of 2026-08-20 (V2-UAT-002), **narrowly**
**Scope:** shopping decision facts only. Not conversation persistence.

---

## 1. The original decision, and why it was reasonable

On 2026-08-20 two complete implementations of the consultative flow existed:

- **RC** — stateless. Need, decision stage and trip context are re-derived from message history every turn.
- **D3** — Redis-persisted conversation state, pre-search gates, deterministic non-LLM replies.

The owner chose **KEEP RC**, for a stable release on the minimum necessary architecture with no unverified dependency. That was recorded in `src/lib/ai/consultativeArchitecture.test.ts` — assertions that fail if the decision is quietly reversed — because nothing in `/api/chat` otherwise says "there is deliberately no state here".

The reasoning was sound for what it covered. Need, stage and trip context **are** functions of what was said, so a store could only add staleness.

## 2. The production evidence that invalidated the premise

The premise did not hold for one class of data. Two authenticated production UAT sessions against `7deee03` ran the follow-up *"Trong các lựa chọn trên, bạn chọn cái nào cho tôi?"* and measured:

| the reply said | the evidence said |
|---|---|
| "khoảng **28-29 triệu**" | **24,490,000** |
| "**Google Maps** 4.8⭐" | product rating **4.7** |
| "các shop khác cao hơn **1-2 triệu**" | **+509k / +1.31M / +3.5M / +5.06M** |
| "danh giá thấp hơn" | all six rows rated **4.7** |

That turn made **zero tool calls** — the correct behaviour, and the entire problem.

Product facts were never in the conversation to re-derive. Price, rating, RAM and condition arrive in a `tool` message, and `clientInput.ts` restricts clients to `user` and `assistant` roles, so that message cannot come back. The model was asked to restate facts that had been deleted. **Fabrication was the only available outcome.**

Two prompt-only fixes preceded this ADR:

- **#171** — rules about scope and configuration equivalence. Still violated in production, 3/5 runs.
- **#172** — a rule about condition/provenance. Still violated, **5/5 runs**.

A rule cannot restore absent data. That is the finding.

## 3. Why follow-up grounding requires state

Only three mechanisms could put the facts back in front of the model, and two were rejected on their merits:

| option | verdict |
|---|---|
| Client echoes the evidence back | **Rejected.** A page could then dictate the price the assistant quotes. It also breaks the role boundary `clientInput.ts` exists to hold. |
| Re-search on every follow-up | **Rejected.** Destroys the confirmed-good "0 unnecessary tool calls", adds latency and provider cost, and returns *different* rows — so the answer would contradict the previous turn. |
| **Server-side state, server-written** | **Accepted.** The facts the server already had, carried forward unchanged. |

## 4. Why this is NOT general conversation persistence

The reversal is deliberately narrow, and the narrowness is the safety argument:

- **Stored:** the decision evidence object for one shopping turn — pick, runner-up, rejected alternatives, exact values, and explicit UNKNOWN markers.
- **Not stored:** messages, need profile, decision stage, trip context, user text, images. All still re-derived, and `consultativeArchitecture.test.ts` asserts they are.
- **Not revived:** D3's pre-search gates, deterministic non-LLM replies, and its seven modules — still absent, still asserted absent.
- **Not added:** a second model call. Out of scope, and asserted at one `AI.stream`.

## 5. Security model

`public.decision_evidence` — `id`, `owner_id`, `evidence jsonb`, `created_at`, `expires_at`.

RLS **enabled with zero policies**, exactly as `public.anon_chat_usage` is. No role reads or writes the table directly. The only doors are two `SECURITY DEFINER` functions with `SET search_path = public`:

- `decision_evidence_save(p_id, p_evidence)`
- `decision_evidence_load(p_id) → jsonb`

**IDOR is impossible by construction, not by convention.** Neither function accepts an owner argument; ownership is taken from `auth.uid()` inside the body. A caller presenting another user's id receives `NULL` — indistinguishable from expired or never-existed. There is no readable policy and no list endpoint, so ids cannot be enumerated. `ON CONFLICT` carries the same `owner_id = auth.uid()` predicate, so a second caller cannot overwrite the first's row.

The client contributes **the key and nothing else**. Facts are read server-side from provider data. This asymmetry is the point.

Grants follow **ADR-019**: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE ... TO authenticated`. Verified by `has_function_privilege`, not by the migration having run.

Stored content is public product listings — no credentials, no provider secrets, no PII beyond `owner_id`.

## 6. Retention

**TTL = 2 hours.** The client holds its key in `sessionStorage`, which dies with the tab, so retention beyond the tab session is storage nobody can use. A follow-up arrives seconds to minutes later; two hours covers a distracted user and a reload with margin. The 24h of D3's dead client comment was never justified by the UX.

**No scheduler.** This project has no `pg_cron`. Housekeeping is caller-scoped and runs on the write path: each caller deletes their own expired rows and is pruned to their latest 3. An `expires_at` index is present so a global sweep can be added later without a schema change.

## 7. Anonymous users

Supported, and deliberately so — anonymous is the majority web path and the one that fabricated.

A Supabase anonymous session is a real `auth.uid()` carrying the `authenticated` Postgres role. This is the same mechanism `anon_chat_usage_increment()` already relies on, so **no new identity infrastructure is introduced**. Storage growth from cheap anonymous sessions is bounded by the 2-hour TTL and the latest-3 prune.

## 8. What this does and does not guarantee

**Does:** the model receives exact server-side values on both turns, and every absent field is stated as `KHONG CO DU LIEU` rather than omitted. Omission is what production filled in with "32GB/512GB". Configuration compatibility is computed in code, so an M1 Pro can no longer be silently offered as the requested M1.

**Does not:** guarantee the model obeys. Enforcement would need a pre-stream validation pass — a second model call (excluded by the one-`AI.stream` lock) or interception before the user sees the text (`onFinish` runs after). **That is explicitly out of scope for this ADR**, and stating it plainly matters: #171 and #172 both over-claimed, and both were disproved in production.

## 9. Rollback

Additive only; nothing existing is altered.

1. Revert the code change. The header stops being sent, the client stops sending the key, and behaviour returns to `7deee03`.
2. Optionally `DROP FUNCTION public.decision_evidence_save(uuid, jsonb)`, `DROP FUNCTION public.decision_evidence_load(uuid)`, `DROP TABLE public.decision_evidence`.

Leaving the table in place is harmless: unreachable except through its own functions, and self-expiring within two hours.

Partial rollback also degrades safely — if the RPCs disappear while the code remains, loads fail, `priorEvidenceMissing` is set, and the reply says it cannot confirm prior specifics rather than inventing them.
