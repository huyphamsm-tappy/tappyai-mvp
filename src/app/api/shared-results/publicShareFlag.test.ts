import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// A5 (PRIVACY-REVIEW-G1): SHOW_PUBLIC_SHARE is the kill switch for publishing a public share.
// Off → both write routes answer 404 `not_available` BEFORE auth or any database work, and
// GET /api/config exposes `flags.publicShare: false`. Default (unset) → on.

const getRequestUser = vi.fn(async () => ({ user: null, supabase: {} }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => getRequestUser() }))
const createSharedResult = vi.fn()
vi.mock('@/lib/share/sharedResultStore', () => ({
  createSharedResult: (...a: unknown[]) => createSharedResult(...a),
  SharedResultError: class extends Error {},
}))

import { POST as CREATE } from './route'
import { POST as PREVIEW } from './preview/route'
import { GET as CONFIG } from '@/app/api/config/route'
import { publicShareEnabled } from '@/lib/config/product'

const body = JSON.stringify({ conversationId: '11111111-1111-4111-8111-111111111111', messageIndex: 1 })
const post = (path: string) => new NextRequest(new Request(`https://www.tappyai.com${path}`, { method: 'POST', body }), {})

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllEnvs() })

describe('publicShareEnabled — env flag, default ON', () => {
  it('is on when unset or any other value; off only for false / 0', () => {
    expect(publicShareEnabled({})).toBe(true)
    expect(publicShareEnabled({ SHOW_PUBLIC_SHARE: 'true' })).toBe(true)
    expect(publicShareEnabled({ SHOW_PUBLIC_SHARE: '1' })).toBe(true)
    expect(publicShareEnabled({ SHOW_PUBLIC_SHARE: 'false' })).toBe(false)
    expect(publicShareEnabled({ SHOW_PUBLIC_SHARE: ' FALSE ' })).toBe(false)
    expect(publicShareEnabled({ SHOW_PUBLIC_SHARE: '0' })).toBe(false)
  })
})

describe('SHOW_PUBLIC_SHARE=false — publishing is closed', () => {
  for (const v of ['false', '0']) {
    it(`POST /api/shared-results and /preview answer 404 not_available before auth (SHOW_PUBLIC_SHARE=${v})`, async () => {
      vi.stubEnv('SHOW_PUBLIC_SHARE', v)
      for (const [handler, path] of [[CREATE, '/api/shared-results'], [PREVIEW, '/api/shared-results/preview']] as const) {
        const res = await handler(post(path))
        expect(res.status, path).toBe(404)
        expect(await res.json()).toEqual({ error: 'not_available' })
      }
      expect(getRequestUser).not.toHaveBeenCalled()
      expect(createSharedResult).not.toHaveBeenCalled()
    })
  }

  it('GET /api/config exposes flags.publicShare: false', async () => {
    vi.stubEnv('SHOW_PUBLIC_SHARE', 'false')
    expect((await (await CONFIG()).json()).flags.publicShare).toBe(false)
  })
})

describe('default (unset) — publishing is open', () => {
  it('GET /api/config exposes flags.publicShare: true', async () => {
    vi.stubEnv('SHOW_PUBLIC_SHARE', '')
    expect((await (await CONFIG()).json()).flags.publicShare).toBe(true)
  })

  it('the routes proceed past the switch (to auth: 401 without a session)', async () => {
    vi.stubEnv('SHOW_PUBLIC_SHARE', '')
    expect((await CREATE(post('/api/shared-results'))).status).toBe(401)
    expect((await PREVIEW(post('/api/shared-results/preview'))).status).toBe(401)
    expect(getRequestUser).toHaveBeenCalledTimes(2)
  })
})
