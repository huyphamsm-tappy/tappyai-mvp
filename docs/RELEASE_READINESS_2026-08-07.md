# Release Readiness Report — 2026-08-07 (final)

Production: `https://www.tappyai.com` @ `97dd3787f6a0a19c0da0ada67e6149d0e70cc172`
Supabase project: `fwznnobrdctuskgrvuik`
Security branch: `fix/platform-owner-revoke-public` @ `258cb5a` (2 commits ahead of `origin/main`, unpushed)
Android RC: `feat/backoffice-phase0` @ `13b5e33` (local, unpushed)

# DECISION: DO NOT RELEASE

Three blockers are open. None is a new Critical; all are closable. Detail in §6.

---

## 1. Repository consistency (Task 1)

**There are two branches, with two different targets, and the migration belongs to only one of them.**

| Branch | Contains the ACL migration | Target |
|---|---|---|
| `fix/platform-owner-revoke-public` @ `258cb5a` | ✅ yes | PR → `main` |
| `feat/backoffice-phase0` @ `13b5e33` (Android RC) | ❌ no — and must not | APK build only |
| `origin/main` @ `97dd378` | ❌ no (unpushed) | — |

**Evidence.** `git merge-base --is-ancestor dc900ba 13b5e33` → NO.
`git cat-file -e 13b5e33:supabase/migrations/20260807_platform_owner_revoke_public_execute.sql` → ABSENT.

**Why the RC branch must NOT carry it.** The RC diverged from main at `807d77b`:
`git rev-list --left-right --count origin/main...13b5e33` → **237 main-only / 151 RC-only commits, 882 files differing.**
It does not contain `origin/main`. It is an Android artifact branch; Android applies no migrations. Adding
the migration there would put a database change on a branch that must never be deployed, and merging that
branch to main is an 882-file conflict surface, not a release step.

**The migration branch is clean.**
- Fast-forward: `git merge-base 258cb5a origin/main == origin/main` → **zero conflict surface**.
- Purely additive: `git diff --stat origin/main 258cb5a` → 4 files changed, **683 insertions, 0 deletions**.
- Ordering correct: `20260803_platform_owner.sql` → `20260807_audit_chain.sql` →
  `20260807_platform_owner_revoke_public_execute.sql` → `20260807b_sync_last_login_revoke_public_execute.sql`.
  Each REVOKE sorts after the CREATE FUNCTION it applies to.
- No duplicates: no repeated `NNNNNNNN_name.sql`. The only other file naming these RPCs is
  `deferred/FOUNDATION_END_service_role_hardening.sql`, which is explicitly gated
  "⛔ DO NOT APPLY WITH COMPONENT 1" and is not part of the applied set.
- The `20260807b` suffix follows the repo's existing same-day convention
  (`20260706_…` / `20260706b_…`).

**Status: closed.** No cherry-pick or merge was required — the migration is already on the correct branch.

---

## 2. `fn_sync_last_login` audit (Task 2)

**Every caller, enumerated.**

| Channel | Result |
|---|---|
| Application | **exactly one**: `src/app/api/cron/analytics-snapshot/route.ts:60`, via `createAdminClient()` |
| Other function bodies | `pg_proc.prosrc ILIKE '%fn_sync_last_login%'` → **0 rows** |
| Triggers | `pg_trigger` join on `tgfoid` → **0 rows** |
| DB scheduler | **pg_cron is not installed** — `cron.job` does not exist; `pg_extension` has no `pg_cron` row |
| Android / iOS | no call site |

**Execution role:** `service_role` only.

| Grant | Required? | Evidence |
|---|---|---|
| `anon` EXECUTE | **NO** | no anon call path exists |
| `authenticated` EXECUTE | **NO** | no authenticated call path exists |
| `PUBLIC` EXECUTE | **NO** | as above |
| `service_role` EXECUTE | **YES** | the cron route |

**Root cause.** `20260713_auth_daily_rollup.sql` contains **zero** GRANT/REVOKE statements. The exposure was
inherited entirely from Supabase's `ALTER DEFAULT PRIVILEGES` plus PostgreSQL's PUBLIC default — identical to
BL-C7-01. Production ACL before the fix: `anon · authenticated · postgres · PUBLIC · service_role`.

**Critical safety check performed before writing a REVOKE-only migration:** `service_role` holds its **own**
ACL entry (grantor `postgres`), independent of PUBLIC. Had its access come via PUBLIC, a REVOKE-only change
would have silently broken the analytics cron. It does not, so no GRANT is needed.

**Migration prepared:** `supabase/migrations/20260807b_sync_last_login_revoke_public_execute.sql` — one
statement, REVOKE only, no business logic.

