# 06 · Release Checklist

End-to-end steps to build, sign, and submit TappyAI to Google Play. Commands reflect the **actual** Gradle configuration in `android/app/build.gradle.kts`.

---

## Phase 0 — Blockers (must clear first)
- [ ] **Account deletion** path exists (in-app flow, or a public Account Deletion URL entered in Play Console). *(README blocker #1)*
- [ ] **Data Safety** owner decisions resolved: PostHog scope + deletion method. *(See [02](02_data_safety.md))*
- [ ] **Public privacy-policy URL** is live and reachable.
- [ ] **Facebook login** decision: hide for launch **or** documented in reviewer notes. *(README blocker #5)*
- [ ] Legal "last updated" dates aligned (web 19/06/2026 vs in-app June 13, 2026).

---

## Phase 1 — Versioning
- [ ] Confirm `versionCode` and `versionName` in `android/app/build.gradle.kts`.
  - Current: `versionCode = 1`, `versionName = "0.1.0"`.
  - For a first production upload, `versionCode 1` is acceptable. Every subsequent upload must **increment `versionCode`**. See [09](09_versioning_release_notes.md).
- [ ] Decide whether to launch as `0.1.0` or bump to `1.0.0` for a public GA. (Recommendation in [09](09_versioning_release_notes.md).)

---

## Phase 2 — Signing (Play App Signing)
- [ ] Generate an **upload keystore** (keep it safe and backed up; never commit it):
  ```bash
  keytool -genkeypair -v -keystore tappyai-upload.jks \
    -keyalg RSA -keysize 2048 -validity 9125 \
    -alias tappyai-upload
  ```
- [ ] Enroll in **Play App Signing** (default for new apps) — Google manages the app signing key; you upload with the upload key.
- [ ] Provide the four signing properties at build time (never hard-code them; `.jks`/`.keystore` are already git-ignored):
  - `TAPPYAI_RELEASE_KEYSTORE_PATH`
  - `TAPPYAI_RELEASE_KEYSTORE_PASSWORD`
  - `TAPPYAI_RELEASE_KEY_ALIAS`
  - `TAPPYAI_RELEASE_KEY_PASSWORD`
  > If any of the four is missing, the `release` build type stays **unsigned** (by design) — it will build but can't be uploaded until signed.

---

## Phase 3 — Release configuration values (build is gated to refuse placeholders)
The `assembleRelease` / `bundleRelease` tasks **throw** if any of these five properties is missing (verified in `build.gradle.kts`). Supply all five:
- [ ] `TAPPYAI_SUPABASE_URL` — real Supabase project URL.
- [ ] `TAPPYAI_SUPABASE_ANON_KEY` — real Supabase anon key.
- [ ] `TAPPYAI_GOOGLE_WEB_CLIENT_ID` — Google Cloud OAuth **Web application** client ID (must match Supabase's Google provider config).
- [ ] `TAPPYAI_WEB_APP_URL` — public web origin (for shareable Group Dining links), no trailing slash.
- [ ] `TAPPYAI_API_BASE_URL_RELEASE` — production API base URL (trailing slash).
- [ ] Supabase dashboard: register the `tappyai://auth-callback` redirect URL for OAuth to complete on device.

Put these in a local, git-ignored `gradle.properties` or pass via `-P` flags.

---

## Phase 4 — Build the release App Bundle (.aab)
Play requires an **AAB** for new apps (not an APK).
```bash
# from android/
./gradlew bundleRelease \
  -PTAPPYAI_SUPABASE_URL=... \
  -PTAPPYAI_SUPABASE_ANON_KEY=... \
  -PTAPPYAI_GOOGLE_WEB_CLIENT_ID=... \
  -PTAPPYAI_WEB_APP_URL=https://... \
  -PTAPPYAI_API_BASE_URL_RELEASE=https://.../ \
  -PTAPPYAI_RELEASE_KEYSTORE_PATH=/abs/path/tappyai-upload.jks \
  -PTAPPYAI_RELEASE_KEYSTORE_PASSWORD=... \
  -PTAPPYAI_RELEASE_KEY_ALIAS=tappyai-upload \
  -PTAPPYAI_RELEASE_KEY_PASSWORD=...
```
- [ ] Output: `app/build/outputs/bundle/release/app-release.aab`.
- [ ] Release build config verified: `isMinifyEnabled = true`, `isShrinkResources = true`, `isDebuggable = false` (from `build.gradle.kts`). R8/ProGuard rules apply (`proguard-rules.pro`).
- [ ] Sanity-test the release bundle on a device via bundletool or an internal-testing track before promoting.

---

## Phase 5 — Pre-launch verification
- [ ] Run the full [QA/UAT checklist](07_qa_uat_checklist.md) on the **release** build.
- [ ] Confirm the **merged release manifest** still declares only `INTERNET` + `ACCESS_NETWORK_STATE` (no library added a surprise permission).
- [ ] Verify a real Google sign-in completes end-to-end on a physical device (needs the real config from Phase 3).
- [ ] Verify chat returns AI answers against the production API.
- [ ] Smoke-test with R8 enabled (release), since minification can surface issues absent in debug.

---

## Phase 6 — Play Console setup
- [ ] Create the app; set default language **Vietnamese (vi-VN)**, add **English (en-US)**.
- [ ] Store listing: paste from [01](01_play_store_listing.md).
- [ ] Upload assets from [10](10_store_assets.md) (icon, feature graphic, screenshots).
- [ ] **App content**: Privacy policy URL, **Data safety** ([02](02_data_safety.md)), **Content ratings** ([03](03_content_rating.md)), **Ads = No**, **Target audience 13+**, Government/News/Financial = No, **Generative AI** disclosure ([04](04_ai_disclosure.md)), Data deletion method.
- [ ] **App access** / review notes: paste [08 Reviewer Notes](08_reviewer_notes.md) (include test-account details for login-gated content).
- [ ] Release notes: from [09](09_versioning_release_notes.md).

---

## Phase 7 — Rollout
- [ ] Upload the `.aab` to **Internal testing** first; validate the pre-launch report (Play runs automated device tests).
- [ ] Fix any pre-launch report crashes/accessibility flags.
- [ ] Promote to **Closed testing** (optional), then **Production** — start with a **staged rollout** (e.g. 10–20%).
- [ ] Monitor Android vitals (ANRs/crashes) after rollout.

---

## Quick gate summary
| Gate | State | Blocking? |
|---|---|---|
| Account deletion | ⛔ missing | Yes |
| Real release config (5 props) | ⛔ must supply | Yes |
| Upload keystore + signing | ⛔ must create | Yes |
| Public privacy URL live | ⛔ verify | Yes |
| Data Safety decisions | ⚠️ decide | Yes |
| Facebook login handling | ⚠️ decide | Recommended |
| Store assets | ⚠️ produce | Yes |
| QA/UAT pass on release build | ⚠️ run | Yes |
