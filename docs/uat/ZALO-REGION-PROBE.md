# Zalo `/me` region probe + Phase 0 risk + release checklist

2026-09-24. Rewritten after the original copy was lost with the `web-uat-rc` worktree (it was
never committed). Re-commit this into `docs/uat/` in whichever worktree we continue in.

No production resource was touched; nothing was deployed to Vercel.

---

## 1. Region probe — INCONCLUSIVE, and the control is why

| Where | Egress IP | Token | Zalo answer |
|---|---|---|---|
| This machine (Vietnam) | — | fake | `{"error":452,"Session key invalid…"}` |
| Cloud Run `asia-southeast1` (Singapore) | `34.34.254.143` | fake | `{"error":452,…}` ×9 |
| Cloud Run `us-central1` (Iowa) — **control** | `34.96.63.15` | fake | `{"error":452,…}` ×3 |

Singapore answering 452 instead of -501 looks like "region accepted". It is not: **us-central1
returns the same 452**, and US is the region we already know is blocked (the -501 recorded in
`api/auth/zalo/callback/route.ts` came from Vercel-US).

**Zalo validates the token before it applies any region rule.** With a fake token the request dies
at the token check and never reaches the geo check, so the probe cannot tell an allowed region
from a blocked one in either direction. Bangkok was not tried — it would have returned 452 too.

Settling it needs one request carrying a **real, unexpired** token from each region:
`{"id":"…"}` = accepted · `{"error":-501}` = blocked · `{"error":452}` = stale token, get another.

Probes (POST `{"at":"…"}`, token never logged), both `--no-allow-unauthenticated`,
`min-instances=0`, in the scratch project `speedy-method-500203-f2`:

- `https://zalo-region-probe-722204197108.asia-southeast1.run.app`
- `https://zalo-region-probe-us-722204197108.us-central1.run.app`

**Caveat for either outcome:** plain Cloud Run has **no static egress IP**. It was stable across
this burst, but it can change between revisions and instances. If Zalo's rule is an IP allowlist
rather than a geo lookup, a service that works today can break with no deploy — pinning it needs a
VPC connector plus Cloud NAT with a reserved address, which is real monthly cost, not near-$0.

Cleanup when finished:

```bash
gcloud run services delete zalo-region-probe    --region=asia-southeast1 --project=speedy-method-500203-f2 --quiet
gcloud run services delete zalo-region-probe-us --region=us-central1     --project=speedy-method-500203-f2 --quiet
```

Also created there: an Artifact Registry repo (`cloud-run-source-deploy`) and four IAM roles on
the default compute SA (`cloudbuild.builds.builder`, `storage.objectViewer`,
`artifactregistry.writer`, `logging.logWriter`) — Cloud Build requires them; without them the
first deploy fails PERMISSION_DENIED.

---

## 2. Phase 0 — risk on the live production web (read-only)

**One Zalo app serves every environment.** `ZALO_APP_ID` = `2070919727306910131` on **Production,
Preview and Development**; `ZALO_APP_SECRET` on Production and Preview. There is no separate UAT
app, so a UAT login exercises the production app and activating it "for UAT" activates it for
production users at the same moment.

**Production still has R-1.** `origin/main` @ `842379b` still reads `zaloId` from the request body.

**The app is NOT activated, and that is what protects production.** Zalo's permission screen
refuses every non-admin, non-tester account while an app is unactivated, and the httpOnly
`zalo_at` cookie that `/complete` requires is only set after a successful code exchange past that
screen. Exploiting R-1 today therefore requires already being an admin/tester — not exploitable by
an ordinary attacker. No firewall rule was proposed on that basis.

**Never established:** whether any account was ever created through the hole. The route logged only
errors and `auth.audit_log_entries` records the account but not the token presented. Non-prod holds
0 Zalo accounts and 0 audit rows. The production query is the owner's to run:
`select count(*) from auth.users where email like 'zalo\\_%@zalo.tappyai.com';`

---

## 3. Zalo app configuration as measured on 2026-09-24

