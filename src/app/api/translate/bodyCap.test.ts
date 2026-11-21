// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Hardening 21/11/2026: the translate body is capped while it is read (32 KB), before it is parsed: a 5 MB body is refused with 413 and never reaches JSON.parse or the model.

const h = vi.hoisted(() => ({ modelCalls: 0 }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: async () => { h.modelCalls++; return { text: 'x' } } } }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: null, supabase: {} }) }))
vi.mock('@/lib/ai/consent/aiConsentGuard', () => ({ refuseWithoutAiConsent: async () => null }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: true }), publicDailyRateLimit: async () => ({ ok: true }) }))

describe('POST /api/translate body cap', () => {
  it('a body over 32 KB is refused (413) before any parsing or model call, even with no content-length', async () => {
    const { POST } = await import('./route')
    const big = JSON.stringify({ text: 'a'.repeat(5_000_000) })
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close() } })
    const res = await POST(new Request('http://localhost/api/translate', { method: 'POST', body: stream, headers: { 'content-type': 'application/json' }, duplex: 'half' } as RequestInit) as never)
    expect(res.status).toBe(413)
    expect(h.modelCalls).toBe(0)
  })
})
