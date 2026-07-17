# TappyAI — Architecture Audit (Web + Android as-built)

> Part of the `docs/ios/` design dossier. Documents how the two reference platforms are built today, so iOS can mirror the proven patterns. Source of truth = production code (2026-07-10).

## 1. Backend (shared by all platforms)

```
Client (Web / Android / iOS)
   │  Supabase JS/Kotlin/Swift SDK (anon key, RLS-bound)  ── direct reads/writes of self-scoped + public tables
   │  HTTPS + Authorization: Bearer <supabase-jwt>        ── privileged logic
   ▼
Next.js 14 API routes (Vercel, node + edge runtimes)
   ├── getRequestUser(req): reads Bearer OR SSR cookie → per-user Supabase client (RLS honored)
   ├── AI: backend AI capability layer (provider-abstracted) — AI.generate / AI.stream / AI.vision
   │        → provider adapters in src/lib/ai/llm/providers/ (frozen law: docs/architecture/AI_PLATFORM.md)
   │        Architecture Guard in CI (scripts/architecture/check.mjs, npm run architecture:check) forbids
   │        provider SDKs / model ids / provider keys outside the provider layer; streaming via Vercel AI SDK
   ├── Data: Supabase service-role (admin) for privileged writes (billing, milestones, counters)
   ├── Media: Vercel Blob (client-direct upload tokens issued here)
   └── External: Serper, OSM/Overpass, open.er-api.com, Travelpayouts, Jamendo, Stripe, web-push (VAPID)
   ▼
Supabase Postgres (~30 tables, RLS everywhere) + Supabase Auth (Google/Zalo/Email-OTP)
```

Key architectural truths (see 04/05 for detail):
- **Two data paths.** Clients read/write public + self-scoped tables **directly** via the anon key under RLS; everything privileged (AI, billing, uploads, review-create validation, counters, crons) goes through **Next.js API routes**. iOS inherits this split unchanged.
- **Auth is uniform.** Supabase JWT. `getRequestUser()` accepts both an SSR cookie (web) and `Authorization: Bearer` (native), so RLS `auth.uid()` resolves for all platforms.
- **Counters are trigger-driven & `SECURITY DEFINER`.** Clients never write count columns — they insert/delete junction rows and call RPCs; DB triggers keep counts correct (this was a fixed bug class).
- **Media = Vercel Blob**, not Supabase Storage. Upload tokens (50MB video / 20MB audio / 10MB thumb) come from `/api/upload/*`.

## 2. Web (authoritative implementation)

- **Framework:** Next.js 14 App Router, React 18, TypeScript, Tailwind (`darkMode:'class'`).
- **State/i18n:** reactive `useSyncExternalStore` store for language; localStorage for language/theme/response-style; conversations persisted client-side + server.
- **AI client:** consumes the Vercel AI SDK data-stream; parses structured markers out of the text stream.
- **Two UI shells that never merge:** adaptive light/dark **App-Shell** (Home/Chat/Deals/Profile, 5-tab bottom nav) and a **permanently-dark Reviews feed** with its own nav.
- **Security posture:** full CSP + security headers, SSRF `isSafeHttpsUrl` guard, PKCE+state OAuth, service-role isolation for billing/PII, per-route rate limits. (See 03 §AI Safety, 04.)
- **Media pipeline:** client-direct Vercel Blob upload after magic-byte checks; images sourced from Serper gstatic thumbnails.

## 3. Android (native, in progress — reference for layering, not scope)

From `08_ANDROID_PARITY_REPORT.md`:
- **14-module Gradle project**, strict **Clean Architecture**. `:core:*` never depends on `:app`. Only `:features:auth` is a real feature module (owner's rule: no module until it has real Repository/business logic).
- **DI:** Hilt throughout. **UI:** Jetpack Compose + Material 3 (dynamic color on API 31+, fixed light/dark fallback).
- **Navigation:** event-bus (`TappyNavigator` interface → `TappyNavigatorImpl` SharedFlow) + nested type-safe NavHosts (root → shell → tab); session-driven root navigation.
- **Networking:** Retrofit/OkHttp stack built but **dormant** (zero endpoints yet); `AuthInterceptor` attaches `Authorization: Bearer` to own-host requests — mirrors web `getRequestUser()`.
- **Auth:** the only live-backend feature — Supabase via supabase-kt/Ktor (Google/Facebook/Email-OTP); `EncryptedTokenStorage` for the JWT; hashed-vs-raw nonce Google flow.
- **Design system:** `:core:designsystem` with ~22 `Tappy*` components + token system (brand `#007AFF`/`#FF9500`, deliberate dark-text-on-orange WCAG rule), formalized empty/error/skeleton/loading/sheet/dialog primitives.
- **Status:** everything except Auth is a UI foundation with in-memory seed data and **no backend** (e.g. `ChatViewModel` fakes a 2.5s "responding" and never replies).

## 4. Patterns iOS should mirror (proven on Android)

1. **Clean Architecture layering** — UI → ViewModel/Presentation → UseCase → Repository → data source; feature isolation.
2. **Design-system-first** — build the `Tappy*` component + token layer before screens; light/dark from tokens.
3. **Session-driven root navigation** — auth state selects the root (auth stack vs app shell).
4. **Bearer-to-Next.js contract** — Supabase JWT in secure storage → attach `Authorization: Bearer` to backend calls; Supabase SDK for direct RLS reads.
5. **Swap-seam abstractions** — isolate platform SDKs behind interfaces (Android did this for `MapCanvas` / `AudioPlayer`); iOS wraps AVPlayer, MapKit/outbound-maps, StoreKit, APNs behind protocols.
6. **Honest empty/loading/error states** as DS primitives (Android formalized these; Web hand-rolls them per screen — iOS should follow Android's formalization).
7. **Window-size-class responsiveness** — Compact/Medium/Expanded ↔ iOS size classes; bottom-nav (compact) vs nav-rail/split (regular).

## 5. Where Web and Android differ from each other (and iOS should side with Web)

| Concern | Web (authoritative) | Android (today) | iOS target |
|---------|---------------------|-----------------|-----------|
| Feature completeness | ~54 features live | Auth only wired | **Match Web** |
| Chat backend | Real streaming AI | Faked | **Real (match Web)** |
| State primitives | Hand-rolled per screen | DS primitives | Prefer DS primitives, Web behavior |
| Networking to Next.js | Live | Dormant | **Live** |
| Payments | Stripe web | none | **StoreKit** (see 09) |
