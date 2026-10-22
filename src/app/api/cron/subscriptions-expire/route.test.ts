import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

const isAuthorizedCronRequest = vi.fn()
vi.mock('@/lib/security/cronAuth', () => ({
  isAuthorizedCronRequest: (req: Request) => isAuthorizedCronRequest(req),
}))

import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  rpc.mockReset()
  isAuthorizedCronRequest.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/cron/subscriptions-expire — Expiry Cron Job', () => {
  it('returns 401 when request is not authorized by cron auth', async () => {
    isAuthorizedCronRequest.mockReturnValue(false)
    const res = await GET(new Request('https://t.test/api/cron/subscriptions-expire'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('skips processing and returns flag_off when SUBSCRIPTIONS_ENABLED is off', async () => {
    isAuthorizedCronRequest.mockReturnValue(true)
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    const res = await GET(new Request('https://t.test/api/cron/subscriptions-expire'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'flag_off' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('executes p8_subscriptions_expire RPC and returns expired count', async () => {
    isAuthorizedCronRequest.mockReturnValue(true)
    rpc.mockResolvedValue({ data: 5, error: null })

    const res = await GET(new Request('https://t.test/api/cron/subscriptions-expire'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, expired: 5 })
    expect(rpc).toHaveBeenCalledWith('p8_subscriptions_expire')
  })

  it('returns 500 when RPC encounters an error', async () => {
    isAuthorizedCronRequest.mockReturnValue(true)
    rpc.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } })

    const res = await GET(new Request('https://t.test/api/cron/subscriptions-expire'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'expire_failed' })
  })
})
