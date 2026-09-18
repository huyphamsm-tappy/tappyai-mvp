// ─────────────────────────────────────────────────────────────────────────────
// Resolving a share request to its SOURCE message — server-side, owner-only.
//
// The client never supplies the content that becomes public. It names a
// conversation it owns and a message index; the server reads that message
// through the caller's RLS-scoped client (so it can only ever be the caller's
// own conversation) and sanitizes THAT. A caller cannot publish arbitrary text
// under a TappyAI URL, which closes the obvious SEO-spam / phishing vector a
// "share anything" endpoint would open.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPublicPayload } from './publicSanitizer'
import { PUBLIC_PAYLOAD_LIMITS, type SharedResultPayload } from './sharedResult'

export interface ShareRequestBody {
  conversationId: string
  messageIndex: number
  title?: string
  locale?: 'vi' | 'en'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Pure shape check. Returns the parsed body or a rejection code. */
export function parseShareRequest(body: unknown): ShareRequestBody | 'invalid_request' {
  if (!body || typeof body !== 'object') return 'invalid_request'
  const b = body as Record<string, unknown>
  if (typeof b.conversationId !== 'string' || !UUID_RE.test(b.conversationId)) return 'invalid_request'
  if (typeof b.messageIndex !== 'number' || !Number.isInteger(b.messageIndex) || b.messageIndex < 0 || b.messageIndex > 500) return 'invalid_request'
  const title = typeof b.title === 'string' ? b.title.slice(0, PUBLIC_PAYLOAD_LIMITS.title) : undefined
  const locale = b.locale === 'en' ? 'en' : b.locale === 'vi' ? 'vi' : undefined
  return { conversationId: b.conversationId, messageIndex: b.messageIndex, title, locale }
}

export type ResolveResult =
  | { ok: true; payload: SharedResultPayload; domain: string }
  | { ok: false; code: 'not_found' | 'not_an_answer' }

interface StoredMessage { role?: string; content?: string }

/** Pure: pick the answer and the question that produced it out of a transcript. */
export function pickShareSource(messages: StoredMessage[], messageIndex: number): { answer: string; question: string } | null {
  const target = messages[messageIndex]
  if (!target || target.role !== 'assistant' || typeof target.content !== 'string' || !target.content.trim()) return null
  let question = ''
  for (let i = messageIndex - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === 'user' && typeof m.content === 'string') { question = m.content; break }
  }
  return { answer: target.content, question }
}

/**
 * Load the owner's message and build the public payload. `supabase` MUST be
 * the request-scoped (RLS) client from `getRequestUser` — never the admin one.
 */
export async function resolveShareSource(
  supabase: SupabaseClient,
  ownerId: string,
  req: ShareRequestBody,
): Promise<ResolveResult> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, category, messages, updated_at')
    .eq('id', req.conversationId)
    .eq('user_id', ownerId)
    .maybeSingle()
  if (error || !data) return { ok: false, code: 'not_found' }

  const messages = Array.isArray(data.messages) ? (data.messages as StoredMessage[]) : []
  const source = pickShareSource(messages, req.messageIndex)
  if (!source) return { ok: false, code: 'not_an_answer' }

  const payload = buildPublicPayload({
    userQuery: source.question,
    assistantContent: source.answer,
    domain: typeof data.category === 'string' ? data.category : 'general',
    locale: req.locale,
    title: req.title,
    createdAt: typeof data.updated_at === 'string' ? new Date(data.updated_at) : new Date(),
  })
  return { ok: true, payload, domain: payload.domain }
}
