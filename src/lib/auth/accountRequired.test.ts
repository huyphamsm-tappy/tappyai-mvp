import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { refuseWithoutAccount } from './accountRequired'

// Owner 28/11/2026: everything except the chat with Tappy needs a Tappy account. Without one a visitor may look, not use.
const req = { url: 'http://localhost/api/x', headers: new Headers() }

describe('refuseWithoutAccount', () => {
  it('nobody signed in: 401 login_required', async () => {
    const res = refuseWithoutAccount(req, null)
    expect(res!.status).toBe(401)
    expect((await res!.json()).error).toBe('login_required')
  })

  it('an anonymous (visitor) session: 403 account_required, never 401 (a client must not mint another visitor session and loop)', async () => {
    const res = refuseWithoutAccount(req, { is_anonymous: true })
    expect(res!.status).toBe(403)
    expect((await res!.json()).error).toBe('account_required')
  })

  it('a registered account, including an old one with no is_anonymous flag, passes', () => {
    expect(refuseWithoutAccount(req, { is_anonymous: false })).toBeNull()
    expect(refuseWithoutAccount(req, {})).toBeNull()
  })

  it('the sentence says what to do, in the caller language', async () => {
    const vi = await refuseWithoutAccount({ ...req, url: 'http://x/?lang=vi' }, { is_anonymous: true })!.json()
    const en = await refuseWithoutAccount({ ...req, url: 'http://x/?lang=en' }, { is_anonymous: true })!.json()
    expect(vi.message).toMatch(/đăng nhập/i)
    expect(en.message).toMatch(/sign in/i)
    expect(vi.message).not.toBe(en.message)
  })
})

// Routes that a visitor could use before this change and that are not the chat. Each must call the guard AFTER it has resolved the user.
const GUARDED = [
  'scam-shield/analyze', 'scam-shield/check', 'scam-shield/qr', 'scam-shield/share',
  'scan', 'translate', 'rates', 'booking/recheck', 'bookings', 'price-watch', 'favorites',
  'stripe/checkout', 'stripe/portal', 'plans/share', 'users/search', 'integrations', 'integrations/google-calendar', 'integrations/zalo',
]

describe('routes a visitor must not use', () => {
  for (const r of GUARDED) {
    it(`${r} refuses a visitor`, () => {
      const src = readFileSync(`src/app/api/${r}/route.ts`, 'utf8')
      expect(src, r).toContain('refuseWithoutAccount')
      expect(src.indexOf('getRequestUser'), r).toBeGreaterThan(-1)
      expect(src.indexOf('refuseWithoutAccount(req', src.indexOf('getRequestUser(')), r).toBeGreaterThan(src.indexOf('getRequestUser('))
    })
  }

  it('the chat and its own private state stay open to a visitor (conversations, memory, preferences, the chat route itself)', () => {
    for (const rel of ['chat', 'conversations', 'memory', 'preferences']) {
      expect(readFileSync(`src/app/api/${rel}/route.ts`, 'utf8'), rel).not.toContain('refuseWithoutAccount')
    }
  })
})
