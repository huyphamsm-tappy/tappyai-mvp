# Explore Navigation — Deployment Plan (PREPARED, NOT EXECUTED)

**Status:** plan only. **No merge, no push, no deploy occurs until the owner explicitly orders each step after UAT.**
**Current state (read-only check, 2026-07-28):** worktree `cool-vaughan-b3c7ff` branch `main` is **21 commits ahead of `origin/main`, 0 behind** (last-known remote refs; re-verify with `git fetch` at execution time). Production = `1184bd5` (verify via `/api/version`).

## ⚠️ Release-unit reality the owner must decide on

The 21 unpushed commits are **three interleaved work streams**, and explore-nav **textually depends** on the playback commits (both rewired `src/app/reviews/page.tsx`):

1. `8b9d7d5`, `73ec5dc` — WEB-EXPLORE-FOLLOW-002 fix + HEADER-001 CTA (their own UAT was never closed; see `archive/WEB_EXPLORE_E2E_PLAN.md`)
2. `59c493e..db52586` — Playback track Phases 1.1–1.7 (PlaybackSession)
3. `ffa7e79..8da316e` — Explore navigation migration (this RC)

**Consequence:** pushing `main` ships all three. Cherry-picking explore-nav alone onto `origin/main` is NOT viable without heavy conflict surgery and would produce an untested tree. **Recommended: UAT covers all three streams (playback + follow/header smoke included below), then ship the branch as one release.** Alternative (owner's call): hold the push until the playback track completes its own acceptance.

## Step 1 — Merge plan
- No merge commit needed: local `main` is a strict superset → **fast-forward push**.
- Pre-push checks (execute in order, abort on any failure):
  1. `git fetch origin` → confirm still `ahead N, behind 0`. If behind ≠ 0: STOP, rebase/merge decision goes back to the owner (new remote commits would make this an untested combination).
  2. Working tree clean; `npx tsc --noEmit`; `npm test`; `npm run build` — all green at the exact push SHA.

## Step 2 — Push plan
- `git push origin main` (fast-forward only; **never** `--force`).
- Record the pushed SHA in the sprint board.

## Step 3 — Deployment plan
- Vercel auto-deploys `main` on push (standard project flow). No env/config/secret changes are part of this release (readiness item 14).
- Watch the Vercel build to completion; if the build fails remotely (it cannot differ from local exit-0 except for env drift): do not retry blindly — diagnose, report to owner.

## Step 4 — Production verification plan (immediately after deploy)
1. `GET https://www.tappyai.com/api/version` → equals the pushed SHA.
2. Anonymous smoke on prod: U1 (profile→Back exact restore), U2 (refresh restore), U4 (feed-switch clean top) from the UAT guide.
3. Console clean on `/reviews`; `__exploreSession` present; one `restore_attempt` per entry.
4. Playback-stream smoke (because the release unit includes it): feed video plays/pauses on scroll; YouTube embeds behave (**Browser pane/foreground required** — IntersectionObserver features falsely read broken otherwise).
5. FOLLOW-002 smoke: avatar "+" follows from the feed (signed in).
6. Telemetry: confirm `explore_session.freeze` / `restore_result` events arriving via `/api/track`; health metric `restore_result.exact / restore_attempt` observed ≥ the local ratio over the first day.
7. Cache-safety check: `/api/reviews/feed` personalized responses still send private Cache-Control (regression guard for the 2026-07-27 P0 — untouched by this work, verify anyway).

## Step 5 — Rollback plan (production)
| Level | Trigger | Action | Time |
|---|---|---|---|
| R1 | Explore-nav regression, isolated | `git revert` the offending step commit(s) on `main` → push → auto-deploy | minutes |
| R2 | Switchover unsound in prod | Revert `0378fce c1f9308 a9ac82c 2d44f1a` (legacy restoration returns wholesale) → push | minutes |
| R3 | Whole release bad | Vercel dashboard → instant rollback to the previous production deployment (`1184bd5` build), then decide the git story calmly | < 5 min, no build wait |
| R4 | Data concerns | None expected — this release touches no schema, no API contracts, no storage server-side | n/a |

**Standing rule during execution:** every step above happens only on explicit owner instruction, one step at a time, with the owner seeing each result before the next.
