# Android Release Configuration

Every Gradle property the Android release build reads, what it does, where it belongs, and what breaks without it.

**Applies to:** `android/app/build.gradle.kts` · **Artifact:** `:app:bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`

---

## Why this document exists

The release build used to default `API_BASE_URL` and `WEB_APP_URL` to `https://tappyai.example.com`. A release built without the matching `-P` overrides **compiled, packaged and signed perfectly** while pointing every network call at a domain that does not exist. Nothing failed until the app was installed on a real device.

Two changes prevent a repeat:

1. **Public endpoints now default to production.** They are not secrets, so the safe default is the real value.
2. **A release artifact cannot be built with placeholder configuration.** `bundleRelease` / `assembleRelease` / `installRelease` / `publishRelease` abort at configuration time, naming the offending property and what it would break.

Debug and staging builds are unaffected — a contributor with no production credentials can still build, test and run the app.

---

## Quick start

Everything except the keystore is already defaulted or stored per-machine. A production build is:

```bash
cd android
./gradlew :app:bundleRelease \
  -PTAPPYAI_RELEASE_KEYSTORE_PATH=/absolute/path/to/upload-keystore.jks \
  -PTAPPYAI_RELEASE_KEYSTORE_PASSWORD=... \
  -PTAPPYAI_RELEASE_KEY_ALIAS=... \
  -PTAPPYAI_RELEASE_KEY_PASSWORD=...
```

Prefer putting the four signing properties in `~/.gradle/gradle.properties` so they never appear in shell history or CI logs.

---

## Property reference

### Endpoints — public, defaulted to production

These describe *where the app points*. They are visible in any decompiled APK, so they are not secrets and are safe to commit.

| Property | Required | Default | Production value |
|---|---|---|---|
| `TAPPYAI_API_BASE_URL_RELEASE` | No — defaults to production | `https://www.tappyai.com/` | `https://www.tappyai.com/` |
| `TAPPYAI_WEB_APP_URL` | No — defaults to production | `https://www.tappyai.com` | `https://www.tappyai.com` |

**`TAPPYAI_API_BASE_URL_RELEASE`**
- **Used for:** the Retrofit `baseUrl` for every API call the release build makes — chat, bookings, memory, preferences, saved items, price tracking, reviews.
- **Safe to commit:** yes. It is a public origin, and it is the committed default.
- **Store in:** nothing to store — the default is correct. Override only to point a release build at a different environment.
- **If missing:** falls back to the production default, which is what you want. **If set to a placeholder the build now fails.**
- ⚠️ **Trailing slash is required.** Retrofit resolves `baseUrl` per RFC 3986; without it the last path segment is dropped.
- ⚠️ **Use `www`, not the apex.** `https://tappyai.com/` redirects, and the redirect is not followed for all request methods.

**`TAPPYAI_WEB_APP_URL`**
- **Used for:** building shareable links — Group Dining invites (`<origin>/group/{id}`, `GroupDetailScreen.kt`) and QR profile URLs (`<origin>/users/{id}`, `QrProfileSheet.kt`).
- **Safe to commit:** yes, same reasoning.
- **Store in:** nothing to store.
- **If missing:** falls back to production. If it were wrong, the app would still run normally — but every shared link and QR code would point at a dead domain, and the damage lands on *recipients*, not the user who generated it. That is why it is guarded despite not breaking any request.
- ⚠️ **No trailing slash** — paths are appended directly.

### Backend credentials — per-machine, never committed

| Property | Required | Default | Production value |
|---|---|---|---|
| `TAPPYAI_SUPABASE_URL` | **Yes** | `https://your-project.supabase.co` (placeholder) | your Supabase project URL |
| `TAPPYAI_SUPABASE_ANON_KEY` | **Yes** | `REPLACE_WITH_SUPABASE_ANON_KEY` (placeholder) | the project's anon/publishable key |
| `TAPPYAI_GOOGLE_WEB_CLIENT_ID` | **Yes** | `REPLACE_WITH_GOOGLE_WEB_CLIENT_ID...` (placeholder) | the OAuth **Web application** client ID |

**`TAPPYAI_SUPABASE_URL`** and **`TAPPYAI_SUPABASE_ANON_KEY`**
- **Used for:** authentication and all database access. One Supabase project is shared across variants, matching the web app.
- **Safe to commit:** **no.** The anon key is protected by Row Level Security rather than secrecy, but committing it removes your ability to rotate it and publishes which project to attack. Treat it as a credential.
- **Store in:** `~/.gradle/gradle.properties` (outside the repo), or a CI secret.
- **If missing:** the build **fails** for release artifacts. Before this guard existed, it silently shipped `REPLACE_WITH_SUPABASE_ANON_KEY` and every sign-in failed on device.

