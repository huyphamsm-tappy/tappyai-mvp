// GET /api/admin/users — search and page the consumer user list.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §2.
// Handler contract: RBAC → origin → rate-limit → validate → operation → audit →
// uniform envelope (21_Coding_Standards.md §2). A read performs no mutation, so
// it carries no origin check and writes no audit row; the PDP audits its own
// denials.

import { adminError, adminErrorResponse } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import {
  readAccountStatusMany,
  standingFilterIds,
  standingOf,
} from '@/lib/admin/users/accountStatusAdmin'
import { findIdByEmail } from '@/lib/admin/users/authDirectory'
import {
  UserListQuerySchema,
  decodeCursor,
  encodeCursor,
  type AdminUserListItem,
} from './schema'

// Reads auth headers per request — always dynamic (never statically rendered).
export const dynamic = 'force-dynamic'

/** The `profiles` columns this surface reads. `email` is not among them — it no longer exists on the table. */
const PROFILE_LIST_COLUMNS = 'id, full_name, avatar_url, created_at'

interface ProfileRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string | null
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_LIST_READ)
    const { user } = ctx

    const rl = await distributedRateLimit(`admin:users:list:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const url = new URL(req.url)
    // `.strict()` on the schema: an unrecognised filter is a 422, never a
    // silently ignored one. §2 lists filters this round does not implement, and
    // a caller passing `?platform=android` must learn it did nothing rather
    // than believe the returned list was filtered.
    const parsed = UserListQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    }
    const { q, status, cursor, limit } = parsed.data

    // Decoded here rather than at the point of use, so the handler's
    // validate-then-operate order holds for the cursor too. A malformed cursor
    // is rejected, never treated as "start from the beginning" — a caller
    // paging a list would silently loop over page one forever.
    const keyset = cursor ? decodeCursor(cursor) : null
    if (cursor && !keyset) return adminError('VALIDATION_ERROR', 'Invalid cursor', 422)

    const supabase = createAdminClient()

    // ── Email search ────────────────────────────────────────────────────────
    // An `@` means the caller is holding a full address, so this becomes an
    // EXACT lookup returning at most one user. It deliberately ignores `cursor`
    // and `status`: there is nothing to page, and filtering a single known
    // result by standing only hides the answer to the question that was asked.
    if (q?.includes('@')) {
      const lookup = await findIdByEmail(supabase, q)
      if (!lookup.userId) {
        // The directory walk was cut short by its page bound — "not found" here
        // is not an answer, and must not be dressed up as an empty result.
        if (!lookup.exhaustive) {
          return adminError(
            'SEARCH_INCOMPLETE',
            'The directory could not be searched completely. Narrow the search or look the user up by id.',
            503
          )
        }
        return Response.json({ data: [], meta: { page: { cursor: null, hasMore: false } } })
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_LIST_COLUMNS)
        .eq('id', lookup.userId)
        .maybeSingle()

      if (error) {
        console.error('[admin][users] profile lookup failed:', error.message)
        return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      }
      // An auth identity with no profile row. Reported as no match rather than
      // as a half-populated row the Controller cannot act on.
      if (!data) {
        return Response.json({ data: [], meta: { page: { cursor: null, hasMore: false } } })
      }

      const statuses = await readAccountStatusMany(supabase, [lookup.userId])
      return Response.json({
        data: [toListItem(data as ProfileRow, statuses)],
        meta: { page: { cursor: null, hasMore: false } },
      })
    }

    // ── Standing filter ─────────────────────────────────────────────────────
    let standingFilter: Awaited<ReturnType<typeof standingFilterIds>> | null = null
    if (status) {
      standingFilter = await standingFilterIds(supabase, status)
      if (!standingFilter.complete) {
        console.error(
          '[admin][users] moderated-account set exceeded the in-memory filter cap; status filter refused'
        )
        return adminError(
          'FILTER_UNAVAILABLE',
          'Too many moderated accounts to filter by status. This filter needs a database-side implementation.',
          503
        )
      }
      // `include` with nothing to include cannot match anything. Returned here
      // because `.in('id', [])` is a valid-but-wasted round trip.
      if (standingFilter.mode === 'include' && standingFilter.userIds.length === 0) {
        return Response.json({ data: [], meta: { page: { cursor: null, hasMore: false } } })
      }
    }

    // ── Keyset page ─────────────────────────────────────────────────────────
    let query = supabase
      .from('profiles')
      .select(PROFILE_LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      // One extra row answers `hasMore` without a second COUNT query.
      .limit(limit + 1)

    if (q) query = query.ilike('full_name', `%${escapeLike(q)}%`)

    if (standingFilter) {
      if (standingFilter.mode === 'include') {
        query = query.in('id', standingFilter.userIds)
      } else if (standingFilter.userIds.length > 0) {
        query = query.not('id', 'in', `(${standingFilter.userIds.join(',')})`)
      }
    }

    if (keyset) {
      // Keyset, not OFFSET: the tiebreaker on `id` is what stops two profiles
      // created in the same millisecond from being skipped or repeated across
      // the page boundary. Values are quoted so a `+` in the timestamp is read
      // as part of the offset rather than as an encoded space.
      query = query.or(
        `created_at.lt."${keyset.createdAt}",and(created_at.eq."${keyset.createdAt}",id.lt."${keyset.id}")`
      )
    }

    const { data, error } = await query
    if (error) {
      console.error('[admin][users] list failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    const rows = (data ?? []) as ProfileRow[]
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const statuses = await readAccountStatusMany(
      supabase,
      page.map((r) => r.id)
    )

    const last = page[page.length - 1]
    return Response.json({
      data: page.map((row) => toListItem(row, statuses)),
      meta: {
        page: {
          cursor: hasMore && last?.created_at ? encodeCursor(last.created_at, last.id) : null,
          hasMore,
        },
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

/**
 * Merge a profile row with its status row.
 *
 * An id absent from the map has never been moderated, and ABSENT MEANS ACTIVE —
 * `standingOf(undefined)` is where that convention is applied, so it stays one
 * rule in one place rather than a default repeated at every call site.
 */
function toListItem(
  row: ProfileRow,
  statuses: Map<string, { is_suspended: boolean | null; suspended_until: string | null; is_banned: boolean | null }>
): AdminUserListItem {
  const status = statuses.get(row.id) ?? null
  const standing = standingOf(status)
  return {
    id: row.id,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    created_at: row.created_at,
    standing,
    // Only meaningful while the suspension is the standing in force. Reporting
    // an expiry next to `active` or `banned` invites a UI to render a countdown
    // for a suspension that is over, or one a ban has overtaken.
    suspended_until: standing === 'suspended' ? (status?.suspended_until ?? null) : null,
  }
}

/**
 * Escape the wildcards of a PostgREST `ilike` pattern.
 *
 * Without this a search for `%` matches every user and `_` matches any single
 * character — not an injection, but a search box that answers a different
 * question than the one typed into it.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
