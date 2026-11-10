import { z } from 'zod'

// Request contract of the Explore video review desk (VID-03).

export const DecideSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    // Required and not merely present: a decision with no recorded reason is unreadable later (the database refuses a blank note too).
    note: z.string().trim().min(5, 'note is required').max(1000, 'note is too long'),
  })
  .strict()

export type DecideInput = z.infer<typeof DecideSchema>

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
export const isUuid = (v: string): boolean => UUID.test(v)
