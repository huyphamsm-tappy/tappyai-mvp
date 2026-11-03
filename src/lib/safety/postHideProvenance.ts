// Proof that a moderation DECISION (a restriction or a lock on a reported post's author) took a post from a visible state to hidden.
//
// Why it exists: a post can be `RESTRICTED` for unrelated reasons — the pre-publication safety gate, a reviewer's «hold», or a decision
// that hides it. When a reversed appeal lifts a restriction/lock, the post may be published again ONLY if that decision is what hid it.
// The current state cannot show that, so the decide route writes one `moderation_actions` row (action `hide_content`, the existing table
// and enum — no migration) whose `notes` carries this small JSON: the decision id and the state the post was in BEFORE the hide.
// It is written BEFORE the hide, from the state just read, so no failure can leave a hidden post without it: a retry finds the record and
// finishes the hide. It is a statement of intent plus the starting state, not proof that the hide landed. What makes a later restore safe
// is the rest of the picture (appeals/[id]/resolve/route.ts): the safety gate cannot re-restrict an existing post
// (reviews/route.ts evaluates a post once, on creation; this was read from the code, not pinned by a test), and every other way a post becomes RESTRICTED leaves a ledger row or another `hide_content` action,
// any of which blocks the restore. A post already restricted when a decision looks at it gets no record at all.
//
// A row that is missing, unreadable, from another decision, or whose `before` was not a visible state proves nothing: callers fail closed.

import type { SupabaseClient } from '@supabase/supabase-js'

export const HIDE_PROVENANCE_VERSION = 1

export interface HideProvenance {
  /** the decision (moderation_decisions.id) that made the transition */
  decision_id: string
  /** the publication_state before the hide (`null` = a legacy row from before the gate, which was visible) */
  before: string | null
  after: string
}

export function hideProvenanceNotes(p: HideProvenance): string {
  return JSON.stringify({ tappy_hide_provenance: HIDE_PROVENANCE_VERSION, decision_id: p.decision_id, before: p.before, after: p.after })
}

export function parseHideProvenance(notes: string | null | undefined): HideProvenance | null {
  if (typeof notes !== 'string' || !notes.startsWith('{')) return null
  try {
    const o = JSON.parse(notes) as Record<string, unknown>
    if (o.tappy_hide_provenance !== HIDE_PROVENANCE_VERSION) return null
    if (typeof o.decision_id !== 'string' || typeof o.after !== 'string') return null
    if (o.before !== null && typeof o.before !== 'string') return null
    return { decision_id: o.decision_id, before: o.before as string | null, after: o.after }
  } catch { return null }
}

/** The state the post was in before the hide was one in which readers could see it. UNDER_REVIEW and RESTRICTED were not. */
export const wasVisibleBeforeHide = (p: HideProvenance): boolean => p.before === 'PUBLISHED' || p.before === null

/**
 * Is the post still kept hidden by moderation OTHER than the caller's own action? True when either
 *  - another decision on it still stands (content removed, restriction, lock) — one that was reversed on appeal does not count; or
 *  - another report on it is on hold (`in_review`, which only the decide route's «hold» sets).
 * Used before ANY code republishes a post: dismissing an unrelated report, or winning an appeal, must not undo a decision that still
 * stands. Throws on a read error, so the caller can refuse to act rather than guess.
 */
export async function postStillHeldByOthers(
  admin: SupabaseClient,
  postId: string,
  except: { queueId?: string | null; decisionId?: string },
): Promise<boolean> {
  let decisions = admin.from('moderation_decisions').select('id').eq('content_type', 'review').eq('content_id', postId).in('outcome', ['content_removed', 'banned', 'restricted'])
  if (except.decisionId) decisions = decisions.neq('id', except.decisionId)
  const dec = await decisions
  if (dec.error) throw new Error('decisions read failed')
  const ids = ((dec.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (ids.length > 0) {
    const won = await admin.from('moderation_appeals').select('decision_id').in('decision_id', ids).eq('status', 'reversed')
    if (won.error) throw new Error('appeals read failed')
    const reversed = new Set(((won.data ?? []) as Array<{ decision_id: string }>).map((w) => w.decision_id))
    if (ids.some((id) => !reversed.has(id))) return true
  }
  let holds = admin.from('moderation_queue').select('id').eq('target_type', 'review').eq('target_id', postId).eq('status', 'in_review')
  if (except.queueId) holds = holds.neq('id', except.queueId)
  const hold = await holds.limit(1)
  if (hold.error) throw new Error('queue read failed')
  return (hold.data ?? []).length > 0
}