| Item | State |
|---|---|
| App | **TappyAI**, `2070919727306910131` — matches the Vercel env |
| Activation | **Chưa kích hoạt** (`aria-checked=false`), a **self-service toggle**, no review queue |
| Admins | **1/30 — Huy Phạm** (the owner is already an admin) |
| Social API "Lấy tên, ảnh đại diện" | **Đã được duyệt**, unlimited |
| Verified domains | **1/20 — `www.tappyai.com`** |
| Verified URL prefixes | **0/20** |
| Callback URLs | `https://www.tappyai.com/api/auth/zalo/callback` ✅ · `http://localhost:3000/api/auth/zalo/callback` ⚠️ dead |
| App secret proof | ON |

⚠️ The localhost entry can never match: `originOf()` falls back to `https` when
`x-forwarded-proto` is absent, so `next dev` produces `https://localhost:3000/...`, and the PKCE
cookies are `secure: true`. Zalo login cannot be tested on localhost at all.

### Why the UAT callback could not be registered

`POST /api/apps/update` answered:

> "Đường dẫn Callback URL `https://tappyai-mvp-git-rc-web-uat-…vercel.app/api/auth/zalo/callback`
> **chưa được xác thực domain**."

A callback URL is only accepted on a domain listed under *Xác thực domain*. The save was rejected,
so **nothing in the Zalo app was changed** — the list is still production + localhost.

Zalo's methods: domain via **DNS TXT record**, **an HTML file**, or **a meta tag**; URL-prefix via
HTML file or meta tag. A `*.vercel.app` host cannot take a DNS record but can serve a file or a
meta tag, since the deployment is ours.

---

## 4. Release checklist — Zalo

### 🛑 RULE 1 — the activation toggle stays OFF until BOTH conditions below are true

It is one click, self-service, effective immediately, and the app is shared with production, which
still runs `842379b`. The inactive state is the *only* thing making that unexploitable.

Owner's decision, 2026-09-26. All three conditions, not any one of them:

**(a) The R-1 fix AND the server-side callback (section 7) are live on production.**
Order: merge to `main` -> deploy -> verify on production that a Zalo login never puts a token in
the URL and that `/auth/zalo-finish` and `/api/auth/zalo/complete` return 404.

**(b) Production has its own `ZALO_VERIFY_URL` and `ZALO_VERIFY_SECRET`, with a secret DIFFERENT
from UAT's.** Without them production answers `?error=zalo_unavailable` for every Zalo login —
fail-closed, by design — so the env has to land with, or before, the deploy.

**(c) The new Android build is live on Play.** The app is approved and ships in the same release.
Android opens the web flow in a Chrome Custom Tab, so it follows whatever production serves — an
older app on the new backend still works. The condition exists because the reverse does not: the
app that is out there today drove the browser leg, and activation is what makes the Zalo app
usable by people who are not admins. Do not flip it while the shipped app and the deployed
backend disagree about the flow. Verify on a real device first (RULE 4).

Only then flip activation. Remove any production firewall rule only after (a) is verified.
The owner is already an admin, so UAT never needed activation.

### RULE 2 — callback URLs are gated by domain verification

Verify the UAT host first (file or meta tag), or give UAT a subdomain of `tappyai.com` and verify
that. Remove the dead localhost entry whenever the form next saves successfully.

### RULE 3 — production at release

`ZALO_APP_ID` and `ZALO_APP_SECRET` already exist in Production. The region test DID end in a
proxy design (section 5), so Production **must** also get `ZALO_VERIFY_URL` and
`ZALO_VERIFY_SECRET`, with a secret **different from UAT's**. One VPS serves both: the service
accepts a comma-separated list, so append the production secret to `ZALO_VERIFY_SECRET` in
`/etc/zalo-verify/env` and give Vercel Production only that one. Without the env, every Zalo
login on production ends at `?error=zalo_unavailable`.

