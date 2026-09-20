# PASS 1 — progress

Session: 2026-09-20 · branch `uat/release-audit-2026-09` (from `merge/main-into-v3` @ d96d06b) · repo root per §0 = `tappyai-mvp/.claude/worktrees/g1-place-guard`
LLM calls used: 0 / 300 · est. cost: $0.00

**SCOPE CHANGE (owner, 2026-09-20):** backend audit of the DELTA on an EMPTY non-prod DB; priorities §3.1 → §3.2 (core) → §3.3 → §3.10 → §3.11 → §3.17 (safety subset) → §3.5. Sections 3.4/3.7/3.8/3.14/3.15/3.19/3.21 and golden-set scoring = DEFERRED (not UNVERIFIED). Seed users A/B via the app signup flow; ≥2 rows per RLS table per user; isolation PASS only with counterpart rows present.

| step | state | note |
|---|---|---|
| STEP 0 · PRE-FLIGHT 1 worktree/branch | DONE | `git worktree list` shows g1-place-guard @ d96d06b [merge/main-into-v3]; branch `uat/release-audit-2026-09` created, HEAD d96d06b. NOTE: the Claude session itself was launched in `.worktrees/g1-growth`; §0 REPO ROOT was followed instead. |
| STEP 0 · PRE-FLIGHT 2 database target | DONE | Owner approved copying audit-nonprod/.env.local (gitignored, .gitignore:44; absent from git status). Running app on :3101 inlines ref `zdaprdfgpbpnxyofagmc` in served client chunks (main-app.js); server admin client reads the same NEXT_PUBLIC_SUPABASE_URL. == §0 non-prod ref, != prod `fwznnobrdctuskgrvuik`. |
| STEP 0 · Playwright install | DONE | playwright@latest + chromium 153.0.8010.12 installed in scratchpad (exit 0). Launched against http://localhost:3101/: status 200, title "TappyAI – Trợ lý AI thuần Việt", 0 console errors, evidence/step0-home-3101.png |
| STEP 0 · migrations → audit project | DONE | Object-existence scan of 86 files: only 20260913_plan_shares.sql MISSING → applied via scripts/audit/applyMigrationAudit.mjs (verify: table present, rls=true, 3 policies; evidence/migration-apply-plan_shares.txt). PARTIALs = policies dropped by later hardening migrations. add_profile_edit (profiles.bio) + add_music_attribution (music_tracks.license) never applied to the prod-exported schema, no code reads them → §3.11 P3 drift. |
| STEP 1 ground truth | DONE | node v24.16.0, npm 11.13.0, next 14.2.35; merge-base(HEAD, origin/main=842379b prod) = 842379b; DELTA = 842379b..d96d06b = 378 commits, 2212 files. Dev server: `npx next dev -p 3101` (bg), Ready in 4.7s. |
| STEP 2 inventory | DONE | docs/uat/inventory.md committed f107368 |
| 3.1 secrets & supply chain | DONE | F-002 (P0 next RCE advisories), F-003, F-004, F-005, F-006; evidence/secret-scan-history-redacted.txt, npm-audit-prod.txt |
| 3.2 seed users + data | DONE | A=uat2609_a@tappyai.com (registered via /register UI → 200, email-confirm ON on non-prod ⇒ confirmed via admin API), B=uat2609_b@ (signup hit Supabase 429 email rate limit ⇒ created via admin API), M=uat2609_merchant@ (admin API). Login via /login password form → /age-check (Playwright). DOB via PATCH /api/profile. Seed: ≥2 rows/user in conversations, favorites, price_watches, reviews, bookings, groups, plan_shares, review_likes/saves/comments/shares, message_feedback(4), chat_messages, user_events, notifications(5); 1-row tables: profiles, user_memory, user_preferences, user_demographics, notification_subscriptions, user_follows, chat_participants. 0 rows: group_members (creator not auto-added), review_interactions (body shape unknown). evidence/seed-*.txt/json |
| 3.2 RLS matrix + IDOR + auth lifecycle | DONE | F-007 (PASS record), F-008, F-009, F-010 (guest path UNVERIFIED: anon sign-in disabled on audit project), F-011, F-012, F-013 (PASS), F-014; evidence/rls-matrix.*, idor-probes.*, auth-lifecycle.txt |
| 3.3 chat quota + AI | DONE | F-015 (P1 FAIL: failed answer charged, 200 on model error), F-016 (PASS mechanics); cross-user memory probe clean (evidence/chat-crossuser-probe-A.txt). 20 LLM calls. |
| 3.23 build/test baseline | DONE | tsc 0 err (29s); next lint 0 err / 2 warn (20s); vitest 735 files pass, 11 skipped, 13,864 tests pass / 69 skipped / 0 fail (211s) — via `vitest run` directly so docs/audit/*.json untouched |
| 3.17 AI safety subset | DONE | F-017 (PASS: injection/extraction/XSS all blocked), F-018 (PASS: SSRF allowlist + DNS pinning). 5 LLM calls. golden-set scoring DEFERRED per owner. |
| 3.5 affiliate/commerce | IN PROGRESS | |
| 3.3 – 3.23 | NOT STARTED | |
| STEP 4 report | NOT STARTED | |
