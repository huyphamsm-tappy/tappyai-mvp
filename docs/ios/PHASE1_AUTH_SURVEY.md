# TappyAI iOS — Phase 1 Survey: Authentication

> **Survey + implementation plan only. No Swift, no feature code, no foundation changes.**
> Source of truth = current production **Web + Backend**. Android is a client implementation, not the spec. All web claims trace to `file:line` in the Next.js codebase (consolidated from the auth audit). This document is the reference the eventual Phase 1 auth implementation must match at 100% parity.

---

## 0. Finalized Architectural Decisions (2026-07-10) — approved before implementation

These resolve the two open items and add the **Anonymous Identity** model. **Per ADR-011, all three are backend-first and cross-platform — Web, Android, and iOS converge on the same model. They supersede the legacy `tappy_anon` cookie; Web migrates too. They are NOT iOS-only, and iOS does not build product behavior ahead of Web.**

### D1 — Anonymous Chat = server-authoritative anonymous session (no login required)
Anonymous users get a real, server-issued session — no login. **The client contract is a stable API; the backend implementation is hidden and swappable.**

**Client contract (stable — this is what iOS/Android/Web depend on):**
```
POST /api/auth/anonymous
  → 200 { access_token, refresh_token, anonymous_id, expires_at }
```
The client stores these in Keychain (via `SessionStore`) and authenticates with `Authorization: Bearer <access_token>` exactly like an authenticated user; refresh follows the normal token flow. The chat quota is enforced **server-side against `anonymous_id`** (5/VN-day; `401 anon_limit_reached` unchanged). **Clients never know how the backend mints or backs these tokens.**

**Backend-owned implementation (any of these, interchangeable with no client change):** Supabase Anonymous Auth · custom JWT · an internal identity service · a future auth provider. The API contract is stable across all of them. Choosing/optimizing the implementation is a backend concern, not part of this survey.

- **No login required** — anonymous users keep full browse + 5 chats/day; the model just makes the quota tamper-resistant and identity-bearing.
- **Backend deltas (Backend + Web first):** expose the stable `POST /api/auth/anonymous` (+ refresh); enforce the anon quota on `anonymous_id`; retire `tappy_anon`. All clients converge on the contract.

### Anonymous Identity — backend guarantees, implementation-agnostic clients
The anonymous session carries a **persistent `anonymous_id`** (Keychain, survives launches) used for **history, recommendations, analytics, personalization**.

On sign-in, the **backend guarantees** (the client relies on these; it does not implement them):
- **History preservation** — conversations and activity carry into the authenticated account.
- **Stable identity** — the user's data identity is continuous.
- **No duplicate user** — no second identity is created.
- **Seamless upgrade** — the anonymous account becomes the authenticated account transparently.

> **How the backend achieves this (convert / merge / link / other) is an implementation detail. Clients remain implementation-agnostic** — iOS calls the standard auth flow and trusts these guarantees; it MUST NOT encode convert-vs-merge logic. Per ADR-011 these are backend capabilities built **Backend → Web → Android → iOS**; iOS Phase 1 consumes them and does not lead product behavior. If not yet live when iOS auth begins, Phase 1 ships anonymous browse + chat against current enforcement, and the contract lands with the backend rollout — a dependency, not an iOS deviation.

### D2 — Zalo = one `ASWebAuthenticationSession`, existing backend unchanged
Implement the complete 5-hop Zalo flow **inside a single `ASWebAuthenticationSession`** web context so the `zalo_login_*` and `zalo_at` httpOnly cookies persist across hops exactly as on Web. **Reuse the existing routes** (`/api/auth/zalo`, `/callback`, `/complete`, `/auth/zalo-finish`, `/auth/confirm`); the device performs the `graph.zalo.me/me` fetch (VN-IP) within that same context; the final `confirmUrl` establishes the Supabase session the SDK captures. **No new backend endpoints** (per Decision 2).

---

## 1. Authentication Survey

### 1.1 Methods (what exists)

