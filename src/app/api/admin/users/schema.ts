import { z } from 'zod'
import type { AccountStanding } from '@/lib/admin/users/accountStatusAdmin'

// Module 08 — request/response shapes for `/api/admin/users`.
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md,
// 19_Security.md §5.
//
// SCOPE OF THIS ROUND, stated so the gap is a decision and not an oversight.
// §2 lists eight list filters and §3 describes a ten-section User 360 view.
// Implemented here: text search, account standing, cursor pagination — the
// filters that `profiles` and `account_status` can actually answer today.
//
// NOT implemented, because no table in this database backs them yet:
// subscription tier (`subscriptions`), platform and last-active (`track_events`),
// country/language filters (`preferences`), admin notes (`user_notes`), the
// activity timeline, AI usage and moderation history. Each is its own module.
// A filter that silently returns everything is worse than a filter that is
// absent, so unknown query parameters are rejected rather than ignored.
//
// ALSO NOT implemented: soft delete (`DELETE /api/admin/users/[id]`). It
// anonymises PII across five tables and is `super_admin`-only; it is a separate
// change with its own Owner authorization, not a rider on this one.

/**
 * A reason is required on EVERY transition, including the lifting ones.
 *
 * `19_Security.md` §5 specifies `min(20).max(500)` for suspension. The same
 * floor is applied to unsuspend and unban deliberately: an audit trail where
 * punishments are explained and reversals are not is unreadable exactly when it
 * matters — reconstructing why someone was let back in is the harder question
 * six months later, not why they were sanctioned.
 *
 * Trimmed before measuring, so twenty spaces is not a reason.
 */
const ReasonSchema = z
  .string()
  .trim()
  .min(20, 'reason must be at least 20 characters')
  .max(500, 'reason must be at most 500 characters')

/** `10_User_Management.md` §4's three states, as a query filter. */
export const AccountStandingSchema = z.enum(['active', 'suspended', 'banned'])

export const UserListQuerySchema = z
  .object({
    // §2: "Partial match" on name. An `@` switches the search to an EXACT email
    // lookup — see the route. Two characters is the floor the consumer search
    // already uses to keep a one-character query from returning the table.
    q: z.string().trim().min(2).max(200).optional(),
    status: AccountStandingSchema.optional(),
    cursor: z.string().min(1).max(500).optional(),
    // §2: "Default 50 per page, max 100."
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()

export type UserListQuery = z.infer<typeof UserListQuerySchema>

export const SuspendUserSchema = z
  .object({
    // §5's cap: 720 hours = 30 days. OPTIONAL, unlike §5's sketch — §4 sets
    // `suspended_until` only "if time-limited", and consumer enforcement
    // already treats a null expiry as an indefinite block. Omitting the field
    // is therefore a supported, explicit choice, not a malformed request.
    duration_hours: z.number().int().min(1).max(720).optional(),
    reason: ReasonSchema,
  })
  .strict()

export const UnsuspendUserSchema = z.object({ reason: ReasonSchema }).strict()

export const BanUserSchema = z
  .object({
    // Stored in `account_status.ban_reason` — the internal moderation note. No
    // PostgREST role can read that column, including the subject of the note.
    reason: ReasonSchema,
    // Audit-only context. Kept out of `ban_reason` so the column holds one
    // thing: the stated justification.
    notes: z.string().trim().max(500).optional(),
  })
  .strict()

export const UnbanUserSchema = z.object({ reason: ReasonSchema }).strict()

/** One row of the user list. */
export interface AdminUserListItem {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string | null
  standing: AccountStanding
  suspended_until: string | null
}

/** The user detail view — Module 08's slice of §3, not the whole 360. */
export interface AdminUserDetail extends AdminUserListItem {
  /** Masked unless the actor holds `users.email.read_full` (§6). Null = none on file. */
  email: string | null
  /** True when the address above went through masking, so the UI need not infer it. */
  email_masked: boolean
  language: string | null
  onboarded: boolean
  follower_count: number | null
  following_count: number | null
  is_suspended: boolean
  is_banned: boolean
  /** Internal moderation note. Service-role-only column; never exposed to consumers. */
  ban_reason: string | null
  /** Null when the user has never been moderated — there is no status row at all. */
  status_updated_at: string | null
}

/**
 * Encode a keyset cursor.
 *
 * `created_at` alone is not unique — two users can register in the same
 * millisecond, and a cursor on a non-unique key silently skips or repeats rows
 * at the page boundary. The row id is carried as the tiebreaker, matching the
 * `(created_at DESC, id DESC)` ordering the query uses.
 */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url')
}

/** Decode a keyset cursor. `null` for anything malformed — a bad cursor is a 422, never a silent page 1. */
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.indexOf('|')
    if (sep <= 0) return null
    const createdAt = raw.slice(0, sep)
    const id = raw.slice(sep + 1)
    if (!createdAt || !id) return null
    // Both halves are interpolated into a PostgREST `or=` filter, whose grammar
    // gives `,` `(` `)` `"` structural meaning. An allowlist is checked BEFORE
    // the date parse: `new Date` accepts a surprising amount of junk, and being
    // a valid date is not the same as being safe to splice into a filter.
    if (!/^[0-9T:.+\-]+Z?$/.test(createdAt)) return null
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null
    if (Number.isNaN(new Date(createdAt).getTime())) return null
    return { createdAt, id }
  } catch {
    return null
  }
}
