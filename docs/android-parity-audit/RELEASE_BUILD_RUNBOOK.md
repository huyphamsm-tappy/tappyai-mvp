# TappyAI Android — Release Build Runbook

**Scope:** Release Keystore → `bundleRelease` → Verify Signed AAB → Google Play Internal Testing → Production.
**App:** `com.tappyai.app` · **Branch:** `feat/backoffice-phase0` @ `ad5e294` (or later).
**Toolchain (this machine):** JDK = Android Studio JBR (`C:\Program Files\Android\Android Studio\jbr`), SDK = `%LOCALAPPDATA%\Android\Sdk`, Gradle wrapper at `android/gradlew(.bat)`.

> ⚠️ The release build is **gated**: `assembleRelease`/`bundleRelease` hard-throws unless all 9 `TAPPYAI_*` properties are present. This is intentional (no placeholder/unsigned release).

---

## 0. Prerequisites (once)

- [ ] Google Play Console account with the app created (or ready to create), package `com.tappyai.app`.
- [ ] **Play App Signing** decision: recommended = let Google hold the *app signing key*; you provide an **upload key** (the keystore below is the upload key).
- [ ] Production values ready: prod Supabase URL + anon key, Google **Web** OAuth client ID (must match Supabase Google provider), prod web app URL, prod API base URL.
- [ ] `bundletool` (for local AAB verification) and `apksigner` (in `$ANDROID_HOME/build-tools/<ver>/`).

---

## 1. Release Keystore (upload key)

Create once and **store securely — never commit** (repo already gitignores keystores; keep a secure backup offline):

```bash
keytool -genkeypair -v \
  -keystore tappyai-upload.jks \
  -alias tappyai-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```

- [ ] Record store password, key alias, key password in your secrets manager (NOT in the repo).
- [ ] Back up `tappyai-upload.jks` offline — losing the upload key means resetting it via Play support.
- [ ] If reusing an existing upload key, skip creation and just reference it below.

---

## 2. Configure release secrets (do NOT commit)

Supply the **9 required** properties via `~/.gradle/gradle.properties` (machine-local, auto-merged) **or** `-P` flags. Missing any → the gate lists exactly which.

```
# ~/.gradle/gradle.properties  (machine-local; already holds the 4 non-secret ids)
TAPPYAI_SUPABASE_URL=https://<prod-ref>.supabase.co
TAPPYAI_SUPABASE_ANON_KEY=<prod anon key>
TAPPYAI_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
TAPPYAI_WEB_APP_URL=https://<prod-web-url>
TAPPYAI_API_BASE_URL_RELEASE=https://<prod-api>/
TAPPYAI_RELEASE_KEYSTORE_PATH=C:/secure/tappyai-upload.jks
TAPPYAI_RELEASE_KEYSTORE_PASSWORD=<store pw>
TAPPYAI_RELEASE_KEY_ALIAS=tappyai-upload
TAPPYAI_RELEASE_KEY_PASSWORD=<key pw>
```

- [ ] Bump **versionCode** (currently `1`) and confirm **versionName** in `android/app/build.gradle.kts` before every upload (Play rejects a re-used versionCode). *(This is the only source edit the release may require — a version bump, not a feature/refactor.)*
- [ ] Verify `TAPPYAI_API_BASE_URL_RELEASE` / `TAPPYAI_WEB_APP_URL` point at **real prod**, not `*.example.com`.

---

## 3. Build from a clean checkout (not the working tree)

The working tree has ~46 uncommitted WIP files that must **not** ship. Build from HEAD:

```bash
git clone --branch feat/backoffice-phase0 --single-branch <repo> tappyai-release
cd tappyai-release/android
```

```powershell
# PowerShell (this machine)
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat :app:bundleRelease --console=plain
```

- [ ] Build succeeds → output at `android/app/build/outputs/bundle/release/app-release.aab`.
- [ ] If it throws "Missing gradle properties: …", supply the listed values (Step 2) and re-run.

---

## 4. Verify the signed AAB

```bash
# (a) versionCode / versionName / package baked in
bundletool dump manifest --bundle=app-release.aab | findstr /I "versionCode versionName package"

# (b) signature present & valid — build a universal APK then verify
bundletool build-apks --bundle=app-release.aab --output=app-release.apks ^
  --mode=universal ^
  --ks=C:/secure/tappyai-upload.jks --ks-key-alias=tappyai-upload
#   (enter store/key passwords when prompted)
# unzip universal.apk from app-release.apks, then:
apksigner verify --verbose universal.apk
```

- [ ] `versionCode`/`versionName`/`package` = expected (`com.tappyai.app`).
- [ ] `apksigner verify` → "Verified" (v2/v3 scheme present).
- [ ] Install the universal APK on a device; run the **P0 journeys** on the *release* build (R8-minified) — confirm auth, chat streaming, feed all work against **prod** endpoints (not placeholders).
- [ ] No debug logging; `debuggable=false`.

---

## 5. Google Play — Internal Testing

- [ ] Play Console → create app (if new): default language, app/game, free/paid.
- [ ] **Testing → Internal testing → Create release** → upload `app-release.aab`.
- [ ] Add internal testers (email list); share the opt-in link.
- [ ] **App access:** add **working test credentials** (login is required — reviewers/testers cannot proceed without them). ⚠️
- [ ] Complete required declarations before promotion out of internal (can draft now):
  - Data safety (location, account info, user content, analytics; processors: Supabase, Vercel Blob, Jamendo)
  - Content rating questionnaire
  - Target audience & content
  - Privacy Policy URL (live)
  - AI-generated content disclosure
  - Account deletion method (in-app mailto + any web form)
  - Ads = No (unless changed)
- [ ] Store listing assets (title, short/full desc, phone+tablet screenshots, feature graphic, icon, category, contact).
- [ ] Install via the internal track on the **device matrix**; execute the UAT Test Log.
- [ ] Review the **Pre-launch report** (auto crawl: crashes/accessibility/policy).

---

## 6. Promote to Production

- [ ] UAT **Exit Criteria met** (see `UAT_RELEASE_READINESS.md` §9) and **Product Owner sign-off** recorded.
- [ ] (Optional) Promote through **Closed → Open** testing first for wider validation.
- [ ] **Production → Create release** → promote the tested AAB (same versionCode) or upload a new build with a bumped versionCode.
- [ ] Release notes (en + vi).
- [ ] **Staged rollout** (start e.g. 10–20%); monitor before 100%.
- [ ] Submit for review.

### Post-release monitoring
- [ ] Play Console: crashes/ANR (Android vitals), pre-launch report, ratings/reviews.
- [ ] Backend: Supabase/API error rates, Vercel Blob upload success, auth success rate.
- [ ] Rollback plan: halt staged rollout; if a bad build shipped, upload a fixed higher versionCode (Play has no true "unpublish a version" — you roll forward).

---

## Quick reference

| Step | Command |
|---|---|
| Build signed AAB | `./gradlew :app:bundleRelease` (with 9 `TAPPYAI_*` set) |
| AAB location | `android/app/build/outputs/bundle/release/app-release.aab` |
| Inspect manifest | `bundletool dump manifest --bundle=app-release.aab` |
| Verify signature | `bundletool build-apks --mode=universal …` → `apksigner verify universal.apk` |
| Gate error | supply the exact `TAPPYAI_*` names it prints |

**Never:** commit the keystore or secrets; build the release from the working tree; re-use a published versionCode; ship without a working test account for Play review.
