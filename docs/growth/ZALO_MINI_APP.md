# TappyAI G1 — Zalo Mini App integration boundary

**Status:** boundary implemented, Mini App NOT registered/shipped (owner action required)
**Date:** 2026-09-15
**Code:** `src/lib/zalo/miniApp.ts`, `src/lib/zalo/identity.ts`, `src/app/api/zalo/mini/verify/route.ts`, `src/app/api/shared-results/[slug]/route.ts`

---

## 1. Architecture

```text
Tappy Core
     │
     ▼
SharedResultPayload  (frozen, sanitized — src/lib/share/sharedResult.ts)
     │
     ├── Web        /r/<slug>                      (SSR, ISR, no LLM)
     │
     └── Zalo Mini App
           reads  GET /api/shared-results/<slug>   (public JSON, cached 1h, no LLM)
           asks   POST /api/chat  { shareSlug }     (existing pipeline, existing quota)
           verify POST /api/zalo/mini/verify        (Zalo token → signed rate-limit cookie)
```

There is **no second result engine and no second AI backend**. The Mini App is a thin
client of the same frozen payload the web renders, and its questions go through the same
`/api/chat` with the same `ANON_DAILY_LIMIT`, plus one extra cap keyed on a server-signed
hash of the Zalo user id.

## 2. Cost guardrail

| Action in Zalo | Cost |
|---|---|
| Open a shared result | one cached JSON read (`s-maxage=3600`). **No LLM.** |
| Ask a follow-up | `/api/chat` → existing anonymous quota (`ANON_DAILY_LIMIT`) **+** per-share cap (`SHARE_FOLLOW_UP_DAILY_LIMIT_PER_IDENTITY`) **+** per-Zalo-identity daily cap (`chat-zalo:<hash>`, same number). |
| Verify identity | one Zalo Open API call per day per user (free). |

One viral result in a 500-person group therefore costs 500 cached reads and at most
`min(ANON_DAILY_LIMIT, SHARE_FOLLOW_UP_DAILY_LIMIT_PER_IDENTITY)` model calls per person.

## 3. Identity model — what is and is not trusted

* Tappy's canonical identity stays the Supabase uid (anonymous session minted by
  `POST /api/auth/anonymous`, or a real login — Zalo OAuth already exists at `/api/auth/zalo`).
* The Zalo user id is **one more rate-limit key**, never authentication and never stored.
  The Mini App posts its Zalo access token; the server verifies it and sets
  `tappy_zalo=<hmac>.<sig>` (httpOnly, Secure, SameSite=None, 24h). `/api/chat` reads the
  cookie, checks the signature, and applies the cap. A client cannot mint the cookie
  without the server secret (`ZALO_IDENTITY_SECRET`).
* Verification adapters: `createGraphZaloVerifier` (real: `graph.zalo.me/v2.0/me?fields=id`)
  and `createMockZaloVerifier` (`ZALO_VERIFIER=mock`, non-production only).

### ⚠ Known constraint — region

`graph.zalo.me/v2.0/me` answers only to **Vietnam IPs** (documented in
`src/app/api/auth/zalo/callback/route.ts`: error `-501` from Vercel-US). The real verifier
may therefore return `503 verification_unavailable` from the current hosting region. In that
case the Mini App proceeds under the ordinary anonymous quota (still capped). Resolving this
is an **owner infrastructure decision** (a VN-region function, or Zalo's server-side
`getUserInfo` flow if available to the registered app) — it must not be worked around by
trusting a client-supplied Zalo id.

## 4. Attribution

* Deep link: `https://zalo.me/s/<MINI_APP_ID>/r/<slug>?src=zalo_mini` (`miniAppResultUrl`).
  Landing inside the Mini App → `source = zalo_mini`.
* A `/r/<slug>` link opened in Zalo's **in-app browser** (not the Mini App) is detected by
  user agent → `source = zalo_link`.
* `share_id` is set by the result page/Mini App after resolving the slug; it is never in the URL.

## 5. Owner / platform actions (blocking for the Mini App itself, not for G1)

1. Register a Mini App at Zalo Mini App Studio under the existing Zalo app (`ZALO_APP_ID` is
   already used for OAuth). Record the **Mini App ID**.
2. Set `NEXT_PUBLIC_ZALO_MINI_APP_ID=<id>` (enables `miniAppResultUrl`) and
   `ZALO_IDENTITY_SECRET=<≥32 random chars>` (enables `/api/zalo/mini/verify`).
3. Verify the deep-link format for the registered app in Zalo's Mini App docs before
   distributing any link — the template in `miniApp.ts` follows the published
   `https://zalo.me/s/<id>/…` shape and is intentionally not asserted beyond that.
4. Build the Mini App project with `zmp-cli` (separate repository/folder; it is a React
   webview app). It needs exactly three network calls, all already implemented here:
   `GET /api/shared-results/<slug>`, `POST /api/zalo/mini/verify`, `POST /api/chat`.
   Share-to-chat inside Zalo uses the ZMP SDK's share API with the **web** `/r/<slug>` URL as
   the payload, so a recipient without the Mini App still lands on the public page.
5. Submit for Zalo review. Until approved, everything above remains inert — no cost, no
   behaviour change for web users.

## 6. Tests

`src/lib/zalo/zalo.test.ts` — link boundary, launch parsing, HMAC cookie sign/verify,
forged-cookie rejection, mock and graph verifiers (including the `-501` region case).
