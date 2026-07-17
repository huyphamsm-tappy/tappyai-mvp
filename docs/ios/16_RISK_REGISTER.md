# TappyAI — iOS Risk Register (living)

> Part of the `docs/ios/` design dossier. A living register — update Status as risks are mitigated or realized. Impact/Likelihood: **H/M/L**. Owner is a role, assign a name at kickoff.

## Legend
- **Impact:** H = blocks release / breaks parity; M = degrades a feature; L = cosmetic/minor.
- **Likelihood:** H = expected without action; M = plausible; L = edge case.
- **Status:** Open · Mitigating · Accepted · Closed.

---

## R1 — Authentication (Bearer + OAuth + anon cookie)
- **Risk:** Some backend quotas/gates are cookie-based (anon 5/day) and the free 15/day is derived from client-persisted conversations. A native Bearer client bypasses these.
- **Impact:** H (business-rule parity + abuse). **Likelihood:** H.
- **Mitigation — DECIDED (2026-07-10):** server-authoritative **anonymous session** — backend issues an `anonymous_token` (Supabase anon sign-in) → Keychain → Bearer → quota keyed server-side on `anonymous_id`; no login required; `tappy_anon` retired. Backend-first, all clients converge. See `PHASE1_AUTH_SURVEY.md §0`, ADR-005 amendment.
- **Owner:** Backend + iOS. **Status:** Resolved (decision made); execution is a backend delta consumed by iOS in Phase 1.

## R2 — StoreKit vs Stripe (App Store 3.1.1)
- **Risk:** Shipping Stripe subscription in the iOS binary violates Apple policy; entitlements must stay unified.
- **Impact:** H (App Store rejection). **Likelihood:** H if Pro is enabled.
- **Mitigation:** Payment Abstraction Layer (`09 §6`): StoreKit 2 + server verify endpoint → shared entitlement. **MVP ships Pro OFF → no purchase surface**, so risk is deferred. Add Apple verify endpoint + `source` column before enabling Pro.
- **Owner:** iOS + Backend. **Status:** Mitigating (deferred by Pro OFF).

## R3 — Chat streaming protocol parsing
- **Risk:** iOS must parse the Vercel AI-SDK data-stream (`0/9/a/e/d`) plus extract in-text markers; a fragile parser breaks chat.
- **Impact:** H (core feature). **Likelihood:** M.
- **Mitigation:** Newline-buffered parser + golden-file tests against captured streams; handle the two server TransformStream additions (final image block, budget rewrite). `04 §chat`, ADR-004.
- **Owner:** iOS. **Status:** Open.

## R4 — Reviews feed player state machine
- **Risk:** The autoplay/sound/watchdog machine is historically the buggiest surface (recurring "stuck paused"); AVPlayer + audio-session adds complexity.
- **Impact:** H (flagship feature UX). **Likelihood:** H.
- **Mitigation:** Implement exactly to `06`/`03` (active-index driven, muted-start, global unlock, ±1 window, 300ms watchdog, no mute button); device UAT each build; audio-session category transitions tested. See memory `project_video_autoplay_architecture`.
- **Owner:** iOS. **Status:** Open.

## R5 — Media uploads (Blob tokens, limits, magic-byte)
- **Risk:** Wrong size/type/duration enforcement or Blob token misuse → failed uploads or policy bypass.
- **Impact:** M. **Likelihood:** M.
- **Mitigation:** Enforce all limits client-side before requesting a token from `/api/upload/*`; magic-byte sniff on device; mirror Web exactly (`03 §Uploads`, `15 §4`).
- **Owner:** iOS. **Status:** Open.

## R6 — Background execution & audio session
- **Risk:** iOS suspends the app; feed players, uploads, and streaming can stall on background/foreground.
- **Impact:** M. **Likelihood:** M.
- **Mitigation:** Correct `AVAudioSession` categories; pause/resume on scene phase; resumable uploads; no reliance on background execution beyond Apple-permitted modes.
- **Owner:** iOS. **Status:** Open.

## R7 — Location permissions
- **Risk:** Denied/limited location degrades chat locationBias and nearby search.
- **Impact:** M. **Likelihood:** M.
- **Mitigation:** Graceful fallback (Web already works without precise location); request when-in-use with clear purpose string; 30-min cache parity; never block the app on location.
- **Owner:** iOS. **Status:** Open.

## R8 — Push notifications (APNs migration)
- **Risk:** Backend push is Web-Push/VAPID; iOS needs APNs. Missing backend APNs case = no notifications.
- **Impact:** M (re-engagement). **Likelihood:** M.
- **Mitigation:** Backend adds `provider='apns'` device-token rows + APNs dispatch case (stub already exists); iOS registers via `UNUserNotificationCenter`; honor master toggle + `data.url` deep links (`08`/`04`, `15 §8`).
- **Owner:** Backend + iOS. **Status:** Open.

