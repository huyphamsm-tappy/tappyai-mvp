import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { iosMinVersion, IOS_MIN_VERSION_DEFAULT } from '@/lib/config/product'
import { __resetAppleCapabilityCache } from '@/lib/auth/appleCapability'
import { __resetDeletionReadyCache } from '@/lib/account/deletionReady'
import { GET } from './route'

describe('iosMinVersion (flags.iosMinVersion in /api/config)', () => {
  it('defaults to 1.1.0', () => {
    expect(IOS_MIN_VERSION_DEFAULT).toBe('1.1.0')
    expect(iosMinVersion({})).toBe('1.1.0')
  })
  it('takes major.minor or major.minor.patch from IOS_MIN_VERSION', () => {
    expect(iosMinVersion({ IOS_MIN_VERSION: '1.2.0' })).toBe('1.2.0')
    expect(iosMinVersion({ IOS_MIN_VERSION: ' 2.0 ' })).toBe('2.0')
  })
  it('ignores anything that is not digits and dots (a typo never reaches the app)', () => {
    for (const bad of ['', 'v1.2.0', '1', '1.2.3.4', '1.x.0', '1.2.0-beta', '1,2,0', 'latest']) {
      expect(iosMinVersion({ IOS_MIN_VERSION: bad })).toBe('1.1.0')
    }
  })
})

describe('GET /api/config carries flags.iosMinVersion', () => {
  beforeEach(() => {
    __resetAppleCapabilityCache()
    __resetDeletionReadyCache()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  it('publishes the default and the env override as a string', async () => {
    const a = (await (await GET()).json()) as { flags: Record<string, unknown> }
    expect(a.flags.iosMinVersion).toBe('1.1.0')
    vi.stubEnv('IOS_MIN_VERSION', '1.3.0')
    const b = (await (await GET()).json()) as { flags: Record<string, unknown> }
    expect(b.flags.iosMinVersion).toBe('1.3.0')
  })
})