**Verified on real PostgreSQL** (`supabase/tests/sync_last_login_revoke.test.ts`, 11 tests, embedded-postgres,
running the actual `.sql` files from disk):
- RED: `anon` can execute it, **and the write lands despite RLS being enabled** on `user_acquisition` — because
  SECURITY DEFINER bypasses RLS. A companion assertion proves `anon` has no direct UPDATE on the table, so the
  write could only have come through the function.
- GREEN: `anon` → 42501, `authenticated` → 42501, no write, ACL clean, `service_role` still works, idempotent.
- **The guard was proven live:** with the REVOKE statement neutered, **5 GREEN tests fail**; the file was then
  restored and verified byte-identical by checksum.

**Status: prepared and verified, NOT applied to production.** Awaiting approval (§6).

---

## 3. Complete SECURITY DEFINER audit (Task 3)

**18 SECURITY DEFINER functions in schema `public`.** Every one classified with evidence.

### Class A — required callable by `anon` (4)
All reached through **`createClient()`** (anon-scoped), so the grant is load-bearing. Removing it would break
the product.

| Function | Evidence |
|---|---|
| `increment_deal_click` | `src/app/api/deals/[id]/click/route.ts:14`; explicit `GRANT … TO anon, authenticated` in `20260724_partner_deals_hardening.sql` |
| `music_increment_play` | `src/app/api/sound/[trackId]/play/route.ts:20` via `createClient()`; route comment: "anonymous listens count too" |
| `music_followed_count` | `follow/route.ts:9`, `[trackId]/route.ts:65` — public track GET |
| `music_saved_count` | `[trackId]/route.ts:64`, `save/route.ts:11` |

### Class B — required callable by `authenticated` (2)
`src/app/api/reviews/[id]/interact/route.ts` calls `getRequestUser(req)` and returns early when `!user`, so
both run as an authenticated user, never anon.

| Function | Current grants | Note |
|---|---|---|
| `increment_review_view` | `authenticated` only | ✅ correctly scoped — the model the others should follow |
| `sync_review_watch_stats` | `anon, authenticated, PUBLIC` | ⚠️ over-granted; only `authenticated` is used (finding M-2) |

### Class C — required only by `service_role` (5)

| Function | State |
|---|---|
| `fn_is_platform_owner` | ✅ revoked. **No application caller** — invoked only from inside `fn_grant_admin_role` / `fn_revoke_admin_role`, both SECURITY DEFINER, so they run as the owner and need no grant |
| `fn_grant_admin_role` | ✅ revoked; `src/app/api/admin/rbac/roles/route.ts:63` via `createAdminClient()` |
| `fn_revoke_admin_role` | ✅ revoked; `src/app/api/admin/rbac/roles/[id]/route.ts:39` via `createAdminClient()` |
| `fn_verify_audit_chain` | ✅ revoked (C7); no application caller, no internal caller — operations use only |
| `fn_sync_last_login` | ⚠️ **still exposed**; fix prepared (§2) |

### Class D — trigger-only / internal (6)
`fn_audit_log_chain`, `handle_new_user`, `update_follow_counts`, `update_review_comment_count`,
`update_review_like_count`, `update_review_save_count`.
**Evidence:** `pg_get_function_result(oid) = 'trigger'`. A function returning `trigger` has no callable
signature, so PostgREST cannot invoke it — their anon/PUBLIC grants are inert.

### Unclassifiable — no caller in any class (1)
`get_interaction_avgs(p_review_id uuid)` — **no application call site, no internal caller, no trigger.** Dead
since `add_phase4_hardening.sql` ("W-02 performance"), yet still granted to anon/authenticated/PUBLIC.
Read-only aggregate (`AVG(watch_seconds)`, `AVG(completion_rate)`) over public reviews. Finding L-2.

---

## 4. Android final blocker (Task 4)

**NOT RUN. Cannot be marked PASS.**

Two independent obstacles, both measured:
1. **Quota not reset.** Device/host clock `22:45 +07`; `FREE_DAILY_LIMIT = 15` resets at VN midnight, ~75 min away.
   Both test accounts were exhausted during today's integrated UAT.
2. **Device disconnected.** `adb devices` returned `R58RC0V30BH` earlier in this session, then
   `no devices/emulators found`; `adb reconnect offline` did not recover it.

The Stop-path code in `ChatViewModel.kt` is byte-identical to where it was proven GREEN on `d9f9f0f`. That is
an argument, not a test, and per the standing rule it does not constitute a PASS.

---

## 5. Final release audit (Task 5)

### Security

