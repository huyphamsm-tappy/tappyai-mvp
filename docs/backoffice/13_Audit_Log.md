# TappyAI Back Office — Audit Log Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Design an immutable, searchable audit trail of every administrative action taken in the TappyAI Back Office Platform.

---

## 2. Core Requirements

| Requirement | Implementation |
|---|---|
| **Immutable** | No UPDATE or DELETE on `audit_log` table — enforced by RLS + no service role mutation |
| **Complete** | Every admin API mutation writes an entry before returning success |
| **Searchable** | Indexed by actor, target, action type, and date |
| **Retained** | Minimum 1 year (configurable) |
| **Privacy-aware** | PII minimized — no full conversation content; user IDs only |
| **Non-blocking** | Audit writes are async — never block the main operation |

---

## 3. What is Audited

Every action taken through the Back Office API that:
- Modifies user data
- Creates or sends a communication
- Changes permissions
- Generates an export
- Changes system settings
- Triggers a background job manually

### Complete Action Catalog

| Category | Actions |
|---|---|
| **User** | `user.suspend`, `user.unsuspend`, `user.ban`, `user.unban`, `user.soft_delete`, `user.force_logout`, `user.password_reset`, `user.data_export`, `user.note_added`, `user.note_deleted` |
| **Moderation** | `moderation.case_assigned`, `moderation.dismissed`, `moderation.warn`, `moderation.content_hidden`, `moderation.content_restored`, `moderation.content_deleted`, `moderation.user_suspended`, `moderation.user_banned` |
| **RBAC** | `rbac.role_granted`, `rbac.role_revoked`, `rbac.permission_override` |
| **Engagement** | `campaign.created`, `campaign.updated`, `campaign.sent`, `campaign.cancelled`, `template.created`, `template.updated`, `template.deleted`, `segment.created`, `segment.updated` |
| **Reports** | `report.generated`, `report.downloaded` |
| **Investor Sharing** | `investor.grant_created`, `investor.auth_succeeded`, `investor.auth_failed`, `investor.viewed`, `investor.grant_revoked` |
| **Export** | `export.initiated`, `export.downloaded` |
| **Settings** | `settings.updated` |
| **Developer Tools** | `devtools.cron_triggered`, `devtools.user_impersonated`, `devtools.cache_cleared` |
| **Releases** | `release.created`, `release.updated` |

---

## 4. Audit Log Schema

See `04_Database_Architecture.md` for full schema.

Key fields:
- `actor_id` — Admin who performed the action
- `actor_email` — Snapshot of their email at time of action (immutable record)
- `actor_role` — Snapshot of their role at time of action
- `action` — Action string from catalog above
- `target_type` — Resource type affected (user, review, campaign, etc.)
- `target_id` — Resource identifier
- `before_state` — JSONB snapshot of the resource before change
- `after_state` — JSONB snapshot after change
- `ip_address` — Admin's IP address
- `user_agent` — Admin's browser/client

---

## 5. Writing Audit Entries

### Utility Function

```typescript
// src/lib/admin/audit.ts
async function writeAuditLog(params: {
  actorId: string
  actorEmail: string
  actorRole: string
  action: string
  targetType?: string
  targetId?: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  metadata?: Record<string, unknown>
  request?: Request  // for IP + user agent
}): Promise<void>
```

### Usage Pattern in API Handlers

```typescript
// After successful operation:
await writeAuditLog({
  actorId: user.id,
  actorEmail: user.email,
  actorRole: role,
  action: 'user.suspend',
  targetType: 'user',
  targetId: userId,
  beforeState: { is_suspended: false },
  afterState: { is_suspended: true, suspended_until: '...' },
  metadata: { duration_hours: 24, reason: '...' },
  request: req,
})
```

### Non-Blocking Pattern

Audit writes must never block the main operation:

```typescript
// Fire and forget — do not await in critical path
writeAuditLog({ ... }).catch(err => console.error('Audit log write failed:', err))

// Return success to client immediately
return Response.json({ success: true })
```

If the audit write fails, log the error but do not fail the operation. The audit log is a safety net, not a gate.

---

## 6. Audit Log UI

### List View

The audit log page shows a searchable, filterable, paginated log.

| Column | Description |
|---|---|
| Timestamp | Date + time (admin timezone) |
| Admin | Name + role of actor |
| Action | Human-readable action label |
| Target | Type + name/ID of affected resource |
| IP Address | Admin's IP at time of action |

### Filters

- Date range (required — default last 7 days to avoid full-table scan)
- Actor (search by admin name or email)
- Action type (dropdown from action catalog)
- Target type (user / review / campaign / etc.)
- Target ID (exact match)

### Detail Panel

Click any row to see:
- Full before/after state (JSON diff view)
- Metadata
- User agent

### Export

Export audit log for a date range as CSV (for compliance reporting).

---

## 7. Immutability Enforcement

### Database Layer

```sql
-- RLS policy: INSERT only for service role
CREATE POLICY "audit_log_insert_only" ON audit_log
    AS RESTRICTIVE
    FOR ALL
    USING (false);  -- Deny all direct access

-- Only service role key (used by server) can INSERT
-- No UPDATE or DELETE policies exist — they are not defined
```

Service role INSERT via supabase admin client (bypasses RLS for writes). No UPDATE or DELETE route is ever exposed.

### Application Layer

There is no API endpoint for updating or deleting audit log entries. The audit log UI is **read-only**.

---

## 8. Retention & Archival

- Default retention: 365 days
- Configurable via Settings (super_admin only)
- Old entries are deleted by a monthly cron job based on `created_at < NOW() - interval '365 days'`
- **Future:** Archive to cold storage (Vercel Blob / S3) before deletion

---

*End of Audit Log Architecture*