| Method | Enabled | Web entry | Mechanism |
|--------|:------:|-----------|-----------|
| Google OAuth | ✅ | `login/page.tsx:92` | Supabase `signInWithOAuth('google')` → `/auth/callback` (PKCE) |
| Facebook OAuth | ❌ (code kept) | gated by `AUTH_PROVIDERS.facebook.enabled=false` (`providers.ts:15`) | same as Google |
| Zalo OAuth | ✅ | `/api/auth/zalo` | Custom 5-hop PKCE + service-role user + magic-link bridge |
| Email OTP (passwordless) | ✅ | `login/page.tsx:162` | `signInWithOtp` + `verifyOtp(type:email)` |
| Email + Password | ✅ **register only** | `register/page.tsx:33` | `signUp` (email confirmation) |
| Anonymous (chat) | ✅ | no login | httpOnly cookie `tappy_anon`, 5 questions/VN-day |

Not present: phone/SMS auth; **no password field on `/login`** (password is registration-only — returning users use Email-OTP); no cross-provider **account linking** (Zalo creates a *separate* synthesized user keyed by `zalo_id`; Google and email are independent Supabase identities). iOS must **not** invent account linking — parity means keeping identities separate.

### 1.2 Login flows (per method, condensed)

- **Google** (`login/page.tsx:92-109`): read `returnTo` → `signInWithOAuth('google', { redirectTo: origin+"/auth/callback?next="+returnTo, skipBrowserRedirect:true })` → `window.location.replace(data.url)`. Google → `/auth/callback?code&next`. Callback exchanges code (PKCE), stamps session cookies, applies onboarding gate. **In-app-browser guard**: if UA is FB/Messenger/IG/Zalo/LINE/TikTok/WeChat, Google/Zalo buttons are hidden; only "Open in Chrome"/"Copy link"/Email-OTP shown (`login/page.tsx:15-29,203-321`).
- **Zalo** (5 hops — see §5): init `/api/auth/zalo` (PKCE + 3 cookies) → Zalo permission → `/api/auth/zalo/callback` (CSRF check + token exchange, sets `zalo_at`) → `/auth/zalo-finish#at=…` (device fetches `graph.zalo.me/me` — **VN-IP required**) → `POST /api/auth/zalo/complete` (service-role createUser + generate magic link) → `/auth/confirm?token_hash&type=magiclink` establishes the Supabase session.
- **Email OTP** (`login/page.tsx:162-201`): `signInWithOtp({email, shouldCreateUser:true})` → 6-digit `verifyOtp({email, token, type:'email'})` → **client-side** onboarding gate (`destWithOnboarding`, `:146-160`) because OTP does not pass through `/auth/callback`.
- **Register** (`register/page.tsx:22-60`): `signUp({email, password (≥6), data:{full_name}, emailRedirectTo: origin+"/auth/callback"})`. Immediate session → `/onboarding`; else "check your email" state.

### 1.3 Logout
`supabase.auth.signOut()` → route to `/login` + refresh (`SignOutButton.tsx:12-16`). Clears Supabase session cookies. **Does NOT clear `tappy_anon`** (separate teaser counter).

### 1.4 Session restoration
Web: Supabase SSR cookies (`sb-<ref>-auth-token`, possibly chunked), re-validated + rotated by `middleware.ts` on nearly every route via `supabase.auth.getUser()` (`:58`). Native: session held by the Supabase mobile SDK; restore on launch from secure storage, refresh proactively.

### 1.5 Anonymous mode + limits
- **Anon CAN**: browse everything; chat capped **5 questions/VN-day**.
- **Anon CANNOT** (→ 401 `{error:'Cần đăng nhập'}`): like, save, comment, follow, upload, price-watch, integrations, profile writes. Every mutating route calls `getRequestUser` → 401 if no user.
- **Anon chat cap** (`chat/route.ts:152-180`): `FREE_ANON_LIMIT=5`, keyed by httpOnly cookie `tappy_anon = "<VN-date>:<count>"`; date≠today resets to 0; `count>=5` → **401 `anon_limit_reached`** `{message, upgradeUrl:'/login'}`; otherwise increments and re-stamps `Set-Cookie` (`Max-Age=86400; HttpOnly; SameSite=Lax; Secure`). **No DB row for anon.** Cookie is httpOnly → client learns the limit only from the 401 body.
- **Logged-in free cap** (`chat/route.ts:77-148`): `FREE_DAILY_LIMIT=15` counted from `conversations.messages` (user-role) since VN-midnight; Pro = `subscriptions` row `status='active' AND current_period_end>now`. `>=15` → **429 `free_limit_reached`** "come back tomorrow" (no upsell; Pro upgrade hidden).

