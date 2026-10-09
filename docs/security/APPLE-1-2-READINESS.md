# App Review 1.2 — the moderation tool, and what must be true before iOS is resubmitted

Branch `sec/apple-1-2-operator-alerts` (from `origin/main` f9f2b12). iOS side: branch `ios/appreview-1-2-terms-at-auth`.
Written 2026-10-09. **Nothing below has been run against production.** Production access is owner-run by design (`scripts/release/*`).

## The tool Apple asks for already exists — this is how it maps (and what was added)

| Need | Where | State |
|---|---|---|
| One queue for posts, comments, accounts | `moderation_queue` (`review_report`, `comment_report`, `user_report`) → `/admin/moderation` desk | existed |
| **Posts reach the queue at once, with a severity** | **new** trigger `content_report_to_queue` (20261009). Before: only the daily ingest, always priority 1 | **added** |
| Severity triage, age, overdue | priority 3 = 24 h target (violence, inappropriate, self_harm, sexual, child_safety), 2/1 = 72 h; the desk shows age and an "overdue" badge | existed |
| Aggregation of repeats | the desk shows reports-on-target; **a decision now closes every other open report on the same target with the evidence in its resolution** (never on a dismissal or hold) | **added** |
| Actions + audit | decide route: warn, remove post/comment, restrict, ban, hold, no-violation; immutable `moderation_decisions` ledger, hash-chained audit log, appeals | existed |
| Alerts, not manual polling | per-report and per-block push + inbox (content-free); **urgent reports are never throttled and also reach the backup reviewers** | **added / changed** |
| Primary / backup routing | `MODERATION_ALERT_USER_IDS` (one or more primaries, all alerted, shared queue) and `MODERATION_BACKUP_USER_IDS` | **added** |
| Escalation | digest runs every 12 h (08:00 and 20:00 VN); anything overdue **or that will be before the next run** also goes to the backups, titled ESCALATION | **added** |

Automation only ever **queues, ranks, de-duplicates (with evidence) and notifies**. It never removes content, sanctions an account, or marks a report resolved without a human decision.

## Honest limits
- Hobby crons are daily at most, so escalation is every 12 h (two entries), not hourly. An item can be up to 12 h late being escalated; the lead time (12 h before target) covers it.
- A comment/user report with reason `sensitive` or `inappropriate` queues at priority 1 (the 20261001d trigger does not list them) although it alerts as urgent; post reports are mapped to 3. Left as is — flag for a later tidy.
- Whether a human actually accepts the 24 h duty cannot be established from the repo.

## Owner decisions (the only ones that cannot be inferred)
1. **Primary reviewer(s)** — TappyAI user id(s) of existing admin accounts; they accept the 24 h duty.
2. **Backup reviewer** — one more admin id (or "none": then escalation has nobody to reach).

