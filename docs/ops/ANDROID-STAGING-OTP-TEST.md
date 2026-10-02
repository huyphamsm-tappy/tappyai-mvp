# F-098 — sign-in on a minified Android build (owner's pre-ship test)

**Question it answers:** R8 minification is ON for `staging` and `release`, and the supabase-kt keep
rules from `cd4cb31` are not on the shipping branch. Does email-OTP sign-in — and the session that
follows — still work in a minified build? kotlinx.serialization 1.7.3 ships its own rules, so it may.
Only this test says so.

`staging` is the right build: same `isMinifyEnabled = true`, same `proguardFiles`, same consumer rules
as `release`, signed with the debug key (no keystore needed), installs beside the Play app
(`com.tappyai.app.staging`). Point it at **audit**, never production.

## 1. An HTTPS URL for the audit backend (no audit host is deployed)
Staging/release block plain HTTP (`network_security_config.xml` allows cleartext only in `src/debug/`),
so `http://10.0.2.2:3007` will not work. Run the audit dev server (`:3007`, `.env.local` → audit) and
put a temporary HTTPS tunnel in front of it. Either:

**Cloudflare quick tunnel** (no account needed; URL changes every run):
```bash
cloudflared tunnel --url http://localhost:3007
```
→ prints `https://<random-words>.trycloudflare.com`.

**ngrok** (free account + authtoken once):
```bash
ngrok http 3007
```
→ prints `https://<id>.ngrok-free.app`.

The tunnel exposes the audit dev server to the internet while it runs. Stop it (Ctrl+C) when done.
Sign-in itself does not go through this URL — the app talks to Supabase directly — but the screens
after sign-in call the API, so without it the post-login part of the test fails for the wrong reason.

## 2. Build the minified staging APK against audit
From `android/` (PowerShell: `.\gradlew.bat` instead of `./gradlew`):
```bash
./gradlew :app:assembleStaging -PTAPPYAI_SUPABASE_URL=https://zdaprdfgpbpnxyofagmc.supabase.co -PTAPPYAI_SUPABASE_ANON_KEY=<AUDIT_ANON_KEY> -PTAPPYAI_API_BASE_URL_STAGING=https://<TUNNEL_HOST>/
```
- `<AUDIT_ANON_KEY>`: the audit project's anon key (Supabase dashboard → Project Settings → API).
- `<TUNNEL_HOST>`: from step 1; keep the trailing `/`.
- Confirm R8 really ran: `app/build/outputs/mapping/staging/mapping.txt` exists and is non-empty.

## 3. Install
```bash
adb install -r app/build/outputs/apk/staging/app-staging.apk
```

## 4. Test (watch the log in a second terminal)
```bash
adb logcat -c
adb logcat | grep -iE "SerializationException|MissingFieldException|kotlinx|supabase|FATAL"
```
Use an audit account whose mailbox you can read (a `manual.uat.*` account is fine — ordinary use).

| # | step | pass |
|---|---|---|
| 1 | Request an OTP for the email | code arrives by email |
| 2 | Enter the code | lands signed in on Home |
| 3 | Force-stop the app, reopen | still signed in (session restored from storage) |
| 4 | Wait past the access-token lifetime (audit default 3600 s), then open a signed-in screen | still signed in (token refreshed) |
| 5 | Sign out, sign in again with a new OTP | works |

**Fail signature:** a step fails AND the log shows `SerializationException` / `MissingFieldException`
or a class/field name like `a.b.c`. Then bring in the 14-line keep block from `cd4cb31`
(`android/features/auth/consumer-rules.pro`), rebuild, re-run. A failure without such a log line is a
different problem (network, tunnel, audit Auth settings) — report it as-is.
