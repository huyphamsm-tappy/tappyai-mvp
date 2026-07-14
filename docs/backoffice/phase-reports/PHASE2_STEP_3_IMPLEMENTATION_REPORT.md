# Phase 2 — Activation Analytics — Step 3 Implementation Report

**Step scope:** `user_acquisition` correlation strategy per `PHASE_2_ACTIVATION_ANALYTICS_SPEC.md` §5/§14 — extend the existing dimension with the two approved columns and add the single reusable writer for activation state. **No** rollup, no cron wiring, no service/API/dashboard, no calling of the Step 2 Engine from any real data source yet. Migration is a **file only, not applied to any database**, per the standing instruction.

---

## 1. What was implemented (2 new files + 1 migration file, nothing edited)

| File | Role (per spec) |
|---|---|
| `supabase/migrations/20260714_activation_dimension.sql` | **Dimension extension (§5, §14 item 1) — file only, NOT applied.** `ALTER TABLE user_acquisition ADD COLUMN activated_at timestamptz, ADD COLUMN activation_rule_version text` — both nullable, no default, no backfill (matches the spec's "pre-instrumentation users show null" honesty principle). |
| same file | **`fn_upsert_activation` (§5, §14 item 4)** — a sibling to the existing `fn_upsert_user_acquisition`, same first-write-wins discipline: only writes when `activated_at IS NULL` (an already-recorded activation is never overwritten by a later evaluation). |
| `src/lib/admin/analytics/activationDimensionWriter.ts` | Pure `activationInputFromResult(userId, result)` — converts a Step 2 `RuleEvaluationResult` into an upsert input (returns `null` for a non-activating result — nothing to persist). `toRpcParams` + `upsertActivation` (lazy-imported admin client), mirroring `userAcquisitionService.ts`'s exact shape. |
| `src/lib/admin/analytics/activationDimensionWriter.test.ts` | 6 unit tests. |

## 2. Design decisions (within frozen-spec bounds)

- **Exactly the two columns the spec approves** (§14 item 1) — no per-signal columns re-added (that was the rejected 1st-draft design; the frozen spec deliberately keeps the dimension's shape stable across rule versions, §5).
- **`activated_at` = the timestamp of the *last* matched signal**, not the evaluation time — because "activation" happened the moment the combinator became satisfied (when the last required signal arrived), which is what the spec's Aha-Moment definition (§2.1, carried into Rule v1) actually means; `evaluation_time` (§2.9) is a separate, distinct concept (when the Engine happened to check), correctly not conflated with it.
- **`fn_upsert_activation` is a new sibling function**, not an edit to `fn_upsert_user_acquisition` — the spec (§14 item 4) explicitly left "extend vs. sibling" as an implementation-time choice; sibling was chosen because it keeps the existing, already-shipped Phase 1 function completely untouched (zero risk to Authentication Analytics) and mirrors the same first-write-wins SQL idiom Phase 1 already established, rather than growing an unrelated function's parameter list.
- **Migration is additive-only and not applied** — `ADD COLUMN IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`, touches no existing column, function, RLS policy, or table. Consistent with the standing "do not apply migrations" instruction and with how Phase 1's own migrations were written step-by-step without being applied until the owner explicitly gated that.
- **No wiring to any real event source yet.** `activationDimensionWriter.ts` is called only by its own tests in this step — there is no cron, no API route, no listener reading real `user_events` rows and feeding them through the Step 2 Engine into this writer. That connection is later-step work (the spec's rollup/cron strategy, §6). Building it now would mean writing the "reads real events for a user" adapter before a concrete caller needs it — exactly what the owner's SR-4 guidance (and the two just-approved "future work, don't build yet" notes on `listAllRules()`/`WindowEvaluator`) says not to do.

## 3. Reuse (SR-1 → SR-6)

- **SR-1:** No new identity/dimension table — `user_acquisition` remains the single acquisition dimension, now also carrying activation state.
- **SR-4:** `fn_upsert_activation` reuses the exact first-write-wins idiom already proven in `fn_upsert_user_acquisition`; `activationDimensionWriter.ts` reuses `userAcquisitionService.ts`'s file shape (pure mapper + lazy-imported thin RPC caller) verbatim as a pattern — no new writer style invented.
- **No duplicated logic:** the merge/write logic for activation state exists in exactly one place (`fn_upsert_activation`); the TS layer only maps and calls it, same discipline as the existing acquisition writer.
- **Engine untouched:** `activationRuleEngine.ts`/`activationRuleProvider.ts`/`registry.ts` from Step 2 are not modified — this step only adds a consumer-shaped adapter for their *output* (`RuleEvaluationResult`), without changing how they work.

## 4. Verification results

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean |
| `next lint` | ✅ Clean — no warnings in any new file |
| `npm test` (vitest) | ✅ **103/103 passing** (12 files: 11 prior + 1 new `activationDimensionWriter.test.ts` with 6 tests) |
| `npm run build` | ✅ "Compiled successfully"; the one logged `Dynamic server usage` line is `/api/subscription`'s pre-existing, unrelated `request.headers` usage |
| `architecture:check` | ✅ 7/7 rules passed |

## 5. Critical audit

- **Migration confirmed not applied:** this step only creates the `.sql` file under `supabase/migrations/`; no database connection was made, no `supabase migration up`/equivalent was run.
- **First-write-wins correctness verified by reading the SQL, not assumed:** `fn_upsert_activation`'s `WHERE ua.activated_at IS NULL` guard means a second call for an already-activated user is a no-op UPDATE (0 rows affected) — matches the spec's "an already-recorded activation is never overwritten" requirement exactly.
- **`activationInputFromResult` defensively handles the "activated but no matched signals" edge case** (returns `null`) even though the Engine (Step 2) cannot currently produce that state for `ALL`/`ANY`/`AT_LEAST` — a cheap, honest guard against a future combinator bug silently writing a garbage timestamp, not speculative new functionality.
- **No behavior change to any live code path:** this step, like Step 2, is inert from the running application's perspective — nothing calls `activationDimensionWriter.ts` outside its own tests yet. Expected for a step whose job is "prepare the dimension + writer," not "wire it up."
- **Authentication Analytics fully unaffected:** confirmed no edit to `20260713_user_acquisition_dimension.sql`, `fn_upsert_user_acquisition`, `fn_sync_last_login`, `fn_rollup_auth_daily`, or any Auth Analytics TS file.
- **No activation-prefixed event reintroduced:** this step contains no event emission at all (it's a schema + writer step); `grep -rn "'activation_" src/` remains empty.
- **Scope discipline:** exactly 3 new files (1 migration, 1 module, 1 test file), 0 edits to any existing file, 0 changes to the frozen specification.

---

**Step 3 status: Implemented, code-verified (tsc/lint/build/103 tests/architecture 7/7 all green).** `user_acquisition` dimension extension + its single reusable writer exist, migration file only (not applied), fully decoupled from any live pipeline. No rollup, cron, API, or dashboard yet.

*Stopping here. Do not proceed to Step 4 until explicitly approved.*
