# App Review 1.2 — ordered release plan, verification and recording checklist

Written 2026-10-10. **Everything about production below is UNVERIFIED until the read-only probe has run.** Last observed from outside
(public GETs, 10/10): production serves `f9f2b12`; `/api/config` → `p8.reports/userBlocks/commentModeration/moderationNotices` all `false`.

Owner: primary reviewer = the owner (accepted 24 h duty). **No backup reviewer** — `MODERATION_BACKUP_USER_IDS` stays unset; escalation then
has nobody to reach (it only repeats the digest to the primary). Do not grant a role to anyone to fill this.

## 0. The probe (read-only) — static review
- `scripts/release/apply-migration.sh --check <file>` runs `psql` in a throw-away container, issues `SET default_transaction_read_only = on`
  first, then executes the file. The password file is mounted read-only into the container and never printed.
- `scripts/release/sql/apple-1-2-probe.sql` contains only `SELECT`s over catalogs and `count(*)`; no DDL/DML, no function that writes
  (it uses `to_regclass`, `to_regprocedure`, `pg_policies`, `pg_trigger`, and counts). It prints names and counts, no report text, ids or e-mails.
- Caveat: read-only is enforced by the session setting, not by the database role. The SQL file is the safeguard: review it before running.
- Pending only on: Docker engine up + permission for exactly `bash scripts/release/apply-migration.sh --check scripts/release/sql/apple-1-2-probe.sql`.

## 1a. OBSERVED on production, 2026-10-10 (four read-only catalog queries in the Supabase SQL Editor; evidence in `APPLE-1-2-PROBE-RESULT-2026-10-10.md`)
Present: `content_reports`, `moderation_queue`, `moderation_actions` (RLS on), `chat_blocks` (RLS on), `fn_ingest_moderation_reports`, and all eight tables the new
migrations need (reviews, review_comments, review_likes, user_follows, notifications, profiles, account_status, audit_log).
**Missing: `user_blocks` + RLS + `safety_private.*` (0 block policies), `user_reports` + trigger, `moderation_decisions`, `moderation_appeals`, `banned_identities`,
the post-report trigger. And 20260930 is NOT applied: `content_reports` still has `WITH CHECK (true)` (any signed-in user can insert arbitrary rows through the API).**
No migration ledger table exists (applied by hand).
**Minimal set (6 files), in this order: 20260930, 20261001, 20261001b, 20261001d, 20261009, 20261010.** (20261010 is the flood guard, added 10/10 because 20260930 pins WHO may report but not HOW MANY.) **20261001e is DEFERRED**: no application code uses `banned_identities`, and it
puts triggers on Supabase's `auth.users` (sign-up/e-mail change/delete): the riskiest file, not needed for Apple.
Until the set is applied, enabling any of the three flags would point the apps at routes whose tables do not exist.

## 1. What the probe output decides
| Probe section | If it shows | Means | Action |
|---|---|---|---|
| 1 tables (9 columns) | any `f` | that migration is missing: `content_reports`/`moderation_queue`/`moderation_actions` → 20260817/20260821; `user_blocks` → 20261001; `user_reports` → 20261001b; `moderation_decisions`/`moderation_appeals` → 20261001d; `banned_identities` → 20261001e; `chat_blocks` → chat Phase 6 (VERIFY-ONLY in the release policy: stop and report, never re-apply) | add to the apply list in §3 |
| 2 RLS | any `f` | table exists without RLS: stop, report | do not enable flags |
| 3 policies | count ≠ 10 | blocks do not hide content server-side | 20261001 missing/partial |
| 4 functions | any `f` | chain incomplete | as above |
| 5 triggers | `content_report_to_queue` absent | post reports queue only daily, priority 1 | apply 20261009 |
| 6 ledger | error / gaps | migrations may have been applied by hand | judge by sections 1–5, not by the ledger |
| 7 queue | rows older than 24 h at priority 3 | unattended reports exist today | triage first |

