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
2. Apply only what §1 shows missing, one file at a time, in this order, each with
   `bash scripts/release/apply-migration.sh <file> --i-have-a-valid-backup <dir> --after-smoke-passed`:
   `20260817` → `20260821` → `20260930` → `20261001` → `20261001b` → `20261001d` → `20261001e` → **`20261009_content_reports_to_queue`**.
   If the wrapper answers UNLISTED/SKIP/DEFER/VERIFY-ONLY for a file, stop and report: never force it (a pre-20260913 file is most likely already on production).
3. After each: re-run the probe; the matching section must flip to `t` / expected counts.
4. Risk: `20261001` adds RLS predicates to `reviews`, `review_comments`, `notifications` (hot tables). Measure feed latency after it.
5. Rollback: `supabase/migrations/rollback/<same name>_rollback.sql` in reverse order (`--rollback`); restore from the backup only as a last resort.

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
