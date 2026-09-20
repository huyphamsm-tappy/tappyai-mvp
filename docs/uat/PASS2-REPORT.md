# PASS 2 — Fix Report

**Branch** `uat/release-audit-2026-09` (worktree `g1-place-guard`, on `merge/main-into-v3` base `d96d06b`). **Date** 2026-09-20. **Env** local `next dev`/`next build` against non-prod Supabase `zdaprdfgpbpnxyofagmc` (PRE-FLIGHT 2 re-confirmed from the running app's bundle before any DB write). Scope: **P0/P1 only**, per owner decisions that override PASS 1 severities. No source edits outside the fixes below; test data seeded and cleaned under the `uat2609`/`uat2609p2` prefix.

## Fixes applied

### F-015 · P1 · A failed AI answer was charged to the user's quota — FIXED (`fb466c1`)
- **Root cause:** `/api/chat` (and `/api/scam-shield/analyze`) call `consumeAiQuestion()` *before* the model call, with no compensating release. A provider/network failure returns HTTP 200 with a data-stream error part (or 502 at init), so the spent question was never returned.
- **Diff:** Added a refund primitive to the sliding-window limiter — `RateLimitResult.member` is returned on admission, `RateLimitStore.releaseSlidingWindow` ZREMs that member, `distributedRateLimitRelease()`. `aiQuestionQuota` now returns a refund handle from `consumeAiQuestion` and exposes `refundAiQuestion()`; the in-process fallback refunds by timestamp. `/api/chat` refunds on `streamText` `onError` and the init-throw catch (single-shot guard); `/api/scam-shield/analyze` refunds in its hard-failure catch. Success (`onFinish`) never refunds; the route's tools catch their own errors, so `onError` = terminal failure. Additive; atomicity preserved; no new deps.
- **Tests:** +12 refund cases in `aiQuestionQuota.test.ts` across both limiter backends; `distributedRateLimit.test.ts` updated for the `member` field. Touched-area suites 92/92.
- **Re-test (live, audit project):** failed turn (invalid `ANTHROPIC_API_KEY`) left quota **15/15** (PASS 1 charged 3→4); refund log `{type:tappyai_quota_refund,reason:stream_error,scope:distributed}`; a successful turn charged **15→14** (`finishReason:stop`). tsc 0.

### F-027 · P1 · `/api/track` returned `{ok:true}` but wrote no rows — FIXED (`08b916f`)
- **Root cause (threefold, all masked because the upsert error was discarded):** (A) the upsert `{error}` was never read → any failure returned `{ok:true}`; (B) `event_id`/`anon_id` are UUID columns, so a non-uuid value from a client rejected the whole batch, losing every valid sibling; (C) `event_type` has a deliberate DB CHECK (taxonomy allowlist) but the route stopped gating on it (`is_unknown_event`) — so an out-of-taxonomy type also rejected the whole batch.
- **Diff (route only, no schema change, security control preserved):** sanitize the strict UUID columns before the write (invalid `anon_id`→null with the identity filter now requiring a valid `anon_id` or a session; invalid/missing `event_id`→fresh uuid); READ the upsert error; on a batch failure, salvage the valid rows one at a time so one bad event cannot erase the others. Only a total failure answers `{ok:false,error:persist_failed}`; `rebuildProfile` keyed off what persisted.
- **Tests:** `uuidNotPii.test.ts` fixtures corrected to real UUIDs (the old `anon-1` never exercised the uuid column — the gap that hid this) + 5 new cases (uuid sanitization, batch not poisoned by a bad `anon_id` or an out-of-taxonomy type, `ok:false` on total failure, `ok:true` on a clean batch). 10/10.
- **Re-test (live):** batch `[page_view + totally_unknown_type_xyz]` → `{ok:true}`, `page_view` persisted, unknown dropped; salvage log `{batch:2,saved:1,dropped:1,codes:{23514:1}}`. A clean event persists; `tel:`/malformed inputs handled. tsc 0.

### F-024 · P1 (owner-raised) · Music reuse ("use this sound") — REMOVED (`919736a` backend, `21cc9cf` frontend)
- **Root cause:** the reuse path let one user take audio from another user's clip (browse/save/follow sounds, attach a borrowed sound to a new clip) across 10 endpoints and ~8 UI surfaces. Own-clip playback is separate (audio embedded in clip data).
- **Diff — backend:** 410 Gone on `/api/sound/[trackId]{,/save,/follow,/play}`, `/api/music/{tracks,tracks/[id],tracks/search,tracks/[id]/report,categories,providers}`, `/api/upload/audio` (shared `src/lib/http/gone.ts`); `/api/reviews` POST refuses a borrowed-sound attach (`b.music`) with 410 while own-audio `original_sound` registration is untouched.
- **Diff — frontend:** `ReviewMusicCard`/`ReviewMusicDisc`/`SoundSheet` → inert null stubs; composer add-music chip + picker + selected-card + `?sound=` deep-link removed; `/sound`, `/music`, `/music/upload` → removed-notice pages; Music home tile removed.
- **Tests:** `socialWriteAccess`/`legacyAdminGate`/`uploadRoutes` updated for the retirement; 224 reviews/music tests pass. tsc 0; `next lint` 0 errors.
- **Re-test (live + Playwright):** all 11 endpoints 410; reuse-attach 410; a plain own-content review still posts 200. Composer has 0 add-music controls and no "Dùng âm thanh này"; feed shows no reuse CTA; the 3 pages render the removed notice (200). **Production build exit 0.**
- **Data (owner decision — NOT deleted):** audit DB holds 0 music rows. **Production counts of `music_tracks`, `music_saved`, `music_followed`, `music_usage`, `music_track_reports`, and `reviews.music` require production DB access, which is FORBIDDEN in this pass — the owner must measure them and decide on deletion.**

### F-014 · P1 (owner-raised) · Unauthenticated debug/test routes — DELETED (`a74499f`)
- **Root cause:** `/api/debug-places`, `/api/test-photos` open in non-prod (NODE_ENV guard, never runtime-verified), gated only by the shared `CRON_SECRET` in prod, calling paid providers (Places/Serper) per hit.
- **Diff:** deleted both route files outright (owner decision #4, not gated). No UI/client/script called them; removed the two entries from `apiErrorContract.test.ts`'s machine-to-machine exemption list.
- **Re-test:** both paths **404** on the running server (health 200); **production build exit 0**, neither route in the build manifest. tsc 0.

## Investigated — no code change (owner decision)

### F-002 · P0 · Next.js Image-Optimization RCE class — DO NOT UPGRADE THIS PASS (owner #5)
Investigation only. Facts: **AVIF output is not enabled** (no `images.formats` → Next 14 default webp); the **Windows-only RCE is N/A** (Vercel is Linux); the AVIF Image-Optimization RCE (`GHSA-2xp9-vwfh-vxw4`) triggers on the optimizer *decoding a malicious AVIF source*, and source hosts include user-writable storage (`*.supabase.co`, `*.public.blob.vercel-storage.com`, `storage.googleapis.com`) — a residual path. Patched only from **15.5.24** (a major from 14.2.35; no 14.x patch). Minor: two config files exist (`next.config.mjs` active, `next.config.ts` is a Next-15 feature, dead here). **Options for the owner:** (C) confirm Vercel platform mitigation of the hosted optimizer first (lowest effort); (A) interim one-line `images.unoptimized: true` (regression = unoptimized delivery, reversible); (B) durable upgrade to 15.5.24+ (major, full regression pass, schedule post-launch). Recommend C → A → B; delete the dead `next.config.ts`. **No version change made.**

## Verified — not reproducible (no fix)

### F-022 · Phone-number scam verdict via indirect paths — NOT REPRODUCIBLE
Runbook item (a) requires no scam verdict about a phone number by any route. Re-checked four paths: bare number → **INCONCLUSIVE** (tier-0, no model); Main Chat "số … có lừa đảo không?" → **refuses + redirects** to VNCERT/Công an; `tel:` URL → **400** rejected; a scam *message* containing a number → correctly flags the **message** CRITICAL and extracts the number only as context (never "this number is a scammer"). No defect to fix (do not fix a phantom). Optional deterministic hardening noted for the owner.

## P0/P1 deliberately NOT fixed — reasons

| ID | Sev | Why not fixed |
|---|---|---|
| **F-002** | P0 | Owner decision #5 — do not upgrade unilaterally; investigation + options delivered, owner to choose. |
| **F-001** | P1 | GA not configured for production — an owner action (create the GA4 property / set the prod Measurement ID), not a repo change. |

## Assessed and filed (out of P0/P1 fix scope)

- **F-028 · P2 — DOB one-correction lockout.** Owner asked me to assess severity. A user who mistypes the single DOB correction can be left ineligible with correction exhausted — but a **support-email recovery path is shown by design** (`AgeCheckView` `age.blocked.exhausted` + `SUPPORT_EMAIL`) and an admin RPC (`admin_set_user_date_of_birth`) exists, so it is friction, not a permanent lockout → **P2**, out of the P0/P1 fix scope. Recommended fix (owner sign-off, touches the age-gate policy via an RPC migration): allow re-correction while ineligible — compliance-neutral because the gate is self-declared.

## Regression check

- **tsc:** 0 errors after every change.
- **next lint:** 0 errors.
- **Production build:** `npm run build` exit 0 after the debug-route deletion and after the full music-reuse removal; deleted routes absent from the manifest.
- **Full unit/integration suite (`vitest run`):** 735 files pass / 11 skipped; **13,865 tests pass / 69 skipped / 0 fail** (193 s). A first full run surfaced 4 tests pinned to the pre-fix code shape (quota one-liner, two exemption lists, a SEALED-i18n page); all reconciled in `3a4326c` and re-run green. Baseline was 13,864 — net +1 after adding refund/track/salvage tests and removing the retired audio-upload test rows.

## Commits (this pass)

`fb466c1` F-015 quota refund · `08b916f` F-027 /api/track · `a74499f` F-014 debug routes · `919736a` F-024 backend · `21cc9cf` F-024 frontend · `2555d38` findings updates.
