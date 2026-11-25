import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { ASSET, OTHER_USER, OWNER, REVIEW, makeAsset, memoryDeliveryStore } from './__fixtures__/memoryDeliveryStore'
import { videoCdnConfig } from './cdnCookie'
import { issueVideoPlayback } from './playback'

const KEY = Buffer.from('0123456789abcdef0123456789abcdef')
const CONFIG = videoCdnConfig({ VIDEO_CDN_HOST: 'media.example.com', VIDEO_CDN_COOKIE_DOMAIN: '.example.com', VIDEO_CDN_KEY_NAME: 'key-1', VIDEO_CDN_SIGNING_KEY: KEY.toString('base64url') })!
const DELIVERY = `vdel/${OWNER}/${ASSET}/manifest.m3u8`
const NOW = Date.parse('2026-11-05T10:00:00Z')

function setup(asset = makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: DELIVERY }), review: { is_hidden: boolean; publication_state: string | null } | null = { is_hidden: false, publication_state: 'PUBLISHED' }) {
  const db = memoryDeliveryStore([asset], review ? [{ id: REVIEW, user_id: OWNER, ...review }] : [])
  return { db, deps: { store: db.store, config: CONFIG, now: () => NOW } }
}

describe('issueVideoPlayback — the text overlay travels with an authorised answer', () => {
  const DOC = { schema_version: 1, layers: [{ id: 'a', type: 'text', text: 'Xin chào' }] }
  it('a public video carries its saved overlay (version + document)', async () => {
    const { deps } = setup()
    const out = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, { ...deps, overlay: { get: async () => ({ version: 3, doc: DOC }) } })
    expect(out.body.overlay).toEqual({ version: 3, doc: DOC })
  })
  it('no saved overlay, or a read that fails, is overlay: null and the video still plays', async () => {
    const { deps } = setup()
    expect((await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, { ...deps, overlay: { get: async () => null } })).body.overlay).toBeNull()
    const failing = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, { ...deps, overlay: { get: async () => { throw new Error('db') } } })
    expect(failing.status).toBe(200)
    expect(failing.body.overlay).toBeNull()
  })
  it('🚨 a refusal never reads the overlay and never carries it', async () => {
    let reads = 0
    const { deps } = setup(makeAsset({ state: 'ready', review_id: null }), null)
    const out = await issueVideoPlayback({ assetId: ASSET, viewerId: OTHER_USER, native: false }, { ...deps, overlay: { get: async () => { reads++; return { version: 1, doc: DOC } } } })
    expect(out.status).toBe(404)
    expect(reads).toBe(0)
    expect(JSON.stringify(out.body)).not.toContain('Xin chào')
  })
})

describe('issueVideoPlayback', () => {
  it('a public video: 200, the manifest URL on the CDN host, and a signed cookie for THAT video only', async () => {
    const { deps } = setup()
    const out = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, deps)
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ assetId: ASSET, manifestUrl: `https://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`, expiresAt: new Date(NOW + 600_000).toISOString(), ttlSeconds: 600, preview: false, overlay: null })
    const header = out.setCookie!
    expect(header).toContain('Cloud-CDN-Cookie=URLPrefix=')
    expect(header).toContain(`Path=/vdel/${OWNER}/${ASSET}/`)
    expect(header).toContain('Domain=.example.com')
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600']) expect(header).toContain(a)
    // the cookie's signature verifies with the key, over the prefix of this video and the expiry
    const value = header.split(';')[0].slice('Cloud-CDN-Cookie='.length)
    const policy = value.slice(0, value.indexOf(':Signature='))
    expect(value.endsWith(`:Signature=${createHmac('sha1', KEY).update(policy).digest('base64').replace(/\+/g, '-').replace(/\//g, '_')}`)).toBe(true)
    expect(policy).toContain(`:Expires=${Math.floor(NOW / 1000) + 600}:KeyName=key-1`)
    expect(Buffer.from(policy.split(':')[0].slice('URLPrefix='.length), 'base64').toString()).toBe(`https://media.example.com/vdel/${OWNER}/${ASSET}/`)
  })

  it('the cookie value is NEVER in the JSON body for a browser (it is HttpOnly); a native player asks for it and gets it', async () => {
    const { deps } = setup()
    const web = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, deps)
    expect(JSON.stringify(web.body)).not.toContain('Signature=')
    const native = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: true }, deps)
    const cookie = (native.body as { cookie: Record<string, unknown> }).cookie
    expect(cookie).toMatchObject({ name: 'Cloud-CDN-Cookie', domain: '.example.com', path: `/vdel/${OWNER}/${ASSET}/`, expiresAt: new Date(NOW + 600_000).toISOString() })
    expect(String(cookie.value)).toContain('Signature=')
  })

  it('🚨 refuses with an IDENTICAL 404 for a hidden post, an unknown asset, a stranger on a ready video — no oracle, no cookie', async () => {
    const hidden = setup(undefined, { is_hidden: true, publication_state: 'PUBLISHED' })
    const held = setup(undefined, { is_hidden: false, publication_state: 'UNDER_REVIEW' })
    const ready = setup(makeAsset({ delivery_manifest_key: DELIVERY }), null)
    const unknown = setup()
    const outs = [
      await issueVideoPlayback({ assetId: ASSET, viewerId: OTHER_USER, native: true }, hidden.deps),
      await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: true }, held.deps),
      await issueVideoPlayback({ assetId: ASSET, viewerId: OTHER_USER, native: true }, ready.deps),
      await issueVideoPlayback({ assetId: '44444444-4444-4444-8444-444444444444', viewerId: null, native: true }, unknown.deps),
    ]
    for (const o of outs) { expect(o).toEqual({ status: 404, body: { error: 'not_found' } }); expect(o.setCookie).toBeUndefined() }
  })

  it('the owner previews a READY video; the answer says so', async () => {
    const { deps } = setup(makeAsset({ delivery_manifest_key: DELIVERY }), null)
    const out = await issueVideoPlayback({ assetId: ASSET, viewerId: OWNER, native: false }, deps)
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ preview: true })
  })

  it('a taken-down video (delivery copy removed) gives no cookie even if the state still says published', async () => {
    const { deps } = setup(makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: DELIVERY, delivery_removed_at: '2026-11-05T09:00:00Z' }))
    expect((await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, deps)).status).toBe(404)
  })

  it('answers 503 (nothing signed, nothing read) when the CDN is not configured', async () => {
    const { deps, db } = setup()
    const out = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: false }, { ...deps, config: null })
    expect(out).toEqual({ status: 503, body: { error: 'video_unavailable' } })
    expect(db.calls.publish).toBe(0)
  })

  it('a malformed asset id is a 404 without touching the database', async () => {
    const { deps } = setup()
    expect((await issueVideoPlayback({ assetId: 'not-a-uuid', viewerId: null, native: false }, deps)).status).toBe(404)
  })

  it('never puts the signing key anywhere in the answer', async () => {
    const { deps } = setup()
    const out = await issueVideoPlayback({ assetId: ASSET, viewerId: null, native: true }, deps)
    expect(JSON.stringify(out)).not.toContain(KEY.toString('base64url'))
    expect(JSON.stringify(out)).not.toContain(KEY.toString('base64'))
  })
})
