# 03 — Backend Contracts

**Frozen commit:** `79d05f3` · **91 `api/**/route.ts` handlers + 4 non-api route handlers.**

> The exhaustive per-route contract table was partially machine-generated; where a specific
> route's request/response shape was not individually verified it is marked **NOT VERIFIED** and
> the reader is directed to the source file. The **cross-cutting contracts (§3) are fully
> verified and are the highest-value part of this document for the Android team.**

---

## 1. The governing principle

**Backend owns business logic. Clients own presentation.**

Concretely, in this system: quotas (`FREE_DAILY_LIMIT`, `ANON_DAILY_LIMIT`), upload limits,
the auth provider list, onboarding catalogs, feature flags, and the user-facing limit *copy*
all originate server-side in `src/lib/config/product.ts` and are served to native clients by
`GET /api/config`. Enforcement stays server-side (`/api/chat` quotas, `/api/upload/video` size
token, `/api/reviews` caps).

**A tampered client changes what it SHOWS, never what it CAN DO.** The web app imports
`product.ts` directly at build time; Android/iOS must consume `/api/config` rather than
hard-coding equivalents (see `11_Android_Migration.md` §3.3).

---

## 2. Route inventory by module

Runtime is Node unless marked **edge**. Auth column: `public` / `anon-ok` / `user` (Bearer or
cookie) / `admin` (RBAC) / `cron` (shared secret).

### Auth
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/auth/anonymous` | POST | public | Creates a Supabase anonymous session; rate-limited 5/min + 30/day; sets `Retry-After` |
| `/api/auth/zalo` · `/callback` · `/complete` | GET/POST | public | Server-side code→token; **`platform=android` supported** (§3.9) |
| `/auth/callback` (handler) | GET | public | Supabase OAuth code exchange |
| `/auth/confirm` (handler) | GET | public | OTP/email confirm; **`platform=android` → token in URL fragment** |

### Chat / conversations
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/chat` | POST | anon-ok | Streaming. Full contract in `05_AI.md`. 30/60s IP flood → 429 `Retry-After`; 24k-char cap → 413; **fails open** on quota error |
| `/api/conversations` | GET/POST/PUT/DELETE | user | List/create/update/delete; `messages` is a JSONB array on the row |
| `/api/message-feedback` | POST/DELETE | user | 👍/👎/report; unique per (user, conversation, message_index, type) |
| `/api/suggested-prompts` | GET | anon-ok | ⚠ honours unguarded `?hour=`/`?day=` overrides |

### Reviews / social
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/reviews/feed` | GET | anon-ok | **edge**. `?page&limit&sort&city&following&search&userId`; cached `s-maxage=30, swr=60` |
| `/api/reviews` | GET/POST | GET public / POST user | Create validates the `music` JSON `{version,trackId,startSec,volume}` |
| `/api/reviews/[id]` | GET/PATCH/DELETE | GET public / mutate owner | Owner-scoped edit/delete |
| `/api/reviews/[id]/comments` | GET/POST/DELETE | GET public / mutate user | **Threaded** (`parent_comment_id`); returns authoritative `count` + per-comment `reactions` + `my_reaction` |
| `/api/comments/[commentId]/reactions` | POST/DELETE | user | **New.** 6-value `ALLOWED` set; one per user (UPDATE-in-place) |
| `/api/reviews/[id]/like` · `/save` | POST | user | **Toggles — not idempotent** (§3.5) |
| `/api/reviews/[id]/interact` | POST | anon-ok (200) | Watch telemetry; 10/min/user; returns `{ok:true}` even unauthenticated |
| `/api/reviews/upload` | POST | user | Server-side `put()` to Blob; magic-byte sniff; 5MB; 10/user/day |
| `/api/reviews/mine` · `/saved` | GET | user | Own posts / saved reviews |
| `/api/users/[id]` | GET | anon-ok | **edge** |
| `/api/users/[id]/follow` | POST | user | **Toggle — not idempotent** |
| `/api/users/search` | GET | user | Uses service-role for the lookup |

### Music / sound
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/music/tracks` · `/search` · `/[id]` | GET | anon-ok | Native surface; web uses the module repository directly |
| `/api/music/categories` · `/providers` | GET | anon-ok | |
| `/api/music/tracks/[id]/report` | POST | user | ⚠ still gated by the **deprecated `ADMIN_IDS`** env, not RBAC |
| `/api/sound/[trackId]` | GET | anon-ok | Counts via SECURITY DEFINER RPCs |
| `/api/sound/[trackId]/play` | POST | public | Anon-callable play counter |
| `/api/sound/[trackId]/save` · `/follow` | POST/DELETE | user | 23505 treated as success (§3.5) |
| `/api/upload/audio` | POST | user | Client-direct Blob token; 20MB |

