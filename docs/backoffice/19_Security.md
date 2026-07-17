# TappyAI Back Office — Security Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the security architecture for the Back Office Platform covering authentication, authorization, data protection, audit, and operational security.

---

## 2. Threat Model

| Threat | Risk | Mitigation |
|---|---|---|
| Unauthorized back office access | Critical — exposes all user data | Strong auth + RBAC + middleware |
| Privilege escalation | High — analyst escalates to admin | Role changes audit logged + super_admin-only |
| Data exfiltration via export | High — bulk user PII export | Export permission gating + audit log |
| CSRF on admin actions | Medium — forged form submissions | SameSite=Lax cookies + CORS |
| Compromised admin account | High — full back office access | Session revocation + 2FA (future) |
| SQL injection via admin search | Medium | Parameterized queries only (Supabase SDK) |
| Mass suspension/ban attack | High — if admin account compromised | Audit log + rate limit on destructive actions |
| Audit log tampering | High — hide evidence of abuse | Immutable audit log via DB policy |

---

## 3. Authentication

### Mechanism
Same Supabase Auth session as the main app. No separate admin login.

**Benefits:**
- No new attack surface
- Shared session management
- Admins already have accounts

### Session Security
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`
- Session rotation on privilege change (role grant)
- Auto-expiry: Supabase default session duration (1 hour access token, 7-day refresh)
- Force logout: admin can revoke all sessions for a user via `/api/admin/users/[id]/force-logout`

---

## 4. Authorization

### Layer 1 — Next.js Middleware

```typescript
// middleware.ts — extended to cover /admin/* routes
if (pathname.startsWith('/admin')) {
  const user = await getUser(request)
  if (!user) return redirect('/login?redirect=' + pathname)
  
  const role = await getAdminRole(user.id)
  if (!role) return redirect('/reviews')  // Not an admin
  
  // Attach role to request headers for downstream use
}
```

### Layer 2 — API Route Handler

Every `/api/admin/*` handler calls `requireAdminRole(req, minRole)` as the first line.

### Layer 3 — Database RLS

Admin operations use the **service role** client (`supabaseAdmin`) which bypasses RLS.

This means authorization is the responsibility of the API layer — not the database layer for admin operations.

**Exception:** The `audit_log` table has RLS enforced even against service role patterns (no UPDATE/DELETE policy exists at all).

---

## 5. Input Validation

All admin API endpoints validate input using Zod schemas:

```typescript
const SuspendUserSchema = z.object({
  duration_hours: z.number().int().min(1).max(720),  // max 30 days
  reason: z.string().min(20).max(500),
})
```

Never trust client-provided data. Validate and sanitize before any database operation.

---

## 6. Rate Limiting

Back office endpoints have separate rate limits (higher than public endpoints — admins are trusted but must still be protected from compromise):

| Endpoint Category | Rate Limit |
|---|---|
| Analytics reads | 100 req/min per admin |
| User actions (suspend/ban) | 20 req/min per admin |
| Bulk actions | 5 req/min per admin |
| Export / report generation | 10 req/hour per admin |
| Campaign send | 5 req/hour per admin |

Rate limits are enforced via the existing `src/lib/security/rateLimit.ts` with admin-specific keys.

---

## 7. Data Protection

### PII Access Policy

| Data | Who Can Access |
|---|---|
| User email (full) | `admin`, `super_admin` |
| User email (masked) | `moderator` |
| No email shown | `analyst` |
| AI conversation content | No one via back office |
| Payment details | `admin`, `super_admin` (last 4 only) |
| IP addresses | `admin`, `super_admin` (audit log only) |

### No PII in Analytics Tables

The `track_events` table stores `user_id` (UUID) only. Never email, name, or phone.

Analytics aggregations use `user_id` counts — never identifying information.

### GDPR / Data Deletion

When an admin triggers soft-delete:
1. PII fields in `profiles` are anonymized
2. `user_memory` rows are deleted
3. `notification_subscriptions` rows are deleted
4. `track_events` rows: `user_id` set to null (retains event data without identity)
5. `ai_usage_log` rows: `user_id` set to null
6. Content (`reviews`) is hidden but not deleted (platform integrity)
7. Audit log rows: `actor_id`/`target_id` remains (legal record)

---

## 8. Secrets Management

All secrets in Vercel Environment Variables. No secrets in code or committed files.

| Secret | Usage |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Existing — admin DB operations |
| `REPORT_GENERATION_SECRET` | New — sign report download URLs |
| `POSTHOG_SECRET_KEY` | New — server-side PostHog API |
| `VAPID_PRIVATE_KEY` | Existing — Web Push |
| Firebase credentials | New — FCM (when implemented) |
| APNs private key | New — iOS push (when implemented) |

**Rule:** Secrets are never logged, never included in error responses, never passed to client-side code (no `NEXT_PUBLIC_` prefix for secrets).

---

## 9. CORS Policy

Admin API routes (`/api/admin/*`) are restricted to same-origin:

```typescript
// In admin API handlers
const origin = request.headers.get('origin')
if (origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) {
  return new Response('Forbidden', { status: 403 })
}
```

This prevents cross-origin requests from other sites.

---

## 10. Content Security Policy

The existing CSP (applied in `next.config.mjs`) covers admin routes.

The back office does not load any external scripts or resources not already covered by the main app CSP.

---

## 11. Backup & Disaster Recovery

| Asset | Backup | Recovery |
|---|---|---|
| Supabase PostgreSQL | Supabase daily automated backups (7-day PITR on Pro) | Restore to point-in-time via Supabase dashboard |
| Vercel Blob (reports, exports) | Vercel Blob is replicated | Re-generate if lost (data in DB is source of truth) |
| Audit log | Backed up with Supabase | Immutable — cannot be altered |
| Analytics snapshots | Backed up with Supabase | Recomputable from `track_events` if lost |

**Recovery target:** Back office can be fully restored from Supabase backup. No separate backup infrastructure required for MVP.

---

## 12. Future Recommendations

> NOT in scope. For future consideration only.

- **Two-factor authentication (2FA)**: Require TOTP for admin accounts (Supabase supports this)
- **IP allowlist**: Restrict back office access to known IP ranges (VPN or office)
- **Session monitoring**: Alert on back office sessions from unusual countries
- **Anomaly detection**: Alert if admin takes more than N ban actions in 1 hour

---

*End of Security Architecture*
