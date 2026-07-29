# Local Development — Authentication (Known Limitations)

**Status:** BINDING guidance · **Date:** 2026-07-29 · Applies to any local run on `http://localhost:<port>`

## Known Limitation — Zalo OAuth does not support localhost callbacks

**Do not attempt Zalo sign-in against `http://localhost`.** It fails with Zalo `error_code=-14003`.

### Evidence (measured 2026-07-29)

| Fact | Value |
|---|---|
| OAuth URL built on localhost | `https://oauth.zaloapp.com/v4/permission?app_id=***&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fzalo%2Fcallback&code_challenge=…&state=…` |
| `redirect_uri` — localhost | `http://localhost:3000/api/auth/zalo/callback` (scheme **http**) |
| `redirect_uri` — production | `https://www.tappyai.com/api/auth/zalo/callback` |
| `app_id` | **identical on both surfaces** — the only differing variable is `redirect_uri` |
| `error_code` / `14003` in `src/` | **absent** — the error is produced by Zalo, not by our code |

**Not a code defect.** `src/app/api/auth/zalo/route.ts` derives `redirect_uri` from the actual request host by design; on localhost that correctly yields `http://localhost:3000/...`. Zalo rejects it because that callback is not (and generally cannot be) registered for the app.

**Precedent in this repo:** commit `7f88c2e` — *"Zalo requires redirect_uri to match the registered callback exactly, so login was rejected"* (apex `tappyai.com` vs registered `www.tappyai.com`). Exact-match enforcement for this Zalo app is empirically established.

**Unverified:** the official meaning of `-14003` could not be read — the Zalo error-code page is an SPA (static fetch returns an empty shell) and web search does not surface the definition. Treated as `ASSUMPTION` per Constitution Article V; the diagnosis above rests on the measured facts, not on that code's documented meaning.

## Use these instead, in this order

| # | Option | When to use | Notes |
|---|---|---|---|
| 1 | **Google OAuth** | Default for local sign-in | Goes through Supabase, not Zalo — `-14003` is irrelevant. Requires `http://localhost:<port>/**` in Supabase → Authentication → URL Configuration → Redirect URLs |
| 2 | **HTTPS tunnel** (ngrok / Cloudflare Tunnel) | When the Zalo flow itself must be exercised locally | Gives a public HTTPS origin; that exact callback must then be registered in the Zalo Developer console |
| 3 | **Preview deployment** | When testing the real provider set end-to-end | Real HTTPS host; register its callback in Zalo, or test Zalo only on production |

**Rule:** attempt Zalo authentication only on a surface whose callback URL is registered in the Zalo Developer console — production, a registered preview host, or a registered tunnel host. Never on localhost.

## Related
`docs/engineering/ENGINEERING_CONSTITUTION_AMENDMENT_001.md` (Article II — runtime identity; Article V — assumption discipline) · commit `7f88c2e` (redirect_uri host derivation).
