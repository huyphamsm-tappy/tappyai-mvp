# Analytics Production Migration Execution — Migration 4 Report

**Migration executed:** `20260714_activation_dimension.sql`
**Executed:** 2026-07-14, via Supabase SQL editor (project `fwznnobrdctuskgrvuik`, `huyphamsm-tappy`), by explicit owner authorization.
**Scope honored:** Only Migration 4 was executed. Migration 5 was not touched. No code was modified. No deployment occurred. No environment variables modified.

---

## 1. Pre-execution checks

Single combined pre-check query:

| Check | Result |
|---|---|
| `migration4_applied` (`user_acquisition.activated_at` column exists?) | `false` — not yet applied |
| `fn_activation_present` (`fn_upsert_activation` exists?) | `false` — not yet applied |
| `m1_ok` (Migration 1 — `user_events.event_id`) | `true` |
| `m2_ok` (Migration 2 — `user_acquisition` table) | `true` — Migration 4's hard dependency |
| `m3_ok` (Migration 3 — `auth_daily_rollup`) | `true` |
| `f1_secdef` (F1 fix still live?) | `true` |

All prerequisites from Migrations 1–3 confirmed present; Migration 4 confirmed not-yet-applied. Safe to proceed.

## 2. SQL buffer verification (before execution)

The migration was written to the clipboard and pasted as one operation. The entire 18-line buffer fit in a single editor view and was verified line-by-line against the source file: the two `ADD COLUMN IF NOT EXISTS` statements (`activated_at timestamptz`, `activation_rule_version text`) and the full `fn_upsert_activation` function — including the **first-write-wins guard `WHERE ua.user_id = p_user_id AND ua.activated_at IS NULL`** and both `COALESCE` clauses — all present and uncorrupted.

## 3. SQL execution result

**Result: `Success. No rows returned.`** No errors, no warnings.

## 4. Verification evidence (against the Step 3 Runbook's Migration 4 criteria)

| Check | Result |
|---|---|
| `activated_at` column exists | `true` — type `timestamp with time zone` |
| `activation_rule_version` column exists | `true` — type `text` |
| `fn_upsert_activation` exists | `true` |
| `fn_upsert_activation` signature | `p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text` — matches the migration file exactly |
| **First-write-wins guard** (`activated_at IS NULL` in function body) | `true` (verified via `pg_get_functiondef` substring check) |
| COALESCE(ua.activated_at ...) in body | `true` |
| COALESCE(ua.activation_rule_version ...) in body | `true` |

## 5. PASS / FAIL

## **PASS.** All checks passed, including the first-write-wins guard confirmation.

## 6. Confirmation that existing `user_acquisition` data was preserved

| Check | Result |
|---|---|
| `user_acquisition` row count | **`10`** — identical to Migration 2's backfill; **the 10 backfilled rows are fully preserved, no data loss** |
| Rows with `activated_at IS NOT NULL` | `0` — correct: the new columns are nullable, default NULL, and no activation has been recorded yet (the cron hasn't run and `fn_upsert_activation` hasn't been invoked) |

The `ALTER TABLE ... ADD COLUMN` operation is purely additive — existing rows gained two NULL columns with no modification to any existing column value. Confirmed by the unchanged row count.

## 7. Anomalies found

**None affecting the migration.** One process note: two *verification* queries (not the migration itself) were briefly mangled by the editor's auto-bracket-insertion when typed directly (stray `)')))` appended after a semicolon); both were caught immediately (they errored harmlessly, changing nothing), rewritten via clipboard-paste, and re-run cleanly. The migration itself and all confirmed verification results are correct.

## 8. Existing objects confirmed intact (Phase 0, Migrations 1–3)

| Check | Result |
|---|---|
| Active `super_admin` count | `1` (Phase 0 unchanged) |
| `user_events` row count | `2017` (unchanged) |
| Migration 1 intact (`user_events.event_id`) | `true` |
| Migration 2 intact (`fn_upsert_user_acquisition`) | `true` |
| Migration 3 table intact (`auth_daily_rollup`) | `true` |
| Migration 3 F1 fix still live (`fn_sync_last_login.prosecdef`) | `true` |
| Migration 5 table still absent (`activation_daily_rollup`) | `true` (does not exist — correctly not touched) |

## 9. Rollback recommendation

**Not needed.** Migration 4 passed completely with no anomalies and preserved all existing data.

## 10. GO / STOP recommendation for Migration 5

## **GO.**

Migration 4 is fully verified: both columns added with correct types, `fn_upsert_activation` deployed with the correct signature and first-write-wins guard, all 10 existing `user_acquisition` rows preserved, and every prior migration's objects (including the F1 fix) remain untouched. Migration 5 (`20260714_activation_daily_rollup.sql`) — the final migration — reads `user_acquisition.activated_at`/`activation_rule_version` (added by this migration, confirmed present) and may proceed once explicitly approved — **not executed as part of this report**, per the strict single-migration scope of this step.

---

*Migration 4 executed and verified. All existing `user_acquisition` data preserved. Migration 5 not touched. No code changed. No deployment performed. No environment variables modified. Stopping here and waiting for your approval before Migration 5.*