## Step 1 — read the production state (read-only)
```
bash scripts/release/apply-migration.sh --check scripts/release/sql/apple-1-2-probe.sql
```
Anything printed `f`, or an error, names what is missing (the migration → object map is in the probe's comments).

## Step 2 — only what is missing: backup, then apply in order
`scripts/release/backup-prod.ps1` → `CHECKS-PASSED.json`; then one file at a time with `apply-migration.sh <file> --i-have-a-valid-backup <dir>` (these are all AFTER-SMOKE in the policy):
`20260817` → `20260821` → `20260930` → `20261001` → `20261001b` → `20261001d` → `20261001e` → **`20261009_content_reports_to_queue`** (needs 20260821 only).
`20261001` changes RLS on hot tables: measure the feed afterwards. Rollbacks: `supabase/migrations/rollback/` (reverse order).

## Step 3 — Vercel Production env, then flags, then redeploy (flags are read at build)
1. `MODERATION_ALERT_USER_IDS`, `MODERATION_DIGEST_USER_IDS` (same ids), `MODERATION_BACKUP_USER_IDS`.
2. In order: `USER_BLOCKS_ENABLED=true` → `REPORTS_ENABLED=true` → `MODERATION_ADMIN_ENABLED=true`. Redeploy (this also registers the two digest crons).
3. Non-destructive checks: `GET /api/config` shows `p8.userBlocks/reports/moderationNotices` true; unauthenticated `GET /api/users/blocks` is 401 (was 404); each reviewer opens `/admin/moderation` and sees the queue; Vercel → Cron Jobs lists two moderation-digest entries.
Rollback: remove the three flags, redeploy.

## 24-hour procedure (becomes real only when the reviewer confirms)
- Primary: **<name / id — owner>**. Backup: **<name / id or none>**.
- Intake is automatic: the report is in the queue with a priority within seconds; severe ones ping primary **and** backup immediately.
- Routine: open `/admin/moderation` at 08:00 and 20:00 VN (the digests arrive then); work urgent items first (red "overdue" badge = past target).
- Decide: remove the post/comment, restrict or ban per the ladder; one decision closes every duplicate report on that target. Every decision is recorded with time and reason.
- Escalation: anything still open when it can no longer make the target is pushed to the backup by the next digest.
- Weekly: read the ledger counts and the overdue number (desk stats).

## Not yet verified (do not claim)
Production migrations and RLS; the flags; that a reviewer receives the push; the human acceptance of the duty; the on-device recording.

## iPhone recording (after Step 3 passes) — two test accounts, no fake data on real users
1. Fresh install → login: tap Google without ticking → red line beside the checkbox; open the Terms link; tick; sign in.
2. Explore → a clip by account B → ⋯ → Report → reason → confirmation; show the item and its priority in `/admin/moderation`.
3. ⋯ → Block B → confirm → B's clips and comments leave the feed at once; Settings → Blocked accounts lists B.
4. Settings → Community guidelines, Contact (support@tappyai.com).
Attach the video to App Review Information notes with who reviews reports and the 24 h commitment.

## Policy wording that must be live before the recording (found on the live pages 09/10)
- `/terms` §4 has no explicit zero-tolerance sentence. This branch adds `legal.terms.s4.p3` (EN + VI) with a pinned test. **It states a 24 h target publicly: the owner must approve that wording** before it is merged and deployed.
- `/community-guidelines` shows the banner "Proposed text, October 2026 — awaiting the product owner's approval." The owner must either approve the text (the effective line then changes) or publish the full canonical document by setting `COMMUNITY_GUIDELINES_EFFECTIVE_DATE`, `LEGAL_OPERATOR_NAME` and `LEGAL_ADDRESS` (real facts only; never invented). Until then Apple's reviewer sees an unapproved draft.

## Proposed App Review Information notes (fill the bracketed parts only after they are true)
> Guideline 1.2 — what changed in this build ([build number]):
> 1. **Terms before sign-in.** The login and registration screens show a required checkbox: "I agree to the Terms of Service and the Community Guidelines", with links to both and a zero-tolerance statement. Every sign-in method (email, Google, Zalo, Sign in with Apple) is refused until it is ticked; a red message appears beside the box.
> 2. **Report.** Every post, comment and profile has a ⋯ menu → Report with a reason; the report is stored and queued for moderators with a priority; the reporter gets a confirmation (or an error, never a false confirmation).
> 3. **Block.** ⋯ → Block asks for confirmation; the blocked user's posts and comments disappear from the blocker's feed immediately and stay hidden server-side (database row-level security). Settings → Blocked accounts lists and undoes blocks.
> 4. **Moderation.** Reports reach a moderation queue and the moderators are notified by push at once ([primary reviewer] primary, [backup] backup); severe reports (violence, sexual content, self-harm, child safety) target 24 hours and are escalated to the backup if still open. Reviewers remove content and restrict or ban accounts; every decision is recorded.
> 5. **Contact.** Settings → Community guidelines and Contact (support@tappyai.com).
> The attached screen recording was captured on a physical iPhone and shows the flows above.
