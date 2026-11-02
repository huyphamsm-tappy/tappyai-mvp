import { describe, it, expect, vi, beforeEach } from 'vitest'

// refuseWithoutAiConsent: the server-side gate every AI endpoint runs before any personal data reaches the provider
// (App Review 5.1.2(i)). Null means "may send"; a 403 response means "send nothing".

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  error: null as null | { code?: string; message: string },
  throwOnRead: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe('ai_data_consent')
      return {
        select: () => ({
          in: async () => {
            if (state.throwOnRead) throw new Error('connection reset')
            return { data: state.rows, error: state.error }
          },
        }),
      }
    },
  }),
}))

const guard = async (userId: string, locale = 'vi') => {
  const { refuseWithoutAiConsent } = await import('@/lib/ai/consent/aiConsentGuard')
  return refuseWithoutAiConsent(userId, locale)
}

beforeEach(() => {
  state.rows = []
  state.error = null
  state.throwOnRead = false
})

describe('refuseWithoutAiConsent', () => {
  it('lets a Web-only account through (no iOS record)', async () => {
    expect(await guard('web-user')).toBeNull()
  })

  it('lets a Web-only account through when its row says the iOS app was not used', async () => {
    state.rows = [{ user_id: 'web-user', ios_used: false, granted: null, decision: null, version: null }]
    expect(await guard('web-user')).toBeNull()
  })

  it('blocks an iOS account that has not answered the sheet (nothing sent)', async () => {
    state.rows = [{ user_id: 'u', ios_used: true, granted: null, decision: null, version: null }]
    const res = await guard('u')
    expect(res?.status).toBe(403)
    expect((await res!.json()).error).toBe('ai_consent_required')
  })

  it('blocks an iOS account that refused', async () => {
    state.rows = [{ user_id: 'u', ios_used: true, granted: false, decision: 'refused', version: 2 }]
    expect((await guard('u'))?.status).toBe(403)
  })

  it('blocks an iOS account that withdrew', async () => {
    state.rows = [{ user_id: 'u', ios_used: true, granted: false, decision: 'withdrawn', version: 2 }]
    expect((await guard('u'))?.status).toBe(403)
  })

  it('lets an iOS account through when it agreed to the current disclosure', async () => {
    state.rows = [{ user_id: 'u', ios_used: true, granted: true, decision: 'agreed', version: 2 }]
    expect(await guard('u')).toBeNull()
  })

  it('blocks an iOS account that agreed only to an older disclosure (stale)', async () => {
    state.rows = [{ user_id: 'u', ios_used: true, granted: true, decision: 'agreed', version: 1 }]
    expect((await guard('u'))?.status).toBe(403)
  })

  it('blocks when the consent read returns an error (cannot verify, so nothing is sent)', async () => {
    state.error = { code: 'XX000', message: 'boom' }
    expect((await guard('u'))?.status).toBe(403)
  })

  it('blocks when the consent read throws', async () => {
    state.throwOnRead = true
    expect((await guard('u'))?.status).toBe(403)
  })

  it('treats a missing consent table (migration not applied yet) as Web-only, so nothing breaks before rollout', async () => {
    state.error = { code: '42P01', message: 'relation "ai_data_consent" does not exist' }
    expect(await guard('u')).toBeNull()
  })

  it('judges each account on its own row (multi-platform: another account refusing does not block this one)', async () => {
    state.rows = [
      { user_id: 'refuser', ios_used: true, granted: false, decision: 'refused', version: 2 },
      { user_id: 'agreer', ios_used: true, granted: true, decision: 'agreed', version: 2 },
    ]
    expect(await guard('agreer')).toBeNull()
    expect((await guard('refuser'))?.status).toBe(403)
  })

  it('returns the message in the caller locale', async () => {
    state.rows = [{ user_id: 'u', ios_used: true, granted: null, decision: null, version: null }]
    const en = await guard('u', 'en-US')
    expect((await en!.json()).message).toMatch(/^Agree to share data with AI/)
  })
})
