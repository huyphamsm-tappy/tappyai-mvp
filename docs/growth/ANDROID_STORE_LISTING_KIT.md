# Android store listing kit — TappyAI

**Status:** preparation only. **Nothing submitted.** Publishing an Android app is a separate owner decision (release build, signing, account). This kit exists so that when that decision is made, every listing agrees with the web entity (`/about`) and the extension listing — one name, one description, one logo.

## Store facts (verify at submission; fees are for the developer account, not per app)

| Store | Developer registration | Listing | Organic discovery | Source |
|---|---|---|---|---|
| Google Play | **US$25 one-time** | free | Play search; Google Search surfaces Play listings | support.google.com/googleplay/android-developer/answer/6112435 |
| Samsung Galaxy Store | Seller Portal sign-up; no fee found | free | Galaxy Store search (pre-installed on Samsung — the largest Android OEM share in Vietnam) | developer.samsung.com/galaxy-store |
| Huawei AppGallery | free ("Join Huawei Developer portal for free") | free | AppGallery search | developer.huawei.com/consumer/en/appgallery |
| Xiaomi GetApps | registration documented; fee not stated | — | GetApps search | global.developer.mi.com |
| Apple App Store | US$99/year — **not free**; needs macOS | — | — | out of scope |
| APK aggregator sites | — | — | — | **rejected** (no control, malware association) |

Note on Vietnam: Samsung, Xiaomi and OPPO dominate Android shipments; Galaxy Store and GetApps are pre-installed alternatives to Play on those devices — free listings that reach a Play-less discovery surface. (Market-share claim: HYPOTHESIS from general knowledge; verify with current data before prioritising.)

## Release facts (from the repository, verified)

| Item | Value | Where |
|---|---|---|
| applicationId | `com.tappyai.app` | `android/app/build.gradle.kts` |
| versionCode / versionName | 8 / 0.1.3 (6 and 7 are spent; Play rejects reuse) | same |
| minSdk / targetSdk / compileSdk | 26 / 36 / 36 | same |
| Play account | **exists** — a vc6 artifact was released to the closed *Alpha* track on 2026-08-16 (build.gradle.kts note) | Play Console |
| Release signing | `signingConfigs.release` reads `TAPPYAI_RELEASE_KEYSTORE_PATH/_PASSWORD/_KEY_ALIAS/_KEY_PASSWORD` gradle properties; keystore never committed | same (build.gradle.kts refers to `docs/release/ANDROID_RELEASE_CONFIGURATION.md`, which is **not present in this tree** — the gradle properties above are the source of truth) |
| Release API/web config | `TAPPYAI_SUPABASE_URL`, `TAPPYAI_SUPABASE_ANON_KEY`, `TAPPYAI_GOOGLE_WEB_CLIENT_ID`, `TAPPYAI_WEB_APP_URL`, `TAPPYAI_API_BASE_URL_RELEASE` — the build refuses a release artifact with placeholder values | same |
| Build command | `./gradlew :app:bundleRelease -P<the properties above>` → `app/build/outputs/bundle/release/app-release.aab` | — |
| App Links flag (optional) | `-PTAPPYAI_APP_LINKS_ENABLED=true` once `ANDROID_APP_LINKS_SHA256` is served (see `APP_LINKS.md`) | — |

## Assets

| Asset | Status | Path |
|---|---|---|
| Icon 512×512 (Play/Galaxy/AppGallery) | READY | `android/store/icon-512.png` (from the brand logo) |
| Feature graphic 1024×500 | READY | `android/store/feature-graphic-1024x500.png` (existing `public/feature-graphic.png`) |
| Phone screenshots (Play: 2–8, 16:9/9:16, ≥320px) | **OWNER** | real captures from the Pixel_8 emulator or a device; not generated |
| Privacy policy URL | READY | https://www.tappyai.com/privacy |
| Data safety answers | outline below (owner completes the form) | — |

## Readiness matrix

| Store | Repository side | Owner action | Fee | Verdict |
|---|---|---|---|---|
| Google Play | READY (copy, icon, feature graphic, signing config, version) | build + sign AAB with the release properties; upload to the existing Play listing (new track/version); screenshots; data-safety form; content rating | account already paid (one-time US$25) | **OWNER ACTION** |
| Samsung Galaxy Store | READY (same copy/assets; APK or AAB) | Seller Portal sign-up (no fee found); upload; screenshots | none found | **OWNER ACTION** |
| Huawei AppGallery | READY (copy/assets) — note: the app uses Firebase Messaging + Google Sign-In; HMS-only devices may lack them (not a store blocker, a UX caveat to test) | free developer registration; upload; screenshots | none | **OWNER ACTION** |
| Xiaomi GetApps | READY (copy/assets) | Mi Developer registration (fee not stated); upload | unknown | **OWNER ACTION** |
| Apple App Store | — | — | US$99/yr; needs macOS | **BLOCKED** |
| APK aggregator sites | — | — | — | **NOT APPLICABLE** (rejected) |

## Canonical listing copy (must match `/about` and the extension listing)

| Field | Value |
|---|---|
| App name | TappyAI |
| Short description (≤80) | vi: `Trợ lý AI thuần Việt: ăn gì, mua gì, đi đâu — và Scam Shield kiểm tra lừa đảo.` · en: `Vietnamese-first AI for food, shopping, travel, beauty — plus Scam Shield.` |
| Full description | vi/en: the `/about` text (`about.intro`, `about.whatDomains`, `about.whatScam`, `about.whatShare`, `about.howSources`, `about.howHonesty`, `about.privacyBody`) |
| Category | Lifestyle (alt: Tools) |
| Content rating | to be completed by owner (app has an 18+ age declaration for accounts — disclose) |
| Privacy policy URL | https://www.tappyai.com/privacy |
| Website | https://www.tappyai.com |
| Support email | support@tappyai.com |
| Icon | `android/store/icon-512.png` (512×512, exported from `public/branding/otter-logo.png`) |
| Feature graphic | `android/store/feature-graphic-1024x500.png` (1024×500, verified) |
| Screenshots | real device captures only — the ones under `public/landing/screen-*.webp` are web captures; Android captures are an owner task (Pixel_8 emulator exists) |
| Data safety (Play) | declare: account data (email), user content (queries), location (optional, for local results), analytics (first-party `user_events` + PostHog). No selling. Encryption in transit. Deletion: request-based (in-app "Request account deletion" → email to support), documented at `/delete-account` — declare it as such, not as self-service. |

## After publication (code-side, prepared)

- Add the Play listing to `public/manifest.json` `related_applications` (`platform: "play"`, `id: "com.tappyai.app"`) — keep `prefer_related_applications: false` so the PWA remains installable.
- Android App Links: publish the release signing cert SHA-256 → `ANDROID_APP_LINKS_SHA256` (server statement already served at `/.well-known/assetlinks.json`), build with `-PTAPPYAI_APP_LINKS_ENABLED=true` and verify on a device — the `autoVerify` alias and the Custom Tab handler for `/r/*` already exist (see `APP_LINKS.md`).
- Attribution: Play Install Referrer is not wired (FUTURE); first-run web deep links from the app carry no `src` today.

## Do not

- Do not sideload-distribute an APK through aggregator sites.
- Do not buy installs, reviews or ratings.
- Do not claim "featured" or ranking.
