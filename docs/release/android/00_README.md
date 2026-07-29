# TappyAI — Android Release Kit

**Generated:** 2026-07-17
**Applies to:** TappyAI Android app (`com.tappyai.app`), versionCode `1` / versionName `0.1.0`
**Source of truth:** the production Web app (`src/`) and the actual Android project (`android/`). Every claim in these documents was read from the real source, not assumed.

> These are **release documents and asset specs only**. No application code was modified to produce them. Where a document states a fact about the app (permissions, data flows, features), it reflects what the code actually does today.

---

## What's in this kit

| # | File | Purpose |
|---|---|---|
| 01 | [Play Store Listing](01_play_store_listing.md) | Title, short & full description, ASO keywords, category (VI + EN) |
| 02 | [Data Safety Declaration](02_data_safety.md) | Exact answers for the Play Console Data Safety form |
| 03 | [Content Rating Guidance](03_content_rating.md) | IARC questionnaire answers + expected rating |
| 04 | [AI Disclosure](04_ai_disclosure.md) | Generative-AI disclosure for Play + in-app + listing |
| 05 | [Privacy & Permissions Summary](05_privacy_permissions.md) | Every permission and why; data-flow map |
| 06 | [Release Checklist](06_release_checklist.md) | End-to-end steps to build, sign, and submit |
| 07 | [QA / UAT Checklist](07_qa_uat_checklist.md) | Pre-submission device test matrix |
| 08 | [Reviewer Notes](08_reviewer_notes.md) | Notes for the Google Play review team |
| 09 | [Versioning & Release Notes](09_versioning_release_notes.md) | Version scheme + first-release notes (VI + EN) |
| 10 | [Store Assets List](10_store_assets.md) | Icons, screenshots, feature graphic specs |

---

## App at a glance (verified from source)

- **Package / applicationId:** `com.tappyai.app` (debug variant: `com.tappyai.app.debug`)
- **Version:** `versionCode = 1`, `versionName = "0.1.0"` (first public release, pre‑1.0)
- **Min / target SDK:** `minSdk 26` (Android 8.0 Oreo) · `targetSdk 35` (Android 15) · `compileSdk 36`
- **Permissions declared:** `INTERNET`, `ACCESS_NETWORK_STATE` — **nothing else**
- **Primary market / language:** Vietnam · Vietnamese (default) + English (in-app switchable)
- **Backend:** Supabase (authentication + Postgres data) and the TappyAI API. AI answers are produced server-side via Anthropic Claude + Google Search.
- **Third-party client SDKs that transmit data:** **none** (no Firebase, no Crashlytics, no ad SDK, no analytics SDK in the Android client)
- **Support contact:** huypham.sm@gmail.com

---

## ⛔ Release blockers found while preparing this kit

These were discovered by reading the real project. Address them **before** submitting — none require guessing; each is a concrete, verifiable gap.

1. **No in-app account deletion.** The app lets users create accounts (Google / Facebook / email OTP), and the privacy policy explicitly promises deletion "via Settings," but **no delete-account flow exists in the Android app** (Account screen has only name/email/joined + Edit profile; Settings has only Sign out). Google Play **requires** an account-deletion path (in-app and/or a public web URL) for apps that support account creation. → Either add the in-app flow, or provide a public **Account Deletion URL** and declare it in Play Console. This is a hard submission gate. See [02](02_data_safety.md) §Data deletion.

2. **Privacy policy vs. Android reality — PostHog analytics.** The published privacy policy (source of truth) declares **PostHog** product analytics. The **Android client contains no analytics SDK** (the only analytics implementation logs to logcat and is debug-gated). The Data Safety declaration must reflect what the Android app actually does. → Decide and document: does backend-side analytics attribute Android events, or is analytics web-only? See [02](02_data_safety.md) §Owner decisions.

3. **Real release configuration required.** The release build is deliberately gated to **refuse** building with placeholder values. You must supply, via `-P…` flags or `gradle.properties`: `TAPPYAI_SUPABASE_URL`, `TAPPYAI_SUPABASE_ANON_KEY`, `TAPPYAI_GOOGLE_WEB_CLIENT_ID`, `TAPPYAI_WEB_APP_URL`, `TAPPYAI_API_BASE_URL_RELEASE`, plus the four `TAPPYAI_RELEASE_KEYSTORE_*` signing properties. See [06](06_release_checklist.md).

4. **Public privacy-policy URL must be live.** Play requires a publicly reachable privacy-policy URL. The policy currently lives as a page inside the web app (`/privacy`). Confirm the production URL resolves before submission.

5. **Facebook login is non-functional in production.** The button is present but blocked end-to-end by Meta Business Verification (an app-level Meta restriction). A reviewer who taps it will hit a dead end. See [08](08_reviewer_notes.md) — either hide it for launch or document it for reviewers.

6. **Minor policy-date inconsistency.** Web privacy policy says "Last updated 19/06/2026"; the in-app Android legal screen says "June 13, 2026." Align the dates.

---

## How to use this kit

1. Read this README and clear the blockers above.
2. Work through [06 Release Checklist](06_release_checklist.md) top to bottom.
3. Copy listing text from [01](01_play_store_listing.md) into Play Console (per locale).
4. Fill the Data Safety form using [02](02_data_safety.md) verbatim, after making the two owner decisions it flags.
5. Answer the content-rating questionnaire with [03](03_content_rating.md).
6. Produce the assets in [10](10_store_assets.md).
7. Paste [08 Reviewer Notes](08_reviewer_notes.md) into the "App access" / review-notes field.