### 1.6 Protected routes, middleware, permission model, feature gating
- **Middleware never gates routes** — "app is open to all" (`middleware.ts:46`). Its only job is session refresh (`getUser()`); it must NOT use `getSession()` (that caused the "periodic logout" bug — `:52-57`). `matcher` excludes `_next/static|image`, `favicon.ico`, static images (`:63-65`).
- **Permission model** = per-request identity via `getRequestUser(req)` (`getRequestUser.ts:18-40`): web cookie session OR native `Authorization: Bearer <supabase-jwt>` (verified per-user via `auth.getUser(token)`, scoped so RLS `auth.uid()` works for both). Separate from `Bearer <CRON_SECRET>` used by internal/cron routes.
- **Feature gating**: login-required actions return 401; verified-badge required to post reviews; 1-review/place; onboarding gate on `profiles.onboarded`. Enforcement is server-side (Thin Client — iOS renders the resulting states, never decides gating).

### 1.7 Onboarding & profile initialization
Trigger: first-time auth where `profiles.onboarded` is falsy — enforced in `/auth/callback:54`, `/auth/confirm:49`, OTP client gate `login/page.tsx:155`, post-register `register/page.tsx:53`. Route `/onboarding?next=<dest>`. Collects **interests** (`food,spa,travel,shopping,entertainment,hotel`) + **city** (8 presets or free text). `POST /api/onboarding {interests, city}` → admin-client upsert `profiles{id, onboarded:true}` + seed `user_memory{location_base, preferences}`. Both steps cosmetically skippable but `onboarded:true` is always set. After POST, `router.replace(next||'/')`.
> **Open item to confirm in Phase 1:** whether a Supabase trigger auto-creates the `profiles` row on signup, or the onboarding upsert is the first write. Affects when iOS can read `profiles.onboarded`.

### 1.8 UI states (loading / empty / error / retry / offline) on Web
- **Loading**: OAuth button → spinner while obtaining provider URL / redirecting; OTP send + verify have pending states; Zalo-finish shows a working state while fetching profile.
- **Error**: surfaced via `?error=<code>` on `/login` (`no_code`, `zalo_denied`, `zalo_failed`, `missing_token`, `<supabase message>`) and inline validation (email `@`, password ≥6, 6-digit code). Chat limits surfaced as 401/429 bodies in `ChatInterface.tsx:1180-1216`.
- **Empty/Retry**: OTP "resend", register "check your email" state; in-app-browser fallback offers Chrome/Copy-link/Email-OTP as alternate paths.
- **Offline**: no explicit offline auth mode on Web (matches ADR-008). iOS shows the native error+retry state; never queues auth.

---

## 2. Backend

### 2.1 Authentication APIs (Next.js routes)
| Route | Method | Purpose |
|-------|--------|---------|
| `/auth/callback` | GET | OAuth (Google/FB) PKCE code exchange + onboarding gate |
| `/auth/confirm` | GET | Magic-link / email OTP `verifyOtp(token_hash,type)` + onboarding gate (shared by Zalo hop 5) |
| `/api/auth/zalo` | GET | Zalo init: PKCE + `state` + 3 cookies → Zalo permission URL |
| `/api/auth/zalo/callback` | GET | CSRF check + Zalo token exchange → `/auth/zalo-finish#at` + `zalo_at` cookie |
| `/api/auth/zalo/complete` | POST | Gated by `zalo_at`; service-role createUser(by zalo_id) + `generateLink(magiclink)` → `confirmUrl` |
| `/api/onboarding` | POST | Upsert `profiles.onboarded=true` + seed memory |

Supabase Auth itself (signInWithOAuth/OTP/signUp/verifyOtp/signOut) is called **directly from the client SDK**, not via Next.js.

