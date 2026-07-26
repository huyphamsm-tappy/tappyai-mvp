# TappyAI Android — Release-Candidate Report

**Date:** 2026-07-26 · **Branch:** `feat/backoffice-phase0` · **Source of truth:** Web Production (worktree `cool-vaughan-b3c7ff`, `main`).

> Scope of this pass: RC hardening only — no new features. Bugs, Web-parity, stability, performance, production-readiness, dead-code removal. Backend contracts unchanged; no UI redesign.

---

## 1. Verification gates

| Gate | Command | Result |
|------|---------|--------|
| Build (debug) | `:app:assembleDebug` | ✅ PASS |
| Build (production-like R8) | `:app:assembleStaging` (minify + ProGuard) | ✅ PASS |
| Lint | `:app:lintDebug` | ✅ 0 errors, 0 unused resources (193 warnings, all non-blocking) |
| Unit + Regression | `:app:testDebugUnitTest` | ✅ 74 tests, 0 failures, 0 errors (21 classes) |
| Signed release bundle | `:app:bundleRelease` | ⛔ BLOCKED — requires owner keystore + 9 `TAPPYAI_*` secrets (see §5) |

The 193 lint warnings are intentionally not actioned during the RC freeze: 120 `GradleDependency` version-bump hints (bumping deps mid-RC is risk, not parity), 30 `TypographyEllipsis` + 23 `PluralsCandidate` cosmetics, 9 `UseKtx`, 4 `AutoboxingStateCreation` micro-perf. None are release blockers.

## 2. Bugs fixed this pass

| Sev | Area | Fix | Commit |
|-----|------|-----|--------|
| P0 (lint) | Reviews video | 5× `UnsafeOptInUsageError` (media3 `UnstableApi`) → file-level opt-in | `c4a06d8` |
| P2 | Analytics | `/api/track` sent only `{event_type,metadata}` → events landed `platform=null`, invisible in platform rollups. Added the native device envelope (anon_id, 30-min session_id, event_id, client_timestamp, flat fields + `device_context`). Server already accepts all fields optional — no contract change. | `2bde168` |
| P1 | Currency | Silent ×1 fallback for a currency missing from `/api/rates` presented a **wrong conversion as authoritative**. Ported web `crossRate` (Bug #15 hardening): returns null on missing/invalid rate; screen shows an explicit "missing rate" error. | `d75442a` |
| P2 | Chat | A `[TAPPY_PLAN]` block with no `days` rendered an **empty** card; now falls back to plain text (web `parsePlan` parity). | `76a0c49` |
| P3 | Split Bill | Tip **percentage** was currency-formatted (12.5% → "13"); now mirrors web `String(activeTip)`. | `0ae3731` |
| P3 | Memory | Banner never showed `updated_at`; now renders the `dd/MM/yyyy` last-updated date with the "updates automatically" fallback. | `0ae3731` |
| P2 | Cleanup | Removed 9 zero-reference string resources (both locales). | `bec1a3c` |

Every automatable fix carries a kept regression test (`TrackWireTest`, `CurrencyMathTest`, `SplitBillCalculatorTest`, `MemoryUpdatedTest`).

## 3. Parity audit vs Web Production (all 5 domains) — no P0/P1 open

- **Reviews** (feed/detail/comments/composer/search/notifications): MATCH — endpoints, DTO shapes, POST bodies, 60/62s rule, optimistic flows, 300 ms watchdog, mute invariant, attached-sound playback, clip-id back-restore.
- **Fortune + Music**: MATCH byte-for-byte — djb2 hash incl. the abs / `ty2` / `YEAR_COMPAT`-reindex traps; ISO-week + UTC+7 keys; CC-BY attribution; videos grid.
- **Chat / Home / Onboarding / History / Recommendations**: MATCH — streaming, request body, `[TAPPY_PLAN]`/CTA/followups parse, save-place, quota copy, action bar; suggested-prompts, greeting buckets; onboarding POST; conversations (limit 20); recs DTO.
- **Split Bill / Analytics / Auth / Preferences**: MATCH — split math, gender auth-metadata read/write, event names + payload keys, Google + Email-OTP transport.
- **Deals / Translate / VietWriter / Scan / Group Dining / Bookings / Price Tracking / Maps / Saved / My Reviews / Settings**: MATCH — contracts, click-counter, OCR scan, group endpoints + deep-link, review-gate, watch GET/DELETE, sign-out, delete-account email path.

## 4. Remaining known issues (P2/P3 — none block release)

| Sev | Item | Note / owner call |
|-----|------|-------------------|
| P2 | Reviews sound **disc** affordance + `SoundSheet` route absent from the Android feed | In-feed music-discovery entry point. Attached-sound **playback** already works. Owner-scoped to a later music-module sprint. |
| P2 | `/api/bookings` caps at 20; the web bookings **page** reads unlimited | Android only has the API path; a user with >20 bookings sees the 20 most-recent. |
| P2 | Group Dining budget labels stored EN on Android vs VN on web | Cross-client string inconsistency; the AI prompt handles both languages. |
| P2 | Translate TTS is stricter than web (suppresses + notice on a missing voice vs web speaking regardless) | Android behavior is arguably safer; not a contract divergence. |
| P3 | `review_share` not emitted on Android | Android reviews feed has no share button to emit from. |
| P3 | Split Bill people-counter stays in sync (web can diverge) | Android behavior is the saner one. |

## 5. Google Play readiness — blockers (external dependencies, cannot be resolved in-repo)

1. **Signed release AAB (hard submission blocker).** `assembleRelease` / `bundleRelease` hard-throw unless 9 `TAPPYAI_*` Gradle properties are supplied: `RELEASE_KEYSTORE_PATH/PASSWORD`, `RELEASE_KEY_ALIAS/PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_WEB_CLIENT_ID`, `WEB_APP_URL`, `API_BASE_URL_RELEASE`. **Owner action:** provide the upload keystore + production secrets, then `bundleRelease`.
2. **FCM push** — needs a Firebase project + `google-services.json`. Push is absent, not broken; the app runs without it.
3. **Zalo login** + **anonymous tier** — need a backend mobile-token/deep-link + session contract decision.
4. **Backend-blocked data items:** liked-reviews source endpoint (P2-4); `inferFromBooking` RLS (P2-13, a web/backend bug, not client).

Google Play **account-deletion** requirement is satisfied (Settings → Delete Account opens a `mailto:` support-request path, mirroring web's email-based policy).

---

## 6. Verdict

# ❌ Not Ready to submit — 1 hard blocker

The blocker is **external, not engineering**: a **signed release AAB cannot be produced in-repo** — it requires the owner's upload keystore and the 9 production `TAPPYAI_*` secrets (§5.1). Everything within engineering control is release-quality:

- ✅ Functionally at parity with Web Production — **no P0/P1 open** across all 5 audited domains.
- ✅ Build (debug + production-like R8), Lint (0 errors), and 74 unit/regression tests all green.
- ✅ Dead code / duplicated logic removed; no new features or UI redesign introduced.

**To reach ✅ Ready:** the owner supplies the keystore + production secrets and runs `bundleRelease`; optionally wires FCM (Firebase project) and decides the Zalo/anonymous-tier backend contracts. Once the signed AAB builds, the app is submission-ready — the remaining items are P2/P3 polish and backend-owned features, none of which block a first release.

> Product UAT is the product owner's verdict — the checks above are engineering evidence (build/lint/unit/regression + code-level parity), not a product sign-off. The device UAT checklist is in `RC_UAT_CHECKLIST.md`.
