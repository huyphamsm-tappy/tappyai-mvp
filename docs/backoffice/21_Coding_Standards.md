# TappyAI Back Office — Coding Standards

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define engineering conventions for all Back Office implementation to ensure consistent, maintainable, and secure code across all implementation sessions.

---

## 2. Core Rules

### Every admin API route handler must:

```typescript
// Standard handler pattern
export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Auth + RBAC check (ALWAYS first)
  const { user, role } = await requireAdminRole(req, 'moderator')

  // 2. Input validation (ALWAYS before DB access)
  const body = await req.json()
  const parsed = SomeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: '...' } }, { status: 422 })
  }

  // 3. Business operation
  const { data, error } = await supabaseAdmin
    .from('table')
    .update({ ... })
    .eq('id', params.id)

  if (error) {
    console.error('[admin] operation failed:', error)
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Operation failed' } }, { status: 500 })
  }

  // 4. Audit log (ALWAYS after successful mutation; non-blocking)
  writeAuditLog({
    actorId: user.id,
    actorEmail: user.email!,
    actorRole: role,
    action: 'entity.action',
    targetType: 'entity',
    targetId: params.id,
    afterState: { ... },
    request: req,
  }).catch(err => console.error('Audit log failed:', err))

  // 5. Return result
  return Response.json({ data })
}
```

---

## 3. File Naming

| Type | Convention | Example |
|---|---|---|
| Page component | `page.tsx` | `src/app/admin/users/page.tsx` |
| API route | `route.ts` | `src/app/api/admin/users/route.ts` |
| Admin lib | camelCase | `src/lib/admin/rbac.ts` |
| Admin component | PascalCase | `src/components/admin/UserTable.tsx` |
| Admin hook | `use` prefix | `src/hooks/admin/useAdminRole.ts` |

---

## 4. Admin Components

Admin-only components live in `src/components/admin/`.

Main app components live in `src/components/`.

**Do not import admin components in main app pages.**

**Do not import main app page-specific components in admin pages.**

Shared UI primitives (Button, Input, etc. from shadcn) can be used anywhere.

---

## 5. Admin Supabase Client

Use the **service role client** for all admin data operations:

```typescript
import { supabaseAdmin } from '@/lib/supabase/admin'
```

This client bypasses RLS and is only used in server-side API routes.

Never pass `supabaseAdmin` to client components.

---

## 6. Zod Schemas for All Inputs

Every API route that accepts a body must validate with Zod:

```typescript
import { z } from 'zod'

const SuspendUserSchema = z.object({
  duration_hours: z.number().int().min(1).max(720),
  reason: z.string().min(20).max(500),
})
```

Schema files for admin routes live alongside their route files:

```
src/app/api/admin/users/[id]/suspend/
  route.ts
  schema.ts  ← Zod schemas
```

---

## 7. Error Handling

```typescript
// Standard error response helper
function adminError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status })
}

// Usage
if (!hasRole(role, 'admin')) {
  return adminError('FORBIDDEN', 'Required role: admin', 403)
}
```

Never expose internal error details (stack traces, SQL errors) in API responses.

Log errors server-side with `console.error('[admin][route_name]:', error)`.

---

## 8. Pagination Pattern

```typescript
// Decode cursor
const cursorData = cursor 
  ? JSON.parse(Buffer.from(cursor, 'base64').toString()) 
  : null

// Query with cursor
const { data } = await supabaseAdmin
  .from('profiles')
  .select('*')
  .lt('created_at', cursorData?.created_at ?? 'now()')
  .order('created_at', { ascending: false })
  .limit(limit + 1)  // fetch one extra to determine hasMore

// Encode next cursor
const hasMore = data.length > limit
const items = hasMore ? data.slice(0, limit) : data
const nextCursor = hasMore 
  ? Buffer.from(JSON.stringify({ created_at: items.at(-1)!.created_at })).toString('base64')
  : null

return Response.json({ data: items, meta: { page: { cursor: nextCursor, hasMore } } })
```

---

## 9. No Business Logic in UI Components

UI components must not:
- Call Supabase directly
- Implement moderation decisions
- Compute analytics
- Determine permissions

UI components must only:
- Call `/api/admin/*` endpoints
- Display data received from those endpoints
- Render permission-gated UI based on `useAdminRole()` hook

---

## 10. Date Handling

All dates stored in UTC. All date displays converted to VN time (or admin preference) in UI.

```typescript
// Never store or compare local dates
// Always use UTC in DB queries
const from = new Date(params.from + 'T00:00:00Z')
const to = new Date(params.to + 'T23:59:59Z')
```

---

## 11. Type Safety

All database query results must be typed using generated Supabase types or explicit TypeScript interfaces.

No `any` types in admin code.

```typescript
import type { Database } from '@/types/supabase'
type AdminRole = Database['public']['Tables']['admin_roles']['Row']
```

---

*End of Coding Standards*
