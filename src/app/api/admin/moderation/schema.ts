import { z } from 'zod'

// Request contract for the Module 09 moderation surface.

export const QueueQuerySchema = z
  .object({
    // §7-style filtering: by state only. The queue has no free-text search —
    // searching a report set by content is a different, more dangerous surface.
    status: z.enum(['pending', 'in_review', 'resolved', 'dismissed']).optional(),
  })
  // Strict: an unimplemented filter must be a 422, never silently ignored.
  .strict()

export const ResolveSchema = z
  .object({
    // `delete` is separated from the rest at the PERMISSION level, not here —
    // `12_RBAC` §3 withholds it from moderator while granting the others.
    kind: z.enum(['dismiss', 'hide', 'restore', 'delete']),
    // Required, and not merely present. A moderation decision with no recorded
    // reason is unreadable six months later, and §4.5 makes `reason` NOT NULL.
    reason: z.string().trim().min(10, 'reason is required').max(500, 'reason is too long'),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()

export type ResolveInput = z.infer<typeof ResolveSchema>

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
export const isUuid = (v: string): boolean => UUID.test(v)

// ── Moderation standards (owner 01/10) ──────────────────────────────────────────────────────────────────────────────────
// The desk's decision. `hold` hides a reported POST while it waits for the decision (no strike, no ledger row); every other
// outcome except `no_violation` needs the rule group the content breaks. The numbers are the ladder in communityRules.ts.
import { RULE_GROUP_IDS, FEATURES, LADDER } from '@/lib/safety/communityRules'

export const DecideSchema = z
  .object({
    outcome: z.enum(['no_violation', 'hold', 'warning', 'remove_post', 'remove_comment', 'restrict', 'ban']),
    rule_group: z.enum(RULE_GROUP_IDS).optional(),
    severity: z.number().int().min(1).max(3).optional(),
    feature: z.enum(FEATURES).optional(),
    restrict_days: z.number().int().min(1).max(LADDER.restrictDaysMax).optional(),
    reason: z.string().trim().min(10, 'reason is required').max(1000, 'reason is too long'),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
export type DecideInput = z.infer<typeof DecideSchema>

export const DeskQuerySchema = z.object({ view: z.enum(['queue', 'appeals', 'stats']).default('queue') }).strict()

export const AppealResolveSchema = z
  .object({
    result: z.enum(['upheld', 'reversed']),
    note: z.string().trim().min(10, 'a note is required').max(1000),
  })
  .strict()

/** An appeal received by email, recorded by the reviewer (a locked account cannot sign in to appeal in the app). */
export const AppealCreateSchema = z
  .object({
    decision_id: z.string().regex(UUID),
    message: z.string().trim().min(10).max(1000),
  })
  .strict()
