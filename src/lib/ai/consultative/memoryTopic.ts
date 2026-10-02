// ── CONSULTATIVE V1 — the topic of a plain request, without a model call ──────
//
// With the consultative memory gate a plain request ("tim quan bun bo o q1 duoi 80k") no longer
// pays for an extraction call: measured, its only durable yield was the `history` topic the model
// wrote ("bún bò Quận 1"). That topic is recorded here deterministically instead, from the user's
// own words, so "Gan day da hoi ve" keeps working at $0.

import type { UserMemory } from '@/lib/memory/memoryService'

export const TOPIC_CHARS = 40
export const HISTORY_KEEP = 10
const MIN_CHARS = 12

/**
 * @returns the topic line to append to `history`, or null when the turn is not a plain request
 * worth a history entry (chitchat, a follow-up inside a thread, too short).
 */
export function plainRequestTopic(input: { text: string; intent: 'chitchat' | 'tool'; isFirstReply: boolean }): string | null {
  if (input.intent === 'chitchat' || !input.isFirstReply) return null
  const t = (input.text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length < MIN_CHARS) return null
  return t.length > TOPIC_CHARS ? t.slice(0, TOPIC_CHARS - 1).trimEnd() + '…' : t
}

/** The merged history the route persists: de-duplicated (case/space-insensitive), newest last. */
export function appendHistoryTopic(existing: UserMemory | null, topic: string): string[] {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const out = (existing?.history ?? []).filter(h => key(h) !== key(topic))
  out.push(topic)
  return out.slice(-HISTORY_KEEP)
}
