# Domain 10 — Cross-cutting Infrastructure (Android vs Web prod)

**Audit baseline:** current working tree (branch `feat/backoffice-phase0`, uncommitted included), read directly from source. Web truth = `docs/freeze/Web_V1_Platform_Freeze_2026-07-25/`.

## Verdict

Backend transport is genuinely shared and `/api/config` is partially consumed (onboarding), but the **committed Android tree still cannot build** (Gradle foundation untracked, no POSIX `gradlew`) — the standing Phase-0 release blocker. Analytics (`/api/track`), suggested-prompts, and FCM push are stubs/absent; App Links are custom-scheme only. i18n is actually strong (943 resource keys + vi), contradicting the "widespread hardcoded VN" hypothesis.

---

## BUILD & RELEASE BLOCKERS

- **[P0] Gradle build foundation is UNTRACKED — committed tree does not build.**
  Only **one** commit has ever touched `android/` (`c4a924b feat(android): complete Android app`). 497 files tracked, but the build-critical files are untracked (never `git add`ed):
  - `android/settings.gradle.kts` — EVIDENCE: `git ls-files --error-unmatch android/settings.gradle.kts` → "did not match any file"; file exists on disk only.
  - `android/gradle/libs.versions.toml` — untracked (all 15 `build.gradle.kts` reference `libs.*` aliases; no catalog in the committed tree).
  - `android/gradle/wrapper/gradle-wrapper.jar` + `.properties` — untracked.
  - `android/gradlew.bat` — untracked.
  A clean checkout has no `settings.gradle.kts` to include modules and no version catalog → cannot build. Matches freeze §1.1. Reality confirms the doc is still current on this point.

- **[P0] No POSIX `gradlew` exists at all.** EVIDENCE: `ls android/gradlew` → "No such file or directory"; only `gradlew.bat` present. Linux/macOS CI has no wrapper. Matches freeze §1.1.

- **[P1] Release build hard-gated on 9 `TAPPYAI_*` Gradle props** (Supabase URL/anon key, Google web client id, web app URL, release API base URL, 4 keystore props) — `assembleRelease`/`bundleRelease` throw with placeholders. EVIDENCE: freeze §2; `android/app/build.gradle.kts` (modified in working tree — re-verify current gating). Expected/correct for V1, but blocks artifact production without secrets.

---

## IMPLEMENTED

- **[P2] `/api/config` IS consumed — but only the onboarding slice.** EVIDENCE: `android/app/src/main/java/com/tappyai/app/onboarding/data/OnboardingApi.kt:23` `@GET("api/config")`; DTO `OnboardingDtos.kt:10-18` deserializes only the `onboarding` block. **Contradicts freeze §3.3's blanket "currently ignored by Android"** — partially wrong: config is fetched, but freemium/flags/upload/auth blocks are deliberately dropped (`OnboardingDtos.kt:7` comment). See DIFFERENT BEHAVIOR.

- **[P2] Gated flags correctly wired (off, matching Web).** `SHOW_PRO_UPGRADE = false` and `SHOW_APP_CONNECTIONS = false`. EVIDENCE: `android/app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt:81,87`. These are local `const val`s mirroring Web `product.ts`, NOT read from the `/api/config` `flags` block (which is dropped) — so they are hardcoded mirrors, same drift risk class as upload limits. Correct behavior for V1.

- **[P1] i18n is resource-based and broad (contradicts backlog hypothesis).** EVIDENCE: `android/app/src/main/res/values/` + `values-vi/` hold 29 per-domain `strings_*.xml` files; **943 default keys vs 941 vi keys**. Auth module + designsystem also localized. The freeze backlog's "~624 hardcoded VN strings" is a **Web** finding (`project_web_uat_backlog`), NOT Android. Android i18n coverage is strong.

- **[P3] `FakeChatRepository` deleted.** EVIDENCE: `git status` shows `D .../chat/data/FakeChatRepository.kt`; file absent on disk. Dead scaffolding removed. Matches expectation.

- **[P3] `62` never appears in any UI string.** EVIDENCE: only occurrences of "62" are code comments (`ReviewComposerViewModel.kt:142,162`) and resource *comments* (`strings_reviews.xml:41`) explicitly noting "never expose the 62s backend tolerance". UI shows advertised 60. Compliant with the 60s/62s rule.

---

## MISSING

- **[P1] FCM push — not implemented.** `firebase-bom` (33.7.0) and `firebase-messaging-ktx` are declared in the version catalog but **never applied**. EVIDENCE: `android/gradle/libs.versions.toml:68,160,161`; `grep firebase android/app/build.gradle.kts` → no match; no `google-services` plugin anywhere; no `FirebaseMessagingService`; no `POST_NOTIFICATIONS` permission in manifest (only INTERNET + ACCESS_NETWORK_STATE, `AndroidManifest.xml:14-15`). The notifications toggle is a pure in-memory stub: `NotificationsViewModel.kt:20-27` (`MutableStateFlow(false)`, comment: "no push engine, permission request, persistence, or backend"). `/api/notifications/subscribe` + `/broadcast` unwired. Matches freeze §4.2 item 5.