### Deals (public + admin CRUD)
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/deals` | GET | public | `force-dynamic`; `?country=VN`; `{success:true, deals}`; RLS-filtered; whitelisted public fields only |
| `/api/deals/[id]/click` | POST | public | SECURITY DEFINER RPC counter; **always 200**; no auth/rate-limit/dedupe |
| `/api/admin/deals` | GET/POST | admin | GET all (RLS bypassed); POST create (+isSameOrigin, 30/60s) |
| `/api/admin/deals/[id]` | PATCH/DELETE | admin | +isSameOrigin; slug immutable; audit-logged |
| `/api/admin/deals/upload` | POST | admin | Blob token; ⚠ **allows `image/svg+xml`** (§ finding) |

### Profile / preferences / memory / onboarding
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/profile` | GET/PATCH/POST | user | POST = avatar upload (server `put()`, 3MB, sniffed); `bio` written to auth metadata |
| `/api/preferences` · `/profile` | GET/PUT/POST | user | 401 body is non-standard (`{profile:null}` / `{ok:false}`) |
| `/api/memory` | GET/PATCH/DELETE | GET anon-ok (200 `{memory:null}`) / mutate user | PATCH is whitelist-only with regex-keyed prefs |
| `/api/onboarding` | POST | user | 401 `{ok:false}` |

### Bookings / favorites / price-watch / group
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/bookings` | GET/POST | user | ⚠ `inferFromBooking()` **no-ops for Bearer callers** (§3.1) |
| `/api/favorites` | GET/POST/DELETE | user | Upsert (`ignoreDuplicates`) — safe to retry |
| `/api/price-watch` | GET/DELETE | user | Backs `/profile/price-watches` + the cron |
| `/api/group` · `/[id]/join` · `/[id]/suggest` | GET/POST | GET public / join anon | join 23505 → `{ok:true, alreadyJoined:true}`; suggest is LLM-backed, 5/min/user |
| `/api/recommendations` | GET | user | 401 for anonymous |

### Notifications / integrations
| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/notifications` | GET | anon-ok (200 `[]`) | **edge**. Aggregates follow + like + milestone + **comment** (4th type, new) |
| `/api/notifications/subscribe` | POST | user | Web Push subscription |
| `/api/notifications/broadcast` | POST | cron | Operator-only |
| `/api/integrations` · `/google-calendar[/callback]` · `/zalo[/callback]` | GET/POST | user | UI hidden by `SHOW_APP_CONNECTIONS`; APIs live |

### Admin (RBAC)
`/api/admin/rbac/roles[/[id]]`, `/api/admin/audit`, `/api/admin/settings`,
`/api/admin/analytics/auth`, `/api/admin/analytics/activation`, plus admin deals (above).
All gated by `requireAdminRole` + `isSameOrigin`; error envelope `{error:{code,message}}`,
success `{data, meta?}`. **Verified live: `/api/admin/settings` returns 401 unauthenticated.**

### Cron (8 routes, all `cron`-gated by `Authorization: Bearer ${CRON_SECRET}`)
`analytics-snapshot`, `behavior-rollup`, `deal-notifications`, `lunch-reminder`,
`morning-brief`, `price-check`, `travel-reminder`, `weekly-recap`.
**Verified live: `/api/cron/price-check` returns 401 unauthenticated.**
> **⚠ Only 4 are scheduled in `vercel.json`** (`deal-notifications`, `morning-brief`,
> `price-check`, `analytics-snapshot`). `lunch-reminder`, `travel-reminder`, `weekly-recap`,
> `behavior-rollup` are **live code but dormant.** Also `price-check`'s own comment claims
> every-6-hours while `vercel.json` schedules it daily. Both → `12_Open_Items.md`.

