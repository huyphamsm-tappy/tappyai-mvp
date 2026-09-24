import { describe, it, expect } from 'vitest'
import { miniAppResultUrl, parseMiniAppLaunch, zaloMiniAppId } from './miniApp'
import {
  ZALO_IDENTITY_COOKIE, createGraphZaloVerifier, createMockZaloVerifier, hashZaloUserId, readZaloIdentity,
  signZaloIdentity, zaloIdentitySecret, zaloIdentitySetCookie,
} from './identity'

const SECRET = 's'.repeat(40)
const envWith = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv

describe('Zalo Mini App — link boundary', () => {
  it('is disabled until the Mini App id is configured', () => {
    expect(zaloMiniAppId(envWith({}))).toBeNull()
    expect(zaloMiniAppId(envWith({ NEXT_PUBLIC_ZALO_MINI_APP_ID: 'not-an-id' }))).toBeNull()
    expect(miniAppResultUrl('AbCdEfGh12', envWith({}))).toBeNull()
  })
  it('builds a deep link that carries zalo_mini attribution and the same slug as the web', () => {
    expect(miniAppResultUrl('AbCdEfGh12', envWith({ NEXT_PUBLIC_ZALO_MINI_APP_ID: '1234567890' }))).toBe('https://zalo.me/s/1234567890/r/AbCdEfGh12?src=zalo_mini')
    expect(miniAppResultUrl('../etc', envWith({ NEXT_PUBLIC_ZALO_MINI_APP_ID: '1234567890' }))).toBeNull()
  })
  it('the Mini App parses its launch back to the slug, refusing anything else', () => {
    expect(parseMiniAppLaunch({ path: '/r/AbCdEfGh12' })).toEqual({ slug: 'AbCdEfGh12', source: 'zalo_mini' })
    expect(parseMiniAppLaunch({ path: '/', query: { slug: 'AbCdEfGh12' } }).slug).toBe('AbCdEfGh12')
    expect(parseMiniAppLaunch({ path: '/r/evil!' }).slug).toBeNull()
  })
})

describe('Zalo identity — a signed rate-limit key, never a claim', () => {
  it('the hash reveals nothing and the cookie is signed', () => {
    const hash = hashZaloUserId('123456789', SECRET)
    expect(hash).not.toContain('123456789')
    const cookie = signZaloIdentity('123456789', SECRET)
    expect(readZaloIdentity(`${ZALO_IDENTITY_COOKIE}=${cookie}`, SECRET)).toBe(hash)
  })
  it('a forged or tampered cookie is rejected; a different secret is rejected', () => {
    const cookie = signZaloIdentity('123456789', SECRET)
    const [hash] = cookie.split('.')
    expect(readZaloIdentity(`${ZALO_IDENTITY_COOKIE}=${hash}.forged`, SECRET)).toBeNull()
    expect(readZaloIdentity(`${ZALO_IDENTITY_COOKIE}=${cookie}`, 'x'.repeat(40))).toBeNull()
    expect(readZaloIdentity(`${ZALO_IDENTITY_COOKIE}=nonsense`, SECRET)).toBeNull()
    expect(readZaloIdentity(null, SECRET)).toBeNull()
    expect(readZaloIdentity(`${ZALO_IDENTITY_COOKIE}=${cookie}`, null)).toBeNull()
  })
  it('the same Zalo user maps to the same key across requests', () => {
    expect(signZaloIdentity('42424242', SECRET)).toBe(signZaloIdentity('42424242', SECRET))
    expect(hashZaloUserId('42424242', SECRET)).not.toBe(hashZaloUserId('42424243', SECRET))
  })
  it('the cookie is httpOnly, Secure, day-scoped, and cross-site capable for the Mini App webview', () => {
    const c = zaloIdentitySetCookie('v')
    expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/Secure/); expect(c).toMatch(/SameSite=None/); expect(c).toMatch(/Max-Age=86400/)
  })
  it('the secret must be configured and long enough', () => {
    expect(zaloIdentitySecret(envWith({}))).toBeNull()
    expect(zaloIdentitySecret(envWith({ ZALO_IDENTITY_SECRET: 'short' }))).toBeNull()
    expect(zaloIdentitySecret(envWith({ ZALO_IDENTITY_SECRET: SECRET }))).toBe(SECRET)
  })
  it('mock verifier accepts only mock tokens', async () => {
    const v = createMockZaloVerifier()
    expect(await v.verify('mock:123456789')).toBe('123456789')
    expect(await v.verify('real-looking-token')).toBeNull()
  })
  it('graph verifier: id on success, null on a rejected token, throws when region-restricted', async () => {
    const mk = (body: unknown, ok = true) => createGraphZaloVerifier((async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch)
    expect(await mk({ id: '123456789' }).verify('t')).toBe('123456789')
    expect(await mk({ error: -216, message: 'invalid token' }).verify('t')).toBeNull()
    await expect(mk({ error: -501 }).verify('t')).rejects.toThrow(/region/)
    await expect(mk({}, false).verify('t')).rejects.toThrow(/HTTP/)
  })
})
