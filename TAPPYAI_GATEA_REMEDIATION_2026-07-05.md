# TappyAI — Gate A Remediation Sprint Report

Date: 2026-07-05 · Scope: eliminate Critical + High blockers from the Verification Audit · Method: one-blocker-at-a-time implement → build/tsc/lint/test/smoke after each. No commits, no deploy.

**Verification state after this sprint:** `tsc --noEmit` **0 errors** · `next lint` **0 errors** · `vitest` **24/24 pass** · `next build` **compiles, 99/99 pages** — all with the build gates now ENABLED. Browser smoke of `/reviews` returned 200 and rendered the feed (only seed-data fake-URL video errors in console).

---

## 1. Executive Summary

All four Critical blockers were addressed and every targeted High issue was implemented and verified at the build/type/lint/test level. The one Critical that cannot be completed in this environment — **Blocker B (DB baseline)** — is intentionally **paused pending a production schema dump**, exactly as instructed; a migration strategy and verification checklist are provided instead of a guessed schema.

Highlight: the **contested `onFinish` "lost user message" bug was resolved from the SDK source** — `@ai-sdk/react@1.2.12`'s `triggerRequest` is a `useCallback` whose `onFinish` dependency means the *running* request holds the **submit-time** `onFinish`, whose `messages` closure predates the user's just-sent message. It is a **real data-loss bug**, now fixed with a latest-messages ref.

**Verdict: NOT READY — but only owner-side actions remain.** All code-side Gate A + High work is complete and verified. The residual is: (1) provide the prod `pg_dump` so Blocker B's baseline can be authored, (2) run the three new migrations and confirm the live `profiles` policy, (3) after deploy, run the two documented `DROP COLUMN` Part-2 steps.

---

## 2. Critical Issues Fixed