## R9 — Offline / caching strategy
- **Risk:** Poor connectivity → blank feeds/tools; over-caching → stale rules/prices.
- **Impact:** M. **Likelihood:** M.
- **Mitigation:** Cache only presentation data (feed page, catalog, images); **never cache rule/price/entitlement decisions** (always server-fresh); show honest empty/error+retry states (ADR-007/008, `06`).
- **Owner:** iOS. **Status:** Open.

## R10 — API / contract changes (drift)
- **Risk:** Backend endpoint/schema changes silently break iOS; three platforms drift.
- **Impact:** H. **Likelihood:** M.
- **Mitigation:** Parity Governance (`13`): contract changes must update `04`/`05` + file parity tasks; typed client; contract tests against staging; monitor for breaking changes.
- **Owner:** Backend + all clients. **Status:** Mitigating (governance in place).

## R11 — Performance (feed, streaming, images)
- **Risk:** Video feed + image-heavy cards cause jank/scroll drops.
- **Impact:** M. **Likelihood:** M.
- **Mitigation:** ±1 player window (already required), image downsampling/prefetch, list virtualization, Instruments profiling.
- **Owner:** iOS. **Status:** Open.

## R12 — Battery
- **Risk:** Continuous video + location + network drains battery.
- **Impact:** L–M. **Likelihood:** M.
- **Mitigation:** Pause offscreen players, when-in-use location only, batch tracking (≤20/batch already), avoid needless polling.
- **Owner:** iOS. **Status:** Open.

## R13 — Memory
- **Risk:** Multiple AVPlayers / large images → memory pressure, crashes.
- **Impact:** M. **Likelihood:** M.
- **Mitigation:** Strict ±1 player window, reuse players, release offscreen media, cache caps.
- **Owner:** iOS. **Status:** Open.

## R14 — App Store review
- **Risk:** Rejection from: SuperTux WebView game, IAP policy, permission strings, fortune-telling content, UGC moderation, misleading copy ("7 games").
- **Impact:** H (blocks launch). **Likelihood:** M.
- **Mitigation:** Confirm SuperTux acceptability early; StoreKit for subs; complete purpose strings; UGC report/takedown present (already built); reconcile copy (`11`); privacy manifest.
- **Owner:** iOS + Owner. **Status:** Open.

## R15 — Privacy (App Privacy + permissions)
- **Risk:** Incomplete App Privacy details / permission rationale; PII handling.
- **Impact:** H (review + trust). **Likelihood:** M.
- **Mitigation:** Privacy manifest + nutrition labels reflecting real data use (analytics via PostHog, location, media); backend already isolates billing PII + removed `profiles.email` from anon reads (`05`).
- **Owner:** iOS + Owner. **Status:** Open.

## R16 — Security (secrets, SSRF, RLS boundary)
- **Risk:** Leaking a key in the binary, ignoring RLS boundary, or duplicating server logic.
- **Impact:** H. **Likelihood:** L (with discipline).
- **Mitigation:** No server secrets on device; respect RLS boundary (`05`/`14`); privileged ops via Next.js; Keychain for JWT; SSRF stays server-side.
- **Owner:** iOS. **Status:** Mitigating.

## R17 — SuperTux WebView isolation on iOS
- **Risk:** SharedArrayBuffer/COOP/COEP requirements may not hold in WKWebView on target iOS versions.
- **Impact:** M (one tool). **Likelihood:** M.
- **Mitigation:** Verify on iOS ≥15.2; if unsupported/rejected, treat game as a known platform gap and escalate to owner (do not silently drop — it's a parity item).
- **Owner:** iOS + Owner. **Status:** Open.

## R18 — Copy/spec inconsistencies carried into iOS
- **Risk:** Building to stale copy (10/day, "7 games", `/service` "dead") re-introduces known discrepancies.
- **Impact:** M. **Likelihood:** L (documented).
- **Mitigation:** Follow enforced code per `11_CONSISTENCY_REVIEW.md`; reconcile before store submission. (10/day copy: ✅ RESOLVED 2026-07-11 — `/subscription` copy + remaining counter updated to 15/day on web.)
- **Owner:** All. **Status:** Mitigating (documented in `11`).

## R19 — UGC block/hide absent (App Store Guideline 1.2)
- **Risk:** Reviews + music are UGC. Apple 1.2 requires filtering, report (✅), **block user / hide content**, and 24h action. Block/hide is not in the product today.
- **Impact:** H (near-automatic App Store rejection for UGC apps). **Likelihood:** H if shipped without it.
- **Mitigation:** **Compliance Investigation Required** — first verify whether the current TappyAI feature set requires block/hide/report-user under the **latest** App Store Review Guidelines. Do **not** add speculatively. If confirmed mandatory: implement **backend → Web → Android → iOS** at 100% parity (never iOS-only), minimal scope, + EULA terms, + 24h report action. Report already exists. See `18_REVIEW_ACTIONS.md §F6`.
- **Owner:** Backend + all clients. **Status:** Open — investigation before any implementation.

---

### Top blockers to resolve before/at kickoff: **R1 (anon quota), R2 (IAP — when Pro on), R4 (feed player), R14/R17 (SuperTux + review), R19 (UGC block — mandatory before submission).**
