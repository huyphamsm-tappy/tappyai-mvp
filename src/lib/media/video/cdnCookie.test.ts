import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { CDN_COOKIE_NAME, CDN_COOKIE_TTL_SECONDS, buildCdnSetCookie, decodeCdnKey, signCdnCookie, videoCdnConfig } from './cdnCookie'

// The signed cookie of Cloud CDN, in the format the 05/11 spike proved against a real private bucket:
//   Cloud-CDN-Cookie=URLPrefix=<b64url prefix>:Expires=<unix>:KeyName=<name>:Signature=<b64url HMAC-SHA1 of "URLPrefix=..:Expires=..:KeyName=..">
const KEY_BYTES = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8')
const KEY_B64URL = KEY_BYTES.toString('base64url')
const OWNER = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const PREFIX = `https://media.example.com/vdel/${OWNER}/${ASSET}/`
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

describe('signCdnCookie', () => {
  it('matches the format of the spike and an INDEPENDENT HMAC-SHA1 computation', () => {
    const c = signCdnCookie({ urlPrefix: PREFIX, keyName: 'tappy-key-1', key: KEY_BYTES, expiresAtSec: 1_800_000_000 })
    const policy = `URLPrefix=${b64u(PREFIX)}:Expires=1800000000:KeyName=tappy-key-1`
    const expectedSig = b64u(createHmac('sha1', KEY_BYTES).update(policy).digest())
    expect(c.name).toBe('Cloud-CDN-Cookie')
    expect(c.value).toBe(`${policy}:Signature=${expectedSig}`)
  })

  it('a different prefix, expiry or key gives a different signature (nothing is signed loosely)', () => {
    const base = { urlPrefix: PREFIX, keyName: 'k', key: KEY_BYTES, expiresAtSec: 1_800_000_000 }
    const sig = (o: Partial<typeof base>) => signCdnCookie({ ...base, ...o }).value.split('Signature=')[1]
    const ref = sig({})
    expect(sig({ urlPrefix: PREFIX.replace(ASSET, OWNER) })).not.toBe(ref)
    expect(sig({ expiresAtSec: 1_800_000_001 })).not.toBe(ref)
    expect(sig({ key: Buffer.from('another key another key another!') })).not.toBe(ref)
    expect(sig({ keyName: 'k2' })).not.toBe(ref)
  })

  it('refuses a prefix that is not ONE video folder on https, a bad key name and a weak key', () => {
    const ok = { keyName: 'k', key: KEY_BYTES, expiresAtSec: 1_800_000_000 }
    for (const bad of ['http://media.example.com/vdel/a/b/', 'https://media.example.com/', 'https://media.example.com/vdel/', `https://media.example.com/vdel/${OWNER}/`, `https://media.example.com/vdel/${OWNER}/${ASSET}`, 'https://media.example.com/vdel/../x/', ''])
      expect(() => signCdnCookie({ ...ok, urlPrefix: bad }), bad).toThrow()
    expect(() => signCdnCookie({ ...ok, urlPrefix: PREFIX, keyName: 'bad name:' })).toThrow()
    expect(() => signCdnCookie({ ...ok, urlPrefix: PREFIX, key: Buffer.from('short') })).toThrow()
    expect(() => signCdnCookie({ ...ok, urlPrefix: PREFIX, expiresAtSec: 1.5 })).toThrow()
  })
})

describe('decodeCdnKey', () => {
  it('reads a base64url key and refuses an empty, tiny or non-base64url one', () => {
    expect(decodeCdnKey(KEY_B64URL)?.equals(KEY_BYTES)).toBe(true)
    expect(decodeCdnKey(undefined)).toBeNull()
    expect(decodeCdnKey('')).toBeNull()
    expect(decodeCdnKey('abc')).toBeNull()
    expect(decodeCdnKey('not base64url!!!!!!!!!!!!!!!!!!!!!!')).toBeNull()
  })
})

describe('buildCdnSetCookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax, scoped to ONE video folder and to the configured domain, with a 10 minute life', () => {
    const header = buildCdnSetCookie({ value: 'URLPrefix=x:Expires=1:KeyName=k:Signature=s', domain: '.example.com', path: `/vdel/${OWNER}/${ASSET}/` })
    expect(header).toBe(`${CDN_COOKIE_NAME}=URLPrefix=x:Expires=1:KeyName=k:Signature=s; Domain=.example.com; Path=/vdel/${OWNER}/${ASSET}/; Max-Age=${CDN_COOKIE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`)
    expect(CDN_COOKIE_TTL_SECONDS).toBe(600)
  })
  it('refuses a domain or path that could widen the cookie or inject an attribute', () => {
    const base = { value: 'v', domain: '.example.com', path: `/vdel/${OWNER}/${ASSET}/` }
    expect(() => buildCdnSetCookie({ ...base, domain: '.example.com; Path=/' })).toThrow()
    expect(() => buildCdnSetCookie({ ...base, path: '/' })).toThrow()
    expect(() => buildCdnSetCookie({ ...base, path: '/vdel/' })).toThrow()
    expect(() => buildCdnSetCookie({ ...base, value: 'a;b' })).toThrow()
  })
})

describe('videoCdnConfig', () => {
  const env = { VIDEO_CDN_HOST: 'media.example.com', VIDEO_CDN_COOKIE_DOMAIN: '.example.com', VIDEO_CDN_KEY_NAME: 'tappy-key-1', VIDEO_CDN_SIGNING_KEY: KEY_B64URL }
  it('reads the four variables; there is NO default for any of them', () => {
    expect(videoCdnConfig(env)).toMatchObject({ host: 'media.example.com', cookieDomain: '.example.com', keyName: 'tappy-key-1' })
    for (const k of Object.keys(env)) expect(videoCdnConfig({ ...env, [k]: undefined }), k).toBeNull()
    expect(videoCdnConfig({})).toBeNull()
  })
  it('refuses a host that is not a bare hostname (no scheme, path or port) and a cookie domain that does not cover it', () => {
    expect(videoCdnConfig({ ...env, VIDEO_CDN_HOST: 'https://media.example.com' })).toBeNull()
    expect(videoCdnConfig({ ...env, VIDEO_CDN_HOST: 'media.example.com/x' })).toBeNull()
    expect(videoCdnConfig({ ...env, VIDEO_CDN_COOKIE_DOMAIN: '.other.com' })).toBeNull()
    expect(videoCdnConfig({ ...env, VIDEO_CDN_COOKIE_DOMAIN: 'media.example.com' })).not.toBeNull()
  })
})
