import type { SupabaseClient } from '@supabase/supabase-js'

// Module 08 — internal admin notes.
//
// CONTRACT
//   04_Database_Architecture.md §4.6   the table
//   10_User_Management.md §3.8         "Chronological internal notes from
//                                      user_notes. Pinned notes shown at top."
//   10_User_Management.md §3.9         "Add internal note - moderator"
//
// This module owns the READ SHAPE and the ORDER. It owns no authorization:
// the routes call `requirePermission` and this file never sees an actor. A
// second place that decided who may read a note would be a second
// authorization path, and the two would disagree eventually.
//
// It also never resolves an author to a name. §4.6 stores `author_id` and
// nothing else, and `profiles` is public-read — joining it here would attach a
// display name to an internal record for no contract reason. The Controller
// shows the id; if a name is ever wanted, that is a contract change.

/** One row as the table stores it. */
export interface UserNoteRow {
  id: string
  user_id: string
  author_id: string
  note: string
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export type NotesStatus = 'ok' | 'empty' | 'error'

export interface NotesResult {
  status: NotesStatus
  notes: UserNoteRow[]
}

const COLUMNS = 'id, user_id, author_id, note, is_pinned, created_at, updated_at'

/**
 * §3.8's order: pinned first, then newest first.
 *
 * Sorted HERE rather than in SQL because the two keys are a presentation rule,
 * and because `idx_user_notes_user` covers `(user_id, created_at DESC)` — the
 * filter and the tiebreak — while `is_pinned` is a small in-memory partition
 * over one subject's notes, which is at most a page of rows.
 */
export function orderNotes(rows: readonly UserNoteRow[]): UserNoteRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
}

/** How many notes one request may return. A person is not a filing cabinet. */
export const NOTES_PAGE_SIZE = 100

/**
 * Read one subject's notes. Never throws — a user detail that 500s because the
 * notes table is unreachable is worse than one that says the notes are.
 */
export async function listNotes(
  admin: SupabaseClient,
  userId: string
): Promise<NotesResult> {
  try {
    const { data, error } = await admin
      .from('user_notes')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(NOTES_PAGE_SIZE)

    if (error) {
      console.error('[admin][notes] read failed:', error.message)
      return { status: 'error', notes: [] }
    }
    const rows = orderNotes((data ?? []) as UserNoteRow[])
    // An error already returned above, so reaching here with nothing means the
    // account genuinely has no notes — a different fact from "unreadable".
    return { status: rows.length === 0 ? 'empty' : 'ok', notes: rows }
  } catch (e) {
    console.error('[admin][notes] read threw:', e instanceof Error ? e.message : e)
    return { status: 'error', notes: [] }
  }
}

/**
 * Add a note. The author is the ACTOR, taken from the authenticated context by
 * the route — never from the request body, which would let any note be
 * attributed to anyone.
 */
export async function addNote(
  admin: SupabaseClient,
  input: { userId: string; authorId: string; note: string; isPinned?: boolean }
): Promise<UserNoteRow | null> {
  const { data, error } = await admin
    .from('user_notes')
    .insert({
      user_id: input.userId,
      author_id: input.authorId,
      note: input.note,
      is_pinned: input.isPinned ?? false,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    console.error('[admin][notes] insert failed:', error.message)
    return null
  }
  return data as UserNoteRow
}
