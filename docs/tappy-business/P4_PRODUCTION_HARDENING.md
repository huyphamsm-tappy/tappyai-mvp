# Tappy Business — P4: production hardening

> Final MVP hardening phase. **No new product surface.** Two defects fixed, one deferred
> finding closed, the rest is verification and documentation.
> **Phases:** [P0](PHASE_0_ARCHITECTURE.md) · [P1](P1_API.md) · [P2.1](P2_1_ORDER_CREATION.md) ·
> [P2.2](P2_2_ORDER_TRACKING.md) · [P3](P3_MERCHANT_ORDER_MANAGEMENT.md)

## Final MVP architecture

```
Controller (identity · admin RBAC/PDP · audit · notifications)
        ↓
Tappy Business  — SoT for commerce
  src/lib/business/
    authz.ts routeGuard.ts       Controller session → MerchantContext
    schema.ts views.ts           validation in, allow-list out
    ids.ts money.ts tracking.ts secrets.ts idempotency.ts masking.ts logging.ts
    repositories/                ← the ONLY place a business_* table name may appear
        ↓
  9 tables · 4 SQL functions · service_role only · RLS on, no policies
```

Guest surface: product page → order → tracking. Merchant surface: onboarding, catalogue,
order inbox, accept/reject. No UI in any phase.

## Order state machine — now the schema's

```
PENDING ──┬── ACCEPTED   (MERCHANT)
          ├── REJECTED   (MERCHANT)
          └── REJECTED   (SYSTEM, expiry)     ACCEPTED / REJECTED are terminal
```

Enforced at four layers, and P4 added the one that was missing:

| Layer | What it stops |
|---|---|
| `business_order_status_history` `from_status` CHECK | *recording* a move out of a terminal state |
| `fn_business_transition_order` (`FOR UPDATE` + conditional UPDATE) | two callers both transitioning |
| `fn_business_expire_orders` (conditional UPDATE) | expiry touching an answered order |
| **`trg_business_orders_enforce_lifecycle` (P4)** | **any direct UPDATE mutating a terminal order** |

Before P4 the last row did not exist. P0's CHECK constrains the *value* of `status`, never the
*transition*, and `service_role` holds UPDATE — so a direct
`UPDATE business_orders SET status='PENDING'` on an accepted order would have succeeded. Nothing
did it, but that was a property of the code, not of the schema.

The same trigger freezes seven columns after INSERT — `public_id`, `merchant_id`,
`tracking_token_hash`, `total_amount`, `total_items`, `currency`, `source` — and makes
`claimed_by_user_id` write-once, closing that deferred finding. `customer_*` stay writable
because the retention job nulls them in place; `created_at` / `expires_at` stay writable because
moving an expiry is an operational act, not an escalation.

## Customer handoff after ACCEPTED

**Already provided by the approved model — no new field, no new system.** `business_merchants`
carries the shop's `phone`, and P2.2's tracking view exposes
`shop: { name, phone }` where `phone` is non-null **only** when the order is `ACCEPTED`.

That is the whole handoff (P0 §29): Tappy stops managing the transaction, the customer is told to
contact the shop, and the shop's number is there to do it with. Before `ACCEPTED` — and after
`REJECTED` — the phone is `null`, so a leaked tracking link never becomes a directory of merchant
phone numbers. Verified end to end against a real database.

No chat, messaging, customer account, payment, delivery, booking, fulfilment or CRM was added.

## Tracking security model

Unchanged from P2.2 and re-verified against the final lifecycle. The 256-bit bearer token is the
only authorization mechanism; PostgreSQL stores only `SHA-256(token)`; the token travels in
`X-Tracking-Token`, never a URL path. No lookup by order id, phone or merchant exists. A
malformed and an unknown token get byte-identical `404`s. `X-Robots-Tag: noindex, nofollow`,
`Referrer-Policy: no-referrer` and `Cache-Control: no-store` are on **every** response including
errors, and pinned again in `next.config.mjs`.

## PII handling

