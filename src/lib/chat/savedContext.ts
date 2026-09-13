import { readExploreClipContext, type ExploreClipRef } from '@/lib/ai/security/clientInput'

// ── Where the Explore clip reference lives once a thread is saved ────────────
//
// "Hỏi Tappy về chỗ này" sends `context: { kind: 'explore_clip', reviewId }` with every
// request of the thread. That context used to exist only as a prop on the FIRST page: after
// the first reply the thread is saved and the router moves to `/chat/<id>`, which rebuilds the
// chat from the saved row — and the row had nowhere to say which clip it started from. Turn two
// therefore ran as plain chat: the deterministic venue narrowing never ran, and an area the
// user typed became an ordinary discovery search.
//
// The fix is a persistence seam that already exists: `conversations.messages` is a free-form
// JSONB array of `{ role, content }`. The FIRST message carries the reference as an extra
// `context` field. Nothing else in the row changes, every reader of the array keeps reading
// `role`/`content` (History, Planner, the thread itself), and the reference is exactly the
// object the request body already carried — a review ID, never a venue fact. The server
// re-reads the review under the caller's own RLS on every turn, as it always did.
//
// 🚨 SHAPE-ONLY ON THE WAY BACK. A saved row is user-owned data; what comes out of it is read
// with the same validator the request body goes through (`readExploreClipContext`): the kind
// must be `explore_clip` and the id must be a UUID, or there is no context at all.

export type SavedMessage = { role: string; content: string; context?: ExploreClipRef }

/**
 * The messages to persist: the same list, with the clip reference on the first entry when
 * this thread has one. Pure — returns new objects, never mutates the input.
 */
export function attachSavedContext<M extends { role: string; content: string }>(
  messages: readonly M[],
  context: ExploreClipRef | undefined,
): Array<{ role: string; content: string; context?: ExploreClipRef }> {
  return messages.map((m, i) => ({
    role: m.role,
    content: m.content,
    ...(i === 0 && context ? { context } : {}),
  }))
}

/**
 * The clip reference a saved thread started from, or undefined. Only the FIRST message is
 * consulted, and only a well-formed reference is returned.
 */
export function readSavedContext(messages: unknown): ExploreClipRef | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined
  return readExploreClipContext(messages[0]) ?? undefined
}
