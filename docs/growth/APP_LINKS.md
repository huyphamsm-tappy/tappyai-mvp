# Android App Links — prepared, off by default

**Goal:** `https://www.tappyai.com/r/<slug>` opens the TappyAI app when it is installed, and the web page otherwise.
**Status:** repository side **DONE (inert until enabled)**; verification needs the release signing certificate and a deployed statement — **owner action**. App Links are **not verified** and no claim is made that they work until the device check in §5 passes.

## 1. What exists (audited)

| Layer | Where | State |
|---|---|---|
| Digital Asset Links statement | `GET /.well-known/assetlinks.json` (`src/lib/growth/appLinks.ts`) | structure correct (`delegate_permission/common.handle_all_urls`, `android_app`, `com.tappyai.app`, `sha256_cert_fingerprints`); **404 until `ANDROID_APP_LINKS_SHA256` is set**; fingerprints validated (`AA:BB:…` 32 pairs, upper-cased), comma-separated for upload + Play App Signing keys |
| Manifest claim | `android/app/src/main/AndroidManifest.xml` → `activity-alias .PublicLinkActivity` → `MainActivity` | `autoVerify="true"`, `https`, host `${tappyPublicHost}` (from `TAPPYAI_WEB_APP_URL` → `www.tappyai.com`), `pathPrefix="/r/"` only; `android:enabled="@bool/tappy_app_links_enabled"` |
| The flag | `android/app/build.gradle.kts` `resValue("bool","tappy_app_links_enabled", …)` | **false** unless the build passes `-PTAPPYAI_APP_LINKS_ENABLED=true` |
| Native handling | `MainActivity.handleIntent` → `PublicWebLinks.isPublicResultLink` → `PublicLinkOpener.open` | the public page is opened in a **session-bound Custom Tab** (androidx.browser, already a project dependency) — the documented way to keep a verified URL in the tab instead of bouncing back to the app; falls back to opening the app normally if no browser offers Custom Tabs |
| Fallback to web | Android behaviour | with the flag off, or the statement unverified, Android opens the URL in the browser (Android 12+ never routes an unverified link to an app) — no link can break |
| Tests | `PublicWebLinksTest` (matcher + manifest/gradle contract), `appLinks.test.ts` (statement + parity with the manifest and applicationId), `publicSurfaces.test.ts` (404 when unset) | green |

## 2. Why only `/r/*`

The five hubs and other public pages have no native destination; claiming them would open the app on a screen that is not the page. `/r/<slug>` is the one link people receive from other people, and it opens the exact page in-app. The server statement (`UNIVERSAL_LINK_PATHS`) lists more paths for the iOS AASA template; Android claims only `/r/`.

## 3. Owner action — enabling

1. **Fingerprints.** Play Console → *Test and release* → *App integrity* → *App signing key certificate* → SHA-256 (Play App Signing), plus the *Upload key certificate* SHA-256. (For a locally signed test build: `keytool -list -v -keystore <keystore> -alias <alias>` → SHA256.)
2. **Vercel Production env:** `ANDROID_APP_LINKS_SHA256=<PLAY_SHA256>,<UPLOAD_SHA256>` → deploy → `https://www.tappyai.com/.well-known/assetlinks.json` returns the JSON statement (must be served with `Content-Type: application/json` and HTTP 200 — the route does both).
3. **Android build:** add `TAPPYAI_APP_LINKS_ENABLED=true` to `android/gradle.properties` (or `-P` on the CLI) for the release build. Version bump as usual (`versionCode` 8 is the current value).
4. Upload to Play; install on a device from Play (or `adb install` the same signed APK).

## 4. Verification commands (device)

```bash
adb shell pm get-app-links com.tappyai.app          # expects: www.tappyai.com: verified
adb shell pm verify-app-links --re-verify com.tappyai.app
adb shell am start -a android.intent.action.VIEW -d "https://www.tappyai.com/r/AbCdEfGh12"
```
Expected: the app receives the intent and the public page opens in a Custom Tab inside the app; pressing back returns to the app; opening the same link from Chrome directly also lands in the app. If `pm get-app-links` says `none`/`1024` (unverified): check the statement URL, the fingerprint case/format, and that the host in the merged manifest is `www.tappyai.com`.

## 5. Not done / not claimed

- No device run yet: `PublicLinkOpener` is inert while the flag is off and **must be exercised on a device on first enablement** (the Custom Tab session binding is what prevents an app-link loop).
- iOS Universal Links: AASA route prepared (`IOS_UNIVERSAL_LINKS_APP_ID`), entitlement needs Xcode — FUTURE.
- Attribution: an App-Link open lands on the web page inside the tab; the existing `share_out` / `share_viewed` events fire as on any browser. There is no `android_deep_link` source (nothing emits it).