- **[P1] `/api/track` analytics — logging-only, effectively unwired.** `LoggingAnalyticsProvider.track()` forwards to logcat only. EVIDENCE: `android/core/analytics/.../LoggingAnalyticsProvider.kt:12-13`; bound as the sole provider in `AnalyticsModule.kt:15`. No HTTP call to `/api/track`. Only **1** `.track(` call-site exists in `app/src/main` — analytics is barely exercised even locally. Android contributes nothing to the personalization signal. Matches freeze §4.2 item 6.

- **[P2] `/api/suggested-prompts` — not called.** EVIDENCE: `grep -rn "suggested-prompts" android/` → 0 hits (only `suggestedCaption` for video AI enrichment, unrelated). Home has a static `home_section_suggested` header (`HomeScreen.kt:301`) but no dynamic prompt fetch. Matches freeze §3.2 / §4.2 item 7.

- **[P2] App Links — custom-scheme only; no real https deep links.** EVIDENCE: `AndroidManifest.xml:46-69` — two `tappyai://` intent-filters (`auth-callback`, `group`), both with `autoVerify` deliberately omitted. No `https` intent-filter for the real origin, no `assetlinks.json` anywhere in the repo (`find -iname "*assetlinks*"` → none). Real `https://<origin>/reviews/{id}` and `/group/{id}` links do not open the app. Matches freeze §4.2 item 11.

---

## DIFFERENT BEHAVIOR (drift risk)

- **[P1] Upload limits & freemium hardcoded as `const val`, not from `/api/config`.** EVIDENCE: `ReviewComposerViewModel.kt:436-439` — `MAX_VIDEO_SIZE_BYTES = 50L*1024*1024`, `MAX_VIDEO_DURATION_ADVERTISED = 60`, `MAX_VIDEO_DURATION_ACCEPT_SEC = 62.0`, `MAX_PHOTOS = 6`. The `/api/config` `upload`/`freemium`/`flags` blocks are explicitly discarded by the onboarding DTO (`OnboardingDtos.kt:7`). This is exactly the drift vector that caused the Web 15s/60s bug. ADR-0004 proposed consuming these; it is **Status: Proposed (Deferred)** and untracked (`android/docs/adr/0004-*.md`). Matches freeze §3.3.

- **[P2] `SHOW_PRO_UPGRADE`/`SHOW_APP_CONNECTIONS` are hardcoded mirrors, not config-driven.** Same drift class — a Web flag flip would require an Android code change + release. `ProfileScreen.kt:81,87`. Acceptable while both are frozen off, but should move to the `/api/config` `flags` block.

---

## BUGS / DEAD SCAFFOLDING

- **[P2] `CachedContextEntity` dead scaffolding still present AND fully plumbed.** Caches `GET /api/context`, which **does not exist server-side**. EVIDENCE: `android/core/database/.../CachedContextEntity.kt` + `CachedContextDao.kt`, and it is wired into `TappyDatabase.kt` and `DatabaseModule.kt` (not orphaned — actively part of the Room schema). Should be deleted. Matches freeze §3.2 ("delete it").

- **[P3] `gender` / profile `created_at` / memory `updated_at` etc.** — API-not-exposed gaps (BLOCKED class, freeze §4.3). Out of this domain's depth; noted for cross-ref.

- **[P3] Residual hardcoded VN literals — small tail, dominated by fortune data.** ~52 `.kt` files contain VN-diacritic string literals, but the bulk are **content data** not UI chrome: `fortune/tarot/TarotCard.kt`, `fortune/tuvi/*`, `fortune/zodiac/*` (reading meanings), plus the `SHARE_PLACE_NAME = "Chia sẻ"` backend sentinel (`ReviewComposerViewModel.kt:441` — a contract value, must stay literal) and some seed/comment strings. Most are single-occurrence. Low priority given the 943-key resource base. This is a data-localization tail, not the systemic hardcoding the backlog implies for Web.

---

## REQUIRED BACKEND CONTRACTS

- `/api/config` full consumption: Android must read `upload.{maxPhotosPerReview,maxVideoSizeMb,maxVideoDurationSec}`, `freemium.{freeDailyLimit,anonDailyLimit}`, `flags.{showProUpgrade,showAppConnections}` — payload already served (freeze §3.3). `62` must remain absent from payload and UI (tolerance is client-internal).
- `/api/track`: wire `LoggingAnalyticsProvider` → real POST.
- `/api/notifications/subscribe` + `/broadcast`: FCM token registration contract (Android uses FCM, not VAPID/Web-Push).
- `/api/suggested-prompts`: Home + Chat chips.
- App Links: hosted `/.well-known/assetlinks.json` for the prod origin (owner infra step) + `autoVerify` https intent-filters.

---

## Freeze-doc contradictions found

1. Freeze §3.3 says `/api/config` is "currently ignored by Android" — **partially inaccurate**: onboarding fetches it (`OnboardingApi.kt:23`); only the limits/flags/freemium/auth blocks are ignored.
2. The backlog's "~624 hardcoded VN strings" is a **Web** finding; Android has robust resource i18n (943/941 keys). Do not carry that number to Android.
3. Freeze §1.1's build-blocker claim is **still current and confirmed** (1 commit, untracked Gradle foundation, no POSIX gradlew) despite the large working-tree modification set on `feat/backoffice-phase0`.
