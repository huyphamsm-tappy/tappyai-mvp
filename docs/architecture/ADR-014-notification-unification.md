# ADR-014 — Notification Unification

**Status:** Proposed (for review & freeze — no implementation until accepted) · **Date:** 2026-07-25
· **Scope:** cross-platform (Web · Android · iOS) · **Supersedes:** the derived `GET /api/notifications` aggregation and the per-generator ad-hoc `sendNotificationToUser` calls.

## Context

Today the app has **two disjoint notification systems** (audited 2026-07-25):

1. **In-app Inbox / badge** — `GET /api/notifications` (`src/app/api/notifications/route.ts`) **derives** notifications on read by joining four activity tables (`user_follows`, `review_likes`, `review_comments`, `review_milestones`). It therefore shows **social events only**. There is **no `notifications` table**.
2. **Web Push** — `sendNotificationToUser()` (`src/lib/notifications/send.ts`) is called ad-hoc by each generator (deal/morning-brief/price crons, like/comment/follow event routes, broadcast). Push is **transient** — never persisted, never shown in the Inbox.

Consequences of the split:
- **Deal / Explore push never appears in the Inbox** (no in-app history; a missed push is lost).
- **Social** appears in the Inbox *and* pushes; **Deal** pushes only; three "Explore" crons (`weekly-recap`, `travel-reminder`, `lunch-reminder`) exist but are **not scheduled in `vercel.json`** → never fire.
- **The Explore unread badge is component-scoped**: its fetch + Supabase-Realtime subscription live inside `src/app/reviews/page.tsx` (`useEffect`, lines ~521–562). On any non-`/reviews` route (e.g. **Home**) that component is unmounted → the channel is removed and nothing updates the badge; the global `BottomNav` has no Explore badge at all. → "badge doesn't update while on Home."
- Read-state is **client-only** (`localStorage 'tappy:notifSeenAt'`) → not correct across devices.
- Android/iOS have no shared notification contract.

## Decision

Introduce **one source of truth**: a persisted `notifications` table that every producer writes and every consumer (Inbox, badge, device push, all platforms) reads.

- **Write:** a single `emitNotification(userId, payload)` helper INSERTs a `notifications` row **and** dispatches device push from the same payload. All generators call it — no other path mints a notification.
- **Read (backend):** `GET /api/notifications` reads the table (paginated); `POST /api/notifications/read` sets server-side `read_at`.
- **Read (web client):** an app-level **`NotificationProvider` + React Context** (root layout) fetches once, holds **one** Realtime subscription on `notifications` (filtered `user_id=me`), and exposes `{ unreadCount, notifications, markAllRead, refetch }`. **BottomNav**, **Explore (TikNav + aside)**, and the **Notification Center/Inbox** all read this context → the badge is correct on every route including Home.
- **Cross-platform:** the table + `GET`/`read` endpoints are the shared contract; Android/iOS consume the same endpoints for inbox+badge and receive push through the same pipeline.

### Approved refinements (owner, 2026-07-25)
1. **`read_at` server-side** — replaces the client-only `notifSeenAt`; correct cross-device. ✅
2. **Backfill** existing social events into `notifications` at cutover, capped at **30 days OR the 100 most recent** (whichever is smaller), so the Inbox isn't empty. ✅
3. **Store = `NotificationProvider` + Context** — **no Zustand** (do not add the dependency). ✅
4. **Realtime publication** — add `notifications` to the `supabase_realtime` publication (migration). ✅
5. **This ADR must be reviewed & frozen before Phase 0.** ✅
6. **Push delivery status** on each row for retry & observability. ✅

## Data model

```sql
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,  -- recipient
  type          text not null,        -- 'like'|'comment'|'follow'|'milestone'|'deal'
                                       -- |'morning_brief'|'lunch'|'weekly'|'price'|'broadcast'|'system'
  category      text not null,        -- 'social'|'deal'|'explore'|'system'  (grouping / future per-category opt-in)
  title         text not null,
  body          text not null,
  actor_id      uuid null references profiles(id) on delete set null,     -- social trigger
  entity_url    text null,            -- deep link: /reviews/[id], /deals, /users/[id]
  image_url     text null,
  data          jsonb not null default '{}'::jsonb,                       -- push payload extras
  read_at       timestamptz null,     -- server-side read state (Decision #1)

  -- Decision #6 — push delivery status (retry + observability)
  push_status   text not null default 'pending',   -- 'pending'|'sent'|'failed'|'skipped'
  push_sent_at  timestamptz null,
  push_attempts int  not null default 0,
  push_error    text null,

  created_at    timestamptz not null default now()
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);
create index notifications_user_unread_idx  on notifications (user_id) where read_at is null;
create index notifications_push_retry_idx   on notifications (push_status) where push_status = 'failed';
```

