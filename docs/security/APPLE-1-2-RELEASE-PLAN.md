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

## 1a. OBSERVED on production, 2026-10-10 (three read-only catalog queries in the Supabase SQL Editor; evidence in `APPLE-1-2-PROBE-RESULT-2026-10-10.md`)
Present: `content_reports`, `moderation_queue`, `moderation_actions` (RLS on), `chat_blocks` (RLS on), `fn_ingest_moderation_reports`, and all eight tables the new
migrations need (reviews, review_comments, review_likes, user_follows, notifications, profiles, account_status, audit_log).
**Missing: `user_blocks` + RLS + `safety_private.*` (0 block policies), `user_reports` + trigger, `moderation_decisions`, `moderation_appeals`, `banned_identities`,
the post-report trigger. And 20260930 is NOT applied: `content_reports` still has `WITH CHECK (true)` (any signed-in user can insert arbitrary rows through the API).**
No migration ledger table exists (applied by hand).
**Minimal set: 20260930, 20261001, 20261001b, 20261001d, 20261009, in that order.** **20261001e is DEFERRED**: no application code uses `banned_identities`, and it
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
2. Apply the minimal set (today: 20260930, 20261001, 20261001b, 20261001d, 20261009; **not** 20261001e), one file at a time, in this order, each with
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

## 9. Step by step, with a stop rule and a check after each (each production step needs its own authorization)
| # | Step | Verify afterwards | STOP and roll back / hold if |
|---|---|---|---|
| 0 | Re-run probes 1–3 in the SQL Editor right before starting | same as `APPLE-1-2-PROBE-RESULT-2026-10-10.md` | anything differs from it |
| 1 | Merge `sec/apple-1-2-moderation-release` → `main`, deploy | `/api/version` = new SHA; `/`, `/login` 200; `/api/config` flags unchanged (false) | any 5xx, a flag appears on |
| 2 | `backup-prod.ps1` | `CHECKS-PASSED.json` written | any check fails: no migration |
| 3 | Apply 20260930 | probe 3: `applied: true`; post a report from the app's legacy menu still works (401 unauth proves the route only) | reports start failing for signed-in users |
| 4 | Apply 20261001 | probe 1: 9 tables… `user_blocks` t, `block_policy_count` 10, functions t; feed loads for a signed-in test account; latency within +50 ms | any feed error or latency regression → rollback 20261001 |
| 5 | Apply 20261001b | `user_reports` t | — |
| 6 | Apply 20261001d | `moderation_decisions`, `moderation_appeals` t; triggers `user_report_to_queue`, guards present | — |
| 7 | Apply 20261009 | trigger `content_report_to_queue` present | — |
| 8 | Set env vars (alert/digest ids = the owner), then the three flags one at a time, redeploy after each | `/api/config` shows each flag; unauthenticated `GET /api/users/blocks` = 401; the owner opens `/admin/moderation` | a route 5xx → remove that flag, redeploy |
| 9 | One controlled test (needs separate authorization): test account B posts, A reports and blocks | queue row with priority; push received; B's post gone from A's feed; ledger row after a decision | any step fails → stop, do not record |
