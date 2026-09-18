# D3 — migrations carried by the origin/main → V3 merge

Both migrations come from `origin/main` (#249–#251); the merge adds no migration of its own. Files here are verbatim copies from the merged branch (`2e3ec8a`).

| Forward | Rollback | What it does | Additive? |
|---|---|---|---|
| `20260908_user_demographics_foundation.sql` (628 lines) | `20260908_user_demographics_foundation_rollback.sql` (from main; sections 1–2 disable without data loss, section 3 — `DROP TABLE` — is commented out and destructive) | creates `public.user_demographics` (RLS on, table-level grants revoked from `anon`/`authenticated`, column-list grants for the owner's own row, `service_role` full), `set_updated_at()` only if absent, and four functions: `age_band_of(date)`, `user_age_status()`, `set_user_date_of_birth(date)`, `admin_set_user_date_of_birth(…)` | **Yes.** New table, new functions, `CREATE … IF NOT EXISTS` / `CREATE OR REPLACE`, policies dropped-then-created by name. Touches no existing table's rows, grants or policies. Safe to re-run. |
| `20260911_user_memory_discovery_city.sql` | `20260911_user_memory_discovery_city_rollback.sql` (**new on the branch** — main had none) | `ALTER TABLE public.user_memory ADD COLUMN IF NOT EXISTS discovery_city text` | **Yes.** Nullable, no default, no grant/RLS change. Safe to re-run. |

## Safety for the currently deployed main
The deployed main (`842379b`, auto-deployed on merge) already *requires* both: `/api/chat` calls `user_age_status()` on every authenticated turn and `memoryService` reads `discovery_city`. So both are already applied to production — confirmed indirectly: the 2026-09-17 production baseline (main code against the audit project, whose schema was exported from production the same day) returned `age_verification_required` from `user_age_status()`, and the export carries `user_memory.discovery_city`.

## State of the AUDIT project (`zdaprdfgpbpnxyofagmc`) — probed read-only 2026-09-17
| object | present |
|---|---|
| `public.user_demographics` (select via PostgREST) | ✅ 200 |
| `user_memory.discovery_city` | ✅ 200 (`null` for the audit user) |
| `rpc user_age_status()` | ✅ 200 |
| `rpc age_band_of('1990-01-01')` | ✅ `"35_44"` |

**Nothing needs to be applied to the audit project before the post-merge acceptance run.** If you still want to rehearse, the forward files are idempotent; run the rollback files only on the audit project, never on production, and note that `20260908`'s section 3 and the `20260911` rollback both destroy data.

Verification query for either project (SQL Editor, read-only):
```sql
select
  to_regclass('public.user_demographics')            as demographics_table,
  to_regprocedure('public.user_age_status()')        as user_age_status,
  to_regprocedure('public.set_user_date_of_birth(date)') as set_dob,
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='user_memory' and column_name='discovery_city') as discovery_city;
```

## Added by the overnight job (2026-09-18) — STEP C

| Forward | Rollback | What it does | Additive? |
|---|---|---|---|
| `20260915_review_shares.sql` (from `integration/v3-canonical`, `c1e1227`) | `20260915_review_shares_rollback.sql` (**new on the branch**; `DROP TABLE IF EXISTS public.review_shares` — destructive) | creates `public.review_shares` (share history for the profile's "Đã share" collection), 2 indexes, RLS on, own-row SELECT/INSERT/DELETE for `authenticated` and never for an anonymous JWT; no `anon` policy, no UPDATE | **Yes.** New table only; `CREATE … IF NOT EXISTS`, policies dropped-then-created by name. Safe to re-run. |

🔶 **NOT yet applied to the audit project.** The direct-DB apply (`scripts/audit/applyMigrationAudit.mjs`, refuses any ref other than the confirmed non-prod one) was blocked by the session's permission classifier ("modify shared resources"). Owner: run

```bash
node scripts/audit/applyMigrationAudit.mjs supabase/migrations/20260915_review_shares.sql --verify-table review_shares
```

from the `g1-place-guard` worktree, or paste the forward file into the audit project's SQL Editor. Until then `GET /api/reviews/shared` answers `500 load_failed` on the audit project (fails closed; nothing else reads the table). Production: apply in the same order as the other two, after the merge is accepted.

`add_user_language_preference.sql` also shows in `git diff 968472e HEAD -- supabase/migrations` only because of a comment edit (`9cc8d5b`); it is long since applied everywhere.
