// ── Social messaging · shared types ─────────────────────────────────────────
//
// 🚨 USER ↔ USER. NOT USER ↔ TAPPYAI.
//
// `src/lib/ai/messages.ts`, `/api/chat`, `/api/conversations` and the
// `conversations` table are the AI assistant. They share vocabulary with this
// file — "message", "conversation", "thread" — and nothing else. Nothing here
// imports from there, and nothing there should ever import from here.
//
// The names are `Chat*` because the tables are `chat_*`, which is what the
// database had left after `conversations` was taken.

/** Direct threads are deduplicated per pair; groups are not. */
export type ChatThreadKind = 'direct' | 'group'

/** A participant, joined to the public `profiles` row the UI renders. */
export interface ChatParticipant {
  userId: string
  fullName: string | null
  avatarUrl: string | null
}

export interface ChatMessage {
  id: string
  threadId: string
  /** Null when the author's account is gone — the message stays, the name does not. */
  senderId: string | null
  body: string
  createdAt: string
}

/**
 * One row of the conversation list.
 *
 * `unreadCount` is DERIVED by `chat_thread_summaries()` — messages after the
 * caller's read cursor that the caller did not send. It is never stored and
 * never computed on the client, so there is no path by which the badge and the
 * thread can disagree.
 */
export interface ChatThreadSummary {
  id: string
  kind: ChatThreadKind
  /** Group name. Null for direct threads, which are titled from the counterpart. */
  title: string | null
  lastMessageAt: string
  lastMessage: { body: string; senderId: string | null; createdAt: string } | null
  unreadCount: number
  /** Everyone in the thread, the caller included. */
  participants: ChatParticipant[]
}

/** The other person in a direct thread, or null for a group. */
export function counterpart(
  thread: Pick<ChatThreadSummary, 'kind' | 'participants'>,
  meId: string | null,
): ChatParticipant | null {
  if (thread.kind !== 'direct') return null
  return thread.participants.find(p => p.userId !== meId) ?? null
}

/**
 * What the list row and the thread header are titled.
 *
 * A group keeps its name; a direct thread takes the counterpart's. `fallback`
 * is an i18n string supplied by the caller — this module never holds
 * user-facing text.
 */
export function threadTitle(
  thread: Pick<ChatThreadSummary, 'kind' | 'title' | 'participants'>,
  meId: string | null,
  fallback: string,
): string {
  if (thread.kind === 'group') return thread.title?.trim() || fallback
  return counterpart(thread, meId)?.fullName?.trim() || fallback
}
