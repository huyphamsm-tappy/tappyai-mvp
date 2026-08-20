# TappyAI Back Office — API Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the complete API contract for all back office endpoints under `/api/admin/`.

Every endpoint must enforce: authentication → role check → operation → audit log.

---

## 2. API Design Principles

| Principle | Implementation |
|---|---|
| RESTful conventions | Standard HTTP verbs + resource-based URLs |
| RBAC enforced in handler | Every handler calls `requireAdminRole(req, minRole)` |
| Audit on every mutation | Every POST/PUT/PATCH/DELETE writes to `audit_log` |
| Paginated list responses | Cursor-based pagination on all list endpoints |
| Consistent error format | Standard error envelope on all responses |
| No business logic in UI | All decisions made in API handlers |

---

## 3. Standard Request/Response Contracts

### Authentication Header
All `/api/admin/*` requests must include the Supabase session cookie (automatic from browser).

No separate admin token — same session as the main app.

### Standard Success Response
```json
{
  "data": { ... },
  "meta": {
    "page": { "cursor": "...", "hasMore": true, "total": 1250 }
  }
}
```

### Standard Error Response
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions. Required role: admin",
    "details": null
  }
}
```

### Standard Error Codes
| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource state conflict |
| `VALIDATION_ERROR` | 422 | Invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 4. Middleware — Admin Guard

All `/api/admin/*` routes must invoke the admin guard utility at the top of every handler:

```
requireAdminRole(request, minRole) → { user, role } | throws AdminError
```

This utility:
1. Extracts session from cookie via Supabase `getUser()`
2. Queries `admin_roles` for user's role
3. Compares role to `minRole` (hierarchy: super_admin > admin > moderator > analyst)
4. Returns `{ user, role }` if authorized
5. Throws `AdminError` (mapped to 401/403 response) if not

---

## 5. Analytics Endpoints

### `GET /api/admin/analytics/snapshot`

Returns `daily_snapshots` for a date range.

**Permissions:** `analyst` or higher

**Query params:**
- `from` — ISO date (required)
- `to` — ISO date (required)
- `platform` — `all` | `web` | `android` | `ios` (default: `all`)
- `metric` — comma-separated list of metric fields to return (optional, default: all)

**Response:**
```json
{
  "data": [
    {
      "snapshot_date": "2026-07-12",
      "platform": "all",
      "dau": 1250,
      "new_users": 87,
      "ai_conversations": 3400,
      "ai_cost_usd": 12.45,
      "revenue_day_usd": 99.00
    }
  ]
}
```

---

### `GET /api/admin/analytics/features`

Returns `feature_usage_rollup` for a date range.

**Permissions:** `analyst` or higher

**Query params:**
- `from`, `to`, `platform`
- `feature` — filter to specific feature key

---

### `GET /api/admin/analytics/cohorts`

Returns `cohort_metrics` table.

**Permissions:** `analyst` or higher

**Query params:**
- `from`, `to` — cohort registration date range
- `platform`

---

### `GET /api/admin/analytics/ai`

Returns aggregated AI usage from `ai_usage_log`.

**Permissions:** `analyst` or higher

**Query params:**
- `from`, `to`
- `group_by` — `day` | `week` | `feature` | `model`

---

## 6. User Management Endpoints

> **Implementation status, 2026-08-20.** Shipped: `GET /api/admin/users`,
> `GET /api/admin/users/[id]`, and the four `suspend` / `unsuspend` / `ban` /
> `unban` routes. Not built: `POST /api/admin/users/[id]/notes` (no `user_notes`
> table exists) and `DELETE /api/admin/users/[id]` (soft delete — its own
> change, its own Owner authorization).
>
> Deviations from the contract below, each forced by something that postdates
> it:
>
> * **The list carries no `email`.** `profiles.email` was removed by
>   `add_profiles_email_isolation.sql`; the canonical address lives in
>   `auth.users`, which PostgREST does not expose, so there is no join and no
>   batch lookup. A 50-row page would cost 50 Admin API round trips. The detail
>   view spends one lookup and masks per §6. A `q` containing `@` becomes an
>   **exact** email lookup returning at most one user — a prefix match would be
>   a user-enumeration primitive.
> * **`subscription_tier` and `last_active_at` are absent**, along with the
>   `role` / `platform` filters: they read `subscriptions` and `track_events`,
>   which Module 08 does not own. Unknown query parameters are **rejected with
>   422** rather than ignored, so a caller never believes a filter applied.
> * **`status` is resolved in memory**, not in SQL: `active` means "no status
>   row, or a row whose restrictions have expired", which an embedded PostgREST
>   filter (an inner join) cannot express. Past 1000 moderated accounts the
>   filter returns **503 `FILTER_UNAVAILABLE`** rather than a truncated answer.
> * **Pagination is keyset on `(created_at DESC, id DESC)`**; the cursor carries
>   both halves, because `created_at` alone is not unique.

### `GET /api/admin/users`

List users with search and filter.

**Permissions:** ~~`admin` or higher~~ → **`moderator` or higher** (`users.list.read`)

> **Amended by [ADR-023](../architecture/ADR-023-module-08-admin-read-surface-roles.md), Owner Decision A, 2026-08-20.** The original line contradicted `12_RBAC.md` §3 (**User List — View** = moderator ✅), `10_User_Management.md` §6 (which defines email masking *for* `moderator`) and `04_Database_Architecture.md` §8 (`moderator`+). It was also inconsistent with this same section, which assigns suspend/unsuspend to `moderator` — an authority with no reachable subject if the list is closed to them. `analyst` remains denied.
>
> **Searching by email address is `admin`+**, gated on `users.email.read_full`: an exact-address lookup answers "does this address have an account here?", which is an existence oracle over the data §6 withholds from `moderator`. Name search is unaffected.

**Query params:**
- `q` — text search (full_name, email)
- `role` — filter by subscription role
- `status` — `active` | `suspended` | `banned`
- `platform` — `web` | `android` | `ios`
- `cursor` — pagination cursor
- `limit` — default 50, max 100

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "full_name": "...",
      "email": "...",
      "created_at": "...",
      "is_suspended": false,
      "is_banned": false,
      "subscription_tier": "free",
      "last_active_at": "..."
    }
  ],
  "meta": { "page": { "cursor": "...", "hasMore": true } }
}
```

---

### `GET /api/admin/users/[id]`

Full User 360 view.

**Permissions:** ~~`admin` or higher~~ → **`moderator` or higher** (`users.detail.read`)

> **Amended by [ADR-023](../architecture/ADR-023-module-08-admin-read-surface-roles.md), Owner Decision A, 2026-08-20.** Same reasoning as the list endpoint above; `12_RBAC.md` §3 states **User — View full profile** = moderator ✅ (masked email).
>
> **Two fields are gated further, both `admin`+:** the email address is masked without `users.email.read_full` (`10` §6), and `ban_reason` is withheld without `users.ban_reason.read`. A `moderator` can neither ban nor unban, so no action of theirs is informed by the note — Constitution **Rule 9, Privacy by Default**. The *ban itself* stays visible; only the note is withheld, reported as `ban_reason_withheld: true` so a hidden note is distinguishable from an absent one.

**Response includes:**
- Profile data
- Subscription status
- AI usage summary (last 30 days)
- Review count
- Content report history
- Admin notes (from `user_notes`)
- Moderation action history
- Admin role (if any)

---

### `POST /api/admin/users/[id]/suspend`

**Permissions:** `moderator` or higher

**Body:**
```json
{ "duration_hours": 24, "reason": "..." }
```

**Side effects:** Updates `profiles.is_suspended`, `profiles.suspended_until`. Writes audit log.

---

### `POST /api/admin/users/[id]/unsuspend`

**Permissions:** `moderator` or higher

---

### `POST /api/admin/users/[id]/ban`

**Permissions:** `admin` or higher

**Body:**
```json
{ "reason": "...", "notes": "..." }
```

**Side effects:** Updates `profiles.is_banned`. Revokes all active sessions. Writes audit log.

---

### `POST /api/admin/users/[id]/unban`

**Permissions:** `admin` or higher

---

### `POST /api/admin/users/[id]/notes`

Add an internal CRM note.

**Permissions:** `moderator` or higher

---

### `DELETE /api/admin/users/[id]` (Soft Delete)

**Permissions:** `super_admin` only

Anonymizes PII. Does not delete database rows. Writes audit log.

---

## 7. Moderation Endpoints

### `GET /api/admin/moderation`

List moderation queue items.

**Permissions:** `moderator` or higher

**Query params:**
- `status` — `pending` | `in_review` | `resolved` | `dismissed`
- `type` — filter by moderation type
- `priority` — filter by priority
- `cursor`, `limit`

---

### `GET /api/admin/moderation/[id]`

Get full moderation case detail.

**Permissions:** `moderator` or higher

---

### `POST /api/admin/moderation/[id]/assign`

Assign case to a moderator.

**Permissions:** `admin` or higher

---

### `POST /api/admin/moderation/[id]/action`

Take a moderation action.

**Permissions:** `moderator` or higher (ban requires `admin`)

**Body:**
```json
{
  "action": "hide_content",
  "reason": "...",
  "notes": "..."
}
```

**Side effects:** Updates content/user. Writes `moderation_actions`. Writes `audit_log`. Closes queue item.

---

### `POST /api/admin/moderation/[id]/dismiss`

Dismiss a report as invalid.

**Permissions:** `moderator` or higher

---

## 8. Engagement Endpoints

### `GET /api/admin/engagement/campaigns`

List campaigns.

**Permissions:** `admin` or higher

---

### `POST /api/admin/engagement/campaigns`

Create a campaign.

**Permissions:** `admin` or higher

**Body:**
```json
{
  "name": "...",
  "channel": "push",
  "template_id": "uuid",
  "segment_id": "uuid",
  "scheduled_at": "2026-07-15T10:00:00Z"
}
```

---

### `POST /api/admin/engagement/campaigns/[id]/send`

Send or schedule a campaign.

**Permissions:** `admin` or higher

**Side effects:** Sets campaign status to `sending` or `scheduled`. Writes audit log.

---

### `POST /api/admin/engagement/campaigns/[id]/cancel`

Cancel a scheduled campaign.

**Permissions:** `admin` or higher

---

### `GET /api/admin/engagement/campaigns/[id]/stats`

Delivery + open + click stats.

---

### `GET|POST /api/admin/engagement/templates`

CRUD for notification templates.

---

### `GET|POST /api/admin/engagement/segments`

CRUD for audience segments.

---

### `POST /api/admin/engagement/segments/[id]/compute`

Re-compute segment size.

---

## 9. RBAC Endpoints

### `GET /api/admin/rbac/roles`

List all admin role assignments.

**Permissions:** `super_admin` only

---

### `POST /api/admin/rbac/roles`

Grant a role.

**Permissions:** `super_admin` only

**Body:**
```json
{ "user_id": "uuid", "role": "moderator", "notes": "..." }
```

---

### `DELETE /api/admin/rbac/roles/[id]`

Revoke a role.

**Permissions:** `super_admin` only

---

## 10. Audit Log Endpoints

### `GET /api/admin/audit`

Search the audit log.

**Permissions:** `admin` or higher

**Query params:**
- `actor_id` — filter by admin who acted
- `target_type` — filter by resource type
- `action` — filter by action type
- `from`, `to`
- `cursor`, `limit`

---

## 11. Reporting Endpoints

### `POST /api/admin/reports/generate`

Trigger async report generation.

**Permissions:** `admin` or higher

**Body:**
```json
{
  "type": "investor",
  "format": "pdf",
  "language": "en",
  "date_from": "2026-06-01",
  "date_to": "2026-06-30"
}
```

**Response:**
```json
{ "job_id": "uuid", "status": "generating" }
```

---

### `GET /api/admin/reports/[job_id]`

Poll report generation status.

**Response:**
```json
{
  "status": "complete",
  "download_url": "https://...",
  "expires_at": "2026-07-13T15:00:00Z"
}
```

---

## 12. System Monitoring Endpoints

### `GET /api/admin/monitoring/health`

Current system health across all services.

**Permissions:** `admin` or higher

---

### `GET /api/admin/monitoring/crons`

Cron job execution history.

**Permissions:** `admin` or higher

---

### `POST /api/admin/monitoring/crons/[name]/trigger`

Manually trigger a cron job.

**Permissions:** `super_admin` only

---

## 13. Settings Endpoints

### `GET /api/admin/settings`

Read platform settings.

**Permissions:** `admin` or higher

---

### `PUT /api/admin/settings`

Update platform settings.

**Permissions:** `super_admin` only

**Side effects:** All setting changes are audit logged.

---

## 14. Export Endpoints

### `POST /api/admin/export`

Generate a data export.

**Permissions:** `admin` or higher (PII exports require `super_admin`)

**Body:**
```json
{
  "type": "user_list",
  "format": "csv",
  "filters": { "status": "active" }
}
```

---

*End of API Architecture*
