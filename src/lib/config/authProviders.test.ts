// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { AUTH_PROVIDERS, isAuthProviderEnabled } from './product'
import { GET as configGET } from '@/app/api/config/route'

// The single source of truth for auth providers lives in product.ts and is the
// SAME list /api/config serves to native clients — so Web, Android, and iOS all
// derive the same enabled set. V1 = Google + Zalo only.

describe('AUTH_PROVIDERS — single source of truth', () => {
  it('declares exactly google/zalo/email/facebook with the V1 enabled flags', () => {
    expect(AUTH_PROVIDERS.map((p) => p.id)).toEqual(['google', 'zalo', 'email', 'facebook'])
    expect(isAuthProviderEnabled('google')).toBe(true)
    expect(isAuthProviderEnabled('zalo')).toBe(true)
    expect(isAuthProviderEnabled('email')).toBe(false)
    expect(isAuthProviderEnabled('facebook')).toBe(false)
  })

  it('V1 enabled set is exactly Google + Zalo', () => {
    const enabled = AUTH_PROVIDERS.filter((p) => p.enabled).map((p) => p.id)
    expect(enabled).toEqual(['google', 'zalo'])
  })
})

describe('/api/config serves the same provider contract', () => {
  it('exposes the identical AUTH_PROVIDERS list (native clients read this)', async () => {
    const res = await configGET()
    const body = await res.json()
    expect(body.auth.providers).toEqual(AUTH_PROVIDERS)
    // The set every platform must render: enabled providers only.
    const enabled = body.auth.providers.filter((p: { enabled: boolean }) => p.enabled).map((p: { id: string }) => p.id)
    expect(enabled).toEqual(['google', 'zalo'])
  })
})
