# Android Release Candidate (RC) Audit — Report

**Date:** 2026-07-18 · **Branch:** `feat/backoffice-phase0` · Web (`src/`) = source of truth.
**Scope:** Production-readiness audit (NOT a feature sprint). No new features, no UI redesign, no
business-logic changes except real-bug fixes. Every finding verified against current source before
fixing; every fix built + unit-tested; app installed and boot-smoke-verified on emulator.

**Method:** 5 parallel read-only audit agents across Crash/ANR, Lifecycle/process-death/rotation,
Memory leaks, Coroutines/races, Network failure/offline/retry, Backend-contract correctness,
Security, Performance, Accessibility, Google Play compliance, Release config, Build/signing/lint,
and Dead code/TODO/debug artifacts. Each reported finding was re-read at the exact `file:line` before
any change.

**Build gate:** `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, tests green (only
pre-existing deprecation warnings). Emulator (`emulator-5554`): install OK, cold boot clean (no
`FATAL EXCEPTION`), `MainActivity` reaches `topResumedActivity`, Login screen renders. `TEMP_VERIFY_HACK` → **0**.

---

## 1 — RELEASE-BLOCKER (fixed)

### N1 · Native video + thumbnail upload broken 100% — blob-token `type` dropped from the wire
- **File:** `app/src/main/java/com/tappyai/app/reviews/data/ReviewNetworkDtos.kt` (`BlobTokenRequestDto`).
- **Cause:** the shared production `Json` uses `encodeDefaults=false` (deliberate — see
  `ChatWireContractTest`). `BlobTokenRequestDto.type = "blob.generate-client-token"` is a
  **default-valued** field, so it was omitted from the serialized body. Android actually sent
  `{"payload":{…}}` with no `type`. The backend (`src/app/api/upload/video/route.ts`) forwards the
  body to `@vercel/blob`'s `handleUpload`, which switches on `body.type` and throws
  `"Invalid event type"` → HTTP 500 → `safeApiCall` → `NetworkResult.Error`. Every native video
  review and every thumbnail upload failed before the Blob PUT.
- **Why it slipped earlier:** the emulator verification 401'd on auth (`getRequestUser`) before ever
  reaching the discriminator check, so the success path was never exercised (it is Owner-UAT-only).
- **Fix:** `@EncodeDefault(EncodeDefault.Mode.ALWAYS)` on `type` (identical guard already applied to
  `MusicSelectionDto` in the same file), plus `@OptIn(ExperimentalSerializationApi::class)`.
- **Follow-up (report-only):** there is no reviews wire-contract test; a test asserting the encoded
  blob-token body contains `type` would prevent regression (chat/onboarding/servicedetail have such
  tests; reviews does not).

---

## 2 — Production-quality fixes (verified + fixed)

### New in-feed video / feed code (the code added in the prior parity sprint)

| # | File | Issue | Fix |
|---|------|-------|-----|
| M2 | `reviews/ui/ReviewVideoPlayer.kt` | Every card called `prepare()` on compose regardless of `active`, so a long feed allocated a video decoder per off-screen card (decoder exhaustion / jank). | `setMediaItem+prepare+play` only while `active`; on inactive `stop()`+`clearMediaItems()` frees the codec. Off-screen cards never prepare. |
| F2 | `reviews/ui/ReviewVideoPlayer.kt` | The lifecycle `ON_START` observer captured a **stale** `active`, so the wrong clip could resume after backgrounding. | `rememberUpdatedState(active)` read inside the observer; `ON_START` re-prepares only if it went idle, else resumes in place. |
| A4 | `reviews/ui/ReviewVideoPlayer.kt` + `ReviewCard.kt` | The video surface had no a11y semantics (TalkBack read nothing). | New `contentDescription` param + `Modifier.semantics`; label `reviews_video_a11y` (vi/en), passed the author name from `ReviewCard`. |
| F1 | `reviews/ui/ReviewsFeedViewModel.kt` | `loadNextPage()` launched an **untracked** coroutine; a tab switch/refresh cancelled only `loadJob`, so a stale page-N append injected the wrong tab's reviews **and** desynced the `page` cursor. | Track `pageJob`; cancel it on `loadFirstPage`; reset `isLoadingMore`; capture `feedType` at launch and discard the result if the tab changed mid-request. |
| M3 | `reviews/ui/ReviewsScreens.kt` | The live-feed `VerticalPager` had no stable `key`, so paging appends / optimistic removes could remap a page onto the wrong card and reset each card's ExoPlayer. | `key = { reviews[it].id }`. |
| A5 | `reviews/ui/ReviewsScreens.kt` | `FeedTab` (For You / Following / Latest) tap target was ~22 dp tall (< 48 dp). | `defaultMinSize(minHeight = TappyMinTouchTarget)` + vertical centering + horizontal padding. |

### Composer & card

| # | File | Issue | Fix |
|---|------|-------|-----|
| M1 | `reviews/ui/ReviewComposerScreen.kt` | Poster preview decoded the **full-res** video frame (often 1080×1920) synchronously in composition on the main thread for a ~200 dp box. | `produceState` + `Dispatchers.Default`; new `decodeSampledPoster` downsamples (power-of-two `inSampleSize`) to ≈720 px off-main. |
| F3 | `reviews/ui/ReviewComposerViewModel.kt` | `onPhotosPicked` computed `room` once from a snapshot and appended without re-checking, so concurrent picks could exceed `MAX_PHOTOS` (6). | Ignore a second pick while `isUploading`; re-check the cap inside the append `update`. |
| M4 | `reviews/ui/ReviewCard.kt` | The author-handle `Regex("\\s+")` was recompiled on every recomposition. | Module-level `WHITESPACE_REGEX` + `remember(displayName)`. |

### Security / release configuration

| # | File | Issue | Fix |
|---|------|-------|-----|
| S1 | `res/xml/{data_extraction_rules,backup_rules}.xml` | Auto Backup / device-transfer excluded only the encrypted token file; the Room DB `tappy.db` (incl. `CachedContextEntity.profileJson` — profile PII) and the DataStore `tappy_preferences` (gender, dietary, name/phone drafts) still backed up to Google cloud. | Excluded `tappy.db` (+`-wal`/`-shm`) and `datastore/tappy_preferences.preferences_pb` from both `cloud-backup` and `device-transfer` (and the pre-API-31 `full-backup-content`). Verified the auth tokens are **not** in the plaintext DataStore — they live only in `EncryptedTokenStorage`. |
| S3 | `app/build.gradle.kts` | The release build gate validated the 5 config props but **not** the 4 `TAPPYAI_RELEASE_KEYSTORE_*` props, so a config-complete build with no signing config produced an **unsigned** AAB instead of failing. | Added the 4 keystore prop names to the gate's `required` list (and switched the check to `isNullOrBlank`). |
| L2 | `res/values/strings.xml` | `app_name` had no `values-vi` counterpart → `MissingTranslation` lint error (blocks a lint-clean release). | `app_name` marked `translatable="false"` (brand name, identical in every locale). |

### Dead code

| # | Area | Fix |
|---|------|-----|
| D1 | `app/.../discovery/` (7 files) + `res/values{,-vi}/strings_discovery.xml` | **Deleted.** Verified zero real references — the Explore tab is `ReviewsNavHost`, not the discovery package; the only outside mentions were two KDoc comments (`HomeTabRoute.kt`, `MusicRoute.kt`), which were also cleaned up. Removes 2 unreachable Hilt ViewModels from the DI graph and shrinks the APK. |

---

## 3 — Reviewed and intentionally NOT changed (report-only)

- **`targetSdk` bump (Play policy):** a `targetSdk 35` migration is planning/testing work, out of scope
  for a fix pass — flagged for a scheduled follow-up, not changed here.
- **Deep-link "DoS" on the OAuth callback:** mitigated by PKCE; an infra/robustness concern, not a
  release blocker.
- **Debug `BODY` HTTP logging:** already gated behind `BuildConfig.DEBUG`; release builds are clean.
- **Scan bitmap recycle:** changing recycle timing is riskier than the marginal benefit; left as-is.
- **No lint baseline:** intentionally not adding one — a baseline would hide real issues; the one real
  lint error (`app_name`) is fixed at the source instead.
- **Network cluster:** the audit cleared the OkHttp/Retrofit client (timeouts, `retryOnConnectionFailure`,
  redacted auth logging), `safeApiCall` (Cancellation rethrown before generic catch), `AuthInterceptor`/
  `TokenAuthenticator` (host-scoped, 401-loop guard), the dedicated `blobUpload` client (no auth
  interceptor, 300 s write timeout, cancellation wired), chat streaming (per-call 60 s read timeout,
  `awaitClose`, `finally` resets the spinner), and every recently-added endpoint contract. No defects
  beyond N1.

---

## 4 — Residual Owner-UAT (require a real signed-in session; cannot be verified here)

Per the standing rule (never click real OAuth on the emulator), the authenticated paths are Owner UAT:
- **N1 fix confirmation:** post a review with a video → token mint now returns 200 and the Blob PUT +
  publish succeed (the on-device proof that the `type` fix works end-to-end).
- In-feed video **playback** (autoplay/mute/loop, tap-to-unlock-sound, scroll pause), feed-**tab** data
  (For You / Following / Latest), and the composer poster preview with a real picked video.

---

## 5 — Release build verification (`bundleRelease`, 2026-07-18)

Final release-pipeline smoke test. **No production keystore was used** (owner-only secret); a
**throwaway self-signed test key** was generated solely to exercise signing, then deleted.

| Check | Result |
|-------|--------|
| **Release gate (S3 fix)** | With no props, `:app:bundleRelease` **correctly refused**: "Missing gradle properties: TAPPYAI_WEB_APP_URL, TAPPYAI_RELEASE_KEYSTORE_PATH/PASSWORD, TAPPYAI_RELEASE_KEY_ALIAS/PASSWORD." No unsigned/misconfigured AAB can be produced. |
| **`bundleRelease`** | **BUILD SUCCESSFUL** (2m28s) with the test key + real config props from `gradle.properties`. |
| **ProGuard / R8** | `minifyReleaseWithR8` ran; `mapping.txt` = 663,881 lines (shrinking + obfuscation applied, no missing keep-rules failing the build). |
| **`lintVitalRelease`** | Passed — confirms the `app_name` `MissingTranslation` fix (a release-blocking lint) is resolved. |
| **AAB produced** | `app/build/outputs/bundle/release/app-release.aab` (10.6 MB). |
| **Signing** | `jarsigner -verify` → **"jar verified"**, SHA256withRSA 2048-bit (test cert). |
| **Manifest** | Release package `com.tappyai.app` (no debug/staging suffix), versionCode 1 / versionName 0.1.0, `debuggable` absent (non-debuggable), backup rules wired (`@xml/data_extraction_rules` + `@xml/backup_rules` — S1 exclusions shipped), minimal permissions (INTERNET, ACCESS_NETWORK_STATE, + WorkManager receiver perm), deep-link scheme `tappyai` + LAUNCHER merged. Explicit `android:exported` is validated implicitly — AGP hard-fails the build otherwise on targetSdk 31+. |

**Pipeline is release-ready.** Owner-only remaining steps for a real Play upload: (1) sign with the
**real upload keystore** (supply the 4 `TAPPYAI_RELEASE_KEYSTORE_*` props — the gate enforces this);
(2) bump `versionCode`/`versionName` per release (currently 1 / 0.1.0, correct for a first upload).

---

## Conclusion

One **release-blocker** (native video/thumbnail upload, N1) and a set of production-quality issues in
the newly-added feed/video/composer code (decoder pressure, stale-lifecycle resume, cross-tab feed
corruption, main-thread poster decode, photo-cap race, a11y, touch target), plus privacy (Auto Backup
of PII) and release-config (unsigned-AAB gate, lint) hardening — all verified against source, fixed,
built, unit-tested, and boot-smoke-verified. Dead `discovery/` package removed. `TEMP_VERIFY_HACK` = 0.
No production-critical issues remain that are verifiable without a signed-in session; the remaining
items are Owner UAT.