### Billing
`/api/stripe/checkout` · `/portal`, `/api/webhooks/stripe`, `/api/subscription`,
`/api/iap/apple/verify` · `/notifications`. Fully implemented; **flag-gated off in the UI**
(`SHOW_PRO_UPGRADE = false`). Apple IAP trusts an unsigned client `expiresDate` **only when
`NODE_ENV !== 'production'`** **[SEC]**.

### Misc
`/api/config` (public, §1), `/api/health` (200 `{status:ok}`), `/api/version`
(`{v:<sha>}`, no-store), `/api/rates` (ISR revalidate 3600, `open.er-api.com` + hardcoded
fallback table), `/api/track` (anon-ok, dedups on `event_id`), `/api/translate` (30/day),
`/api/scan` (20/day), `/api/viet-content`, `/api/explore/process` (user, SSRF-guarded),
`/api/explore/oembed` (**edge**, exact-host allowlist), `/api/version`.
`/api/debug-places` and `/api/test-photos` are **leftover diagnostics** — `CRON_SECRET`-gated in
prod but they burn paid Google Places + Serper quota. **Recommend removal** → `12_Open_Items.md`.

---

## 3. Cross-cutting contracts (VERIFIED — read this if nothing else)

### 3.1 Auth header contract
Every route using `getRequestUser(req)` accepts `Authorization: Bearer <supabase access_token>`
identically to a cookie session. **Cookie-only routes** (`createClient()` directly) that a
Bearer token **cannot** authenticate into: `GET /api/reviews` (public read — fine),
`GET /api/reviews/[id]/comments` (public — fine), `GET /api/group?id=` (public — fine),
`POST /api/sound/[trackId]/play` (public — fine), and — the real gap — **`inferFromBooking()`
inside `POST /api/bookings` silently no-ops for Bearer callers.**

### 3.2 Three inconsistent error envelopes — Android must branch on route family
1. Most app routes: `{ error: "<Vietnamese user-facing string>" }`
2. Some routes: `{ error: "<machine_code>", message: "<Vietnamese>" }` — `/api/auth/anonymous`,
   `/api/chat`, `/api/translate`
3. All `/api/admin/*`: `{ error: { code, message } }`, success `{ data, meta? }`

### 3.3 Routes returning 200 (not 401) when unauthenticated — absence of 401 ≠ authorized
`GET /api/memory` → `{memory:null}` · `GET /api/notifications` → `[]` ·
`POST /api/reviews/[id]/interact` → `{ok:true}` · `POST /api/explore/process` → empty ·
`POST /api/track` → `{ok:true}` · plus the anon-allowed reads
(`/api/reviews/feed`, `/api/users/[id]`, `/api/sound/[trackId]`, `/api/suggested-prompts`) which
degrade fields rather than 401.

### 3.4 Routes returning 401 with a non-standard body
`/api/preferences/profile` GET → `401 {profile:null}`, POST → `401 {ok:false}`;
`/api/memory` mutate → `401 {ok:false}`; `/api/onboarding` → `401 {ok:false}`.

### 3.5 Idempotency — what is safe to blind-retry, and what is NOT
**Safe:** `POST /api/track` (dedup on client `event_id`), `POST /api/favorites` (upsert),
`POST /api/sound/[trackId]/save` and `/follow` (23505 → success),
`POST /api/group/[id]/join` (23505 → `alreadyJoined`).
**NOT safe — TOGGLES, a retry flips the state back:** `POST /api/reviews/[id]/like`, `/save`,
`POST /api/users/[id]/follow`. **Android must not blind-retry these.**

