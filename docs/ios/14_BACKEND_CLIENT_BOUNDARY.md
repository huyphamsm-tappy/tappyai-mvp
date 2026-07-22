# TappyAI — Backend / Client Boundary

> Part of the `docs/ios/` design dossier. Defines exactly what the client does vs what the backend does, so Android and iOS stay **extremely thin** and can never drift from Web. Derived from the production architecture (docs 04, 05, 07).

## 1. Governing rule

**Clients render and capture. The backend decides.**

No product decision — pricing, quotas, gating, ranking, moderation, AI orchestration — is ever computed on a client. Clients send inputs and render server outputs. This is how three platforms produce one product: they share one brain (Backend + Supabase), and swap only the skin.

If a rule lived on the client, each platform could implement it differently → drift. Therefore **every rule lives server-side**, and the client's copy (if any) is a UX affordance only, never the enforcement point.

## 2. Logic that MUST remain server-side forever

These are **backend-owned** and must never be re-implemented as the source of truth in any client:

| Domain | Why server-only | Where today |
|--------|-----------------|-------------|
| **Prompt building** | System prompt, VN scope-lock, context injection, safety framing | `src/lib/ai/promptBuilder.ts` |
| **AI orchestration** | Tool routing, intent → tool state machine, multi-step agent loop, stream transforms | `src/app/api/chat/route.ts`, `src/lib/ai/*` |
| **AI routing / model choice** | Provider/model selection (provider-abstracted; AI_PLATFORM.md), tool-choice, budget brand-rewrite | `src/lib/ai/llm` (capability layer + adapters), `budget.ts`, `intent.ts` |
| **Recommendation engine** | 6-signal scoring, hidden-topic penalty, candidate aggregation | `src/lib/recommendation/*`, `/api/recommendations` |
| **Learning / preference engine** | Signal collection, time-decay, taxonomy affinity propagation | `src/lib/preferences/*` |
| **Feed ranking** | Trending score, cold-start, city boost | `/api/reviews/feed` |
| **Membership / entitlement logic** | Free vs Pro, entitlement resolution, provider reconciliation | `subscriptions` + Stripe/StoreKit verify |
| **Pricing behavior** | FX rates, gold, price display rules, "tham khảo" labeling, no fabrication | `/api/rates`, chat tools |
| **Quota calculation** | Anon 5/day, free 15/day, per-IP flood caps, VN-midnight rollover | `/api/chat`, `rateLimit.ts` |
| **Moderation** | `is_hidden`, review reports, music takedown, `is_active` kill-switch | reviews/music routes + DB |
| **Feature gating** | Verified-badge to post, 1-review/place, onboarding gate, login walls | reviews route, `getRequestUser` |
| **Counters** | like/save/comment/follow/watch counts via `SECURITY DEFINER` triggers/RPC | DB (05) |
| **Auth token issuance / OAuth exchange** | Supabase Auth, Zalo PKCE bridge, calendar CSRF | `/api/auth/*`, `/api/integrations/*` |
| **Payment verification** | Stripe webhook / StoreKit receipt verification → entitlement write | `/api/webhooks/stripe`, future `/api/iap/apple/verify` |
| **Media tokens** | Vercel Blob upload authorization | `/api/upload/*` |
| **Secrets** | AI provider adapter credentials (held inside the provider layer only), Stripe, Serper, VAPID, service-role keys | server env only |

**iOS must call the backend for all of the above.** It must never embed any AI provider key, compute quotas locally as the enforcement point, rank the feed itself, or decide entitlement client-side.

## 2b. Client layering follows the Thin Client (no pass-through layers)

Because the client is thin, its internal layering must stay thin too. Default per-feature layering is **View → ViewModel → Repository → data source**. A **UseCase object is added ONLY where genuine client-side business logic exists** — e.g. feed player orchestration, chat stream assembly/marker extraction, optimistic same-sign-delta revert, the deterministic fortune/split-bill engines, entitlement resolution. A UseCase that only forwards to a Repository is a pass-through and is **forbidden**. Every layer must justify its existence or be removed (see ADR-001 amendment).

## 3. Client responsibilities (thin)

The client (iOS/Android/Web) is responsible only for:

- **Rendering** server outputs: chat stream + structured markers, feed items, cards, recommendations, prices, counts.
- **Capturing** user input: text, media, form fields, gestures, permissions.
- **Local-only UX**: navigation, animation, theme, language selection, optimistic UI (with server-confirmed revert), haptics, accessibility.
- **Direct RLS-bound reads/writes** that the backend explicitly delegates to the client via Supabase anon key (see §4).
- **Platform integration**: media playback (AVPlayer), camera/photos, CoreLocation, APNs registration, StoreKit purchase UI, Keychain token storage.
- **Purely local computation that is not a product rule**: split-bill arithmetic, the deterministic fortune engine (ported data banks), QR generation, currency display formatting. These are safe on-device because they are deterministic and identical to Web by construction.

> Even "local" tools (fortune, split-bill) are *ports of Web logic*, not new logic. They must produce byte-identical results to Web. If the algorithm ever changes, it changes on Web first (source of truth) and is re-ported.

## 4. Delegated direct-Supabase operations (allowed on client)

The backend intentionally lets clients hit Supabase directly under RLS for non-privileged data. iOS may do these directly (anon key + Bearer for `auth.uid()`):

- Read public/catalog: reviews feed rows, music catalog, public profile columns, comments, groups.
- Read self-scoped: own preferences, own memory, own saves/favorites, own price-watches.
- Write junction rows: like/save/follow inserts-deletes (counts update via triggers — never write counts).
- Call whitelisted RPCs: `music_increment_play`, count functions.

Everything else goes through Next.js. When in doubt: **if it enforces a rule or touches a secret, it's server-side.**

## 5. Anti-duplication checklist (enforce in review)

- [ ] No quota/limit number is the enforcement point on the client (server returns 401/429).
- [ ] No ranking/scoring/recommendation math on the client.
- [ ] No prompt text or model selection on the client.
- [ ] No entitlement decision on the client (read the server's entitlement).
- [ ] No moderation decision on the client.
- [ ] No secret/key in the client binary.
- [ ] Any on-device algorithm (fortune/split-bill) is a verified port of Web, changed only when Web changes.
- [ ] Native never names or knows an AI provider/model — enforced on Web by the Architecture Guard; the same rule applies to native code and docs.

## 6. Why this keeps the platforms aligned

Because the brain is shared and centralized, a rule change (e.g. 15→20 free messages, a new safety constraint, a re-tuned ranking) happens **once** on the backend and all three clients change behavior simultaneously with **zero client edits**. The clients are interchangeable skins over one product. That is the structural guarantee of long-term parity.
