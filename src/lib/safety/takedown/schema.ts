import { z } from 'zod'
import { URGENCIES } from './clock'

export const TARGET_TYPES = ['review', 'comment', 'plan_share', 'user'] as const

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a uuid')

/** The id of a review, a comment or a user is a uuid; a shared plan's id is the short public id of its link (letters, digits, - and _). */
const targetId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'invalid id')

export const CreateTakedownSchema = z.object({
  source: z.enum(['authority', 'user_complaint']),
  agency: z.string().trim().min(1).max(200),
  reference_no: z.string().trim().max(100).optional(),
  legal_basis: z.string().trim().max(500).optional(),
  urgency: z.enum(URGENCIES as [string, ...string[]]),
  /** When Tappy RECEIVED the request (ISO). The clock starts here. Not in the future (a minute of skew is allowed). */
  received_at: z.string().datetime({ offset: true }),
  target_type: z.enum(TARGET_TYPES),
  target_id: targetId,
  notes: z.string().trim().max(2000).optional(),
  /** Carry the takedown out in the same call (the usual case under a 24 h clock). */
  execute: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.target_type !== 'plan_share' && !uuid.safeParse(v.target_id).success) ctx.addIssue({ code: 'custom', path: ['target_id'], message: 'must be a uuid' })
  if (v.source === 'authority' && v.urgency === 'complaint_48h') ctx.addIssue({ code: 'custom', path: ['urgency'], message: 'a complaint window belongs to a user complaint' })
  if (v.source === 'user_complaint' && v.urgency !== 'complaint_48h') ctx.addIssue({ code: 'custom', path: ['urgency'], message: 'a user complaint has the 48 h window' })
})

export const ActionTakedownSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('execute'), notes: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('reject'), notes: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('needs_info'), notes: z.string().trim().min(3).max(2000) }),
])

export const isUuid = (s: string): boolean => uuid.safeParse(s).success