### 3.6 Rate limiting is per-serverless-instance **[SEC]**
`src/lib/security/rateLimit.ts` states it itself: state is a module-level `Map`, "not a global
guarantee across all lambdas." So the daily IP caps (`/api/reviews` 20/day, `/api/scan` 20/day,
`/api/translate` 30/day, `/api/auth/anonymous` 30/day) are **advisory**, and mobile-carrier NAT
shares one IP bucket across many users. **The only quota with a real server-side guarantee is
chat** (SECURITY DEFINER RPC `anon_chat_usage_increment` keyed on `auth.uid()`, and
`countTodayUserMessages` for the free tier).

### 3.7 `Retry-After` is set on only three routes
`/api/auth/anonymous`, `/api/chat`, `/api/viet-content`. Other 429s carry none.

### 3.8 Caching
Cached responses: `/api/config` (`max-age=300, swr=3600`), `/api/reviews/feed`
(`s-maxage=30, swr=60`), `/api/rates` (ISR 3600). Explicit `no-store`: `/api/health`,
`/api/version`. **Edge-runtime routes:** `/api/reviews/feed`, `/api/users/[id]`,
`/api/notifications`, `/api/explore/oembed`. Everything else is dynamic by default.

### 3.9 Android auth scheme — the single most Android-critical detail
`/auth/confirm` and all three `auth/zalo/*` accept **`platform=android`** and return tokens in
the URL **fragment** to **`tappyai://auth-callback`**. Note **Android's scheme differs from
iOS's `tappyai://auth/callback`.**

### 3.10 External services
| Service | Used by |
|---|---|
| Supabase (anon/cookie/Bearer) | nearly every route |
| Supabase **service-role** (`createAdminClient`) | admin/*, cron/*, track, onboarding, webhooks/stripe, iap/*, stripe/*, auth/zalo/complete, integration callbacks, users/search, milestones, music report, chat (price-watch + memory writes) |
| Anthropic (via `@/lib/ai/llm`) | chat, scan, translate, viet-content, group/suggest, memory, explore/process, crons morning-brief/deal-notifications/price-check/weekly-recap |
| Serper | chat tools, cron/price-check, debug-places, test-photos |
| Google Places | debug-places + chat tools |
| Vercel Blob | reviews/upload, profile avatar, upload/video, upload/audio, admin/deals/upload |
| Stripe | stripe/*, webhooks/stripe |
| Apple App Store Server API + JWS | iap/apple/* |
| web-push (VAPID) | notifications/broadcast + push-emitting crons |
| Google OAuth + Calendar | integrations/google-calendar, chat event injection |
| Zalo OAuth + graph.zalo.me | auth/zalo*, integrations/zalo* |
| wttr.in · open.er-api.com · TikTok/Facebook oEmbed · Travelpayouts · OSM/Nominatim · vang.today | chat tools, rates, oembed |

---

## 4. Security findings (for the freeze)

| # | Finding | Severity |
|---|---|---|
| 1 | `POST /api/admin/deals/upload` allows **`image/svg+xml`** — the only upload path that does, while others sniff magic bytes specifically to block SVG-as-image stored XSS | Review |
| 2 | Dead client call `POST /api/cta-click` from `ChatInterface.tsx:379` — no such route exists; every chat CTA click **404s silently** | Low, cosmetic |
| 3 | `/api/debug-places`, `/api/test-photos` — leftover diagnostics burning paid quota; recommend removal | Housekeeping |
| 4 | `/api/music/tracks/[id]/report` still gated by the **deprecated `ADMIN_IDS`** env while everything else uses RBAC | Low |
| 5 | Rate limiting is per-instance (§3.6) — advisory only | Known limitation |
| 6 | `/api/translate`, `/api/scan`, `/api/viet-content` — paid model, **no auth** | Cost exposure |

All are carried into `12_Open_Items.md`.

---

## 5. NOT VERIFIED

- The exact request/response body of every individual route (the table above captures method,
  auth and the notable rules; per-field shapes for the less-critical routes were not
  individually re-read). The source file is authoritative.
- Whether Vercel Cron sends the `CRON_SECRET` header (the routes only check it; the sending
  side is Vercel config, not in-repo).
- SECURITY DEFINER function bodies — signatures inferred from call sites (see `04_Database.md`).
- Whether native clients actually consume `/api/config` (the route exists for them; consumption
  not verified).