### 2.2 Required headers / cookies / bearer / refresh / validation
- **Native auth header**: `Authorization: Bearer <supabase access_token>` on every privileged Next.js call (`getRequestUser.ts:24-34`).
- **Cookies (web-only)**: `sb-<ref>-auth-token[.0/.1]` (session, httpOnly); `tappy_anon` (anon cap, httpOnly); Zalo transient `zalo_login_cv|state|return` (httpOnly, Max-Age 300) + `zalo_at` (Max-Age 300).
- **Refresh**: access token ~1h (Supabase default), refresh token long-lived. Web rotates via middleware `getUser()`; native refreshes via the Supabase SDK.
- **Session validation**: `auth.getUser(token)` verifies against Supabase per request (not a shared secret) → RLS-scoped client.
- **Security model**: PKCE+state (Zalo), Supabase PKCE (Google), open-redirect sanitization of every `next/returnTo`, service-role key server-only, per-identity RLS.

### 2.3 Rate limits
`rateLimit.ts` = in-memory sliding window per instance (not globally consistent). Auth-relevant: `POST /api/chat` **30 req/min/IP** (anon+authed) → 429 + `Retry-After`. Daily chat caps (5 anon / 15 free) are separate longer-window controls (§1.5).

### 2.4 Environment variables (names only)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `ZALO_APP_ID`, `ZALO_APP_SECRET`, `NEXT_PUBLIC_APP_URL` (site), `CRON_SECRET`, `ADMIN_IDS`. iOS uses only the URL + anon key (+ its own bundle config); never the service-role/Zalo secrets.

---

## 3. Supabase usage (auth-relevant)

- **Auth providers**: Google (enabled), Facebook (disabled), Email (OTP + password signup). Zalo is **not** a native Supabase provider — the backend synthesizes an `auth.users` row via `admin.createUser` (email `zalo_<id>@zalo.tappyai.com`, `user_metadata.zalo_id`) and logs the user in with an admin-generated magic link.
- **Tables (auth path)**: `profiles` (`id`, `onboarded`, `language`, name/avatar/bio; `email` removed from anon-readable columns by a hardening migration), `subscriptions` (Pro check: `status`, `current_period_end`), `user_memory` (seeded at onboarding; `user_id` is **text**), `conversations` (free-limit message counting).
- **RLS**: self-scoped on user-owned tables via `auth.uid()`; public read on some `profiles` columns (email excluded); `subscriptions` writes are service-role only. iOS (anon key + Bearer) is bound by the **same RLS** as the web browser.
- **Triggers/Functions (auth-relevant)**: counter/`SECURITY DEFINER` functions are not on the auth path; **confirm** whether a `handle_new_user`-style trigger creates `profiles` on signup (open item §1.7). Zalo user creation is done via the Admin API, not a trigger.
- **Storage**: **none in the auth flow.** All media = Vercel Blob (not Supabase Storage); irrelevant to Phase 1.

---

## 4. Authentication Flow Diagram

```
                          ┌─────────────── App launch ───────────────┐
                          │  Supabase SDK restores session (Keychain) │
                          └───────────────┬───────────────────────────┘
                              session? ──yes─► profiles.onboarded? ──no─► Onboarding ─► App shell
                                 │no                         │yes─────────────────────► App shell
                                 ▼
                         ┌──────────────┐
                         │  /login UI   │  (anon can still browse + 5 chats/day)
                         └──────┬───────┘
        ┌───────────────┬───────┼──────────────────┬──────────────────────┐
        ▼               ▼       ▼                  ▼                      ▼
     Google           Zalo   Email OTP        Register(pwd)          Anonymous
   signInWithOAuth  5-hop    signInWithOtp     signUp                (no login)
        │           (see §5) → verifyOtp        │                      │
        ▼               │        │              ▼                      ▼
  /auth/callback        │        │        session or "check email"  tappy_anon cookie
  code exchange         │        │              │                    5/day cap
        │               ▼        │              │
        │        /auth/confirm   │              │
        │        verifyOtp       │              │
        └──────┬────────┴────────┴──────────────┘
               ▼
        profiles.onboarded gate  ──no─► Onboarding (interests+city → POST /api/onboarding)
               │yes
               ▼
           App shell (authenticated)
```

---

## 5. Native OAuth Flow (iOS)

