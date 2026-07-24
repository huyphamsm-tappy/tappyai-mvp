# Bug #14 — Deals V1 (admin-managed) — Production Release Notes

- **Date:** 2026-07-24
- **Commit shipped to production:** `b4134e8` (fast-forward merge of `preview/deals-v1` → `main`)
- **Previous production:** `d1c159c` (7-partner hardcoded `DEAL_POOL`)
- **Live:** https://www.tappyai.com/api/version → `{"v":"b4134e8…"}`

## What shipped

Deals moved from a hardcoded pool (`src/lib/shopee-deals.ts`, deleted) to **DB-backed,
admin-managed content**. One source of truth serves web + Android + iOS.

**Architecture:** Admin Dashboard → `partner_deals` table → `GET /api/deals` → clients.

- **DB:** table `partner_deals` + RLS (public reads only active, in-window rows; writes
  service-role only) + idempotent 7-partner seed.
- **Hardening columns:** `partner_slug` (unique, lowercase, immutable via trigger),
  `partner_type` (free-text string, lowercase, ≤32 — no DB CHECK, future types need no
  code change), `affiliate_code` (nullable placeholder, no logic, never in API),
  `is_featured`, `click_count` (via `SECURITY DEFINER increment_deal_click(uuid)` RPC).
- **Reserved:** `metadata JSONB DEFAULT '{}'` — not used, not exposed, no UI.
- **Public API:** `GET /api/deals` → `{success, deals}`; `POST /api/deals/[id]/click`
  (best-effort, always 200, never blocks the link). API never exposes
  `affiliate_code` / `click_count` / `metadata`.
- **Admin CRUD:** `/admin/deals` (role `admin`) — create/edit/disable/delete/reorder/
  schedule, upload logo+banner, `partner_slug` create-only, `click_count` read-only.

## Migrations applied to production (in order)

1. `20260724_partner_deals.sql` — table + trigger + RLS + 7-partner seed — **SUCCESS**
2. `20260724_partner_deals_hardening.sql` — 5 columns + backfill + slug immutability trigger + click RPC — **SUCCESS**
3. `20260724_partner_deals_metadata.sql` — `metadata JSONB` column — **SUCCESS**

Each verified independently via PostgREST. All additive / idempotent / backward-compatible; no data loss.

## Production smoke tests (2026-07-24)

| # | Check | Result |
|---|-------|--------|
| 1 | `GET /api/deals` returns `success` | ✅ 7 active deals |
| 2 | Data comes from database | ✅ `partnerSlug` etc. present |
| 3 | `/deals` page renders | ✅ HTTP 200 |
| 4 | Active scheduling works | ✅ 7 in-window deals shown |
| 5 | Expired deals hidden | ✅ temp expired row not returned |
| 6 | Future deals hidden | ✅ temp future row not returned |
| 7 | Click counter increments | ✅ `0 → 1`, reset to 0 |
| 8 | `partner_slug` immutable | ✅ UPDATE rejected (HTTP 400 "immutable"), slug intact |
| 9 | `partner_type` free text | ✅ no DB CHECK; zod lowercase/≤32 (unit-tested) |
| 10 | API hides `affiliate_code`/`click_count`/`metadata` | ✅ not present in response |
| 11 | All `officialUrl` are https | ✅ |
| 12 | No console/server errors | ✅ endpoints clean, page 200 |

Temporary test rows (`smoke-expired`, `smoke-future`) inserted and deleted; all
`click_count` bumps from testing reset to 0 for a clean launch.

## Requires the owner's authenticated admin session (cannot be automated)

These need a logged-in `admin` account; per standing rule Claude does not perform real
logins. Owner to confirm in the live Admin Dashboard:

- Admin CRUD end-to-end (create / edit / disable / delete / reorder / schedule)
- Logo upload
- Banner upload

## Test / build

194/194 unit tests pass on `b4134e8`; build clean. Regression suite
`src/lib/deals/partnerDeals.test.ts` (10 tests) is permanent.
