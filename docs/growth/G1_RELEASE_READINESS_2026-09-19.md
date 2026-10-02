# G1 — engineering close-out and release readiness (2026-09-19)

**Scope of this document:** evidence only. It does not make the release decision. It records where `feat/g1-completion` stands relative to the release candidate, what was closed on the repository side today, what remains for the owner, and what would block a release.

---

## 1. Current HEAD / worktree

| Item | Value |
|---|---|
| Worktree | `D:\Claude\Projects\TappyAI\.worktrees\g1-completion` |
| Branch | `feat/g1-completion` — **not pushed** (no `origin/feat/g1-completion`) |
| HEAD before today | `6fd3d25` — tree clean |
| Release candidate | `rc/web-uat @ b0896e7` in `.worktrees/web-uat-rc` — clean, **untouched** today (re-verified) |
| Commit chain | `b0896e7` (RC) → `19569f1` → `79dbaa7` → `d08f0a1` → `6fd3d25` → *(today's docs commit)* |

## 2. Diff from RC (`b0896e7..6fd3d25`)

- `git merge-base --is-ancestor b0896e7 6fd3d25` → **true**; merge-base = `b0896e7`; 4 commits ahead, **0 behind**.
- 114 files: 74 added, 40 modified, 0 deleted; +5,519 / −50 lines.
- Areas: `docs/growth/**` (13 new docs + kits), `extensions/browser/**` (MV3 extension + store kit), `scripts/extension/**`, `src/app/{about,extension,llms.txt,feed.xml,opensearch.xml,api/oembed,.well-known/indexnow}`, `src/app/scam-shield/kich-ban/**`, `src/lib/{discovery,growth,scam-shield,share,analytics}` additions, `src/components/discovery/PublicFooter`, Android App Links alias + `PublicLinkOpener` + `PublicWebLinks`, store assets, `.env.local.example`, `.gitignore` (`extensions/browser/dist/`), `package.json` (one script: `extension:package`; **no dependency change**).
- **`src/app/(home)/page.tsx` is in the diff** — metadata only (`alternates.canonical = /`, `robots index,follow`), added at `19569f1`. No UI/JSX change on Home; `publicFooter.test.tsx` pins that `HomeV3.tsx` and `(home)/page.tsx` do not mount `PublicFooter`.
- **No migration in the diff.** Both G1 migrations were introduced at `47f2d5e` / `8a01877` and are already on the RC (`b0896e7`).

**Technically eligible for fast-forward integration; merge not performed.**

## 3. Engineering work closed today (repository side, docs only)

| Item | What | Why it was a gap |
|---|---|---|
| `docs/growth/G1_MIGRATION_APPLY_CHECKLIST.md` (new) | ADR-014-style apply order + 7 verification queries with expected results (tables, 15 columns, constraints, indexes, policies, `has_table_privilege`/`has_column_privilege`/`has_function_privilege` matrix), post-apply one-share check, rollback order; behaviour matrix of the code with vs. without the migrations | The G1 reports pointed at "the ADR-014 section-by-section verification", but that checklist covers only the notifications migration — nothing owner-facing existed for the two G1 files |
| `docs/growth/validation/TEMPLATE.csv` (new) + plan step 6 | Header row for the record sheet the validation plan names | The directory the plan writes to did not exist; a fixed header prevents column drift across T+7/14/30 runs |
| `DISTRIBUTION.md`, `ANDROID_STORE_LISTING_KIT.md`, `COMPLETE_FREE_ACQUISITION.md`, `FREE_ACQUISITION_RESEARCH.md` | Five rows still said App Links needed "a native `/r/*` handler" and the store kit said "512×512 export needed" | Stale: the alias + Custom Tab handler and `android/store/icon-512.png` landed at `6fd3d25`, one commit after those lines were written |
| `ANDROID_STORE_LISTING_KIT.md` data-safety row | "Deletion via `/delete-account`" → request-based (email), as the app ships | Play compares the form with the app; the page itself already says request-based |

Checked and **left alone** (already complete): every backticked repo path in `docs/growth/*.md` resolves; every growth env var read in `src/` (`INDEXNOW_KEY`, `ORGANIZATION_SAME_AS`, `NEXT_PUBLIC_EXTENSION_URL_{CHROME,EDGE,FIREFOX}`, `ANDROID_APP_LINKS_SHA256`, `IOS_UNIVERSAL_LINKS_APP_ID`) is documented in `.env.local.example` with an empty value; `npm run extension:package` builds `tappyai-extension-0.1.0.zip` (14 files, 55,382 bytes) into the gitignored `dist/`; extension manifest version = `EXTENSION_VERSION` = store kit (`0.1.0`); no 32–128-hex key, no `AA:BB:…` fingerprint, no invented profile URL anywhere in `src/`, `docs/growth/`, `extensions/`, `android/app/src/` (the two profile URLs in `WEBMASTER_SETUP.md` §5 are labelled syntax examples).

No code, configuration or test changed today.

## 4. Owner actions — 10 items

Status vocabulary: **DONE** (nothing remains) · **READY** (repository side complete; owner performs an external action) · **BLOCKED** (a named external prerequisite is missing) · **NOT SAFE TO DO NOW** (would violate a standing rule) · **OWNER ACTION** (a decision, not a task).

| # | Item | Status | Owner | Exact action | Prerequisite | Required before release? |
|---|---|---|---|---|---|---|
| 0 | apex → www redirect + `NEXT_PUBLIC_SITE_URL` | **DONE** (already true in production: `tappyai.com` answers 308 → `www`; code falls back to `https://www.tappyai.com` when the env is unset) | owner | at release: `curl -sI https://tappyai.com/` → `308` + `location: https://www.tappyai.com/`; if Vercel ever makes the apex primary, set `NEXT_PUBLIC_SITE_URL` accordingly | — | Confirm once (1 command) |
| 1 | Cốc Cốc URL submission | **READY** | owner | `WEBMASTER_SETUP.md` §1: submit the 10 URLs in `webmaster-checklist.json → coccoc_submit_urls` at coccoc.com/search/console (captcha) | production deploy | No — post-release |
| 2 | Google Search Console | **READY** | owner | §2: Domain property `tappyai.com` → DNS TXT at the DNS provider → submit `sitemap.xml` → request indexing for the 7 `inspection_targets` | production deploy; DNS access | No — post-release (T+0) |
| 3 | Bing Webmaster Tools | **READY** | owner | §3: add site (or import from GSC after #2) → submit sitemap → confirm the IndexNow key panel shows the key from #4 | production deploy; #2 optional | No — post-release |
| 4 | `INDEXNOW_KEY` | **READY** — code DONE, production-secret-safe (key never committed, never logged, never in HTML; any invalid value = feature off) | owner | §4: `openssl rand -hex 16` → Vercel → Production env `INDEXNOW_KEY` → deploy → `GET /.well-known/indexnow/<KEY>.txt` returns the key → one public share appears in Bing *IndexNow insights* | Vercel access; #3 to observe it | No — feature is inert without it and the site is unaffected |
| 5 | Extension stores | **READY** — `npm run extension:package` → `extensions/browser/dist/tappyai-extension-0.1.0.zip`; listing text/assets in `extensions/browser/store/` | owner | Edge Partner Center (free) and Firefox AMO (free): upload the zip + `LISTING.md` copy + `/extension/privacy` URL. Chrome Web Store: same, but registration is a **US$5 one-time developer fee — owner decision** (not recurring). After each listing is live: set `NEXT_PUBLIC_EXTENSION_URL_<STORE>` (Production) and redeploy — the `/extension` page shows install buttons only for configured, real store hosts | store accounts; production deploy of `/extension/privacy` first (reviewers fetch it) | No |
| 6 | Android stores | **READY** for Google Play (account exists, alpha track vc6 released 2026-08-16); Galaxy / AppGallery / GetApps READY with the same kit | owner | `ANDROID_STORE_LISTING_KIT.md`: build + sign `bundleRelease` with the `TAPPYAI_*` gradle properties (release keystore is owner-held, never in the repo), real phone screenshots, data-safety form (deletion = request-based), content rating, upload | signing keystore; screenshots; separate release decision — the Android app is **not part of the web release** | No |
| 7 | `ORGANIZATION_SAME_AS` | **DONE** — intentionally empty; `sameAs` key absent from JSON-LD until set | owner | only when an official profile exists (LinkedIn company page / Crunchbase / GitHub org): set `ORGANIZATION_SAME_AS=<https URL>,<https URL>` (Production) → redeploy → check `/about` JSON-LD | a real, owner-controlled profile | No |
| 8 | GitHub public repo (`tappyai-extension`) | **READY** — README/topics/about text in `GITHUB_PUBLIC.md`; only `extensions/browser/` (no proprietary code) | owner | create the public repo → copy `extensions/browser/` minus `dist/` → paste README → choose a LICENSE (legal choice, MIT recommended) → optionally add `https://github.com/<org>` to #7 | owner GitHub session; decision to publish | No |
| 9 | Android App Links | **READY** (code) / **BLOCKED** (verification) — alias `PublicLinkActivity` is `enabled=false` unless `-PTAPPYAI_APP_LINKS_ENABLED=true`; `assetlinks.json` is 404 until `ANDROID_APP_LINKS_SHA256` is set; **no fingerprint is in the repo and none was invented** | owner | `APP_LINKS.md` §3–§4: Play Console → App integrity → SHA-256 (App Signing + Upload) → `ANDROID_APP_LINKS_SHA256=<A>,<B>` (Production) → deploy → release build with the flag → device: `adb shell pm get-app-links com.tappyai.app` expects `www.tappyai.com: verified`; then the `am start … /r/<slug>` check | the real release signing fingerprint (Play Console); a device; #6 | No — keep OFF for this release |
| 10 | Home footer (`/` → hubs/About link) | **NOT SAFE TO DO NOW** → **OWNER ACTION** (decision) | owner | decide per `HOME_FOOTER_DECISION.md`: either the documented one-import + one-line change in `HomeV3.tsx` (and flip the assertion in `publicFooter.test.tsx` in the same commit), or keep Home unchanged | owner decision — Home is the locked V3 surface; changing `/` without it violates the freeze | No — cost is one missing root→cluster link signal |
| 11 | AI-search validation plan | **READY** | owner (or Claude, on request, using free tiers) | `AI_SEARCH_VALIDATION_PLAN.md`: at T+7/14/30 run Q1–Q35 across the 9 platforms, record into `docs/growth/validation/<date>.csv` from `TEMPLATE.csv` | production deploy + #2/#3 done at T+0 | No — post-release |

Nothing above needs a repository change before it can be done. None of the paid items (#5 Chrome US$5, #6 Play already paid) is recurring; none was actioned.

## 5. Migration status — **REQUIRES MIGRATION** (owner-gated), evidence:

| Migration | Introduced | On RC? | Required by code? | Safe? |
|---|---|---|---|---|
| `20260913_g1_growth_foundation.sql` | `47f2d5e` | yes | **yes** — `sharedResultStore`, `g1Ingestion`, `growthMetrics/ReportService` read/write `shared_results`, `anon_identity_map`, `fn_shared_result_bump` | additive only; idempotent; ADR-019 grants; rollback provided (destructive) |
| `20260918_g1b_share_ancestry.sql` | `8a01877` | yes | **yes** — the share INSERT writes `owner_is_anonymous` and `parent_id`; the listed filter reads `owner_is_anonymous` | additive only (2 columns, 2 partial indexes); depends on the foundation; idempotent; rollback provided (non-destructive) |

- Ordering: foundation first, ancestry second; `20260913_plan_shares.sql` and `20260915_review_shares.sql` (also on RC) are independent of both.
- Nothing in the code checks whether the migrations exist; behaviour without them is graceful on reads (`/r/*` 404, hubs/sitemap/feed static-only) and **failing on writes** (the Share buttons return `db_error`) — full matrix in `G1_MIGRATION_APPLY_CHECKLIST.md` §0. `feat/g1-completion` adds no new schema dependency beyond what the RC already has.
- Both files pass `npm run check:sql-grants` (0 errors) and are applied + rolled back for real in `supabase/tests/g1_growth_foundation.test.ts` (20 tests, embedded PostgreSQL, port 54385 — executed in today's run, not skipped).
- **Not applied anywhere today.** Apply only via the owner's SQL Editor session per the checklist, before the release reaches anyone who will press Share.

## 6. Verification results (after today's docs-only changes)

| Check | Today | Baseline (`6fd3d25`) | Δ |
|---|---|---|---|
| `npm test` (vitest + required-suite gate) | **13,662 pass / 0 fail / 68 skipped** · 723 files pass, 10 skipped · gate `result: OK — every required suite executed` (48) | 13,662 / 0 / 68 | 0 |
| Android `:app:testDebugUnitTest` | **not rerun** — no Android file changed today (docs only) | 745 / 0 | n/a |
| `tsc -p tsconfig.json --noEmit` | 0 errors | 0 | 0 |
| `next lint` | 0 errors / 42 warnings | 0 / 42 | 0 |
| `architecture:check` | 14/14 | 14/14 | 0 |
| `check:sql-grants` | 0 errors (9 info, 6 pinned legacy) | 0 | 0 |

Side effect noted: the audit suites under `scripts/audit/*.audit.test.ts` rewrite four `docs/audit/*.json` files on every run; they were restored with `git checkout` and are not part of the commit.

## 7. Release blockers

| Blocker | Type | Owner | Resolution |
|---|---|---|---|
| Migrations not applied to production | **REQUIRES MIGRATION** — the share loop (the reason for G1) does not work without both | owner | `G1_MIGRATION_APPLY_CHECKLIST.md` §1–§2, before or immediately after deploy |
| Integration decision: `feat/g1-completion` → `rc/web-uat` | **OWNER ACTION** — fast-forward is technically clean (0 behind, 0 conflicts by construction); nothing merged | owner | say "fast-forward" (then `git -C .worktrees/web-uat-rc merge --ff-only feat/g1-completion`) or "release RC as is" |
| Anything else engineering-side | **none found** | — | — |

Not blockers (post-release, listed in §4): webmaster registrations, IndexNow key, store submissions, App Links verification, Home footer decision, validation runs.

## 8. Safe next step

1. Owner reads §2 and §5 and makes the two decisions in §7 (integrate or not; when to apply the migrations).
2. If "fast-forward": run the `--ff-only` merge in the RC worktree, re-run `npm test` there once, then release from the RC as planned (week of 2026-09-21).
3. At T+0 of the deploy: §4 item 0 (one `curl`), then #2 → #3 → #4 → #1 in that order (`WEBMASTER_SETUP.md` §6).
4. Nothing to push, deploy, submit or apply from this branch until those decisions exist.