### Blocker A — `profiles.email` public exposure → **FIXED (code) + migration (staged)**
Root cause: two out-of-band `qual=true` SELECT policies expose all columns to the anon key; `email` is a duplicate of the canonical `auth.users.email`. 
- **Code:** `src/app/api/profile/route.ts` no longer selects the `email` column; email is sourced from the session (`user.email`). Every other reader already used `user.email` or `select('*')` (which tolerates the drop).
- **Migration** `supabase/migrations/add_profiles_email_isolation.sql` (mirrors the team's `billing_customers` two-stage pattern):
  - **Part 1 (safe now, closes the Critical):** `REVOKE SELECT (email) ON public.profiles FROM anon` + `handle_new_user` recreated to stop duplicating email into profiles.
  - **Part 2 (after deploy):** `DROP COLUMN email` (commented, run post-deploy) — removes the duplicate entirely.
- **Pending owner action:** run the migration; confirm the live `profiles` SELECT policy in the Supabase dashboard (the one "insufficient evidence" item); after deploying the code, run Part 2. Documented "Pending production schema verification" per instructions.

### Blocker B — DB baseline (rebuild from source) → **PAUSED (awaiting prod dump)**
No base `CREATE TABLE` DDL exists for `reviews`/`review_saves`/`favorites`. Per instructions, **not reconstructed from assumptions** (that would risk prod drift). Deliverables provided in §7 (migration strategy + verification checklist). **Requires:** `supabase db dump --schema-only` (or `pg_dump --schema-only`) from production, after which the baseline migration will be authored and validated against an empty database.

### Blocker C — `group/[id]/join` unauthenticated → **FIXED**
- **Route** `src/app/api/group/[id]/join/route.ts`: now requires `getRequestUser` (401 on anon), uses the RLS-scoped client, attributes the row to `user_id`, and treats the unique-violation (double-join) as success.
- **Migration** `add_group_members_auth.sql`: adds `user_id` (nullable, backward compatible), a partial unique index `(group_id, user_id)`, replaces the `WITH CHECK(true)` INSERT policy with an authenticated self-scoped one, and adds a self-delete policy.

### Blocker D — build gates disabled → **FIXED & VERIFIED**
`next.config.mjs`: removed `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`. `next build` now compiles cleanly with both gates enforced (proven — exit 0, 99/99 pages).

---

## 3. High Issues Fixed

| Issue | Fix | Files |
|---|---|---|
| **Contested onFinish data-loss** (CONFIRMED real via SDK source) | Persist from a latest-`messages` ref + authoritative `message` arg, deduped by id | `src/components/ChatInterface.tsx` |
| Duplicate memory extraction (2× LLM/reply) | Removed the client `/api/memory` POST; server-side extraction is the sole path | `ChatInterface.tsx` |
| Memory broken under Bearer/native | Threaded request client into reads (`contextBuilder`, `/api/memory` GET/POST/DELETE, `suggested-prompts`); admin client for the chat `onFinish` write | `contextBuilder.ts`, `api/chat/route.ts`, `api/memory/route.ts`, `api/suggested-prompts/route.ts` |
| Freemium bypass / anon LLM spend | **Product decision enforced:** anonymous users are blocked from chat (401 before any LLM/tool work) | `api/chat/route.ts` |
| Feed like/save corrupts counts on error | `res.ok` + type guards + underflow clamp; bail without mutating on failure | `app/reviews/page.tsx` |
| SavePlaceButton false "✓ saved" | Only confirm on `res.ok`; leave unsaved + retryable otherwise | `ChatInterface.tsx` |
| YouTube embeds all autoplay | IntersectionObserver mounts the iframe only while in view | `components/explore/VideoPlayer.tsx` |
| `review_milestones` insert silently RLS-dropped | Insert via admin client (policy was removed by hardening) | `api/reviews/[id]/like/route.ts` |
| `increment_review_view` anon-spammable | `REVOKE EXECUTE FROM anon, public` + grant to `authenticated` | `add_gatea_db_hardening.sql` |
| `place_photos` anon-writable | Dropped `anon_insert`/`anon_update` policies | `add_gatea_db_hardening.sql` |
| `user_events` column drift | Idempotent `ADD COLUMN IF NOT EXISTS place_id, review_id` | `add_gatea_db_hardening.sql` |
| RUN_ALL re-run regresses triggers | Removed the obsolete `RUN_ALL_MIGRATIONS.sql` footgun | (deleted) |
| `onSave` pending-flag leak | try/finally around the save await | `ChatInterface.tsx` |
| Missing `reviews(user_id)` index | Added (bonus) | `add_gatea_db_hardening.sql` |
| `/api/suggested-prompts` build warning | `export const dynamic = 'force-dynamic'` (bonus) | `api/suggested-prompts/route.ts` |

---

## 4. Remaining Medium Issues (out of Gate A scope, from verification report)
Prompt-cache reorder (largest cost win), per-instance rate limiters not consolidated (only `/api/chat` uses the shared helper), error-shape standardization + raw Supabase error leaks + 200-on-unauth, `conversations.messages` JSONB scaling, trending-feed 200-row JS scoring, `staleTimes:{dynamic:0}` global, migration ordering nondeterminism, cron idempotency + 4 dormant crons, auto-scroll hijack, FavoriteToggle can't un-favorite (server DELETE exists, client unwired), `creator/[id]` no error handling.

## 5. Remaining Low Issues
`/api/cta-click` route still missing (client call is swallowed), dark-mode FOUC, object-URL leak on unmount, iOS 14px input zoom, single error boundary, notifications 200-on-unauth, milestone count read timing.

## 6. Files Modified
`next.config.mjs`, `src/app/api/profile/route.ts`, `src/app/api/group/[id]/join/route.ts`, `src/app/api/chat/route.ts`, `src/lib/ai/contextBuilder.ts`, `src/app/api/memory/route.ts`, `src/app/api/reviews/[id]/like/route.ts`, `src/app/api/suggested-prompts/route.ts`, `src/components/ChatInterface.tsx`, `src/app/reviews/page.tsx`, `src/components/explore/VideoPlayer.tsx`.

## 7. Migrations Added / Removed
**Added:** `add_profiles_email_isolation.sql`, `add_group_members_auth.sql`, `add_gatea_db_hardening.sql`. **Removed:** `RUN_ALL_MIGRATIONS.sql` (obsolete/regression-prone).

**Blocker B — baseline plan (pending `pg_dump --schema-only`):**
1. Owner runs `supabase db dump --schema-only > supabase/migrations/00000000000000_baseline.sql` against prod.
2. Diff the dump against existing migrations; the baseline must contain `reviews`, `review_saves`, `favorites`, `profiles` (incl. actual policies), all functions/triggers/extensions/storage objects.
3. Verification checklist: `supabase db reset` on a fresh local DB must apply baseline → all `add_*`/dated migrations cleanly; then `tsc`+build+a smoke of feed/chat against the fresh DB.
4. Commit the reconciled baseline; renumber ad-hoc `add_*` files to timestamps in a follow-up.

## 8. API Changes
- `/api/chat`: returns **401 `auth_required`** for anonymous callers (freemium policy).
- `/api/group/[id]/join`: now **401** for anon; body attributed to `user_id`; idempotent on re-join.
- `/api/profile`: response `email` now sourced from session (unchanged shape).
- `/api/memory` (all verbs) + `/api/suggested-prompts`: request-scoped client threaded (native-auth correctness; no contract change).

## 9. Database Changes
New table column `group_members.user_id`; new policies (group join self-scoped INSERT + self DELETE); `profiles.email` anon-REVOKE (+ pending column drop); `handle_new_user` no longer writes email; `increment_review_view` EXECUTE restricted; `place_photos` anon writes removed; `user_events` columns reconciled; `reviews(user_id)` index; counter triggers unchanged (already fixed by `add_counter_security_definer.sql`).

## 10. Security Improvements
Closed: anon `email` harvest (Part 1), anon group-member injection, anon LLM spend, anon trending-inflation RPC, anon place-photo poisoning. Hardened: memory writes work under Bearer without RLS-silent-drops; milestone writes no longer silently dropped.

## 11. AI Improvements
Halved memory-extraction LLM calls per reply (duplicate removed); memory now actually persists/loads for Bearer/native sessions; no prompt-behavior or model-routing changes (per AI rules).

## 12. Regression Results
`tsc` 0 errors · `lint` 0 errors · `vitest` 24/24 · `build` 99/99 pages with gates ON · `/reviews` renders (200). No new errors introduced (the only console output is seed-data fake video URLs hitting the pre-existing native `<video onError>`).

## 13–16. Build / TypeScript / ESLint / Test Results
Build: **PASS** (Compiled successfully). TypeScript: **PASS** (0). ESLint: **PASS** (0 errors; warnings only, unchanged). Tests: **PASS** (24/24).

## 17. Android Readiness
Improved: Bearer memory now works; group-join authenticated. Still needed before store release (unchanged): FCM subscribe/dispatch + device-keyed subscriptions, native chat stream protocol/versioning, native Zalo login. **YELLOW.**

## 18. iOS Readiness
As Android + Sign in with Apple + APNs. **YELLOW-RED.**

## 19. Dashboard Readiness
Unchanged: no `/api/admin/*` surface, env-var admin role. **RED.**

## 20. Production Readiness
Improved (build gates enforced, several Criticals/Highs closed). Still open: CI, error tracking, `/api/health`, cron idempotency, `push.bat --force` removal. **Improving; not yet production-operated.**

## 21. Remaining Risks
1. **Blocker B open** until the prod dump is provided (DR risk).
2. **Blocker A completion** depends on the operator running the migration + confirming the live policy; until Part 2 runs post-deploy, an authenticated user could still read others' emails (anon path is already closed by Part 1).
3. **Anon-chat block is a product-visible change** — recommend the client redirect anon users to `/login` on 401 (currently the error banner shows the message).

## 22. Final Checklist
* Build ✅
* TypeScript ✅
* ESLint ✅
* Tests ✅
* Authentication ✅ (anon chat blocked; group join gated)
* AI ✅ (memory threaded; duplicate extraction removed; behavior unchanged)
* Database ✅ code + migrations authored; ⚠️ Blocker B baseline pending prod dump
* Security ✅ (5 anon vectors closed; email Part 2 pending deploy)
* API ✅
* Frontend ✅ (data-loss, feed, video, save-button fixed)
* Backend ✅
* Android Ready ⚠️ (improved; store blockers remain)
* iOS Ready ⚠️
* Dashboard Ready ❌ (no admin API surface)

---

## Final Verdict

### NOT READY

All **code-side Gate A and High work is complete and verified** (build/type/lint/test green with gates enforced, plus a live `/reviews` smoke). The project is **NOT READY** only because two owner-side actions remain, both outside this sandbox:

1. **Blocker B** — provide `pg_dump --schema-only` so the DB baseline can be authored and validated on an empty database (a Critical that must not be guessed).
2. **Blocker A finalization** — run `add_profiles_email_isolation.sql`, confirm the live `profiles` SELECT policy in Supabase, and run the Part-2 `DROP COLUMN` after deploying the code change.

Complete those two and re-run `supabase db reset` + build, and the Critical set is fully closed — at which point this flips to **READY** for the Android pilot and Dashboard API work to begin (iOS still gated on Sign in with Apple + APNs, Dashboard on its API surface, both tracked separately).
