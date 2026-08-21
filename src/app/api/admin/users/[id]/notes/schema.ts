import { z } from 'zod'

// Request contract for /api/admin/users/[id]/notes.

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** The id arrives from the route segment, not from a validated body. */
export const isUuid = (v: string): boolean => UUID.test(v)

export const AddNoteSchema = z
  .object({
    // Trimmed BEFORE the length check, so a note of spaces is an empty note.
    // 2000 characters is a note; anything longer is a document, and the
    // Controller is not a document store.
    note: z.string().trim().min(1, 'note is required').max(2000, 'note is too long'),
    isPinned: z.boolean().optional(),
  })
  // Strict: `author_id` in particular must NOT be accepted from input — the
  // route takes it from the authenticated actor. Silently ignoring an unknown
  // field would let a caller believe they had set one.
  .strict()

export type AddNoteInput = z.infer<typeof AddNoteSchema>