Rollback is a revert and redeploy — no migration, no data change. Post-deploy checks: sign in with
Zalo and confirm the account is the token's own; confirm no URL in the browser ever shows a token;
confirm `/api/auth/zalo/complete` and `/auth/zalo-finish` are 404.

### ✅ Android Zalo login — ACCEPTED on a real device, 2026-09-26

Debug APK (`com.tappyai.app.debug`, built from a3dd1fee0d1f with
`TAPPYAI_API_BASE_URL_DEBUG=https://uat.tappyai.com/`), installed on the owner's phone, signed in
with Zalo: straight into the app. The verifier logged `POST /verify 200 id` for each attempt
(13:58, 13:59, 14:00, 14:19, 14:23 VN), 71–84 ms, no 401 and no fallback. Nothing left to do for
Zalo on Android.

**Open, and NOT a Zalo problem:** the app shows the new layout before sign-in and an older-looking
one after. Under investigation; it blocks the release, not the Zalo work. Read-only findings so
far: the Android Home path has no branch on session state at all, and the two Android files
touched by unpushed local work (chat share wiring, plan price) are not layout.

### RULE 4 — mobile shares this backend

Android and iOS drive the same `/api/auth/zalo/*` routes with `platform=android|ios`, returning
through a custom scheme via `/auth/confirm`. **Zalo login must be tested on a real Android device
before the app ships** — web UAT does not cover the custom-scheme return leg.

Checked in the repo 2026-09-26: Android needed **no** code change for the server-side flow. It
only opens `${baseUrl}api/auth/zalo?platform=android&returnTo=/` in a Chrome Custom Tab and waits
for `tappyai://auth-callback`, which carries a Supabase session — it never handled `zalo-finish`,
`/api/auth/zalo/complete`, the `zalo_at` cookie or a Zalo token, and
`ZaloLoginFlowTest` now fails if any Kotlin source starts to. iOS is the same shape
(`ZaloAuthController` opens `/api/auth/zalo`) but has never been run — no macOS here.

QA build for a real phone (the debug default is the emulator loopback, which is why a phone build
needs the override):

```bash
ORG_GRADLE_PROJECT_TAPPYAI_API_BASE_URL_DEBUG=https://uat.tappyai.com/ ORG_GRADLE_PROJECT_TAPPYAI_WEB_APP_URL=https://uat.tappyai.com ORG_GRADLE_PROJECT_TAPPYAI_SUPABASE_URL=<prod url> ORG_GRADLE_PROJECT_TAPPYAI_SUPABASE_ANON_KEY=<prod anon key> ./gradlew :app:assembleDebug
```

Env vars, not `-P`, so the values stay out of the process list. The phone's Chrome must be signed
in to Vercel once, because the UAT preview is behind Vercel's SSO gate.

---

## 5. Phase B -- real token: every non-Vietnamese region is blocked

