import { z } from 'zod'

// Controller V2 — Component 11: request/response shapes.
//
// The response type is the contract's §16 field list, written out. Adding a
// field here is a contract change, not a convenience: the SQL function projects
// exactly these eight columns and nothing else.

export const SessionListQuerySchema = z.object({
  userId: z.string().uuid('userId must be a UUID'),
  // The cap is enforced again in SQL. Two places on purpose: the schema gives a
  // caller a clean 422, and the function stays safe for any future caller that
  // does not come through this route.
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime({ offset: true }).optional(),
})

export const ForceLogoutSchema = z.object({
  userId: z.string().uuid('userId must be a UUID'),
  // Required, and not merely present: a forced logout with no recorded reason
  // is indistinguishable from an attack when the audit trail is read later.
  reason: z.string().trim().min(3, 'reason is required').max(500),
})

/** One row of the inventory. Mirrors fn_session_inventory's RETURNS TABLE. */
export interface SessionRow {
  id: string
  user_id: string
  state: 'active' | 'expired'
  created_at: string | null
  last_refreshed_at: string | null
  expires_at: string | null
  aal: string | null
  client_class: 'web' | 'native' | 'unknown'
}

/** What the revoke functions return: a count plus why it was that count. */
export interface RevokeResult {
  revoked: number
  reason: 'ok' | 'not_found' | 'owner_protected'
}
