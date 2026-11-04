// Security audit 04/11 (W-06): production without the shared limiter store says so (once), and behaves exactly as before.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { warnIfProductionWithoutStore, __resetStoreWarning } from './publicRateLimit'

describe('warnIfProductionWithoutStore', () => {
  beforeEach(() => __resetStoreWarning())

  it('logs once on the Vercel production deployment', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(warnIfProductionWithoutStore({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(warnIfProductionWithoutStore({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toContain('tappyai_limiter_store_missing')
    spy.mockRestore()
  })

  it('stays silent on previews, local runs and tests', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const env of [{ VERCEL_ENV: 'preview' }, {}, { NODE_ENV: 'test' }]) expect(warnIfProductionWithoutStore(env as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