Real access token (owner's QR login on uat.tappyai.com, read once from Chrome history with the
owner's written authorisation, memory only, never printed; temp copy deleted):

| Where | Zalo answer |
|---|---|
| Vercel `iad1` (live UAT `/complete`, 18:28) | -501 -> `/complete` 503 `verification_unavailable`, no account created |
| Cloud Run `asia-southeast1` (Singapore) | **-501 region restricted** |
| Cloud Run `us-central1` (control) | -501 region restricted |

So `graph.zalo.me/v2.0/me` only answers a Vietnamese address. Owner decision: a VPS in Vietnam.
Bangkok / Jakarta not tried (owner's call). Both probes and their 4 IAM grants in
`speedy-method-500203-f2` were deleted; the Artifact Registry repo `cloud-run-source-deploy`
(probe images) is still there.

### Design -- `infra/zalo-verify/`

```
browser --QR--> Zalo --code--> /api/auth/zalo/callback (Vercel, exchanges code, sets zalo_at)
/api/auth/zalo/complete --POST {at} + x-zalo-verify-secret--> https://zalo-verify.tappyai.com/verify
   (Caddy TLS -> 127.0.0.1:8787, VPS in VN) --GET /v2.0/me?fields=id, token in header--> Zalo
```

* App side: `createZaloVerifier()` in `src/lib/zalo/identity.ts`, used by `/complete` and the Mini
  App `/api/zalo/mini/verify`. Needs `ZALO_VERIFY_URL` (https) + `ZALO_VERIFY_SECRET` (>= 32).
  Missing env, unreachable, timeout (6s), wrong secret, 429, 502 -> throw -> **503**. Only the
  service's `{error:"invalid_token"}` -> 401. No path uses a client-supplied id.
* Service side: zero-dependency Node, secret checked first (constant-time), rate limits
  (60/min/IP, 600/min total, 10 bad secrets/min/IP -> 15 min block), 5s upstream timeout,
  logs outcome only. Tests: `src/lib/zalo/zaloVerifyService.test.ts` (incl. end-to-end against
  the app-side verifier over a socket).
* `/auth/zalo-finish` stripped `#at=` with `history.replaceState`. **MEASURED 2026-09-26: that
  did NOT remove the token from Chrome's History database** (see section 6). The page is gone
  now -- section 7.

---

## 6. replaceState does NOT clear the browser's history -- measured

On 2026-09-26 the owner logged in on UAT three times. Chrome's History database afterwards, read
with the owner's authorisation (shapes only, no values printed):

```
09-26 04:28:56  uat.tappyai.com/auth/zalo-finish        (no params)          <- the replaceState row
09-26 04:28:56  uat.tappyai.com/auth/zalo-finish        frag.at[len=382]     <- the token, still there
09-26 04:28:56  uat.tappyai.com/api/auth/zalo/callback  query.code[len=419]
09-26 04:28:49  uat.tappyai.com/auth/zalo-finish        frag.at[len=384]
09-26 04:28:40  uat.tappyai.com/auth/zalo-finish        frag.at[len=386]
```

`history.replaceState` ADDS a clean row; it does not rewrite the one Chrome recorded when the
navigation committed. So every Zalo login left a live access token, and the OAuth code, in
history -- and in browser sync, screenshots, and reach of any extension that reads `location`.
The first pass through this evidence picked the stripped row and briefly read as "the token is
gone"; the query has to filter on `at=` to see the truth.

This is why the browser leg was removed the same day (section 7), and why the correction in
b7a9586 was right to distrust replaceState.

Owner action still open: delete the `zalo-finish` and `api/auth/zalo/callback` rows in
chrome://history on that machine. The tokens are expired, but the rows should not linger.

---

## 7. The token never reaches the browser (2026-09-26)

`/api/auth/zalo/callback` now does the whole flow server-side: code exchange -> verifier in
Vietnam (`{at, profile: true}` -> id + name + avatar) -> Supabase user -> one-time magic-link
hash -> `302 /auth/confirm?token_hash=...`. No fragment, no `zalo_at` cookie, no client step.

Deleted: `src/app/auth/zalo-finish/` and `src/app/api/auth/zalo/complete/`. The session logic
moved to `src/lib/zalo/session.ts` (create-only, so a returning user keeps the avatar they chose).

Failure mapping, all fail-closed, none of them creating or signing in anything:

| What happened | Redirect |
|---|---|
| bad state / no code | `/login?error=zalo_denied` |
| code exchange failed | `/login?error=zalo_failed` |
| verifier unreachable / -501 / wrong secret / unconfigured | `/login?error=zalo_unavailable` |
| Zalo rejected the token | `/login?error=zalo_invalid` |
| Supabase failed | `/login?error=zalo_failed` |

Pinned by `src/app/api/auth/zalo/callback/serverSideCallback.test.ts`, including the owner's
test: no response header on any path -- success or failure -- contains the access token, the
OAuth code or a `#` fragment, and the two deleted directories must stay deleted.

Native apps are unaffected in shape: they still open `/api/auth/zalo` and come back through
`/auth/confirm?...&platform=ios|android`. **Still to do before the mobile release: run this on a
real Android build** (RULE 4).
