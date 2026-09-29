# RELEASE GOVERNANCE — TappyAI web + Android release (from 2026-09-29)

Rules for how code reaches production in this release, who decides, and what evidence each step needs.
The step-by-step commands live in `RELEASE-PLAN-2026-09-29.md` (migrations, env gap, run sheet) and
`DEPLOY-CHECKLIST.md` (§0 backup … §6); this file does not repeat them — it decides **when** they may run.

Owner / approver: **Huy Phạm** (the only person who approves UAT, merges to `main`, changes production).
Lead: the release session (prepares, verifies, runs only what Huy has approved in chat).

---

## 1. Branches

| Branch | Role |
|---|---|
| `rc/web-uat` | **The ONLY release branch.** Everything that ships is on it first, and UAT (`uat.tappyai.com`) deploys it. |
| `main` | Production. Changes only through **PR #252 (`rc/web-uat` → `main`)**, merged with a merge commit. Hotfixes (like C2, PR #260) go to `main` **and** are merged back into `rc/web-uat` the same day. |
| `feat/*`, `fix/*`, `wip/*`, worktree branches | Reach `rc/web-uat` only by a checked merge: `git fetch` + `git merge` (never rebase, never force-push), merge-guard clean, full gates of §3 re-run. Never merged into `main` directly. |
| `feat/affiliate-live` (PR #255) | Merged into `rc/web-uat` on 2026-09-27 (`dc51447`), PR state MERGED. Nothing left to merge. |
| Phase 8 (`phase8-master`, `P8_*`) | **Not part of this release.** Merged after launch following `PHASE8-OVERLAP-2026-09-29.md`. |

## 2. Code freeze

- Freeze starts when Huy approves UAT (the UAT sign-off of §3 gate 5).
- After freeze `rc/web-uat` accepts **blocker fixes only** (a bug that fails a gate or breaks a core flow: login, chat,
  payments, uploads, sharing, data access). Everything else goes to `docs/uat/POST-LAUNCH-BACKLOG.md`.
- **Every commit after freeze re-runs all gates of §3** on the new SHA; the release SHA is the last SHA that passed them.

## 3. Gates before merging PR #252 (rc → main)

Each gate needs its evidence recorded in `RELEASE-PROGRESS.md` (SHA + link/path). Evidence files go ONLY to the
private bucket `gs://tappyai-uat-evidence/evidence/<SHA>/…` — never into git, never to a public bucket.

| # | Gate | Evidence |
|---|---|---|
| 1 | All tests + typecheck + lint + build + architecture tests green on the release SHA | command output (counts, exit 0) — `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, the architecture suites (`*architecture*`, `consultativeArchitecture`, `publicBoundary`) |
| 2 | AI consultation meets §9 in **all 5 areas** on replay, neither column (quality, cost/turn) worse than the kept baseline, **and** Huy approved the §10 UAT page | replay `summary.md` per area + the approved artifact link |
| 3 | Every reported blocker has a PASS screenshot on UAT | `evidence/<SHA>/…` per blocker id |
| 4 | Android e2e green + Huy tested on a real phone | e2e run folder + Huy's note |
| 5 | Huy signs off UAT **once** (web + Android) | Huy's chat message, quoted with date/time in RELEASE-PROGRESS |
| 6 | Backup §0 valid | `D:\TappyAI-backups\prod-<stamp>\CHECKS-PASSED.json` from `scripts/release/backup-prod.ps1` |

A gate that is not met blocks the merge. No gate is waived without Huy writing so in chat.

## 4. Release order (production)

Only after all gates. Each step is in `RELEASE-PLAN-2026-09-29.md` §1/§4; the order is binding:

1. **Backup** (`backup-prod.ps1`, §0) → `CHECKS-PASSED.json`.
2. **Pre-check** `precheck-all.sql` (read-only) — prod state snapshot. ⚠ `commerce_providers` (#5) and its 7 rows (#7)
   were applied to production on 2026-09-27 (`docs/commerce/AFFILIATE_STATUS.md` §0): treat #5 and #7 as
   **VERIFY-ONLY** (already applied); apply #6 (`commerce_feed_items`) only if the pre-check shows it absent.
3. **Migrations 1 → 15** in the listed order. **Deferred:** D1, D2, D4 (not this release). **S1** (#16) and #17 only
   after the deploy; **H1/M1** (#18, #19) only after the smoke passed and a fresh backup.
4. **Merge PR #252** (merge commit, by Huy).
5. **Vercel production deploy** of that merge; wait until `/api/version` = release SHA.
6. **Env / flags** (RELEASE-PLAN §3a): `ACCOUNT_SELF_DELETE_ENABLED=false` (today it is `true`), `SERPER_DAILY_CREDIT_CEILING`,
   `ACCESSTRADE_*` (owner), and the `SNIPPET_PRICE_GUARD_V2` decision of §7 below; `NEXT_PUBLIC_PLAY_LISTING_LIVE` stays **unset**
   until Huy makes the Play listing public. Env changes need a redeploy to take effect.
7. **S1** + #17.
8. **Feed ingest** (`/api/cron/feed-ingest`, needs `ACCESSTRADE_API_KEY`).
9. **Smoke** — `scripts/release/verify-prod.mjs` (§ PRODUCTION-VERIFICATION below) + RELEASE-PLAN §5b manual.
10. Fresh backup → **H1/M1** → **smoke again**.
11. **AAB vc10** built from the release SHA (`scripts/release/build-aab.sh <sha>`).
12. **Play Internal testing** → Huy tests on his phone → **Production track** (app stays **hidden** on Play until Huy makes it public).

## 5. Tag and record

After step 10 passes: `git tag -a release-2026-09-XX <sha> -m "…"` on `main`, pushed. RELEASE-PROGRESS records:
release SHA, Vercel deployment id, migrations applied (with times), who approved (Huy) and when, backup folder.

## 6. Rollback

**Triggers** (any one): the smoke fails a core check; 5xx rate on `/api/*` clearly above the pre-release baseline
(`evidence/prod-baseline-f42ae4b/`); chat errors ("Đã xảy ra lỗi") on more than an isolated turn; login, payment or
upload broken; a data-access failure (user A sees user B's data).

**Who decides:** Huy. The lead may roll back the **web deploy** immediately without asking when login, chat or payment is
broken for everyone, and tells Huy at once.

**Steps:**
1. Vercel → Production → promote the previous deployment (`f42ae4b`, `dpl_AwmZEwWgMNzJzKun5K7c6CYKvsne`) — instant, no build.
2. Migrations: roll back only what was applied, in reverse (RELEASE-PLAN §1 "Rollback order"), via
   `apply-migration.sh … --rollback --i-have-a-valid-backup <dir>`. Additive tables (#5–#7) may stay: the old code does not read them.
3. Rows removed by one-off sweeps come back only from the §0 dump.
4. Env: revert any flag changed in step 6 of §4.
5. `main` is reverted with a revert commit (never a force-push); `rc/web-uat` keeps the release commits for the fix.

## 7. Environment matrix

Names only; values never in git or chat. Source: `vercel env ls` (29/09). Full gap analysis: RELEASE-PLAN §2.

| Group | Production | Preview (UAT) | Development | Secret | Who may change |
|---|---|---|---|---|---|
| Supabase URL / anon key | ✓ own project | ✓ audit project | local | anon: no · service role: **yes** | Huy |
| `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `STRIPE_*`, `ZALO_APP_SECRET`, `ZALO_VERIFY_SECRET`, `CCP_ATTRIBUTION_SECRET` (different per env), `CRON_SECRET`, `VAPID_PRIVATE_KEY`, `GCP_*` service accounts | ✓ | ✓ (own values) | local | **yes** | Huy |
| `ACCESSTRADE_PUBLISHER_ID` | ✓ | ✓ | local | no (public in links) | Huy |
| `ACCESSTRADE_API_KEY`, `ACCESSTRADE_FEED_ENDPOINT` | ✗ (to add, owner) | ✗ | — | key: **yes** | Huy |
| `GCS_MEDIA_BUCKET`, `GCP_MEDIA_SERVICE_ACCOUNT` | **must stay unset** (code defaults = prod) | ✓ UAT values | — | no | Huy |
| `ACCOUNT_SELF_DELETE_ENABLED` | ✓ **`true` today → set `false` at release** | unset (off) | — | no | Huy |
| `AUTH_GOOGLE_ENABLED` | ✓ **keep** (Phase 8 reads it) | — | — | no | Huy |
| `NEXT_PUBLIC_PLAY_LISTING_LIVE` | **unset (off)** until the Play listing is public | unset (UAT shows the badge by rule) | — | no | Huy |
| `SNIPPET_PRICE_GUARD_V2` | ✗ unset → **OFF** | ✓ set for `rc/web-uat` (UAT and the replay run with it **ON**) | — | no | Huy — **decision needed** (CẦN HUY QUYẾT Q-ENV1) |
| Consult flags `CONSULT_*`, `CONSULTATIVE_V1`, `RISK_BACKSTOP`, `PLACE_GUARD_ATTRIBUTION_V2` | unset (code defaults = what UAT tested) | unset | — | no | lead proposes, Huy approves |
| `LLM_*`, `AUDIT_*`, `CCP_EVENT_LOG`, `REPLAY*` | **must stay unset** | unset | harness only | — | nobody |
| `P8_*` | present, unread by this release | — | — | some | Phase 8 only |

## 8. After the release

- Delete from this PC: `D:\TappyAI-backups\pgpass`, `pghost.txt`, `accesstrade.txt` (any copy), and the prod secret
  files noted in `PRELAUNCH-REPORT.md` (Huy confirms each deletion).
- Write `HANDOFF.md` (what shipped, SHA, open items, where evidence is).
- iOS: TestFlight pipeline exists (build 16); App Store work is a separate release.
- Merge Phase 8 into `rc/web-uat` per `PHASE8-OVERLAP-2026-09-29.md`, then a new release cycle with these same gates.
