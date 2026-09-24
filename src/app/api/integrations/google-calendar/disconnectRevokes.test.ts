import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// C-1 — the DISCONNECT ROUTE, driven for real.
//
// The helper's own tests prove revocation works. This proves the route actually
// calls it, and in the right order: a version that deletes the row and never
// revokes passes every helper test ever written while leaving the user's Google
// grant live forever — and leaving a working credential in every backup taken
// before the disconnect.
//
// So the assertions here are about SEQUENCE and UNCONDITIONALITY, not about
// HTTP: revoke happens, it happens before the delete, and the delete happens
// even when Google refuses.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  delete (globalThis as { WebSocket?: unknown }).WebSocket
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon'
  return {
    order: [] as string[],
    revokeResult: true,
    stored: { access_token: 'ya29.access', refresh_token: '1//0gRefresh' } as
      { access_token: string | null; refresh_token: string | null } | null,
  }
})

vi.mock('@/lib/integrations/googleCalendar', () => ({
  revokeGoogleToken: async () => { h.order.push('revoke'); return h.revokeResult },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: { id: 'user-1' },
    supabase: {
      from: () => {
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq']) chain[m] = () => chain
        chain.maybeSingle = async () => ({ data: h.stored, error: null })
        chain.delete = () => { h.order.push('delete'); return chain }
        // `.delete().eq().eq()` is awaited directly.
        ;(chain as { then: unknown }).then = (r: (v: unknown) => void) => r({ error: null })
        return chain
      },
    },
  }),
}))

const { GET } = await import('./route')

const disconnect = () =>
  GET(new Request('https://tappy.ai/api/integrations/google-calendar?action=disconnect') as never)

beforeEach(() => {
  h.order.length = 0
  h.revokeResult = true
  h.stored = { access_token: 'ya29.access', refresh_token: '1//0gRefresh' }
})

describe('C-1 · disconnecting Google Calendar', () => {
  it('🚨 revokes at Google BEFORE deleting our row', async () => {
    await disconnect()
    expect(h.order).toEqual(['revoke', 'delete'])
  })

  it('still deletes the row when Google refuses — the user is not trapped', async () => {
    h.revokeResult = false
    await disconnect()
    expect(h.order).toEqual(['revoke', 'delete'])
  })

  it('redirects back to the integrations page either way', async () => {
    const res = await disconnect()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/profile/integrations')
  })

  it('does not fall over when there was no stored integration', async () => {
    h.stored = null
    const res = await disconnect()
    expect(h.order).toContain('delete')
    expect(res.status).toBe(307)
  })
})
