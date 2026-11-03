# Tappy Business — P2.1: guest order creation

> **Scope:** a guest places an order. **No tracking endpoint yet** (P2.2), no merchant
> Accept/Reject, no claim, no cancellation, no payment, delivery, refund or inventory.
> **Architecture:** [`PHASE_0_ARCHITECTURE.md`](PHASE_0_ARCHITECTURE.md) · **P1:** [`P1_API.md`](P1_API.md)

## `POST /api/public/business/orders`

| | |
|---|---|
| **Auth** | None. The customer has no Tappy account and is not asked for one. |
| **Authorization** | None to apply — but merchant ownership is **derived from the product**, never from the request. |
| **PII written** | Customer name, phone, address, note. Nothing is returned to the caller. |
| **Required header** | `Idempotency-Key` (8–200 chars) |
| **Optional header** | `X-Turnstile-Token` |

```jsonc
// request
{ "productPublicId": "01BX5ZZKBKACTAV9WEVGEMMVRZ",
  "quantity": 2,
  "selectedOptions": [{ "group": "Màu", "value": "Đỏ" }],
  "customer": { "name": "Nguyễn Thị Lan", "phone": "0901 234 567",
                "address": "128 Nguyễn Văn Cừ, Q5", "note": "Giao sau 18h" },
  "source": "CLIP", "sourceContentPublicId": "01J8ZA…" }

// 201 (200 on an idempotent replay)
{ "order": { "status": "PENDING", "totalAmount": 90000, "totalItems": 2,
             "currency": "VND", "totalFormatted": "90.000₫",
             "notice": "Tạm tính — chưa gồm phí vận chuyển. Shop sẽ xác nhận tổng tiền cuối cùng." },
  "trackingUrl": "https://tappyai.com/order/9f3Kx2…" }
```

**Errors** — `400 bad_request` (missing/short idempotency key, unparseable body) ·
`404 not_found` · `409 product_unavailable` · `422 validation_error` ·
`422 idempotency_conflict` · `429 rate_limited` · `503 service_unavailable` · `500 server_error`

## What the server computes, and the client cannot influence

| Value | Source |
|---|---|
| unit price, product name, currency | the product row |
| merchant | the product's `merchant_id` |
| line total, `total_amount`, `total_items` | integer arithmetic in `fn_business_create_order` |
| `status` | always `PENDING` |
| `expires_at` | `created_at + 72h` |
| tracking token | 256 bits of CSPRNG |

The schema accepts no `merchantId`, `price`, `currency`, `totalAmount`, `totalItems` or
`status`. Zod strips them, so a hostile body is inert rather than an error message that tells
the caller what the server reads.

```
product public_id (from the URL the customer opened)
  → business_products row → merchant_id → the order is created under that merchant
```

Even if a `merchantId` were read, it could not help: `business_order_items` carries composite
foreign keys into `(order_id, merchant_id)` and `(product_id, merchant_id)`, so an order whose
item names a different merchant than its product cannot be written at all.

## Anti-spam, in the order the controls run

Cheap rejections first, so a flood is refused before it costs a database round-trip.

1. **Business secret configured** — else `503`. The phone key and the idempotency record both
   depend on it; running without them means an unlimited public write that can duplicate orders.
2. **Idempotency key present**
3. **Body validation**
4. **IP rate limit** — 20/min, or 5/min when Turnstile could not reach a verdict
5. **Turnstile** — see below
6. **Product limit** 60/min · **Phone limit** 5 per 10 min, keyed by `HMAC(secret, E.164 phone)`
7. **Idempotency lookup**
8. **Product resolution**

**Turnstile has three outcomes, deliberately.** A token Cloudflare *rejects* is refused — that
is a positive signal of automation. A *missing* token or an *unreachable* verifier is `degraded`:
the order proceeds under the tighter limits above. Most Tappy Business traffic arrives inside
the Zalo and Messenger webviews where a challenge widget is unreliable, and Cloudflare's
availability must not become Tappy's. One spam order that gets through is cheaper than one real
customer who cannot buy (PHASE_0 §Clarify E).