### 5.1 Google (native)
1. `ASWebAuthenticationSession` opens the Supabase-provided Google auth URL (obtain via the Supabase Swift SDK's OAuth start, or `signInWithOAuth` with `redirectTo = tappyai://auth/callback`).
2. Google → callback deep link `tappyai://auth/callback?code&next`.
3. SDK exchanges the code (PKCE) → session in Keychain.
4. Client reads `profiles.onboarded` → route to Onboarding or shell.
> Use `ASWebAuthenticationSession` (shared cookie jar, Apple-blessed), **not** an embedded `WKWebView`. Register `tappyai://` + associated-domains for universal links.

### 5.2 Zalo (native — the hard one)
The 5-hop server flow is preserved; iOS drives it natively:
1. Open `GET /api/auth/zalo?returnTo=…` (or the Zalo permission URL it redirects to) in `ASWebAuthenticationSession`. **The three PKCE cookies are set by the server on that web context** — see native caveat below.
2. Zalo → `/api/auth/zalo/callback` (server does CSRF + token exchange, sets `zalo_at`) → redirects to `/auth/zalo-finish#at=<token>`.
3. **Device must fetch `https://graph.zalo.me/v2.0/me` itself** (VN-IP requirement) — do this natively or inside the web context on the device.
4. `POST /api/auth/zalo/complete {zaloId,name,avatar,next}` — **gated by the `zalo_at` cookie**.
5. Consume returned `confirmUrl` (`/auth/confirm?token_hash&type=magiclink`) to establish the Supabase session; SDK stores it in Keychain.
> **Cookie-jar caveat (critical) — DECIDED (D2):** hops 1→2 (`zalo_login_*`) and hop 4 (`zalo_at`) rely on an httpOnly cookie jar. **The whole flow runs inside one `ASWebAuthenticationSession` web context** so the cookies persist and the flow works unchanged, **reusing the existing backend routes with no new endpoints** (see §0 · D2). Native `URLSession` is not used mid-flow, so no `zalo_at`-carrying or backend token-bound variant is needed.

---

## 6. Session Lifecycle

```
Launch ─► SDK.restoreSession(Keychain)
   ├─ valid  ─► SessionStore.state = authenticated/onboarding (per profiles.onboarded)
   ├─ expired─► SDK auto-refresh (refresh token) ─► rotate ─► authenticated
   │              └─ refresh fails ─► logout ─► anonymous
   └─ none   ─► anonymous (browse + 5 chats/day)

Sign-in (any method) ─► SDK stores session ─► SessionStore.didAuthenticate ─► onboarding gate
Sign-out ─► SDK.signOut() ─► clear Keychain ─► anonymous (do NOT clear anon counter)
Background/foreground ─► SDK validates/refreshes as needed; no forced logout
```
iOS mirror of web's middleware refresh = the Supabase SDK's auto-refresh; the foundation's `SessionStore` (single authority) + single-flight refresh coordinator already model this (ADR-004/005) — Phase 1 only swaps the `UnavailableTokenRefreshing` stub for the SDK-backed refresher.

---

## 7. Token Lifecycle

| Token | Source | Lifetime | Storage (iOS) | Use |
|-------|--------|----------|---------------|-----|
| Access (JWT) | Supabase | ~1h | Keychain (via SDK + `SessionStore`) | `Authorization: Bearer` to Next.js; RLS `auth.uid()` |
| Refresh | Supabase | long-lived | Keychain | obtain new access token |
| anon session `access_token`/`refresh_token` | `POST /api/auth/anonymous` | `expires_at` / refresh | Keychain | Bearer; quota on `anonymous_id` (replaces `tappy_anon`) |
| `zalo_login_*`, `zalo_at` | server cookie | 300s | web-auth context only | Zalo hops |

Rules: single token authority (`SessionStore`), single-flight refresh, **401 → refresh-once → retry-once** (already in the foundation's `AuthInterceptor`). On refresh failure → logout. Never cache a token copy in the networking layer.

---

## 8. API Mapping (Web → iOS)

| Concern | Web | iOS Phase 1 |
|---------|-----|-------------|
| Google sign-in | `signInWithOAuth` + `/auth/callback` | Supabase Swift OAuth via `ASWebAuthenticationSession` + `tappyai://auth/callback` |
| Email OTP | `signInWithOtp`/`verifyOtp` | Supabase Swift OTP; native code entry |
| Register | `signUp` | Supabase Swift `signUp` |
| Zalo | `/api/auth/zalo` → … → `/auth/confirm` | same server routes, driven from web-auth context (§5.2) |
| Onboarding gate read | `profiles.onboarded` via SDK/DB | Supabase Swift select `profiles.onboarded` |
| Onboarding write | `POST /api/onboarding` | same endpoint, Bearer |
| Anonymous session | `tappy_anon` cookie (server) | stable `POST /api/auth/anonymous` → Bearer; quota on `anonymous_id` (§0) |
| Auth for privileged calls | cookie session | `Authorization: Bearer` |
| Sign-out | `signOut()` | Supabase Swift `signOut()` |

No new endpoints are required for parity (except the possible anon-quota/Zalo-token backend deltas flagged below).

---

## 9. Security Notes
- **Bearer, not cookies**, for native privileged calls (server already supports it).
- **Open-redirect sanitization**: every `next`/`returnTo`/deep-link path → relative-only (`startsWith('/') && !startsWith('//')`). iOS deep-link router MUST replicate.
- **PKCE + state** preserved (Google via SDK; Zalo via server).
- **Service-role & Zalo secrets** never on device.
- **RLS parity**: anon key + Bearer → identical `auth.uid()` scoping as web.
- **Keychain** for all tokens (`AfterFirstUnlockThisDeviceOnly`); never UserDefaults.
- **ASWebAuthenticationSession** (not WKWebView) for OAuth; verify unfamiliar redirect hosts.
- **VN-time (UTC+7)** day boundaries for any "questions left" display.

---

## 10. Edge Cases
1. **In-app browser** (app opened from FB/Zalo/etc.): web hides Google/Zalo, offers Email-OTP. On iOS this is largely moot (native OAuth), but keep Email-OTP as universal fallback.
2. **Anon cap with no cookie**: a native client that doesn't persist/replay `tappy_anon` is treated as fresh each request → the 5/day cap is unenforceable client-side (R1). Requires the server-authoritative anon decision.
3. **Zalo cookie-jar** across hops (§5.2) — the main native risk.
4. **Zalo user lookup scans only first 1000 users** (`zalo/complete:38`) — server-side scaling bug; iOS inherits it, don't work around client-side.
5. **OTP resend / wrong code / expired code** — mirror web validation + resend.
6. **Register with email confirmation ON vs OFF** — immediate session → onboarding; else "check your email" (deep-link back via `/auth/callback`).
7. **Onboarding skip** — steps skippable but `onboarded:true` always set.
8. **Refresh race** — multiple concurrent 401s → single-flight (already handled).
9. **Sign-out must not clear anon counter** (parity).
10. **`profiles` row absence** before onboarding (§1.7 open item) — handle a missing row as "not onboarded".
11. **Facebook stays disabled** unless the flag flips.
12. **Periodic-logout trap** — the SDK must proactively refresh (web's `getUser()` equivalent); do not rely on lazy validation.

---

## 11. Native Considerations (where iOS cannot behave exactly like Web, and how to preserve behavior)

| Web mechanism | iOS difference | How to preserve identical product behavior |
|---------------|----------------|--------------------------------------------|
| httpOnly session cookie | Native uses Bearer | Bearer already supported by `getRequestUser`; identical RLS scoping. |
| `tappy_anon` httpOnly cookie | Native has no shared cookie jar with `URLSession` | **DECIDED (D1):** server-authoritative **anonymous session** via the stable `POST /api/auth/anonymous` contract (`access_token`/`refresh_token`/`anonymous_id`/`expires_at`) → Keychain → Bearer; quota keyed server-side on `anonymous_id`. Backend implementation hidden/swappable. Replaces the cookie; no login required (§0). |
| Zalo `zalo_login_*`/`zalo_at` cookies | Native `URLSession` won't carry them | **DECIDED (D2):** run the entire flow inside one `ASWebAuthenticationSession` so cookies persist; reuse existing routes; no new endpoints (§0). |
| OAuth via full-page redirect | Native needs a controlled auth session | `ASWebAuthenticationSession` + `tappyai://` deep link / universal link. |
| `window.location` redirects & `next` query | Native deep links | `DeepLinkHandler` (foundation) resolves `next`/paths; apply the same relative-only sanitization. |
| Middleware token refresh | No middleware on native | Supabase Swift SDK auto-refresh, surfaced through `SessionStore` single-flight. |
| Cookie-based logout | Native clears Keychain | `signOut()` + Keychain clear; keep anon counter behavior server-side. |

Net: **no product behavior changes** — only the transport/mechanism differs, and each difference maps to a native equivalent above.

---

## 12. Phase 1 Implementation Plan (no Swift; ordered)

**Decisions — RESOLVED (see §0):**
- **D1 ✅** — Anonymous chat = **server-authoritative anonymous session** behind a stable client contract `POST /api/auth/anonymous → {access_token, refresh_token, anonymous_id, expires_at}` → Keychain → Bearer → server quota on `anonymous_id`. No login required. Backend implementation hidden/swappable. Replaces `tappy_anon`. Backend-first, all clients converge.
- **D2 ✅** — Zalo = **one `ASWebAuthenticationSession`**, existing routes, **no new backend endpoints**.
- **Anonymous Identity ✅** — persistent `anonymous_id`; on sign-in the **backend guarantees** history preservation, stable identity, no duplicate user, seamless upgrade. Mechanism (convert/merge/link) is a backend detail; client is implementation-agnostic.

**Backend dependencies (Backend + Web first, per ADR-011):** expose the stable `POST /api/auth/anonymous` (+ refresh); enforce anon quota on `anonymous_id`; guarantee history-preserving seamless upgrade (mechanism backend-owned); retire `tappy_anon`. iOS Phase 1 consumes the contract.

**Still-open confirmations (not blockers to starting):**
- **D3** — Confirm `profiles` auto-creation trigger (§1.7).
- **D4** — Universal-link domain + `tappyai://` scheme; Supabase redirect allow-list updated for the iOS scheme.
- **D5** — Min-iOS target (still open, ADR-003) as it affects the auth UI stack.

**Build order (each: build UI → runtime-verify against live backend → polish → close):**
1. **Supabase auth wiring** — replace `UnavailableTokenRefreshing` with an SDK-backed `TokenRefreshing`; `SessionStore.didAuthenticate` on real sign-in; launch restore. (Uses the existing foundation seams; no new architecture.)
2. **Email OTP** — send/verify screens, validation, resend, error states (universal fallback first; lowest risk).
3. **Google** — `ASWebAuthenticationSession` + deep-link callback + onboarding gate.
4. **Register (email+password)** — sign-up + "check your email" + confirmation deep link.
5. **Onboarding** — interests + city, `POST /api/onboarding`, `profiles.onboarded` read, `replace` navigation; seed-memory happens server-side.
6. **Zalo** — the 5-hop native flow per D2; the highest-risk item, do last.
7. **Anonymous session + identity** — on first launch (no session) call the stable `POST /api/auth/anonymous` → store returned tokens + `anonymous_id` in Keychain via `SessionStore`; browse + chat under the server quota; handle 401 `anon_limit_reached` (→ prompt login) and 429 `free_limit_reached` (→ "come back tomorrow"). *(Consumes the backend anon-session contract; implementation-agnostic.)*
8. **Anon → account carry-over** — sign in via the standard flow and rely on the backend's guarantees (history preservation, stable identity, no duplicate user, seamless upgrade); the mechanism (convert/merge/link) is backend-owned. Verify history carried over.
9. **Cross-cutting** — loading/empty/error/retry states via the DS primitives; open-redirect sanitization in the deep-link router; sign-out (Keychain clear); VN-time "questions left" display.

**Acceptance (parity gate):** every method above produces the same identities, the same onboarding gating, the same limit responses (401/429 codes + messages), and the same permission model as Web — verified on device against the live backend, per `13_PARITY_GOVERNANCE §8`.

**Non-goals for Phase 1:** no product features beyond auth+onboarding; no StoreKit; no repositories for other domains; no new backend behavior except the D1/D2 deltas if chosen.

---

### Survey validation
- Scope covered: all 21 listed survey items ✔ · Backend (APIs/headers/cookies/bearer/refresh/validation/security/rate-limits/env) ✔ · Supabase (providers/tables/RLS/triggers/functions/storage) ✔ · Native differences with preservation strategy ✔ · 9 deliverables produced ✔.
- **No Swift written · foundation unchanged · Authentication not implemented · Phase 1 not started.**
- Open items (D1–D5, §1.7 trigger, Zalo 1000-user cap) are flagged, not resolved — they are decisions/confirmations for the start of implementation.
