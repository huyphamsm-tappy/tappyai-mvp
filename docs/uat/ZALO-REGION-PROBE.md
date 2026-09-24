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

### 🛑 RULE 1 — the activation toggle stays OFF until the R-1 fix is on production

It is one click, self-service, effective immediately, and the app is shared with production, which
still runs `842379b`. The inactive state is the *only* thing making that unexploitable.

1. The owner is already an admin, so UAT needs no activation.
2. Merge the fix to `main`, deploy to production.
3. Verify on production that `/complete` no longer reads a body id.
4. **Only then** flip activation.
5. Remove any firewall rule only after step 3.

### RULE 2 — callback URLs are gated by domain verification

Verify the UAT host first (file or meta tag), or give UAT a subdomain of `tappyai.com` and verify
that. Remove the dead localhost entry whenever the form next saves successfully.

### RULE 3 — production at release

`ZALO_APP_ID` and `ZALO_APP_SECRET` already exist in Production; the R-1 fix needs no new env var.
If the region test ends in a proxy design, Production additionally needs `ZALO_VERIFY_URL` and
`ZALO_VERIFY_SECRET` with a secret **distinct from UAT's**. Rollback is a revert and redeploy —
no migration, no data change. Post-deploy: sign in with Zalo and confirm the account is the
token's own, then repeat with a forged `zaloId` in the body and confirm it is ignored.

### RULE 4 — mobile is not released yet and shares this backend

Android and iOS drive the same `/api/auth/zalo/*` routes with `platform=android|ios`, returning
through a custom scheme via `/auth/confirm`. **Zalo login must be tested on a real Android build
before the app ships** — web UAT does not cover the custom-scheme return leg.