| ID | Severity | Finding | Blocking |
|---|---|---|---|
| **C-1** | Critical | **RESOLVED.** anon could call the Owner RPCs and self-grant `admin`. Applied to production and verified 4 ways: anon → `42501` on all three (vs `200`/`FORBIDDEN`/`NOT_FOUND` before); `authenticated` → `42501` with 0 rows written; `aclexplode` → exactly 6 rows (`postgres` + `service_role`); `service_role` genuinely executed `fn_is_platform_owner` (returned `false`). Repro: `POST /rest/v1/rpc/fn_grant_admin_role` with the public anon key. **Fixed** | **NO** |
| **C-1b** | Critical (process) | The fix exists in production and in one local worktree, **not in git**. `git branch -r --contains dc900ba` → empty. Deploying cannot regress it (grants don't ride a deploy), but a database provisioned from `supabase/migrations/` alone rebuilds the vulnerable state. **Open** | **YES** |
| **H-1** | High | `fn_sync_last_login` anon-executable SECURITY DEFINER → unauthenticated, unrate-limited full-scan `UPDATE … FROM auth.users`, bypassing RLS. Availability only: returns void, write is idempotent, nothing leaks or corrupts. Repro: `POST /rest/v1/rpc/fn_sync_last_login` (deliberately **not executed** — static evidence is conclusive and running it would be a pointless production write). **Fix prepared + PostgreSQL-verified, not applied** | **YES** (see §6) |
| **M-1** | Medium | `p_actor_id` is a caller-supplied parameter in `fn_grant_admin_role`/`fn_revoke_admin_role` instead of `auth.uid()`; authorization is checked only for `super_admin`. After C-1 only `service_role` can reach it, i.e. our own API routes, which enforce `requireOwner`. Contrast `anon_chat_usage_increment`, which derives identity from `auth.uid()` — the correct pattern. **Accepted** (needs its own migration) | **NO** |
| **M-2** | Medium | `sync_review_watch_stats` granted to anon+PUBLIC but only ever called as `authenticated`. Unnecessary exposure; idempotent recompute, so worst case is compute. **Accepted** | **NO** |
| **L-1** | Low | `profiles` is anon-readable (id, username, full_name, avatar_url, onboarded, counts, language — **no email, no phone**). Correct for a social product; enables user-id enumeration. **Accepted** | **NO** |
| **L-2** | Low | `get_interaction_avgs` is dead code still granted to anon. Read-only aggregate over public reviews. **Accepted** | **NO** |
| **L-3** | Low | 6 trigger-only functions carry anon/PUBLIC grants that are inert (no callable signature). Hygiene. **Accepted** | **NO** |

**RLS verified, not assumed.** `admin_roles`, `audit_log`, `user_acquisition` have `relrowsecurity = true` with
**0 policies** naming anon/public, yet `has_table_privilege('anon', …, 'INSERT')` is **true** — the table GRANT
exists and RLS is the only barrier. Measured over PostgREST: reads return `[]`; INSERT into `admin_roles`
returns `42501 new row violates row-level security policy`. The insert probe used an FK-violating `user_id`, so
it could not have persisted even if RLS had allowed it.

**Correction to a previous claim.** I earlier reported that loading `/admin` exercises `fn_is_platform_owner`.
It does not — `src/lib/admin/owner.ts:36` reads the `platform_owner` **table** directly via
`.from('platform_owner')`. The C-1 conclusion is unaffected (the function was separately called under
`SET LOCAL ROLE service_role` and returned `false`), but that reasoning was wrong.

**Correction to L-2 in the previous report.** I earlier claimed 7 of 8 exposed functions were absent from
version control. That was a grep artefact — the pattern omitted the `public.` prefix. **All 8 are in
`supabase/migrations/`.** Withdrawn.

### Database / Supabase

| Finding | Evidence | Blocking |
|---|---|---|
| `20260711_anon_chat_usage.sql` **was never applied to production** | Neither `anon_chat_usage_increment` nor table `anon_chat_usage` exists (`pg_proc`/`pg_class` → 0 rows) | **NO** |
| — consequence | `/api/chat:122` calls that RPC for anonymous sessions and explicitly falls back to the httpOnly cookie cap ("migration not applied yet"). The cookie is resettable by clearing cookies (documented at `route.ts:198`) | **NO** |
| — why impact is nil today | **Anonymous sign-ins are disabled in the Supabase project.** `POST /api/auth/anonymous` → `503 {"error":"anonymous_unavailable"}` in production, so `user?.is_anonymous` is never true and the path is dead code | **NO** |
| Unauthenticated chat is still bounded | `rateLimit('chat:'+clientIp, 30, 60_000)` — 30 req/min/IP, plus the cookie cap | **NO** |

### Cron

All 5 cron routes enforce `CRON_SECRET` **fail-closed** (`if (!secret || header !== ...)` — a missing env var
denies rather than allows). Verified in production: `analytics-snapshot`, `behavior-rollup`,
`deal-notifications`, `lunch-reminder`, `morning-brief` all → **HTTP 401** unauthenticated, and 401 with a wrong
bearer. **No finding.**

### Admin / OAuth / Scam Shield

- Owner loads `/admin` (header renders "huypham.sm@gmail.com / Platform Owner") and `/admin/rbac` (lists the
  existing `super_admin`). No console errors. Grant/Revoke deliberately not exercised — that would mutate
  production. **No finding.**
- Google Sign-In verified on device earlier in the release. `DEVELOPER_ERROR` lines in logcat originate from
  Phenotype.API, not our credential request. **No finding.**
- Scam Shield: URL check verified field-by-field against a direct API call; error mapping proven end-to-end
  (`400 private_url` → localized copy); QR contract replicated with curl. **No finding.**

### Web / Backend

| Check | Result |
|---|---|
| `tsc --noEmit` on the release branch | **exit 0** |
| Full vitest suite, release branch `258cb5a` | 881 tests — **878 passed, 3 failed** |
| Full vitest suite, baseline `origin/main` (same worktree) | 861 tests — **858 passed, 3 failed** |
| Delta from my 2 commits | **+20 tests, all passing; 0 new failures** |
| SQL suite | **132/132 passed** (was 121) |

**The 3 failures are pre-existing and environment-dependent, not caused by this release.** Root cause:
`src/lib/admin/auditChainInvariants.test.ts:42` strips SQL comments with
`.split('\n').map(l => l.replace(/--.*$/, ''))`. On a CRLF checkout every line retains a trailing `\r`; `.`
never matches `\r`, so `--.*$` cannot reach `$` and **comments are not stripped**, leaking comment text into the
extracted trigger body.

Proven by isolation: the same test passes **16/16** at `origin/main` in an LF worktree
(`tappyai-controller-v2`) and fails **3/16** at the *same commit* `97dd378` in the CRLF worktree
(`tappyai-secfix`) — with my commits checked out *and* with them absent. File sizes differ by exactly 521 bytes
across 521 lines; `core.autocrlf=true` makes git report both checkouts as clean.

Notably the test's own anti-vacuity guard (S-00) is what catches this, so it fails loudly rather than reporting
a false green. CI on Linux checks out LF and is unaffected. **Finding T-1, Medium, not blocking** — reported,
not fixed (out of scope: no refactoring, no unrelated cleanup).

### Android

| Item | State | Blocking |
|---|---|---|
| RC `13b5e33` — integrated UAT | PASS on Sign-In, logout, persistence, profile, chat/streaming/markdown/CTA/follow-ups, planner generate/images/cost/day-tabs/booking/share, history restore, Scam Shield URL (4 cases), Explore feed/like/comment/save/share, settings, vi↔en, dark mode | NO |
| **Planner Stop** | **NOT RUN** — quota + device disconnected (§4) | **YES** |
| Branch state | local only, unpushed | NO |

### Media / Blob

**E-1 — External.** Vercel Blob store `y5ozy0i9wdb73mam` returns **HTTP 403**, re-verified 2026-08-07. Hobby-tier
quota suspension, `blockedUntil` 2026-09-02. All Blob-hosted media unavailable. Not fixable from code — requires
owner action in the Vercel dashboard. **Blocking: owner's call** (YES if the release must serve media).

### Known technical debt (accepted, non-blocking)

`p_actor_id` design (M-1) · `sync_review_watch_stats` over-grant (M-2) · dead `get_interaction_avgs` (L-2) ·
inert trigger grants (L-3) · unapplied `20260711_anon_chat_usage.sql` · CRLF-sensitive invariants test (T-1) ·
Delete Account has no backend (pre-existing Play blocker; iOS ships the email-request path) ·
RC branch is 882 files divergent from main and must never be merged as-is.

---

## 6. Release decision (Task 6)

# DO NOT RELEASE

No new Critical was discovered, and the one Critical (C-1) is closed with production evidence. The decision is
driven by three open blockers:

| # | Blocker | What closes it |
|---|---|---|
| 1 | **C-1b** — the security fix is not in git | Push `fix/platform-owner-revoke-public` @ `258cb5a` → PR → merge. Fast-forward from `origin/main`, 683 insertions, 0 deletions, zero conflict surface |
| 2 | **H-1** — `fn_sync_last_login` still anon-executable in production | Apply `20260807b_…sql` (one REVOKE statement). Prepared, PostgreSQL-verified RED→GREEN, guard proven live. Awaiting your approval to apply |
| 3 | **Planner Stop UAT** — not run | Reconnect device + retest after VN midnight. Cannot be marked PASS on a code-identity argument |

Plus **E-1 (Blob 403)**, which is external and yours to decide.

Once 1–3 are closed with evidence, this becomes READY FOR PUSH / MERGE / DEPLOY.

Nothing was pushed, merged, or deployed. The only production change made in this session remains the C-1 grant
migration; the H-1 migration is committed locally and **not** applied.
