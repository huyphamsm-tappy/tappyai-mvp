import { z } from 'zod'
import { COMMERCE_CAPABILITIES, COMMERCE_DOMAINS, DOMAIN_INTENTS, INTENT_CAPABILITY, INTENT_TYPES, type CommerceRequest } from './types'

// Request validation — the only place a caller's input is trusted. Everything
// downstream (adapters, resolver) assumes a request that passed this schema, so
// the schema is strict: closed enums, bounded strings, canonical date/time
// formats, party sizes a merchant would accept.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').refine(s => !Number.isNaN(Date.parse(s)), 'valid date')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')
// A provider reference is an opaque id or a URL; it must never carry control
// characters or whitespace, which is where parameter injection would start.
const ref = z.string().min(1).max(512).regex(/^[^\s\x00-\x1f\x7f]+$/, 'no whitespace/control chars')
const small = z.number().int().min(1).max(20)

const configurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shopping'), productRef: ref, variant: z.string().trim().max(80).optional(), quantity: small.optional() }),
  z.object({
    kind: z.literal('hotel'),
    propertyRef: ref,
    cityRef: ref.optional(),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: small,
    children: z.number().int().min(0).max(10).optional(),
    rooms: z.number().int().min(1).max(9).optional(),
  }),
  z.object({
    kind: z.literal('transport'),
    originRef: ref,
    destinationRef: ref,
    departDate: isoDate,
    returnDate: isoDate.optional(),
    passengers: small.optional(),
    cabin: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
    mode: z.enum(['flight', 'bus', 'train']),
  }),
  z.object({ kind: z.literal('event'), eventRef: ref, city: z.string().trim().max(80).optional(), date: isoDate.optional(), quantity: small.optional() }),
  z.object({
    kind: z.literal('reservation'),
    restaurantRef: ref,
    date: isoDate,
    time: hhmm,
    adults: small,
    children: z.number().int().min(0).max(10).optional(),
  }),
  z.object({ kind: z.literal('delivery'), restaurantRef: ref, city: z.string().trim().max(80).optional() }),
  z.object({
    kind: z.literal('cinema'),
    filmRef: ref,
    city: z.string().trim().max(80).optional(),
    cinemaRef: ref.optional(),
    date: isoDate.optional(),
    showtime: hhmm.optional(),
    sessionRef: ref.optional(),
    format: z.string().trim().max(40).optional(),
  }),
  z.object({ kind: z.literal('activity'), activityRef: ref, packageRef: ref.optional(), date: isoDate.optional(), quantity: small.optional() }),
  z.object({
    kind: z.literal('spa'),
    activityRef: ref,
    packageRef: ref.optional(),
    quantity: small.optional(),
    preferredDate: isoDate.optional(),
    preferredTime: hhmm.optional(),
  }),
])

export const CommerceRequestSchema = z
  .object({
    domain: z.enum(COMMERCE_DOMAINS),
    intentType: z.enum(INTENT_TYPES),
    capability: z.enum(COMMERCE_CAPABILITIES).optional(),
    subject: z.string().trim().min(1).max(200),
    configuration: configurationSchema.optional(),
    constraints: z
      .object({
        budgetMinVnd: z.number().int().min(0).optional(),
        budgetMaxVnd: z.number().int().min(0).optional(),
        city: z.string().trim().max(80).optional(),
        merchantAllowList: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      })
      .optional(),
    context: z
      .object({
        actorHash: z.string().regex(/^[a-f0-9]{16,64}$/).optional(),
        sessionHash: z.string().regex(/^[a-f0-9]{16,64}$/).optional(),
        platform: z.enum(['web', 'android', 'ios']).optional(),
        locale: z.enum(['vi', 'en']).optional(),
        requireGuestPath: z.boolean().optional(),
        allowTracking: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(r => DOMAIN_INTENTS[r.domain].includes(r.intentType), {
    message: 'intentType does not belong to domain',
    path: ['intentType'],
  })
  // Cross-field rules that a discriminated union cannot carry per member.
  .superRefine((r, ctx) => {
    if (r.capability && r.capability !== INTENT_CAPABILITY[r.intentType]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `capability ${r.capability} does not match intent ${r.intentType} (expects ${INTENT_CAPABILITY[r.intentType]})`, path: ['capability'] })
    }
    const c = r.configuration
    if (c?.kind === 'hotel' && !(c.checkOut > c.checkIn)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'checkOut must be after checkIn', path: ['configuration', 'checkOut'] })
    }
    if (c?.kind === 'transport' && c.returnDate && !(c.returnDate >= c.departDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'returnDate must not precede departDate', path: ['configuration', 'returnDate'] })
    }
  })

export type ValidatedCommerceRequest = z.infer<typeof CommerceRequestSchema>

/** Parse untrusted input into a CommerceRequest, or return the zod issues. */
export function parseCommerceRequest(input: unknown): { ok: true; request: CommerceRequest } | { ok: false; issues: string[] } {
  const parsed = CommerceRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`) }
  }
  // Normalise: every validated request carries its capability, filled from the intent when absent.
  return { ok: true, request: { ...(parsed.data as CommerceRequest), capability: parsed.data.capability ?? INTENT_CAPABILITY[parsed.data.intentType] } }
}
