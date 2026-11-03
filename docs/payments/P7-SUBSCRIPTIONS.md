# P7 Web — Subscription, SePay/VietQR payment, Quota v2

Branch `p7/web-subscription`. Web only. Master switch `SUBSCRIPTIONS_ENABLED` (default OFF = release behaviour).

## Plans (owner, FINAL)
| Plan | List price | Duration | Charged by bank transfer (VND) | AI questions |
|---|---|---|---|---|
| Pip (one-time trial) | $1 | 7 days | 29.000đ | 30/day |
| Momo | $7 | 1 month (30 d) | 179.000đ | 30/day |
| Coco | $19 | 3 months (90 d) | 489.000đ | 30/day |
| Milo | $36 | 6 months (180 d) | 939.000đ | 30/day |
| Sunny | $66 | 12 months (365 d) | 1.719.000đ | 30/day |

Guest ("Welcome Guest"): 5 AI questions for life. Free account: 10/day (`FREE_DAILY_LIMIT`, Phase 7 canonical catalog 04/10; this line said 15 until the Phase 7 final UAT 05/10 found it stale). The USD price is only the label. The VND amounts are FIXED catalog values (`src/lib/plans/subscriptionPrices.json`) — never computed from USD or an exchange rate — and are what the SePay order charges and the payment screens show.

## Pip is a one-time trial per account (enforced in the database)
`supabase/migrations/20261016_p7_pip_one_time.sql`: `p7_pip_used(user)` is true when the ledger holds a purchased Pip grant or a Pip order was paid; it never looks at the current subscription row, so expiry / cancellation / deleted row do not reopen it.
- `p8_payments_create_order` answers `pip_used` → API 409 `pip_already_used` ("Bạn đã sử dụng gói Pip. Gói dùng thử này chỉ có thể mua một lần cho mỗi tài khoản.").
- `p8_payments_apply_sepay`: a Pip payment for an account that already used Pip is not granted (`pip_used`, order kept as `mismatch` for a staff refund). A per-payer advisory lock (same one `create_order` takes, taken before the order row) makes two Pip orders paid back-to-back grant exactly one.
- Unique backstop `entitlement_ledger_pip_once` (one web Pip grant per user).
- ANY grant mechanism consumes the trial — `web_sepay`, `google_play`, `apple_iap` and `manual` (staff comp), owner decision (20261017): `p7_pip_used` has no source exception and `entitlement_ledger_pip_once` allows one Pip `stack` grant per user whatever the source; a second Pip grant is refused with 23505, a replay of the same `external_ref` is still `duplicate`. `/api/payments/me.pipUsed` calls the same DB function.
- UI: "$1 · 7 ngày · Dùng thử 1 lần" + note; after use "Bạn đã sử dụng gói Pip" and Pip is no longer offered (`/api/payments/me` → `pipUsed`).

## Payment flow
`POST /api/payments/orders {plan}` (real account only; price/duration from `PLAN_CONFIG`, never from the client; 409 while a plan is active; ≤3 pending; 15-min expiry) → VietQR → `POST /api/payments/sepay` (HMAC-SHA256 over `"<timestamp>.<raw body>"`, 5-minute window, idempotent by SePay transaction id, amount ≥ price, receiving account checked) → `p8_apply_entitlement` (the only writer, append-only `entitlement_ledger`) → plan ACTIVE. No manual activation. Web = one payment per period, no auto-renew; the plan expires (`p8_subscriptions_expire`, cron route not scheduled) and the user buys again. Failure/expiry/short-transfer states are drawn by `SubscriptionFlow`; a client-side "paid" is never trusted — the screen shows success only after `/api/payments/me` says ACTIVE.

## Quota v2 = ONE module
`src/lib/ai/quota/aiQuestionQuota.ts` (plan-aware): guest/anon lifetime 5 · free 10/day · every paid plan 30/day · day = Vietnam calendar day (reset = key change). Entitlement → quota is `accountQuotaFor` (one rule, `lib/plans/entitlement.ts`). A paying legacy `pro` row stays unmetered until its period ends (or `PRO_GRANDFATHER_CUTOFF`). Paid-plan refusal: 429 `plan_limit_reached`; free: `free_limit_reached`.
Metered (spend from the pool): `/api/chat` (guest, anonymous, free, paid) and `/api/scam-shield/analyze`. Display (`/api/subscription`, `/api/payments/me`, `/subscription`, Home chip) reads the same store.
Not metered by this pool (own per-feature limits, unchanged from the release): `/api/translate`, `/api/scan`, `/api/viet-content`, `/api/group/[id]/suggest`, `/api/explore/process`, memory extraction, cron jobs.

## Not in scope
Android/iOS/RevenueCat/Google Play/Apple verify paths, admin plan-grant route.

## Stripe — legacy / unsupported for the current P7 subscription flow
`/api/stripe/checkout`, `/api/stripe/portal` (create a Stripe Pro checkout / billing portal; need `STRIPE_SECRET_KEY` at import) and `/api/webhooks/stripe` (writes `plan = 'pro'` rows) are the pre-P7 Pro path used only by the old `SubscriptionView`. They are not part of the SePay/VietQR flow and add no Stripe config requirement to it. With `SUBSCRIPTIONS_ENABLED=1` checkout and portal answer 404 (the five-plan page replaces the Stripe page); with it off they behave as in the release. The Stripe webhook is untouched and not flag-gated, and an existing paying `pro` row stays unmetered until its period ends (or `PRO_GRANDFATHER_CUTOFF`), then is a 30/day plan.
