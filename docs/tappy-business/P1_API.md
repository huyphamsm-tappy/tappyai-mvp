# Tappy Business — P1 API

> **Scope:** Merchant → Product → Public Product. **No orders exist in P1** — no order
> creation, no accept/reject, no tracking token, no customer flow.
> **Architecture:** [`PHASE_0_ARCHITECTURE.md`](PHASE_0_ARCHITECTURE.md) (frozen).

Every response uses the repository's envelope: `{ error: <machine code>, message: <localized> }`
from `src/lib/http/apiError.ts`. The `error` code is what a client branches on; `message` is
the human sentence in the caller's language and is deliberately generic — it names no table,
column, id or internal state.

## The authorization model, once

```
Controller session (getRequestUser)
   → business_merchants.controller_user_id = auth.uid()
       → MerchantContext
           → repository(ctx, …)   ← merchant_id derived here, never from the request
               → business_* tables
```

`merchant_id` is **never** read from a body, query string, path parameter or header for
authorization. `requireMerchant(req)` takes only the request, and every merchant-scoped
repository function takes `MerchantContext` as its first argument. Both facts are asserted by
function arity in `routeGuard.test.ts` and `products.test.ts`, so adding a parameter that
carries an id fails a test.

**Anonymous sessions are refused on every mutating route.** A Supabase anonymous session is
still a `user`, so "authenticated" does not mean "has an account" — and a shop belongs to a real
account. `refuseAnonymousSocialWrite` draws that line, returning `403 account_required`.
Onboarding is the load-bearing one: it is the only way a merchant row comes into existence, so
refusing there keeps every later route out of an anonymous session's reach; the rest are defence
in depth. The repository's whole-surface guard (`anonymousWriteBoundary.test.ts`, U02) is what
required this to be a decision rather than an assumption.

A product's `public_id` is an **address, not a credential**: every merchant-scoped query
carries both `public_id` and `merchant_id`, so substituting another shop's id matches zero
rows and returns `404` — the same answer as a product that does not exist.

---

## Merchant

### `POST /api/business/onboarding`

Become a merchant. The only Business route that does not take a `MerchantContext`, because it
creates one.

| | |
|---|---|
| **Auth** | Controller session (cookie or `Authorization: Bearer`) |
| **Authorization** | Any authenticated user. The shop is bound to `auth.uid()`. |
| **Rate limit** | 10 / minute per user |
| **PII** | Writes the merchant's own shop name, address, phone. No customer data. `legal_name` and `tax_or_identity_number` are **not collected** — PHASE_0 §F3. |

```jsonc
// request
{ "businessCategory": "CAFE", "shopName": "Lan Shop",
  "address": "128 Nguyễn Văn Cừ, Q5", "phone": "0901234567",
  "acceptedTermsVersion": "2026-09-08" }

// 201
{ "merchant": { "publicId": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "status": "ACTIVE" } }
```

