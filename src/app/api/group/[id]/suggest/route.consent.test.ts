import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'

// Group suggestions put each member's name, budget, food preferences, diet and area into the model prompt. A member's
// details reach the model only if that member has an account that is ALLOWED: web-only accounts keep the existing
// behaviour; an account that has used iOS must have agreed to the current disclosure. A guest (no account) is never
// described. A failed consent read describes no account member (fail closed).

const h = vi.hoisted(() => ({
  creatorId: 'creator',
  members: [] as Array<Record<string, unknown>>,
  consent: [] as Array<Record<string, unknown>>,
  consentThrows: false,
  generate: vi.fn(async (_o: { prompt: string }) => ({ text: 'Gợi ý' })),
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: { id: h.creatorId }, supabase: client() }),
}))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true }) }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: (o: { prompt: string }) => h.generate(o) } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin() }))

/** A chainable stand-in for a Supabase query. The awaited value depends on the table. */
function query(table: string) {
  let ids: string[] | null = null
  const b: Record<string, unknown> = {}
  const chain = () => b
  Object.assign(b, {
    select: chain, order: chain, eq: chain, update: chain,
    single() { return b },
    in(_col: string, v: string[]) { ids = v; return b },
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      if (table === 'groups') return Promise.resolve({ data: { id: 'g1', name: 'Bạn bè', creator_id: 'creator' }, error: null }).then(res, rej)
      if (table === 'group_members') return Promise.resolve({ data: h.members, error: null }).then(res, rej)
      if (table === 'ai_data_consent') {
        if (h.consentThrows) return Promise.reject(new Error('db down')).then(res, rej)
        const rows = h.consent.filter(r => !ids || ids.includes(r.user_id as string))
        return Promise.resolve({ data: rows, error: null }).then(res, rej)
      }
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    },
  })
  return b
}
function client() { return { from: (t: string) => query(t) } }
function admin() { return { from: (t: string) => query(t) } }

const member = (over: Record<string, unknown>) => ({
  user_id: null, name: 'x', budget: 'y', food_preferences: 'z', dietary_restrictions: 'w', area: 'v', ...over,
})

async function suggest() {
  const { POST } = await import('@/app/api/group/[id]/suggest/route')
  return POST(new Request('http://localhost/api/group/g1/suggest', { method: 'POST' }) as never, { params: { id: 'g1' } })
}

const CREATOR = member({ user_id: 'creator', name: 'Linh_CREATOR', budget: '111111', food_preferences: 'pho_CREATOR', area: 'Quan1_CREATOR' })
const MINH = member({ user_id: 'minh', name: 'Minh_OTHER', budget: '777777', food_preferences: 'buncha_OTHER', dietary_restrictions: 'hai_san_OTHER', area: 'Hanoi_OTHER' })
const GUEST = member({ user_id: null, name: 'Hoa_GUEST', budget: '888888', food_preferences: 'lau_GUEST', area: 'Danang_GUEST' })

describe('group suggestions — each member’s details follow that member’s account state', () => {
  beforeEach(() => {
    h.creatorId = 'creator'
    h.generate.mockClear()
    h.consentThrows = false
    h.members = [CREATOR, MINH, GUEST]
    h.consent = [
      { user_id: 'creator', ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION },
      { user_id: 'minh', ios_used: true, granted: false, decision: 'refused', version: AI_DATA_CONSENT_VERSION },
    ]
  })

  it('an agreeing iOS member is described; a refusing iOS member and a guest never reach the model', async () => {
    const res = await suggest()
    expect(res.status).toBe(200)
    expect(h.generate).toHaveBeenCalledTimes(1)
    const prompt = h.generate.mock.calls[0][0].prompt
    expect(prompt).toContain('Linh_CREATOR')
    expect(prompt).toContain('111111')
    for (const secret of ['Minh_OTHER', '777777', 'buncha_OTHER', 'hai_san_OTHER', 'Hanoi_OTHER']) expect(prompt).not.toContain(secret)
    // A guest has no account, so no consent can be recorded for it: never described.
    for (const secret of ['Hoa_GUEST', '888888', 'lau_GUEST', 'Danang_GUEST']) expect(prompt).not.toContain(secret)
    expect(prompt).toContain('có 3 người')
    expect(prompt).toContain('2 thành viên khác chưa chia sẻ')
  })

  it('an iOS member who has not answered the sheet is not described (never assumed agreed)', async () => {
    h.consent = [
      { user_id: 'creator', ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION },
      { user_id: 'minh', ios_used: true, granted: null, decision: null, version: null },
    ]
    await suggest()
    const prompt = h.generate.mock.calls[0][0].prompt
    expect(prompt).not.toContain('Minh_OTHER')
    expect(prompt).not.toContain('777777')
  })

  it('an old-version agreement does not count as agreement', async () => {
    h.consent = [
      { user_id: 'creator', ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION },
      { user_id: 'minh', ios_used: true, granted: true, decision: 'agreed', version: 0 },
    ]
    await suggest()
    const prompt = h.generate.mock.calls[0][0].prompt
    expect(prompt).not.toContain('Minh_OTHER')
    expect(prompt).not.toContain('777777')
  })

  it('a web-only member (no iOS record) keeps being described, as before', async () => {
    h.consent = [] // every member is web-only
    const res = await suggest()
    expect(res.status).toBe(200)
    const prompt = h.generate.mock.calls[0][0].prompt
    expect(prompt).toContain('Linh_CREATOR')
    expect(prompt).toContain('Minh_OTHER')
    // The guest is still never described; it is counted.
    expect(prompt).not.toContain('Hoa_GUEST')
    expect(prompt).toContain('1 thành viên khác chưa chia sẻ')
  })

  it('if the consent read fails, no account member is described (fail closed) — even the creator; a guest is still never described', async () => {
    h.consentThrows = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await suggest()
    spy.mockRestore()
    expect(res.status).toBe(200)
    const prompt = h.generate.mock.calls[0][0].prompt
    for (const secret of ['Linh_CREATOR', '111111', 'Minh_OTHER', '777777', 'Hoa_GUEST', '888888']) expect(prompt).not.toContain(secret)
    expect(prompt).toContain('3 thành viên khác chưa chia sẻ')
  })

  it('a non-owner still gets 403 and no model call', async () => {
    h.creatorId = 'someone-else'
    const res = await suggest()
    expect(res.status).toBe(403)
    expect(h.generate).not.toHaveBeenCalled()
  })
})