- **RLS:** recipient reads/updates own rows (`user_id = auth.uid()`); INSERT/push-status updates only via the service-role (server generators). No client insert.
- **Realtime:** `alter publication supabase_realtime add table notifications;` — clients subscribe with `filter: user_id=eq.<me>` (one narrow subscription, unlike today's four broad table subscriptions).
- **`skipped`** push_status = recipient has no enabled subscription (persist for Inbox, nothing to push) — distinguishes "no device" from a real failure.

## Write pipeline

```
emitNotification(userId, { type, category, title, body, actor_id?, entity_url?, image_url?, data? }):
  row = INSERT notifications (... , push_status='pending')          -- persisted → Inbox + badge immediately
  subs = active notification_subscriptions for userId
  if subs empty: UPDATE row push_status='skipped'; return
  results = dispatch web push (existing send.ts) to each sub
  UPDATE row push_status = all-ok ? 'sent' : 'failed',
             push_sent_at = now(), push_attempts = 1, push_error = first error
```

- A **retry worker** (small cron) later re-attempts `push_status='failed'` rows within a TTL (uses `push_attempts` for backoff / give-up). Out of scope for Phase 0–2; enabled once observability shows need.
- Every generator migrates to `emitNotification`: `cron/deal-notifications`, `cron/morning-brief`, `cron/price-check`, `cron/weekly-recap`, `cron/travel-reminder`, `cron/lunch-reminder`, `api/reviews/[id]/like` (like + milestone), `api/reviews/[id]/comments`, `api/users/[id]/follow`, `api/notifications/broadcast`, `api/music/tracks/[id]/report`.

## Read pipeline

- `GET /api/notifications` → `select … from notifications where user_id = me order by created_at desc limit N`. Unread = `count(*) where read_at is null`.
- `POST /api/notifications/read` → `update notifications set read_at = now() where user_id = me and read_at is null` (mark-all) or by id list.
- **`NotificationProvider`** (root layout, web): initial fetch + one Realtime channel (`filter user_id=eq.me`) → updates context on INSERT/UPDATE; focus/visibility catch-up retained. `BottomNav`, Explore `TikNav`/`aside`, Inbox read `useNotifications()`. Removes the per-page effect in `reviews/page.tsx`.

## Rollout (phased — never break the old path mid-flight)

- **Phase 0** — schema + RLS + realtime publication migration; `emitNotification` helper. No behaviour change.
- **Phase 1 (write)** — generators call `emitNotification` (persist + push); backfill social events (30d / 100 cap).
- **Phase 2 (read)** — `GET /api/notifications` reads the table; add `read_at` + mark-read endpoint; build `NotificationProvider` + Context; wire BottomNav / Explore / Inbox to it; delete the per-page badge effect and client `notifSeenAt`.
- **Phase 3 (cleanup)** — retire the derived aggregation; **schedule the three dead crons** (`weekly-recap`, `travel-reminder`, `lunch-reminder`) in `vercel.json` (now safe on the unified pipeline); optional push-retry worker.

## Consequences

- Every notification (any category) is persisted → consistent Inbox history + accurate unread badge on **all platforms** and **all routes** (fixes the Home-badge bug via the app-level provider, not a BottomNav-only patch).
- Server-side read-state → correct cross-device.
- Push delivery is observable + retriable.
- One narrow Realtime subscription replaces four broad ones.
- Cost: a new table + backfill migration; a coordinated multi-file write-path migration; retention/pagination policy needed (proposed: keep 90 days or 500 rows/user, prune via the analytics-snapshot cron).

## Alternatives considered

- **Keep deriving on read, add a BottomNav-only badge** — rejected: badge still can't live-update off-route, Deal/Explore still absent from Inbox, no cross-platform contract. (Owner explicitly rejected patching BottomNav alone.)
- **Zustand store** — rejected (Decision #3): avoid a new state dependency; Context suffices for a single provider.
- **Persist only push, keep social derived** — rejected: leaves the two systems split.

## Open items to confirm at review

- Retention/pagination policy exact numbers (proposed 90d / 500 rows).
- Whether per-category push opt-in (`category` toggles) is in-scope now or later.
- Android/iOS: confirm they will consume `GET /api/notifications` + `read` verbatim (backend-first, per ADR-011).
