# Tappy Business — P2.2: secure order tracking

> **Scope:** the customer follows their order. **Read-only.** No Accept/Reject, no accounts,
> no claiming, no cancellation, no customer notifications.
> **Builds on:** [`P2_1_ORDER_CREATION.md`](P2_1_ORDER_CREATION.md) · [`PHASE_0_ARCHITECTURE.md`](PHASE_0_ARCHITECTURE.md)

## `GET /api/public/business/orders/track`

| | |
|---|---|
| **Auth** | None. The customer has no Tappy account (P0 §22). |
| **Authorization** | The 256-bit bearer tracking token minted by P2.1, and nothing else. |
| **Input** | `X-Tracking-Token` request header. One input; there is no other. |
| **Rate limit** | 60/min per IP |

```jsonc
// 200
{ "order": {
    "reference": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "status": "PENDING",
    "statusTitle": "Đã đặt hàng",
    "statusDetail": "Shop đang xử lý đơn hàng.",
    "placedAt": "2026-09-09T00:00:00Z", "updatedAt": "2026-09-09T00:00:00Z",
    "items": [{ "name": "Áo thun cotton", "quantity": 2,
                "options": [{ "group": "Màu", "value": "Đỏ" }], "lineTotal": 90000 }],
    "totalItems": 2, "totalAmount": 90000, "currency": "VND",
    "totalFormatted": "90.000₫",
    "notice": "Tạm tính — chưa gồm phí vận chuyển. Shop sẽ xác nhận tổng tiền cuối cùng.",
    "customer": { "name": "Nguyễn Thị L.", "phone": "09••••567",
                  "address": "••• Nguyễn Văn Cừ, Q5" },
    "shop": { "name": "Lan Shop", "phone": null } } }
```

**Errors** — `400 bad_request` (no token) · `404 not_found` · `429 rate_limited` · `500 server_error`

## Token lookup and security model

The token is the one minted in P2.1 — no second scheme, no second hashing implementation:
256 bits of CSPRNG, base64url, 43 characters, and PostgreSQL permanently stores **only**
`SHA-256(token)` in `business_orders.tracking_token_hash` (UNIQUE, `octet_length = 32`).

```
X-Tracking-Token  →  hashTrackingToken()  →  findOrderByTrackingHash(digest)
                                                → UNIQUE index probe
```

`findOrderByTrackingHash` takes **one argument** and it is the digest. There is no lookup by
`order_public_id`, phone, merchant or session — adding a second parameter would be adding a
second authorization mechanism. The repository also drops the order's internal `id` before
returning, so a value that never leaves the repository cannot be leaked by a later change to
the response mapper.

**Why the token is a header, not a path segment.** A URL path is written to access logs, CDN
logs, APM traces, and the `Referer` of everything the page loads. A request header is written to
none of those. The customer-facing page lives at `/order/<token>` — the token is in the URL bar,
where the customer put it — and reads its own token to call this endpoint.

**Deviation from the P0 sketch, recorded:** P0 §7 showed the page sending `SHA-256(token)` as
`X-Tracking-Hash`. That is not done. Once the token is in a header it is already out of the
logs, so hashing in the browser buys nothing — and it would put a second implementation of the
hashing scheme in client code, where it could drift from the server's.

## Response allow-list

Built field by field in `toTrackingView` (`src/lib/business/views.ts`). Nothing is spread.

**Exposed:** `reference` (the order's public id), `status`, `statusTitle`, `statusDetail`,
`placedAt`, `updatedAt`, `items[]` (name / quantity / options / lineTotal), `totalItems`,
`totalAmount`, `currency`, `totalFormatted`, `notice`, `customer` (masked), `shop`.

**Never exposed:** the raw token, the token hash, any internal UUID (order, item, merchant,
product), the merchant's controller user id, status-history actor ids, unmasked phone or
address, `expires_at`, `source` / `source_content_public_id`, idempotency internals, rate-limit
internals, or any database or security diagnostic.

`reference` is the order's **public id**, and it is not a credential: it cannot be exchanged for
the tracking token, and this endpoint does not accept it as input.

## PII masking

No shared masking helper existed. `src/lib/business/masking.ts` follows the philosophy of
`maskEmail` in `src/lib/admin/users/fieldVisibility.ts` — **fixed-width masks** so length is not
leaked, and **reveal nothing** for a value that is not the shape expected. The admin module's
functions are deliberately not imported: that would pull the admin permission model into a
public customer surface.

| Field | Rule | Example |
|---|---|---|
| Phone | first 2 digits + fixed `••••` + last 3; `•••` below 8 digits | `0901234567` → `09••••567` |
| Address | drop the first whitespace token (the house number), cap at 60 chars | `128 Nguyễn Văn Cừ, Q5` → `••• Nguyễn Văn Cừ, Q5` |
| Name | last name-part reduced to an initial | `Nguyễn Thị Lan` → `Nguyễn Thị L.` |

⚠️ **Stated plainly: the address mask reveals the street.** That is the locked P0 §24 example
and a deliberate trade — an address a customer cannot verify defeats the purpose of echoing it
back. A street without a house number does not reach anybody's door, but this is not anonymity,
and an address written in an unusual order (`Số 5 ngõ 12 …`) keeps a digit that a
house-number-first address would not.

**The shop's phone appears only after `ACCEPTED`** (P0 §29): Tappy stops managing the
transaction at that point, so the customer must be able to reach the shop — and before it, a
leaked link must not become a directory of merchant phone numbers.

## Security headers

`X-Robots-Tag: noindex, nofollow` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store, max-age=0`

Set in two places on purpose. The route applies them to **every** response including the errors
— a 404 that omitted `no-referrer` would still leak the token in the `Referer` of whatever the
error page loaded. `next.config.mjs` pins the same two after its catch-all rule, because the
baseline `Referrer-Policy: strict-origin-when-cross-origin` applies to `/:path*` and would
otherwise still send this origin; a later rule wins for a duplicate key.

## Error and enumeration behaviour

A malformed token, an unknown token and an internal failure are deliberately not
distinguishable to a caller:

- malformed (fails the 40–64 base64url shape check) → `404`, and it is never hashed or looked up
- well-formed but unknown → `404`, **identical body**
- an exception → `500` with the generic catalogue message; no stack, host or table name

Telling a malformed token from an unknown one would confirm that a well-formed token is a real
order. The status semantics carry exactly `PENDING` / `ACCEPTED` / `REJECTED`; an unrecognised
stored status is reported as `PENDING` rather than echoed.

Expiry is unchanged and remains P2.1's: `PENDING → REJECTED`, `actor = SYSTEM`,
`reason = EXPIRED`. Tracking reflects it; it does not perform it.

## Anonymous route declaration

Read-only, so the U02 whole-surface guard (`anonymousWriteBoundary.test.ts`) does not classify
it: that guard covers `POST|PUT|PATCH|DELETE`, and adding a read-only route to its `EXEMPT` map
would fail its own staleness assertion. The mutating sibling —
`POST /api/public/business/orders` — carries the explicit exemption entry made in P2.1. The
guard was not weakened, bypassed or disabled.

## Deployment prerequisites

None beyond P2.1's. No new environment variable, no new dependency, no schema change.