**Validation** — `businessCategory` must be one of the eleven locked categories (the list is
asserted equal to the migration's CHECK constraint); text fields are trimmed then
length-checked; `acceptedTermsVersion` must equal the version the server is currently serving.

**Errors** — `401 unauthorized` · `409 merchant_exists` · `409 terms_outdated` ·
`422 validation_error` · `429 rate_limited` · `500 server_error`

Terms acceptance is written as a second statement, after the merchant row. The two are not one
transaction (Supabase REST has none across statements), so the ordering is chosen for a
recoverable failure: a merchant with no acceptance is detected and repaired by re-running
onboarding, which returns `409 merchant_exists` and completes the record. The reverse order
would orphan an acceptance permanently.

### `GET /api/business/me` · `PATCH /api/business/me`

The caller's own shop profile.

| | |
|---|---|
| **Auth** | Controller session → `requireMerchant` |
| **Authorization** | Resource ownership. No parameter names a shop. |
| **PII** | The merchant's own details only. |

```jsonc
// GET 200 / PATCH 200
{ "merchant": { "publicId": "01ARZ…", "businessCategory": "CAFE", "shopName": "Lan Shop",
  "address": "128 Nguyễn Văn Cừ, Q5", "phone": "0901234567", "status": "ACTIVE",
  "legalName": null, "hasTaxOrIdentityNumber": false,
  "createdAt": "…", "updatedAt": "…" } }
```

`PATCH` accepts any subset of `businessCategory`, `shopName`, `address`, `phone`.

🚨 **`status`, `legalName` and `taxOrIdentityNumber` are not writable.** Suspension is a
moderation action behind `commerce.merchants.suspend`; a merchant editing their shop name must
not be able to lift their own suspension. Zod strips the fields, and `merchants.test.ts`
asserts the repository refuses them even if they arrive.

**Errors** — `401` · `403 merchant_required` · `403 merchant_suspended` · `404 not_found` ·
`422 validation_error` · `500`

---

## Products

All four endpoints: **Auth** Controller session → `requireMerchant`; **Authorization** resource
ownership via `MerchantContext`; **PII** none — products carry no customer data.

### `GET /api/business/products`

The caller's catalogue, newest first. Soft-deleted products are excluded.

```jsonc
{ "products": [ { "publicId": "01BX…", "name": "Áo thun cotton", "description": null,
  "imageAssetKey": "products/01ARZ…/abc123.jpg", "imageUrl": "https://…/abc123.jpg",
  "priceAmount": 45000, "currency": "VND", "isAvailable": true, "status": "ACTIVE",
  "options": [], "createdAt": "…", "updatedAt": "…", "deletedAt": null } ] }
```

### `POST /api/business/products`

```jsonc
// request
{ "name": "Áo thun cotton", "description": "Cotton 100%",
  "priceAmount": 45000, "currency": "VND", "isAvailable": true,
  "imageAssetKey": "products/01ARZ…/abc123.jpg",
  "options": [ { "name": "Màu", "isRequired": false, "values": ["Đỏ", "Xanh"] } ] }
// 201 → { "product": { … } }
```

**Validation** — `name` 1–200 after trim; `description` ≤ 2000; `priceAmount` a non-negative
**integer** (a float is rejected, never rounded — VND has exponent 0, so `45000` means 45,000 ₫);
`currency` must be `VND`; at most 5 option groups of at most 20 values each, no duplicate group
names or values, no price delta and no per-variant stock (P0 §12 — extra keys are stripped).
`imageAssetKey`, when present, must be `products/{your merchant publicId}/{file}`.

**Rate limit** — 60 / minute per merchant.

**Errors** — `401` · `403` · `400 invalid_image` · `422 validation_error` · `429` · `500`

### `GET|PATCH|DELETE /api/business/products/{publicId}`

`PATCH` accepts any subset of the create fields. `imageAssetKey: null` clears the image;
omitting it leaves it untouched. When `options` is present it **replaces the whole set** —
there is no per-option endpoint, because an option only exists inside a product that is already
authorized, and addressing one directly would create a second thing to authorize.

`DELETE` is a **tombstone, never a removal** (P0 §9, §11): `status='DELETED'`, `deleted_at` set,
`is_available=false`, and the options cleared. `service_role` holds no `DELETE` privilege on
this table, so a hard delete is unavailable even by mistake. The public URL keeps resolving —
a link a merchant posted to Facebook outlives the product.

**Errors** — `401` · `403` · `404 not_found` (also for another merchant's id, and for a
malformed one) · `400 invalid_image` · `422 validation_error` · `500`

---

## Media

### `POST /api/business/media/upload-intent`

Authorizes one client-direct product-image upload. Reuses the platform media pipeline
unchanged — this route contributes authorization and nothing else; it does not choose the
object name, touch storage, or process the image.

```jsonc
// request
{ "type": "media.create-upload-session", "kind": "productImage",
  "contentType": "image/jpeg", "size": 812345 }
// 200 → { "provider": "gcs", "uploadUrl": "…", "url": "…", "key": "products/01ARZ…/abc123.jpg" }
```

🔑 **The owner id is the merchant's PUBLIC id.** `resolveUploadTarget` builds every key as
`{prefix}/{ownerId}/{random}.{ext}`, so the shop is stamped into the path, and product
create/update refuse any key whose second segment is not the caller's own id. That is what
stops one merchant pointing a product at another merchant's image — or at `avatars/…`, which is
somebody's face. The public id is used rather than the internal UUID because the bucket is
publicly readable and the key ends up in a URL.

The bucket being public also makes this an **integrity** control, not a confidentiality one: a
shared image leaks nothing a product page would not already show. What it prevents is a product
displaying an arbitrary object from the store.

Accepts JPEG, PNG, WebP up to 6 MB. SVG is excluded — a product photo is never a vector, and
SVG carries script. **Rate limit** 60 / minute per merchant.

**Errors** — `401` · `403` · `400 bad_request` · `429` · media-policy `4xx` · `502`

---

## Public

### `GET /api/public/business/products/{publicId}`

The customer-facing read — the link a merchant shares to Facebook and Zalo.

| | |
|---|---|
| **Auth** | None |
| **Authorization** | None to apply. Possession of the public id is the whole access model, which is why it is a 26-character ULID with 80 random bits. |
| **PII** | **None.** The product, the shop's display name, nothing else. |
| **Rate limit** | 120 / minute per IP |

```jsonc
{ "product": { "publicId": "01BX…", "name": "Áo thun cotton", "description": "Cotton 100%",
  "imageUrl": "https://…/abc123.jpg", "priceAmount": 45000, "currency": "VND",
  "priceFormatted": "45.000₫", "isAvailable": true, "status": "ACTIVE",
  "isOrderable": true, "options": [ … ], "shop": { "name": "Lan Shop" } } }
```

**Never exposed** — internal UUIDs (product or merchant), `imageAssetKey`, `createdAt`,
`updatedAt`, `deletedAt`, the merchant's address, phone, legal name or tax number, any terms
record, and any customer data. The response is built by allow-list in `src/lib/business/views.ts`,
and `views.test.ts` drives a row carrying every one of those poisoned fields through it.

`isOrderable` is computed server-side because a suspended shop or a retired product must stop
selling the moment the flag flips; a client deciding for itself would keep selling until it
next reloaded. It is `false` unless the product is `ACTIVE`, the shop is `ACTIVE`, and
`isAvailable` is true.

A retired or unpublished product **still resolves**, reporting `status: "RETIRED"` and
`isOrderable: false` (P0 §11). `UNPUBLISHED` and `DELETED` collapse to the same customer-facing
state — a customer has no business learning whether a product was withdrawn by its merchant or
unpublished by moderation. A genuinely unknown or malformed id is `404`.

**Errors** — `404 not_found` · `429 rate_limited` · `500 server_error`. Read-only: there is no
mutating verb on this path.
