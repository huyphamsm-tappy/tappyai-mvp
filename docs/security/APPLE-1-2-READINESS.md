# App Review 1.2 — what must be true before iOS is resubmitted

Branch `sec/apple-1-2-operator-alerts` (from `origin/main` f9f2b12). iOS side: branch `ios/appreview-1-2-terms-at-auth`.
Written 2026-10-09. **Nothing below has been run against production.** Production access is owner-run by design (`scripts/release/*`).

## What this branch adds (code only, inert until configured)
- `src/lib/safety/operatorAlert.ts`: a content-free push + inbox alert to the named reviewers when (a) a report is stored (review, comment, user) and (b) a block succeeds. Throttled to one per kind per reviewer per 15 min; best-effort; never throws; does nothing with no recipients.
- `vercel.json`: `/api/cron/moderation-digest` daily 01:00 UTC (08:00 VN) as the safety net behind the per-report alert (counts only, "overdue" in the title).
- Tests: `operatorAlert.test.ts` (8), cron pin in `outbox.test.ts` 15 → 16 (documented).

## Owner decision needed (the one thing that cannot be inferred)
**Who is the responsible reviewer?** Give the TappyAI user id(s) of an existing admin account. It goes into `MODERATION_ALERT_USER_IDS` (and `MODERATION_DIGEST_USER_IDS`). That person must have the push-enabled app signed in and access to `/admin/moderation`.

## Step 1 — read the production state (read-only)
```
bash scripts/release/apply-migration.sh --check scripts/release/sql/apple-1-2-probe.sql
```
Anything printed `f`, or a missing table/policy, names a migration still to apply. The migration → object map is in the probe's comments.

## Step 2 — only if something is missing: backup, then apply in order
`scripts/release/backup-prod.ps1` → `CHECKS-PASSED.json`, then one file at a time with `apply-migration.sh <file> --i-have-a-valid-backup <dir>`, in this order and only those the probe shows missing:
`20260817_content_safety_gate` → `20260821_m09_moderation_queue` → `20260930_content_reports_insert_check` → `20261001_user_blocks` → `20261001b_user_reports` → `20261001d_moderation_standards` → `20261001e_banned_identity_hash`.
`20261001` changes RLS on hot tables (`reviews`, `review_comments`, `notifications`): measure feed latency after it. Rollback files exist in `supabase/migrations/rollback/` (reverse order: e → d → b → block).

## Step 3 — Vercel Production env, then flags, then redeploy (flags are read at build)
1. `MODERATION_ALERT_USER_IDS`, `MODERATION_DIGEST_USER_IDS` = the reviewer id(s).
2. In order: `USER_BLOCKS_ENABLED=true` → `REPORTS_ENABLED=true` → `MODERATION_ADMIN_ENABLED=true`. Redeploy.
3. Not-destructive checks: `GET /api/config` shows `p8.userBlocks/reports/moderationNotices` true; unauthenticated `GET /api/users/blocks` answers 401 (was 404); the reviewer opens `/admin/moderation` and sees the queue.
Rollback: remove the three variables, redeploy.

## 24-hour procedure (draft — becomes real only when the reviewer confirms)
- Reviewer: **<name — owner to fill in>**. Backup reviewer: **<name or "none">**.
- Alerts: a push + inbox item per new report / block (one per 15 min), plus the 08:00 VN digest. Severe groups (sexual, self-harm, child safety, per `RULE_GROUPS` priority 3) target 24 h; the rest 72 h.
- Daily routine: open `/admin/moderation` at least at 08:00 and 20:00 VN; clear priority-3 items first.
- Action: hide/remove the content (state → `RESTRICTED`), restrict or ban the account where the ladder says so; every decision is stored in the immutable `moderation_decisions` ledger with time and reason.
- Escalation: an item reaching 24 h open raises "overdue" in the next digest title.

## Not yet verified (do not claim)
Production migrations and RLS; the flags; that the reviewer receives the push; the 24-hour commitment; the on-device recording.

## iPhone recording (after Step 3 passes) — two test accounts, no fake data on real users
1. Fresh install → login screen: try Google without ticking → red message beside the checkbox; open the Terms link; tick; sign in.
2. Explore → a clip by account B → ⋯ → Report → reason → confirmation; show the item in `/admin/moderation`.
3. ⋯ → Block B → confirm → B's clips and comments leave the feed at once; Settings → Blocked accounts → B listed.
4. Settings → Community guidelines, Contact (support@tappyai.com).
Attach the video to App Review Information notes with a sentence on who reviews reports and the 24 h commitment.