| Data | Where | Exposure |
|---|---|---|
| `customer_name/phone/address/note` | `business_orders`, **unindexed** | masked on public tracking; unmasked to the owning merchant only |
| Tracking token | customer's URL, response, encrypted Redis record (24h) | **never in PostgreSQL**, never in a log |
| Token digest | `business_orders.tracking_token_hash` | never in any API response |
| Phone (rate limiting) | `HMAC(secret, E.164)` in Redis | never a plaintext key, never a query |
| `legal_name`, `tax_or_identity_number` | columns exist, **not collected** | no code writes them |
| Notification body | Controller notifications | product name + total only — **no customer PII on a lock screen** |
| Logs | `logBusinessError` / `logBusinessEvent` | scope, error class, SQLSTATE, public reference — nothing else |

**P4 fixed a real leak here.** Every Business route was passing the caught error object to
`console.error`. PostgreSQL puts the offending row into an error's `detail`, so a single CHECK
violation on `business_orders` would have written
`Failing row contains (…, Nguyễn Thị Lan, 0901234567, 128 Nguyễn Văn Cừ…)` into the platform
log — a store with different retention and a different audience than the database. All 18 call
sites now go through `logBusinessError`, which logs the failure's *shape* and never its message,
details or hint.

## Retention — a decision that is still owed

> ⚠️ **SUPERSEDED BY [P5](P5_DATA_RETENTION.md).** The provisional 90-day rule described below
> was researched against current Vietnamese law in P5 and found to have **no legal basis, and to
> point the wrong way**: Luật Thương mại điện tử 122/2025/QH15 Art. 17(2)(i) requires an
> intermediary platform to keep contract data for **≥3 years** (≥1 year under the SME carve-out).
> A 90-day anonymisation job would have destroyed records the platform must keep. No such job was
> ever built. The section below is kept as the record of what P4 verified.

P0 §37 requires a retention policy before production. [P0 §8](PHASE_0_ARCHITECTURE.md) stated
one — customer PII nulled 90 days after an order reaches a terminal state, order row and
non-PII retained for audit — and P4 verified the schema **permits** it: the trigger deliberately
leaves `customer_*` writable, and a test proves the nulling update succeeds while the order
survives.

🚨 **No deletion job has been implemented, and that is deliberate.** The 90-day figure has not
been ratified by anyone with the authority to choose it, and Vietnamese personal-data rules may
set their own floor. Encoding a destructive job around an unratified number is the one mistake
that cannot be undone later.

**Needs a product/legal decision:** the retention period; whether an order under an open
moderation report is exempt; whether `order_status_history` (non-PII) is kept indefinitely.
Once decided, the job is a cron route plus one `UPDATE` — the schema is ready for it.

## Turnstile

Three outcomes, unchanged and re-verified: Cloudflare *rejecting* a token → refused;
a *missing* token or an *unreachable* verifier → `degraded`, order proceeds under tightened
limits (IP 20→5/min, phone 5→3 per 10 min); accepted → `passed`. Unconfigured is `degraded`,
never `passed`, so removing the variable cannot switch the control off. The token is never
persisted and is excluded from the idempotency fingerprint — it is single-use, so comparing it
would turn every legitimate retry into a conflict.

## Idempotency

Guest order creation: Redis, 24h TTL, AES-256-GCM. Replay returns the original response with the
same tracking URL; same key + different request → `422`; **Redis unavailable → `503`, never
proceed unprotected**; a record that fails to decrypt is treated as absent, not trusted; a
storage failure loses the replay, never the order.

Merchant transitions: **state-based, not key-based** — the target state is the token. Re-accepting
an already-accepted order is `200 alreadyApplied:true` with no second history row; accepting a
rejected one is `409`.

## Rate limiting

`distributedRateLimit` (Upstash) **fails closed**. Order creation therefore requires Redis, which
is consistent: idempotency requires it too, and a public write endpoint with neither control is
worse than one that is briefly unavailable. Public tracking is 60/min per IP; merchant mutations
60/min per merchant; onboarding 10/min per user.

## Authorization

