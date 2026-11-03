import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/translate with a signed-in account. The model must not be called unless the account may send its text
// (App Review 5.1.2(i)). A direct API call is held exactly like an app call.

const state = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  consentRows: [] as Array<Record<string, unknown>>,
  generateCalls: 0,
}))

vi.mock('@/lib/ai/llm', () => ({
  AI: {
    generate: async () => {
      state.generateCalls++
      return { text: 'ok' }
    },
  },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: state.user, supabase: {} }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: async () => ({ data: state.consentRows, error: null }) }),
    }),
  }),
}))

vi.mock('@/lib/security/publicRateLimit', () => ({
  publicDailyRateLimit: async () => ({ ok: true }),
}))

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/translate/route')
  return POST(new Request('http://localhost/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  }) as never)
}

beforeEach(() => {
  state.user = null
  state.consentRows = []
  state.generateCalls = 0
})

describe('POST /api/translate — AI consent gate', () => {
  it('Web-only signed-in account: translates as before', async () => {
    state.user = { id: 'web-user' }
    const res = await post({ text: 'hello' })
    expect(res.status).toBe(200)
    expect(state.generateCalls).toBe(1)
  })

  it('iOS account that has not answered the sheet: 403 and the model is never called', async () => {
    state.user = { id: 'u' }
    state.consentRows = [{ user_id: 'u', ios_used: true, granted: null, decision: null, version: null }]
    const res = await post({ text: 'hello' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('ai_consent_required')
    expect(state.generateCalls).toBe(0)
  })

  it('iOS account that refused: 403, nothing sent', async () => {
    state.user = { id: 'u' }
    state.consentRows = [{ user_id: 'u', ios_used: true, granted: false, decision: 'refused', version: 2 }]
    expect((await post({ text: 'hello' })).status).toBe(403)
    expect(state.generateCalls).toBe(0)
  })

  it('iOS account that agreed to the current disclosure: translates', async () => {
    state.user = { id: 'u' }
    state.consentRows = [{ user_id: 'u', ios_used: true, granted: true, decision: 'agreed', version: 2 }]
    expect((await post({ text: 'hello' })).status).toBe(200)
    expect(state.generateCalls).toBe(1)
  })

  it('signed-out caller: no account to check, translates as before (residual gap, reported)', async () => {
    state.user = null
    expect((await post({ text: 'hello' })).status).toBe(200)
    expect(state.generateCalls).toBe(1)
  })
})
