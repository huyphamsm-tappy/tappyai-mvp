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