```
Controller session → business_merchants.controller_user_id = auth.uid()
  → MerchantContext → repository(ctx, …) → business_* tables
```

`merchant_id` is never read from a body, query, path or header. For order transitions the scope
is inside the SQL lookup, so another merchant's order is a `404`, not a `403`. Anonymous sessions
are refused on every mutating merchant route (U02); guest order creation is the one explicitly
exempt mutating route, and it is read-only with respect to merchant identity — ownership comes
from the product.

## Database transaction boundaries

Supabase REST has no transaction across statements, so anything that must be atomic is a
function: `fn_business_create_order` (order + item + opening history),
`fn_business_transition_order` (status + history, row-locked),
`fn_business_expire_orders` (conditional update + history, `SKIP LOCKED`). All three are
`SECURITY DEFINER` with `SET search_path = public`, revoked from `PUBLIC`, `anon` **and**
`authenticated`, granted to `service_role` only — verified by a catalogue query in the P4 suite,
not by reading the migration.

## Deployment prerequisites

| Variable | Required | Missing behaviour |
|---|---|---|
| `TAPPY_BUSINESS_SECRET` (≥32 chars) | **yes** | order creation returns `503`; never degrades |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | **yes** for ordering | rate limiter fails closed; idempotency `503` |
| `TURNSTILE_SECRET_KEY` | no | `degraded` — tighter limits, never `passed` |
| `CRON_SECRET` | **yes** for expiry | the expiry route returns `401` |

**Migration order** (each additive, none relaxes a reviewed constraint):
`20260908` P0 schema → `20260909` P2.1 invariants + create/expire → `20260910` P3 transition →
`20260911` P4 lifecycle trigger.

**Cron:** `/api/cron/business-order-expiry`, daily `15 2 * * *`. Daily means an order closes up to
~24h after its 72 are up — latency in the closing, not in the guarantee.

## Observability

`logBusinessError(scope, error, { reference, outcome })` and `logBusinessEvent(event, ctx)` are
the only ways Business writes to the log. They emit the scope, the error class, the SQLSTATE and
a public order reference.

**Never logged:** raw tracking token, token hash, customer phone/address/name, request bodies,
`TAPPY_BUSINESS_SECRET`, Turnstile secrets or tokens, Redis ciphertext, SQL messages, `details`
or `hint`.

## Known limitations and deferred findings

| Finding | Status |
|---|---|
| `claimed_by_user_id` write-once | **fixed in P4** (trigger) |
| MerchantContext serializer | **resolved by test** — every mapper is asserted against a poisoned row; no route spreads a context |
| Status-history consistency | **deferred, documented.** All writes go through the two functions; a contradictory row needs direct `service_role` access, which can already do worse. A `to_status = orders.status` trigger would add complexity for an attacker who is already inside |
| Rollback script | **deferred.** All four migrations are purely additive; rollback is a `DROP`. Adding one now would be speculative tooling |
| No retention job | **blocked on a product/legal decision** — see above |
| No UI | Deliberate across all phases; the merchant surface is API-only |
| Daily expiry latency | Accepted; documented in P2.1 |

## SCOPE CREEP / FUTURE — identified, not implemented

- **Merchant staff accounts.** One Controller identity = one merchant. A restaurant with shifts
  will want more; `UNIQUE(controller_user_id)` becomes a join table, deliberately, later.
- **Customer notification on Accept/Reject.** Would need a customer identity to notify; the guest
  has none. Belongs with order claiming (Phase 1.5).
- **Bulk reject.** P0 §27 lists it for spam handling; the reason enum already has `SPAM`.
- **Moderation surface.** `COMMERCE_MERCHANTS_*` permissions and `business_product_reports` exist
  and are unused — suspend/unpublish has no route yet.

## Explicit non-goals — confirmed not implemented

Customer registration/login, customer accounts, order claiming, cancellation, payment, wallet,
escrow, shipping, delivery, fulfilment, refunds, disputes, loyalty, coupons, CRM, inventory
engine, marketplace search, ranking, checkout, accounting, analytics platform, chat,
review/rating, CS-Cart-specific logic. No new order state.
