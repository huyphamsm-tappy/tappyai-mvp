# Stripe `checkout` / `portal` — contract, authentication and a safe restriction PROPOSAL (2026-10-10)

Status: **review and proposal only. No route, flag or payment behaviour was changed; subscriptions were not enabled.** Baseline `23c34a2`. The production value of `SUBSCRIPTIONS_ENABLED` is **UNVERIFIED** (no authorised production evidence was available; nothing was requested from production).

## 1. Contracts (read from `src/app/api/stripe/{checkout,portal}/route.ts`)
| | `POST /api/stripe/checkout` | `POST /api/stripe/portal` |
|---|---|---|
| Request | no body is read | no body is read |
| Order of checks | flag → session → work. `subscriptionsEnabled()` true ⇒ `404` (empty body) before anything else; no user ⇒ `401 {error:'unauthorized'}` | same |
| Authentication | `getRequestUser`: **any session with a user id, including an anonymous Supabase session** (`is_anonymous = true`); `anonymousWriteBoundary` records both routes as "payment session / billing portal for the calling account" | same |
| Side effects | service-role read of `billing_customers`; if none: **`stripe.customers.create`** (email = `user.email`, absent for anonymous; metadata `supabase_user_id`) and an **upsert into `billing_customers`**; then **`checkout.sessions.create`** (mode `subscription`, price `STRIPE_PRO_PRICE_ID`, card, locale `vi`, success/cancel URLs from `serverEnv.siteUrl()` or the Vercel default) — one new Checkout Session per call | service-role read of `billing_customers`; none ⇒ `400 {error:'no_subscription'}`; else **`billingPortal.sessions.create`** per call |
| Success | `200 {url}` | `200 {url}` |
| Failure | any exception ⇒ `500 {error:'checkout_failed'}` (logged) | `500 {error:'portal_failed'}` |
| Import-time dependency | `new Stripe(process.env.STRIPE_SECRET_KEY!)` at module load (a missing key breaks the module, not just the call) | same |
| Webhook | separate `webhooks/stripe` route, signature-verified, writes `subscriptions` on `checkout.session.completed` / `customer.subscription.updated|deleted`; **not** flag-gated, not affected by this proposal | – |
| Limiter | **none** | **none** |

## 2. Findings (verified in code and tests)
1. **Live under the default.** `flags.ts` default is off; `.env.local.example` ships `SUBSCRIPTIONS_ENABLED=false`; the release notes say it is not set; `payments/flagGate.test.ts` shows flag off ⇒ the routes run (`401` for a signed-out caller, not `404`). They are `404` only while the flag is on (the SePay/VietQR rail replaces them).
2. **No caller in the repository** (Web `src`, Android, iOS: no reference to either path; the old Web `SubscriptionView` is gone). The route source comment says Stripe "does not onboard individual Vietnamese sellers", i.e. the path is not commercially usable for the current seller.
3. **Anonymous sessions can reach Stripe.** An anonymous identity is cheap to mint, and each one can create a Stripe customer object (no email) plus a `billing_customers` row, and unlimited Checkout/Portal sessions. Cost per call is not metered by Stripe, but it pollutes the live Stripe account, grows a table, and consumes Stripe's per-account API rate limit; the key is shared with the webhook route.
4. **A subscription bought by an anonymous identity would be stranded**: the claim flow carries only conversations into the account a visitor later signs into (`socialWriteAccess.ts`), so the anonymous tier cannot have a legitimate paid flow.
5. Production and Preview carry the Stripe keys (finding F-062 in `docs/uat/findings.json`); whether the key works is unverified.

## 3. Proposal (nothing implemented; subscriptions stay as they are)
**P-1 Refuse anonymous sessions** with the existing `403 {error:'account_required'}` (the shape `refuseAnonymousSocialWrite` returns), placed **after** the `401` check and **after** the flag check. Behaviour for signed-in users: unchanged.
**P-2 A per-user shared limit** via `publicRateLimit('stripe-checkout:<user.id>', 10, 1 h)` and `('stripe-portal:<user.id>', 10, 1 h)`, placed after P-1 and **before** any Stripe or database call, refusing through `rateLimitedResponse` (`429`, `X-RateLimit-Reason`, `Retry-After`). Basis for the numbers (a judgement, not a measurement): a person starts a purchase or opens the portal a handful of times an hour at most; precedent `profile` 10/hour. Store semantics: the shared helper's default (shared when configured, in-process when none is configured, **fail closed** when configured but down). Availability trade-off: during a store outage nobody can start a Stripe checkout; given there is no caller and the SePay rail is the intended path, that is acceptable; the alternative (fail-open to in-process for these two routes) needs a new helper option and is not proposed.
**P-3 Order** for both routes: flag (404) → session (401) → anonymous (403) → limiter (429) → Stripe. A refusal must not touch Stripe, `billing_customers` or the limiter store before its turn.
**P-4 Unchanged, by construction:** flag semantics, success and error response shapes and statuses for signed-in callers under the limit, the price/env variables, URLs, the webhook, and the fact that subscriptions are not enabled.
**Alternative P-A (stronger, reversible):** answer `404` for both routes unconditionally, like `/api/memory` POST. Choose it only if the owner confirms the Stripe rail is retired and no shipped client or external caller uses it (the same residual-risk reasoning as the memory route; the evidence is E4 in `WEB-HANDOFF-NOTES.md`). P-1/P-2 and P-A are alternatives; P-A makes P-1/P-2 unnecessary.

## 4. Acceptance tests (to write with the change; not written now because the change is not approved)
1. Flag on ⇒ `404` and **no** limiter counter consumed, no Stripe call (existing `flagGate` assertions kept).
2. Flag off, signed out ⇒ `401` (unchanged). Anonymous session ⇒ `403 account_required`, no limiter, no Stripe, no DB.
3. Signed-in, under the limit ⇒ the same `200 {url}` (Stripe mocked) and the same `billing_customers` upsert as today; over the limit ⇒ `429` with `reason=limit_exceeded` and **no Stripe call**; another user unaffected; window is an hour.
4. Store configured but down ⇒ `429` with `reason=store_unavailable`, no Stripe call; not configured ⇒ in-process fallback with the same limit.
5. Portal: `400 no_subscription` unchanged for a signed-in user without a customer (counted against the limit).
6. Mutations that must fail: limiter after the Stripe call, anonymous check removed, key by IP instead of user, flag check after the limiter.
7. Registry: both entries become `covered` with limiter `public`; `KNOWN_GAP_BUDGET` 5 → 3. Documented limitation retained: the ratchet proves a limiter is *called*, not that it is ordered before Stripe; test 6 is what proves the order.

## 5. Verifying the production flag (not done)
Authorised evidence only. Options for the owner, in order of strength: (a) the deployed build's env: `vercel env ls production` shows whether `SUBSCRIPTIONS_ENABLED` exists (names only), and the dashboard shows the value for non-sensitive variables (note `vercel env pull` renders sensitive values as empty — the 2026-09 forensic found 29 of 57 Production variables pulling empty); (b) `GET /api/config` of the deployed site returns `subscriptions: <boolean>` (the route is static, so the value reflects the **build** env — redeploy after a flip); (c) a request to `POST /api/stripe/checkout` without a session answers `404` if the flag is on and `401` if off. (b) and (c) are requests to production and were **not** made here.

## 6. Owner decisions
1. Retire the Stripe rail (P-A) or restrict it (P-1 + P-2)?
2. If restricted: accept 10 per hour per user and fail-closed on a store outage?
3. Provide E4 (production flag value, Stripe key validity, 30-day traffic to `/api/stripe/*`).