## 2. Code ships first, inert (needs the owner's authorization to merge and deploy)
- Merge `sec/apple-1-2-moderation-release` (`8ffe64e`, fast-forward over `origin/main` `f9f2b12` as of 10/10) → Vercel deploy.
  Everything is gated: routes answer 404 while their flag is off, the alert helper does nothing without recipients, the digest answers 404 while
  `MODERATION_ADMIN_ENABLED` is off. Registers two digest crons (08:00 and 20:00 VN).
- **Do not include commit `663699a`** (Terms wording) until the owner approves the text. It is separate on `sec/apple-1-2-operator-alerts`.
- Smoke after deploy (non-mutating): `/api/version` shows the new SHA; `/api/config` unchanged; `/` and `/login` 200.

## 3. Migrations (each needs the owner's explicit authorization; the release policy marks 20260930 onward AFTER-SMOKE, i.e. after §2 and its smoke)
1. **Backup first:** `scripts/release/backup-prod.ps1` → `CHECKS-PASSED.json`; no backup, no migration.
2. Apply the minimal set (today: 20260930, 20261001, 20261001b, 20261001d, 20261009, 20261010; **not** 20261001e), one file at a time, in this order, each with
   `bash scripts/release/apply-migration.sh <file> --i-have-a-valid-backup <dir> --after-smoke-passed`:
   
   If the wrapper answers UNLISTED/SKIP/DEFER/VERIFY-ONLY for a file, stop and report: never force it (a pre-20260913 file is most likely already on production).
3. After each: re-run the probe; the matching section must flip to `t` / expected counts.
4. Risk: `20261001` adds RLS predicates to `reviews`, `review_comments`, `notifications` (hot tables). Measure feed latency after it.
5. Rollback: `supabase/migrations/rollback/<same name>_rollback.sql` in reverse order (`--rollback`); restore from the backup only as a last resort.