**The phone limit never queries the phone.** It counts against a keyed HMAC in Redis;
`business_orders.customer_phone` is never read, never compared, and carries no index. The limit
exists and the enumeration §16 forbids does not.

## Idempotency

Redis, 24-hour TTL. The record holds a fingerprint of the request and the original result,
AES-256-GCM encrypted under a key derived from the Business secret.

| Situation | Result |
|---|---|
| Unseen key | proceed |
| Same key, same request | **replay** the original response, same `trackingUrl`, `200` |
| Same key, different request | `422 idempotency_conflict` |
| Redis unavailable | `503` — never proceed unprotected |

The fingerprint deliberately **excludes** the Turnstile token: it is single-use, so a legitimate
retry carries a different one and comparing it would turn every retry into a conflict.

A record that fails to decrypt — key rotation, tampering — is treated as **absent**, not
trusted. Creating a fresh order is the safe way to be wrong.

## The tracking token

256 bits of CSPRNG, base64url, 43 characters. PostgreSQL stores **only** `SHA-256(token)`; the
raw token lives in the customer's URL, the response we just sent, and the encrypted idempotency
record for 24 hours. It is never in PostgreSQL, never in a log, and is not derived from the
order id, the public id, the phone number or the clock — each of which is known to someone.

`tracking_token != order_public_id`: possessing one must not yield the other.

## Expiry

`GET /api/cron/business-order-expiry`, `CRON_SECRET` bearer, daily at 02:15.
`fn_business_expire_orders` closes PENDING orders past `expires_at` as `REJECTED` with
`actor_type='SYSTEM'`, `reason='EXPIRED'`, writing the history row in the same statement set.

The update is conditional (`WHERE status = 'PENDING'`), so a merchant accepting at hour 71:59
and the job running at the same moment cannot both succeed. Idempotent. Daily scheduling means
an order closes up to ~24h after its 72 are up — latency in the closing, not in the guarantee.

## Notification

`emitNotification` (ADR-014), `type: 'business_order'`, `category: 'system'` — transactional, so
exempt from marketing caps and opt-out by definition. Fire-and-forget: a notification failure
must never fail an order that is already written.

🚨 **The body carries no customer PII** — no name, no phone, no address. A push lands on a lock
screen; the details belong behind the merchant's authenticated dashboard.

## Schema changes (`20260909_tappy_business_p2_order_invariants.sql`)

Purely additive. Closes four deferred findings:

1. **An item cannot join a terminal order** — trigger. Grants already forbade UPDATE and DELETE;
   INSERT was the remaining way to change what a merchant had accepted.
2. **`total_amount` / `total_items` must equal the sums over the items** — a `DEFERRABLE
   INITIALLY DEFERRED` constraint trigger, checked at COMMIT so an order with **zero** items
   fails too.
3. **`expires_at > created_at`** — CHECK.
4. **VND only** — CHECK on all three money-bearing tables, added alongside P0's `^[A-Z]{3}$`
   rather than replacing it, so the P0 migration stays exactly as reviewed.

Plus `fn_business_create_order` (the transaction boundary — Supabase REST has none across
statements, and an order with no item would be unrepairable) and `fn_business_expire_orders`.
Both `SECURITY DEFINER`, both revoked from `PUBLIC, anon, authenticated` and granted to
`service_role` alone (ADR-019).

## Deployment prerequisite

`TAPPY_BUSINESS_SECRET` — one secret, ≥32 characters. Two purpose-scoped keys are derived from
it by HMAC (`phone-rate-limit`, `idempotency-encryption`), so knowing one reveals neither the
other nor the root. One variable rather than two is one thing to rotate and one chance to get
wrong. **Without it, order creation returns `503`** — a missing secret is a reason to refuse,
not to skip the control.

`TURNSTILE_SECRET_KEY` is optional; unconfigured means `degraded`, never `passed`, so removing
it cannot silently switch the control off.
