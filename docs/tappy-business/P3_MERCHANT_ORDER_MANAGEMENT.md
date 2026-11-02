# Tappy Business — P3: merchant order management

> **Scope:** the merchant sees incoming orders and answers them.
> **Builds on:** [`P2_1_ORDER_CREATION.md`](P2_1_ORDER_CREATION.md) ·
> [`P2_2_ORDER_TRACKING.md`](P2_2_ORDER_TRACKING.md) · [`PHASE_0_ARCHITECTURE.md`](PHASE_0_ARCHITECTURE.md)

## Endpoints

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/business/orders` | — (`status`, `limit`, `cursor` query) |
| `GET` | `/api/business/orders/{publicId}` | — |
| `POST` | `/api/business/orders/{publicId}/accept` | **none** |
| `POST` | `/api/business/orders/{publicId}/reject` | optional `{ reason }` |

All four: Controller session → `requireMerchant`. The two `POST`s additionally refuse anonymous
sessions (`refuseAnonymousSocialWrite`, U02) — a shop belongs to a real account.

```jsonc
// GET /api/business/orders?status=PENDING&limit=20
{ "orders": [ { "reference": "01ARZ…", "status": "PENDING",
                "placedAt": "…", "updatedAt": "…", "expiresAt": "…",
                "customerName": "Nguyễn Thị Lan", "customerPhone": "0901234567",
                "totalItems": 2, "totalAmount": 90000, "currency": "VND",
                "totalFormatted": "90.000₫", "source": "DIRECT" } ],
  "page": { "cursor": "MjAyNi0wOS0xMFQ…", "hasMore": true } }

// POST …/accept  → 200
{ "order": { "reference": "01ARZ…", "status": "ACCEPTED", "updatedAt": "…" },
  "alreadyApplied": false }
```

**Errors** — `401` · `403 merchant_required` / `merchant_suspended` / `account_required` ·
`404 not_found` · `409 order_not_pending` · `422 validation_error` · `429 rate_limited` · `500`

## Authorization model

```
Controller session → business_merchants.controller_user_id = auth.uid()
  → MerchantContext → repository(ctx, …) → business_* tables
```

`merchant_id` is never read from a body, query, path or header. For the transition it goes
further: the merchant scope is **inside the SQL lookup**, so another merchant's order matches
zero rows and produces the same `404` as an order that does not exist. Knowing a real public id
gains nothing.

## State machine and transition semantics

Unchanged from P0 — no new state:

```
PENDING ──┬── ACCEPTED   (merchant)
          ├── REJECTED   (merchant)
          └── REJECTED   (SYSTEM, expiry — P2.1)
```

`ACCEPTED` and `REJECTED` are terminal. `ACCEPTED → ACCEPTED`, `ACCEPTED → REJECTED`,
`REJECTED → ACCEPTED` and `REJECTED → REJECTED` all fail without writing anything — **not even a
history row**, because a failed transition must not leave a trail suggesting something happened.

Everything authoritative is server-derived: target status (fixed by the endpoint), actor
(`MERCHANT` + the authenticated Controller identity), timestamp (`now()` in the database),
merchant (the session). **Accept reads no request body at all** — one fewer thing to get wrong
than a schema that strips fields.

## Concurrency

`fn_business_transition_order` (migration `20260910_…`) does the whole transition:

```sql
SELECT … FROM business_orders
 WHERE public_id = $2 AND merchant_id = $1
 FOR UPDATE;                     -- serialises concurrent callers on the row
…
UPDATE business_orders SET status = …
 WHERE business_orders.id = v_id
   AND business_orders.status = 'PENDING';   -- and again, conditionally
