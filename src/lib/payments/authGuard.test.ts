import { afterEach, describe, expect, it, vi } from 'vitest'

// Who may use the payment routes: a real, active account — never a guest, an anonymous session or a banned user.

const h = vi.hoisted(() => ({ user: null as null | { id: string; is_anonymous?: boolean }, blocked: false }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/account/accountStatus', async (orig) => ({
  ...(await orig<typeof import('@/lib/account/accountStatus')>()),
  getAccountRestriction: async () => (h.blocked ? { blocked: true, reason: 'suspended' } : { blocked: false }),
}))

import { requirePayer } from './authGuard'

const req = () => new Request('https://t.test/x', { method: 'POST' })
afterEach(() => { h.user = null; h.blocked = false })

describe('requirePayer', () => {
  it('a guest is refused (401)', async () => {
    const r = await requirePayer(req())
    expect(r instanceof Response && r.status).toBe(401)
  })
  it('an anonymous session is refused (it has no account to put a plan on)', async () => {
    h.user = { id: 'a1', is_anonymous: true }
    const r = await requirePayer(req())
    expect(r instanceof Response).toBe(true)
    expect((r as Response).status).toBeGreaterThanOrEqual(401)
    expect((r as Response).status).toBeLessThan(500)
  })
  it('a suspended account is refused', async () => {
    h.user = { id: 'u1', is_anonymous: false }
    h.blocked = true
    const r = await requirePayer(req())
    expect(r instanceof Response && r.status).toBe(403)
  })
  it('a real, active account passes and gets its own client', async () => {
    h.user = { id: 'u1', is_anonymous: false }
    const r = await requirePayer(req())
    expect(r instanceof Response).toBe(false)
    expect((r as { user: { id: string } }).user.id).toBe('u1')
  })
})
