# V3 User Data Foundation — session handoff (2026-09-08)

**Read this first when resuming.** Everything below is implemented, verified, and
**deliberately uncommitted**.

- **Worktree:** `D:\Claude\Projects\TappyAI\.worktrees\v3-user-data-foundation`
- **Branch:** `feat/v3-user-data-foundation`, based on `origin/main` (b85ddd9)
- **HEAD:** still `b85ddd9` — **0 commits ahead**. All work is working-tree only.
- **Not done, on instruction:** no commit, push, merge, deploy, or migration apply.

---

## 1. Verification status — everything green as of the last run

| Check | Result |
|---|---|
| Web test suite | **9455 passed, 0 failed**, 44 skipped (467 files) |
| Required-suite gate | OK — every required suite executed |
| DB boundary suite (real PostgreSQL) | **59 tests** |
| Android unit tests | **263 passed, 0 failures** |
| `:app:assembleDebug` | ✅ APK produced |
| `architecture:check` | 12/12 ✅ |
| `check:sql-grants` | 0 errors ✅ |
| `tsc --noEmit` / `next build` | clean ✅ |

To reproduce, see [`tappyai-worktree-build-setup`] essentials:
`npm ci` first; copy `.env.local`, `android/gradle.properties` and
`android/local.properties` from `D:\Claude\Projects\TappyAI\tappyai-mvp`;
**delete `.env.local` again afterwards — it holds production service-role keys**;
Android needs `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`.

⚠️ This repo has **mixed line endings per file** and no normalizing
`.gitattributes`. `src/components/ChatInterface.tsx` is CRLF; most files are LF.
Scripted (Python) rewrites silently convert them and produce whole-file phantom
diffs — verify with `git diff --ignore-cr-at-eol --stat`.

## 2. What was built

**The decisive finding.** `public.profiles` is not private: two permissive SELECT
policies with `qual=true` for `{public}`, plus table grants to `anon` and
`authenticated`; RLS filters rows, never columns. A `date_of_birth` column there
would be world-readable **and writable by its own subject** — which would make
the 18+ gate advisory. So demographics live in `public.user_demographics`, a 1:1
private companion keyed on `profiles.id`, following the pattern this repo already
used three times. Full reasoning: [ADR-027](../../architecture/ADR-027-user-demographics-isolation.md).

**Database** — `supabase/migrations/20260908_user_demographics_foundation.sql`
- `user_demographics` (DOB, gender, city, country, occupation, industry, education)
- `date_of_birth`, `age_declared_at`, `dob_corrections`, `admin_corrections`
  granted to **no PostgREST role at all**
- 4 functions: `age_band_of`, `user_age_status`, `set_user_date_of_birth`,
  `admin_set_user_date_of_birth`

**Shared lib** — `src/lib/account/`: `ageEligibility`, `demographics`,
`userDataClassification`, `requireEligibleUser`, `ageGateClient` (+ tests)

**Contract** — `/api/profile` extended (no new API). Android consumes it verbatim.

**Web** — `/age-check`, w6 i18n, auth-callback + home gates, gender migrated off
`user_metadata`, 6 gated surfaces on the shared interceptor

**Media boundary (2026-09-09)** — gating only the POST left both review
composers able to write user-generated media to storage FIRST and be refused
one call later. Both upload authorizations are now 18+ on the server:
`/api/reviews/upload` (receives the bytes) and `/api/upload/video` (mints the
resumable session the browser PUTs to directly). Both use `refuseIneligible`,
never a second copy of the rule. On `/api/upload/video` only the MINT is
gated, not the completion — refusing a confirmation of bytes already in
storage would strand the object, so the gate sits where the write is
authorized. `/api/upload/audio` serves the separate `/music/upload` surface
and was audited but left alone; `/api/profile` stays ungated on purpose (it
is the remediation path). See §7.

**Android** — `agecheck/` screen + VM, account DTO/API/repo, nav route,
login-transition **and cold-start** gates, strings in both locales

**Docs** — ADR-027 plus three phase reports in this directory.

## 3. The two launch blockers

1. **Legal.** No shipped text states a minimum age, and `src/lib/i18n/legal.ts`
   enumerates collected data listing neither DOB nor gender. Legal review is
   required before ship. No legal copy was written by this task.
2. **Admin DOB-correction surface.** The audited primitive
   `admin_set_user_date_of_birth()` exists and is `service_role`-only, but its
   HTTP route, RBAC permission and back-office UI are Controller-owned and were
   deferred (§34). Until they exist, the only remedy is raw SQL by a keyholder.
   See [V3_DOB_ADMIN_CORRECTION_PATH.md](./V3_DOB_ADMIN_CORRECTION_PATH.md).

## 4. Known gap, scoped as a separate task

**Android emits no client-side behavioural events.** `AnalyticsProvider` is a
logcat stub AND has exactly one consumer (the developer diagnostics screen) — so
no product screen calls `track()`. Android's *server-side* behaviour is already
captured, because it calls the same backend routes as web. Exact follow-up scope:
[ANDROID_ANALYTICS_GAP_AUDIT.md](./ANDROID_ANALYTICS_GAP_AUDIT.md).

## 5. Open product decisions

1. Anonymous Chat is now refused (`auth_required`) — a real funnel change to a
   deliberately-built feature. Confirm this is intended before ship.
2. Whether to pre-announce the one-time age prompt (every existing account is
   prompted at once on release).
3. Which RBAC role may correct a date of birth.
4. Whether any AI use case should declare `precision: 'exact'` — today none does.
5. Whether the prompt engine should recognise `gender: 'other'`.

## 6. Sensible next steps

- Owner review of the diff, then commit on this branch and open a PR.
- Legal review of the Privacy Policy / ToS (blocker 1).
- Controller task: admin correction route + RBAC + UI (blocker 2).
- Separate task: Android analytics instrumentation (§4).
- Migration apply, under Owner authorization, with its own preflight and rollback
  window — the file's own header states this and carries a VERIFY block.