## 3a. Migration review (each file and rollback read in full, 10/10)
Order, dependencies and rollback were also exercised on a real PostgreSQL with the production baseline: `supabase/tests/apple_1_2_release_order.test.ts`
(apply the set in order, run the repo's own probe SQL, roll back in reverse, require an identical schema fingerprint, re-apply). It proves the SQL and the order;
it does not prove production's data, load or locks.
| File | What it does | Data impact | Lock / load | Rollback | Stop if |
|---|---|---|---|---|---|
| 20260930 | replaces the content_reports INSERT policy (reporter pinned to the caller, defaults enforced), narrows INSERT column privileges | none | policy + grant on a small table, brief | restores `WITH CHECK (true)` | any other client inserts extra columns into `content_reports` (the post-report route inserts exactly the allowed ones) |
| 20261001 | new `user_blocks` + private schema/functions; RESTRICTIVE policies on `user_follows`, `review_comments`, `review_likes`, `reviews`, `notifications`; **a new DELETE policy: the owner of a post can delete comments on it (active at once, not behind a flag)** | none to existing rows | CREATE/DROP POLICY takes ShareUpdateExclusive per PostgreSQL's policy code (reads/writes continue; not measured on production); one transaction, short. After it, every authenticated read of `reviews`/`review_comments` evaluates a block sub-select once per statement (measured on synthetic 300k-row data in docs/security/USER-BLOCKS-MEASURE.json, not on production) | drops policies, functions, schema, table (blocks made meanwhile are lost; `chat_blocks` untouched) | feed p95 grows > 50 ms or any 5xx on the feed |
| 20261001b | new `user_reports` (no existing data touched) | none | new table | drops table (reports lost) | — |
| 20261001d | new `moderation_decisions`, `moderation_appeals` (append-only guards), report→queue trigger, snapshot purge function; widens `user_reports` reason check | none | new objects only; the ALTER is on the still-empty `user_reports` | drops ledger + appeals (**export first if any decision exists**) | the `moderation_type` / `moderation_status` enums lack the values it casts (they come from 20260821, present) |
| 20261009 | trigger: a post report enters `moderation_queue` at filing with a priority; the daily ingest stays a backstop (unique source index) | none | trigger on a small table | drops trigger + function; queued rows stay | `uq_modq_source` missing (not probed): duplicates possible, not harmful |
| 20261010 | per-reporter flood guard on `content_reports` (BEFORE INSERT: refuses the 11th report in 10 minutes, SQLSTATE 53400, which the route answers with 429); `reason` must be one of the seven canonical values and `policy_id` at most 80 characters, for NEW rows only (NOT VALID); one index | none (the constraints are NOT VALID: old rows are not scanned) | trigger and index on a small table; the count uses `content_reports_reporter_recent_idx` (plan checked on a real PostgreSQL) | drops trigger, function, constraints and index; rows stay | the route does not map 53400 (it does since this commit) |
| 20261001e (DEFERRED) | banned-identity hashes + triggers BEFORE INSERT / UPDATE OF email / DELETE on `auth.users` | one random pepper row | CREATE TRIGGER on `auth.users` takes SHARE ROW EXCLUSIVE: it waits behind running writes and, while waiting, queues new sign-ins/updates. If ever applied: add `SET LOCAL lock_timeout = '3s'` first, at low traffic | drops triggers, functions, tables | any sign-up or sign-in error |
Gaps I could not close from here: production row counts, load, and whether some client inserts into `content_reports` outside the route.
After EACH file: re-run the probe (dashboard SQL Editor or wrapper); expected sections must flip; a failed file rolls back by itself (single transaction).

## 4. Environment and flags (each needs authorization; read at build, so redeploy after)
| Variable | Value | Needs |
|---|---|---|
| `MODERATION_ALERT_USER_IDS`, `MODERATION_DIGEST_USER_IDS` | the owner's TappyAI user id | the owner's admin account (super_admin, seen in `/admin/rbac`) |
| `USER_BLOCKS_ENABLED=true` | block API, block list, comment moderation flag | `user_blocks` + RLS (20261001) **and** `chat_blocks` |
| `REPORTS_ENABLED=true` | comment/user report routes, `p8.reports` | `user_reports` (20261001b) |
| `MODERATION_ADMIN_ENABLED=true` | desk, decisions, appeals, digest, `p8.moderationNotices` | 20261001d, owner RBAC |
Order: `USER_BLOCKS_ENABLED` → `REPORTS_ENABLED` → `MODERATION_ADMIN_ENABLED`. Never enable one whose prerequisite row is not green in the probe.
Rollback: remove the variable, redeploy.

## 5. After the deploy — verification that does NOT write
1. `/api/config` shows the three `p8` flags `true`. 2. Unauthenticated `GET /api/users/blocks` → 401 (was 404). 3. The owner opens `/admin/moderation`:
desk, queue and stats load. 4. Vercel → Cron Jobs lists two moderation-digest entries. 5. Probe re-run: all expected values.
**Not provable without writing:** that a report reaches the queue, that the push arrives, that a block hides content live. That needs one controlled test
(see §7) and the owner's authorization for it.

## 6. 24-hour process (what actually runs)
Intake automatic (queue row with priority at filing); urgent reports push the owner immediately (never throttled); routine ones are throttled to
one push per 15 min; digest at 08:00 and 20:00 VN with overdue / nearly-due counts; the owner decides in `/admin/moderation`; a decision closes
every duplicate report on the same target; every decision is in the immutable ledger with time and reason. Gaps: no backup (escalation reaches only the owner);
the 12-hour cadence can leave an urgent item un-escalated for up to 12 h; the human duty is the owner's.

## 7. Authorizations needed, in order (nothing is done without each)
1. Run the read-only probe. 2. Merge `sec/apple-1-2-moderation-release` + deploy. 3. Backup. 4. Each migration. 5. Env vars. 6. Flags + redeploy.
7. One controlled production test with a test account (one harmless post, one report, one block, then clean up). 8. Merge `663699a` (policy) after the owner approves the text.
9. App Store Connect (attach build, notes, submit): the owner only.

## 8. Physical-iPhone recording (build 156 or later; only after §3–§5 passed)
Setup: owner account A signed out; test account B with one harmless post; screen recording on; one continuous take (~3 min).
| # | Do | Expected, visible |
|---|---|---|
| 1 | Open TappyAI → login. Tap "Continue with Google" with the box unticked | red message under the checkbox; no sign-in starts |
| 2 | Tap "Read the Terms of Service" | in-app page; zero-tolerance clause visible (once published); close it |
| 3 | Tap "Community Guidelines" | browser opens the Guidelines page (no "awaiting approval" banner once published); return |
| 4 | Tick the box → "Continue with Google" | returns to the app signed in |
| 5 | (Optional) Create account screen: fill a valid form, leave the box unticked | "Sign up" disabled; tick → enabled (do not submit) |
| 6 | Settings → "Community guidelines", "Contact" | both open; support@tappyai.com |
| 7 | Explore → B's post → ⋯ → Report → a reason → Send | confirmation card (an error message if it fails, never a false "sent") |
| 8 | ⋯ → Block → confirm | B's post disappears from the feed at once |
| 9 | Settings → Blocked accounts | B listed; open B's profile via search → shows "You blocked this person" |
| 10 | (If authorized) Safari → /admin/moderation | the report is in the queue with its priority; the blocked/reported content is not shown beyond what the reviewer needs |
Do not edit the video. If a step fails, stop and report; do not re-take around it.

## 9. Step by step — each production step needs your own authorization; nothing below runs by itself
Facts used: production serves `f9f2b12`; flags false (public `/api/config`); the probes of 10/10 (see `APPLE-1-2-PROBE-RESULT-2026-10-10.md`).
Re-run probes 1–4 (`scripts/release/sql/apple-1-2-probe-editor.sql`, `-2`, `-3`) in the SQL Editor immediately before step 1; if any answer differs from the record, stop and re-plan.

### Step 1 — Ship the code, inert
- **Before:** CI green on `sec/apple-1-2-moderation-release` (Architecture Guard, Regression Gate); the Terms commit `663699a` is NOT on this branch.
- **Change:** merge that branch into `main` (fast-forward over `f9f2b12` as of 10/10); Vercel deploys. Registers two digest crons.
- **Verify:** `/api/version` = the new SHA; `/`, `/login`, `/reviews` answer 200; `/api/config` `p8.*` still all false; Vercel → Cron Jobs lists `moderation-digest` twice.
- **Stop if:** a deploy error, any 5xx on `/` or `/login`, or a flag turns on by itself.
- **Recover:** redeploy the previous deployment (`f9f2b12`) from the Vercel dashboard. Nothing in the database has changed yet.

### Step 2 — Backup
- **Before:** the production password file exists on the machine that runs it (only you can create it, RELEASE-PLAN §3b); Docker engine up.
- **Change:** `scripts/release/backup-prod.ps1` (lead-run, not Claude).
- **Verify:** `CHECKS-PASSED.json` is written and the dump hash re-verifies.
- **Stop if:** any check fails: no migration is applied without it.
- **Recover:** n/a (a read-only dump).

### Step 3 — 20260930 (close the open insert policy)
- **Before:** probe 3 shows `policy_is_still_check_true: true`; no client other than the post-report route inserts into `content_reports`.
- **Change:** `bash scripts/release/apply-migration.sh supabase/migrations/20260930_content_reports_insert_check.sql --i-have-a-valid-backup <backup-dir> --after-smoke-passed`
- **Verify:** probe 3 → `insert_check_20260930_applied: true`; one post report from a signed-in test account still returns "sent" (part of the controlled test, step 10).
- **Stop if:** reports from signed-in users start failing (route 500 / `report_failed`).
- **Recover:** `supabase/migrations/rollback/20260930_content_reports_insert_check_rollback.sql` (reopens the old policy).

### Step 4 — 20261001 (blocks: the one that touches hot tables)
- **Before:** probe 1 shows `user_blocks` false and `block_policy_count` 0; the prerequisite tables (probe 2) all true; a low-traffic hour; step 3 verified; the feed API's response time noted beforehand.
- **Change:** apply `20261001_user_blocks.sql` the same way. (This also activates, regardless of flags, the policy that lets a post's owner delete comments on that post.)
- **Verify:** probe 1 → `user_blocks` t, `block_policy_count` 10, `blocked_ids` t, `review_author_blocked` t; a signed-in test account loads Explore and a post detail normally; compare the feed's response time with the value noted before.
- **Stop if:** any feed, comment or notification error, or the feed's response time rises by more than 50 ms (the threshold is a decision, not a measurement of production).
- **Recover:** `.../rollback/20261001_user_blocks_rollback.sql` (blocks made in the meantime are lost; `chat_blocks` is untouched).

### Steps 5–8 — 20261001b, 20261001d, 20261009, 20261010
One file each, in this order, each with its own authorization.
- **Before (each):** the previous step verified; the probe shows this file's objects missing.
- **Change (each):** `apply-migration.sh <file> --i-have-a-valid-backup <backup-dir> --after-smoke-passed`.
- **Verify:** 20261001b → `user_reports` t. 20261001d → `moderation_decisions` and `moderation_appeals` t; triggers `user_report_to_queue`, `moderation_decisions_guard`, `moderation_appeals_guard`. 20261009 → trigger `content_report_to_queue`. 20261010 → trigger `content_report_flood_guard`; constraints `content_reports_reason_check` and `content_reports_policy_id_len` present with `convalidated = false`.
- **Stop if:** the wrapper refuses (UNLISTED / SKIP / DEFER: do not force) or the file's own transaction errors (it rolls itself back).
- **Recover:** that file's rollback, in reverse order (1010, 1009, 1001d, 1001b). Rolling back 1001d drops the ledger: export decisions first if any exist.

### Step 9 — Environment variables, then the flags (read at build: redeploy after each change)
- **Before:** steps 3–8 verified by probe; you are the named reviewer (you accepted the 24 h duty); no backup reviewer (leave `MODERATION_BACKUP_USER_IDS` unset).
- **Change, in this order:** `MODERATION_ALERT_USER_IDS` and `MODERATION_DIGEST_USER_IDS` = your TappyAI user id → redeploy; `USER_BLOCKS_ENABLED=true` → redeploy; `REPORTS_ENABLED=true` → redeploy; `MODERATION_ADMIN_ENABLED=true` → redeploy.
- **Verify after each flag:** `/api/config` shows it true; an unauthenticated `GET /api/users/blocks` answers 401 (it was 404); after the last one you open `/admin/moderation` and see the desk and its stats.
- **Stop if:** a route answers 5xx or the desk fails to load.
- **Recover:** remove that variable in Vercel and redeploy (the route answers 404 again). The database objects can stay.

### Step 10 — One controlled test (separate authorization; it creates real rows)
- **Before:** step 9 verified; a test account B you control with one harmless post; you (A) signed in on the iPhone.
- **Change:** A reports B's post (with a severe reason, to exercise the urgent path), then blocks B.
- **Verify:** a queue row exists with its priority (desk); you received the push; B's post left A's feed at once; after you decide on the report, a decision row exists and any duplicate reports are closed.
- **Stop if:** any of those does not happen: do not record the video.
- **Recover:** close the test report as "no violation"; unblock B in Settings → Blocked accounts.

### Not part of this plan
`20261001e` (triggers on `auth.users`); publishing the policies; App Store Connect; any build upload. If 20261001e is ever wanted: add `SET LOCAL lock_timeout = '3s'` first and apply at low traffic.
