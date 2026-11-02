import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'

// POST /api/ai-consent. The app reports its use (heartbeat), its decisions (agreed / refused / withdrawn). A heartbeat
// must never overwrite a decision. Writes go through the service role after the account check, and a stale disclosure
// version is refused.

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string; is_anonymous?: boolean } | null,
  upserts: [] as Array<Record<string, unknown>>,
  upsertError: null as null | { message: string },
  adminCalls: 0,
  userClientWrites: 0,
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: state.user,
    // The user-scoped client must NOT be used to write: the table revokes client writes.
    supabase: { from: () => { state.userClientWrites++; return {} } },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    state.adminCalls++
    return {
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
          expect(table).toBe('ai_data_consent')
          expect(opts.onConflict).toBe('user_id')
          state.upserts.push(row)
          return { error: state.upsertError }
        },
      }),
    }
  },
}))

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/ai-consent/route')
  return POST(new Request('http://localhost/api/ai-consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('POST /api/ai-consent', () => {
  beforeEach(() => {
    state.user = { id: 'user-1' }
    state.upserts = []
    state.upsertError = null
    state.adminCalls = 0
    state.userClientWrites = 0
  })

  it('an agreement is stored for the account at the current version, and marks iOS use', async () => {
    const res = await post({ granted: true, version: AI_DATA_CONSENT_VERSION })
    expect(res.status).toBe(200)
    expect(state.upserts[0]).toMatchObject({ user_id: 'user-1', ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION })
  })

  it('a withdrawal is stored as withdrawn (granted false), so the background jobs stop using the data', async () => {
    const res = await post({ granted: false, version: AI_DATA_CONSENT_VERSION })
    expect(res.status).toBe(200)
    expect(state.upserts[0]).toMatchObject({ user_id: 'user-1', ios_used: true, granted: false, decision: 'withdrawn', version: AI_DATA_CONSENT_VERSION })
  })

  it('a refusal is stored as refused, distinct from a withdrawal', async () => {
    await post({ granted: false, decision: 'refused', version: AI_DATA_CONSENT_VERSION })
    expect(state.upserts[0]).toMatchObject({ granted: false, decision: 'refused' })
  })

  it('a heartbeat (granted null) records iOS use only: it carries no decision, so it cannot overwrite one', async () => {
    const res = await post({ granted: null, version: AI_DATA_CONSENT_VERSION })
    expect(res.status).toBe(200)
    const row = state.upserts[0]
    expect(row).toMatchObject({ user_id: 'user-1', ios_used: true })
    for (const key of ['granted', 'decision', 'version', 'decided_at']) expect(row).not.toHaveProperty(key)
  })

  it('a client that shows an older disclosure version is refused and nothing is stored', async () => {
    const res = await post({ granted: true, version: 0 })
    expect(res.status).toBe(400)
    expect(state.upserts).toHaveLength(0)
  })

  it('a malformed body is refused', async () => {
    expect((await post({ granted: 'yes', version: AI_DATA_CONSENT_VERSION })).status).toBe(400)
    expect((await post({ version: AI_DATA_CONSENT_VERSION })).status).toBe(400)
    expect(state.upserts).toHaveLength(0)
  })

  it('an anonymous visitor cannot write a decision', async () => {
    state.user = { id: 'anon-1', is_anonymous: true }
    const res = await post({ granted: true, version: AI_DATA_CONSENT_VERSION })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(state.upserts).toHaveLength(0)
  })

  it('no signed-in user: 401 and nothing stored', async () => {
    state.user = null
    expect((await post({ granted: true, version: AI_DATA_CONSENT_VERSION })).status).toBe(401)
    expect(state.upserts).toHaveLength(0)
  })

  it('the write goes through the service role, never the user-scoped client', async () => {
    await post({ granted: true, version: AI_DATA_CONSENT_VERSION })
    expect(state.adminCalls).toBeGreaterThan(0)
    expect(state.userClientWrites).toBe(0)
  })

  it('a failed save is reported, not hidden', async () => {
    state.upsertError = { message: 'db down' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post({ granted: false, version: AI_DATA_CONSENT_VERSION })).status).toBe(500)
    spy.mockRestore()
  })
})