INSERT INTO business_order_status_history …; -- same transaction
```

`FOR UPDATE` rather than a conditional `UPDATE` alone: the decision must be **read** before it
can be reported ("did it transition, or was it already terminal"), and reading separately from
updating is exactly the race the requirement forbids. Both mechanisms are kept — the lock
decides the order, the `WHERE status = 'PENDING'` means a bug in the lock cannot become a double
transition.

Proved against a real PostgreSQL with **two connections and a deliberate interleaving** (not two
promises and a hope): accept/accept, reject/reject, accept/reject and reject/accept each produce
exactly one transition, one history row, and no contradictory record. A rolled-back transition
leaves neither the status change nor the history row.

## Expiry race

P2.1's expiry is unchanged. Its `UPDATE` also carries `status = 'PENDING'`, so:

- expiry **cannot** reject an order that is already `ACCEPTED` — it is not among the rows matched
- expiry **cannot** alter an order already `REJECTED` by the merchant; the history keeps the
  merchant's account of why it closed, not a second contradictory one
- a merchant accepting **after** expiry ran reads `REJECTED` and is refused, writing nothing
- expiry uses `FOR UPDATE SKIP LOCKED`, so a merchant holding the row is skipped rather than
  blocked — a slow merchant cannot stall the job

## Idempotency

**State-based, not key-based — a deliberate finding, not an omission.**

P2.1's idempotency store exists for guest order *creation*, where a retry would otherwise produce
a second order; its record type carries a tracking token and order totals and does not describe a
transition. Reusing it would mean a second implementation of a mechanism the transition does not
need.

A transition needs no key because **the target state is the token**:

| Retry | Result |
|---|---|
| Accept an order this merchant already accepted | `200`, `alreadyApplied: true`, **no second history row** |
| Reject an order already rejected (by the merchant *or* by expiry) | `200`, `alreadyApplied: true` |
| Accept an order that is `REJECTED` | `409 order_not_pending` |
| Reject an order that is `ACCEPTED` | `409 order_not_pending` |

This holds even when the client loses its key, and it cannot be defeated by generating a new one.
The order's detail history says who actually closed it, which is what a merchant on the phone to
a customer needs.

## Response fields

**Inbox** — `reference`, `status`, `placedAt`, `updatedAt`, `expiresAt`, `customerName`,
`customerPhone`, `totalItems`, `totalAmount`, `currency`, `totalFormatted`, `source`.

**Detail** — the above plus `customerAddress`, `customerNote`, `items[]` (name, quantity,
options, unitPrice, lineTotal) and `history[]` (from, to, actor, reason, at).

This is an authenticated merchant surface, so customer contact details are **unmasked** — P0 §6
makes the merchant the party who has to contact them. It is still an allow-list, not a row dump.
Absent: every internal UUID (dropped in the repository before the view sees it), the tracking
token and its hash — the *customer's* credential, not the merchant's, and never selected by the
query — `source_content_public_id`, and history `actor_id`.

## Ordering and pagination

`created_at DESC, public_id DESC`. The second key is not decoration: two orders placed in the
same millisecond would make a page boundary ambiguous, and an order a merchant never sees is a
sale they never make.

Keyset cursor over `(created_at, public_id)`, following `src/app/api/admin/users/schema.ts` —
including its rule that **a malformed cursor is a `422`, never a silent restart at page one**.
The query asks for `limit + 1` rows so `hasMore` comes from the query rather than a second count
that could disagree with it.

## Reject reason

Optional, bounded: `OUT_OF_STOCK` · `CANNOT_DELIVER` · `CUSTOMER_UNREACHABLE` · `SPAM` · `OTHER`
(default). Stored in `business_order_status_history.reason` — **the column P0 already provides,
so no schema change was needed**.

🚨 **Not customer-visible.** The tracking view shows the status and its fixed copy and never the
reason: "hết hàng" and "khách hàng đáng ngờ" are not the same thing to say to a customer.

## Notification behaviour

**None is emitted by P3, and that is the finding rather than an omission.** P0's non-goals
exclude customer push, SMS and email; the approved contract requires no notification for Accept
or Reject. The customer learns the outcome from the tracking page they already hold. Inventing
one would be scope this phase does not own, and there is no Controller mechanism for
customer-side delivery to reuse — a guest has no account to notify.

P2.1's merchant "new order" notification is unchanged.

## After acceptance

Nothing new. P2.2 already shows the merchant's phone on the tracking page **only** once the
order is `ACCEPTED` (P0 §29), which is the whole of the handoff: Tappy stops managing the
transaction and the two parties talk directly. No delivery workflow, chat, payment, settlement,
refund or dispute was added.

## Customer tracking integration

P2.2 already renders all three states correctly, so P3 added **regression tests rather than
code**: an accepted order tracks as `ACCEPTED` by its token, a rejected one as `REJECTED`, and
the tracking token is unchanged by a transition — a customer's link must keep working after the
merchant answers, which is when they most need to read the outcome.

## Migration, function and grants

`supabase/migrations/20260910_tappy_business_p3_order_transitions.sql` — **one function, no new
table, no new column, no new state, no relaxed constraint.**

`fn_business_transition_order(uuid, text, text, text, text)` is `SECURITY DEFINER` (the Business
tables grant to `service_role` alone) with `SET search_path = public`. `EXECUTE` is revoked from
`PUBLIC`, `anon` **and** `authenticated` — naming both matters on Supabase, where
`ALTER DEFAULT PRIVILEGES` grants them explicitly — and granted to `service_role` only. It takes
`p_merchant_id` as an argument, so EXECUTE by an untrusted role would be a way to transition any
merchant's order; only the app tier, which derives that id from the session, may call it.

## Deployment prerequisites

None beyond P2.1's `TAPPY_BUSINESS_SECRET`. No new environment variable, dependency or cron.

## Non-goals — explicitly not implemented

No UI. P1 deliberately shipped no Business UI, so the phase's "if the existing Business UI
architecture is already established" condition is not met; building one now would be inventing
that architecture inside an order-management phase.

Also absent: customer accounts, claiming, customer cancellation, payment, wallet, escrow,
delivery/shipping/fulfilment, refunds, disputes, loyalty/CRM/coupons, marketplace
checkout/search/ranking, inventory, accounting, analytics, and any CS-Cart-specific behaviour.
No new order state was introduced.
