# ADR-005 — Authentication

**Status:** Accepted · **Date:** 2026-07-10

## Context
Auth is Supabase JWT. Backend `getRequestUser` reads Bearer or cookie, so native works with Bearer. Methods: Google, Zalo (5-hop PKCE bridge), Email-OTP, register; anonymous chat (cookie-based on Web). OAuth on Web uses browser redirects (`01`, `04 §1`, `15 §1`).

## Decision
Use **supabase-swift** for session management; store the **JWT in Keychain**. Attach `Authorization: Bearer` to all Next.js calls. Run OAuth (Google, Zalo, Google-Calendar) via **`ASWebAuthenticationSession`** with a registered deep-link callback (`tappyai://`). Email-OTP handled natively. **Anonymous chat is NOT cookie-based on iOS** — resolve via a server-authoritative anon/device token or require login for chat (decision R1, to confirm with backend). Session state drives root navigation (ADR-002).

## Alternatives Considered
- **Roll our own OAuth web view (WKWebView)** — rejected: `ASWebAuthenticationSession` is the Apple-blessed, cookie-isolated, more secure path.
- **Replicate the httpOnly anon cookie** — impossible/unsafe for a native client; must be server-side.
- **Store JWT in UserDefaults** — rejected (insecure); Keychain only.

## Consequences
- Secure, HIG-compliant sign-in; unified Bearer contract.
- Requires a backend decision on native anon quota (R1) before chat ships for logged-out users.
- Zalo's VN-IP-only profile constraint and `zalo_at` cookie binding need care in the native bridge.

## Amendment — 2026-07-10 review (F4, F5)
**Single token authority (F4) · Required before Phase 0.** The JWT lives once in `SessionStore` (backed by Keychain) and is the single source for both supabase-swift and `TappyAPIClient`; refresh/retry policy is defined in ADR-004's amendment.

**Native anon-chat quota (F5) · Decision required before Phase 2.** The web httpOnly `tappy_anon` cookie cannot gate a native client. Decide before Phase 2: **server-authoritative anon/device token** (preferred) or **login-required chat**. This is a small backend change and does not block Phase 0. Not adding this is an abuse/cost hole (R1).

## Amendment — 2026-07-10 decisions (finalize D1, D2; add Anonymous Identity)
Resolves the two open auth items. **Backend-first and cross-platform (Web/Android/iOS converge), per ADR-011 — not iOS-only.** Full detail in `PHASE1_AUTH_SURVEY.md §0`.

- **D1 — Anonymous chat = server-authoritative anonymous session (no login required).** The client depends on a **stable API contract**, not a backend implementation: `POST /api/auth/anonymous → { access_token, refresh_token, anonymous_id, expires_at }`. The client stores these in Keychain and authenticates with `Bearer`; the chat quota is enforced server-side against `anonymous_id`. **How the backend mints/backs these tokens is backend-owned and swappable** — Supabase Anonymous Auth, a custom JWT, an internal identity service, or a future provider — with no client change. Clients must never know the implementation. Supersedes R1's cookie mechanism.
- **Anonymous Identity — backend guarantees, implementation-agnostic clients.** A persistent `anonymous_id` (Keychain) powers history/recommendations/analytics/personalization. On sign-in the **backend guarantees**: history preservation, stable identity, no duplicate user, and seamless upgrade to the authenticated account. **How this is achieved (convert / merge / link / other) is an implementation detail; clients must not encode it.**
- **D2 — Zalo runs entirely inside one `ASWebAuthenticationSession`**, reusing the existing backend routes; **no new backend endpoints**. The shared cookie jar preserves `zalo_login_*`/`zalo_at` across hops.

Backend deltas (Backend + Web first): expose the stable `POST /api/auth/anonymous` (+ refresh); enforce anon quota on `anonymous_id`; guarantee history-preserving seamless upgrade; retire `tappy_anon`. iOS consumes the contract; it does not lead product behavior or depend on the backend implementation.

## Amendment — 2026-07-25 (Auth Provider Contract · which methods render)
**Provider availability is config-driven from the shared source of truth, not hardcoded per platform.** The canonical list is `AUTH_PROVIDERS` in `src/lib/config/product.ts`, served verbatim to native clients by `GET /api/config` as `auth.providers: [{ id, enabled }]`. Web imports the constants directly; **iOS reads the same list from `/api/config`** and renders a provider's button **only when `enabled === true`** (`isAuthProviderEnabled`). Web, Android, and iOS therefore expose the identical set with no per-platform drift.

- **V1 enabled set = Google + Zalo only.** These are the only two buttons iOS renders in V1.
- **Email — DISABLED and hidden, machinery kept internal.** Email-OTP stays implemented (supabase OTP verify + the OTP screens) but is **not surfaced** in the UI while `email.enabled === false`. Do not delete the native Email-OTP flow; gate its entry point on the config so it can be re-enabled by flipping the shared config alone. (Mirrors the Web, which keeps `EmailOtpBlock` + handlers but renders nothing.) The Supabase Email provider itself is **not** being disabled server-side — only its client surface.
- **Facebook — not offered** (Meta Business Verification blocks Advanced Access); `enabled === false`, never rendered.
- **Registration** is not a distinct provider button; account creation happens implicitly via the OAuth/OTP flows above.

Implementation note for iOS: fetch `/api/config` once at launch (cacheable, `Cache-Control: public, max-age=300`), read `auth.providers`, and drive the sign-in screen off it. A provider must render **only when both** its config `enabled` is true **and** the client actually has a working handler for it — never render a button whose flow isn't implemented yet.

## Future Evolution
Add Sign in with Apple if/when the product adds it on Web first (not an iOS-exclusive addition). Move anon handling fully server-side. When Sign in with Apple (or any new method) ships, it enters `AUTH_PROVIDERS` in `product.ts` first and reaches iOS through `/api/config` — never as an iOS-only hardcode.
