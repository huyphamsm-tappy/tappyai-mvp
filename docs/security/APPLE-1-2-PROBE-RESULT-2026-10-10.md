# Production probe result — 2026-10-10 04:02 UTC (11:02 Vietnam)

How it was obtained: `scripts/release/sql/apple-1-2-probe-editor.sql` (one catalog-only SELECT, verified before running: 1 statement, no write
keywords, function names only as quoted text for `to_regprocedure`) was run once in the Supabase SQL Editor of the signed-in owner session,
project `fwznnobrdctuskgrvuik`, branch `main`, labeled PRODUCTION. The editor text was read back and matched the verified file exactly
(1652 characters, same hash) before Run. The wrapper `apply-migration.sh --check` could not be used: the production password file is absent on
this PC. **Not a migration, not a write.** Side effect: the dashboard may keep an "Untitled query" snippet in the owner's private SQL list.

## Raw result
```json
{
  "rls": { "chat_blocks": true, "content_reports": true, "moderation_queue": true, "moderation_actions": true },
  "tables": {
    "chat_blocks": true, "user_blocks": false, "user_reports": false, "content_reports": true, "moderation_queue": true,
    "banned_identities": false, "moderation_actions": true, "moderation_appeals": false, "moderation_decisions": false
  },
  "triggers": [],
  "functions": {
    "blocked_ids": false, "user_report_to_queue": false, "review_author_blocked": false,
    "fn_ingest_moderation_reports": true, "content_report_to_queue_20261009": false
  },
  "block_policy_count": 0,
  "ledger_table_exists": false
}
```

## What it proves (and nothing more)
| Fact | Evidence |
|---|---|
| Post reports have somewhere to land | `content_reports` and `moderation_queue`, `moderation_actions` exist with row-level security on |
| The daily ingest function exists | `fn_ingest_moderation_reports` |
| `chat_blocks` exists with RLS | so the block route's second write has its table |
| **User blocks do not exist** | no `user_blocks` table, no `safety_private.blocked_ids` / `review_author_blocked`, 0 block policies → migration **20261001** is NOT applied; nothing server-side hides a blocked person |
| **Comment/user reports do not exist** | no `user_reports`, no `user_report_to_queue` → **20261001b** NOT applied |
| **No decision ledger, no appeals** | no `moderation_decisions`, `moderation_appeals` → **20261001d** NOT applied |
| **No banned-identity guard** | no `banned_identities` → **20261001e** NOT applied |
| **Post reports do not queue at once** | no `content_report_to_queue` trigger, no triggers at all of the five checked → **20261009** NOT applied (post reports reach the queue only through the daily ingest, priority 1) |
| No migration history | `supabase_migrations.schema_migrations` does not exist: migrations were applied by hand, so history cannot be read |

## What it does NOT prove
- That the queue's contents, the ingest cron's schedule or any report on production are healthy (no row counts were read).
- Whether `20260930_content_reports_insert_check` is applied (the probe did not look at the `content_reports` INSERT policy).
- Anything about the three feature flags (they live in Vercel environment, not in the database). The last public reading of `/api/config`
  (10/10) was all `false`; that is a separate source and is not this probe.
- That the moderation workflow works: tables existing is not the workflow working.

## Consequence
Turning on `USER_BLOCKS_ENABLED`, `REPORTS_ENABLED` or `MODERATION_ADMIN_ENABLED` today would send the apps to routes whose tables do not exist.
The four missing migrations (and 20261009) must be applied first; see `APPLE-1-2-RELEASE-PLAN.md`.

## Addendum — second and third queries (same session, same method)
Prerequisite tables: all eight exist (`reviews`, `review_comments`, `review_likes`, `user_follows`, `notifications`, `profiles`, `account_status`, `audit_log`).
`content_reports` has one policy, "Users can file a content report : INSERT", and its check is still `true` (the third query: `policy_is_still_check_true: true`,
`insert_check_20260930_applied: false`) → **20260930 is NOT applied.**

## Addendum 2 — fourth query (`apple-1-2-probe-editor-3.sql`, same method; definitions only)
- `moderation_queue` has `uq_modq_source` (UNIQUE on `metadata->>'source_table'` and `metadata->>'source_id'`): the queue's duplicate protection is present, so the post-report
  trigger and the daily ingest cannot double-queue a report. It also has `idx_modq_status`, `idx_modq_target` and the primary key.
- `content_reports`: columns `id, content_id, reporter_source_id, reason, policy_id, verification_state, status, created_at`; UNIQUE (content_id, reporter_source_id, reason);
  FK `content_id` to `reviews(id)` ON DELETE CASCADE; a `status` check; **no check on `reason`** (free text today).
- Enums: `moderation_type` = review_report, comment_report, user_report, music_report, ai_flag; `moderation_status` = pending, in_review, resolved, dismissed. The values 20261001d and 20261009 cast to exist.