**`TAPPYAI_GOOGLE_WEB_CLIENT_ID`**
- **Used for:** Credential Manager's native Google Sign-In `serverClientId`.
- **Safe to commit:** it is not secret (it ships in the APK), but keep it alongside the other backend config so all environment wiring lives in one place.
- **Store in:** `~/.gradle/gradle.properties`.
- **If missing:** the build **fails** for release artifacts; previously Sign in with Google failed at runtime.
- ⚠️ Must be the **Web application** client ID, *not* the Android one, and must match the ID configured in Supabase's Google provider.

### Signing — per-machine, never committed

| Property | Required for a *publishable* AAB | Default | Production value |
|---|---|---|---|
| `TAPPYAI_RELEASE_KEYSTORE_PATH` | **Yes** | none | absolute path to the upload keystore |
| `TAPPYAI_RELEASE_KEYSTORE_PASSWORD` | **Yes** | none | keystore password |
| `TAPPYAI_RELEASE_KEY_ALIAS` | **Yes** | none | key alias |
| `TAPPYAI_RELEASE_KEY_PASSWORD` | **Yes** | none | key password |

- **Used for:** signing the release artifact with the **upload key**. Under Play App Signing, Google re-signs with the app signing key it holds; this key only proves the upload is yours.
- **Safe to commit:** **absolutely not** — neither the passwords nor the `.jks`. `*.jks` / `*.keystore` are gitignored; keep them that way.
- **Store in:** `~/.gradle/gradle.properties`, or a CI secret store. The keystore file itself belongs in a password manager or an encrypted backup.
- **If missing:** the build **succeeds and produces an UNSIGNED AAB**, with a loud warning. Play rejects it at upload. This is a warning rather than an error on purpose: contributors without the keystore must still be able to run release-variant lint, unit tests and `generateReleaseBuildConfig`.
- 🔑 **Losing this key is unrecoverable if you are not enrolled in Play App Signing.** With Play App Signing enrolled, a lost upload key can be reset by Google. Verify enrolment before first upload.

### Other variants

| Property | Applies to | Default |
|---|---|---|
| `TAPPYAI_API_BASE_URL_DEBUG` | debug only | `http://10.0.2.2:3000/` (emulator loopback) |
| `TAPPYAI_API_BASE_URL_STAGING` | staging only | `https://staging.tappyai.example.com/` |

Neither is guarded — they cannot reach a production artifact. The staging default is still a placeholder; set it if you use the staging variant.

---

## The placeholder guard

At configuration time, when the requested tasks match `(bundle|assemble|install|publish).*Release`, the build checks the resolved values of `TAPPYAI_API_BASE_URL_RELEASE`, `TAPPYAI_WEB_APP_URL`, `TAPPYAI_SUPABASE_URL`, `TAPPYAI_SUPABASE_ANON_KEY` and `TAPPYAI_GOOGLE_WEB_CLIENT_ID` for the markers `tappyai.example.com`, `your-project.supabase.co` and `REPLACE_WITH`. Any hit aborts the build:

```
Refusing to build a release artifact with placeholder configuration.

  • TAPPYAI_API_BASE_URL_RELEASE resolves to "https://tappyai.example.com/"
      contains placeholder "tappyai.example.com" — would break every API request the app makes

Such a build succeeds and packages cleanly, then fails at runtime on a real device.
```

Notes:
- Matching is by **substring**, so a half-edited value or a stray staging host is caught too.
- A blank override (`-PTAPPYAI_WEB_APP_URL=`) is treated as absent and falls back to the default, so an empty CI variable cannot ship an empty URL.
- Debug and staging tasks skip the check entirely.

---

## Where to store what

| Location | Put here | Never put here |
|---|---|---|
| `android/app/build.gradle.kts` (committed) | public production endpoint defaults | any credential |
| `~/.gradle/gradle.properties` (per-machine) | Supabase URL + anon key, Google client ID, all four signing properties | — |
| CI secret store | the same values as above, injected as `-P` flags | — |
| `android/local.properties` (gitignored) | `sdk.dir` only | credentials — it is easy to commit by accident |

---

## Pre-upload checklist

- [ ] `./gradlew :app:generateReleaseBuildConfig` → `API_BASE_URL` and `WEB_APP_URL` both read `https://www.tappyai.com`
- [ ] `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `GOOGLE_WEB_CLIENT_ID` contain no `REPLACE_WITH` or `your-project`
- [ ] All four signing properties set — build logs show **no** "Release signing is NOT configured" warning
- [ ] `versionCode` incremented (a consumed `versionCode` can never be reused in Play)
- [ ] Play App Signing enrolment confirmed in the Console
