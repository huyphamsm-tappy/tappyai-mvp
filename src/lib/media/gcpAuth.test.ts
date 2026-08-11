import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWifTokenSource, stsAudience, WifExchangeError } from './gcpAuth'
import { createGcsProvider } from './providers/gcs'
import { getMediaProvider } from './index'

const CONFIG = {
  projectNumber: '1023373437508',
  poolId: 'vercel-oidc',
  providerId: 'vercel',
  serviceAccountEmail: 'tappyai-media-bridge@aerobic-lock-498409-u7.iam.gserviceaccount.com',
}
const OIDC = 'header.payload.sig'
const bytes = new Uint8Array([1, 2, 3])

/** Mock the two-leg exchange. `fail` selects which leg returns non-2xx. */
function mockExchange(opts: { fail?: 'sts' | 'imp'; expireTime?: string } = {}) {
  const urls: string[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    urls.push(String(url))
    if (String(url).includes('sts.googleapis.com')) {
      if (opts.fail === 'sts') return { ok: false, status: 400, json: async () => ({ error: 'unauthorized_client' }) } as unknown as Response
      return { ok: true, status: 200, json: async () => ({ access_token: 'federated-xyz' }) } as unknown as Response
    }
    if (String(url).includes('iamcredentials')) {
      if (opts.fail === 'imp') return { ok: false, status: 403, json: async () => ({}) } as unknown as Response
      // the federated token must be presented here
      const auth = (init.headers as Record<string, string>).Authorization
      if (auth !== 'Bearer federated-xyz') throw new Error('wrong federated token forwarded')
      return {
        ok: true, status: 200,
        json: async () => ({ accessToken: 'sa-access-token', expireTime: opts.expireTime }),
      } as unknown as Response
    }
    throw new Error('unexpected url ' + url)
  }) as unknown as typeof fetch
  return { fetchImpl, urls }
}

describe('WIF token source', () => {
  it('targets the exact provider audience from WIF-1', () => {
    expect(stsAudience(CONFIG)).toBe(
      '//iam.googleapis.com/projects/1023373437508/locations/global/workloadIdentityPools/vercel-oidc/providers/vercel'
    )
  })

  it('exchanges OIDC -> STS -> impersonated SA token', async () => {
    const { fetchImpl, urls } = mockExchange()
    const get = createWifTokenSource({ config: CONFIG, getOidcToken: () => OIDC, fetchImpl })
    await expect(get()).resolves.toBe('sa-access-token')
    expect(urls[0]).toContain('sts.googleapis.com')
    expect(urls[1]).toContain('iamcredentials')
    expect(urls[1]).toContain(encodeURIComponent(CONFIG.serviceAccountEmail))
  })

  it('caches the token instead of re-exchanging on every upload', async () => {
    const { fetchImpl } = mockExchange({ expireTime: new Date(Date.now() + 3_600_000).toISOString() })
    const get = createWifTokenSource({ config: CONFIG, getOidcToken: () => OIDC, fetchImpl })
    await get(); await get(); await get()
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2)
  })

  // K — credential exchange failure must be safe
  it('fails closed when no OIDC token exists (not running on Vercel)', async () => {
    const { fetchImpl } = mockExchange()
    const get = createWifTokenSource({ config: CONFIG, getOidcToken: () => null, fetchImpl })
    await expect(get()).rejects.toThrow(WifExchangeError)
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
  })

  it.each([
    ['sts' as const, 'sts'],
    ['imp' as const, 'impersonation'],
  ])('fails closed when the %s leg is rejected', async (fail, stage) => {
    const { fetchImpl } = mockExchange({ fail })
    const get = createWifTokenSource({ config: CONFIG, getOidcToken: () => OIDC, fetchImpl })
    const err = (await get().catch((e) => e)) as WifExchangeError
    expect(err).toBeInstanceOf(WifExchangeError)
    expect(err.stage).toBe(stage)
  })

  // H — no credential material in error text
  it('error messages leak no token material', async () => {
    for (const fail of ['sts', 'imp'] as const) {
      const { fetchImpl } = mockExchange({ fail })
      const get = createWifTokenSource({ config: CONFIG, getOidcToken: () => OIDC, fetchImpl })
      const err = String(await get().catch((e) => e))
      expect(err).not.toContain(OIDC)
      expect(err).not.toContain('federated-xyz')
      expect(err).not.toContain('Bearer')
      expect(err).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
    }
  })
})

describe('GCS write through WIF', () => {
  // A/B/L — server-side producers land in the bucket and get a GCS URL
  it('uploads with the impersonated token and returns the GCS URL', async () => {
    const exchange = mockExchange()
    const seen: Array<{ url: string; auth: string }> = []
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes('googleapis.com/upload/storage')) {
        seen.push({ url: String(url), auth: (init.headers as Record<string, string>).Authorization })
        return { ok: true, status: 200 } as Response
      }
      return (exchange.fetchImpl as unknown as typeof fetch)(url as never, init as never)
    }) as unknown as typeof fetch

    const provider = createGcsProvider({
      bucket: 'tappyai-media-prod',
      getAccessToken: createWifTokenSource({ config: CONFIG, getOidcToken: () => OIDC, fetchImpl }),
      fetchImpl,
    })
    const res = await provider.put('avatars/u1-abc.jpg', bytes, { contentType: 'image/jpeg' })
    expect(res.url).toBe('https://storage.googleapis.com/tappyai-media-prod/avatars/u1-abc.jpg')
    expect(seen[0].auth).toBe('Bearer sa-access-token')
  })

  // I — no silent Blob fallback once GCS is the active provider
  it('does not fall back to Blob when the credential exchange fails', async () => {
    const { fetchImpl } = mockExchange({ fail: 'sts' })
    const provider = createGcsProvider({
      bucket: 'tappyai-media-prod',
      getAccessToken: createWifTokenSource({ config: CONFIG, getOidcToken: () => OIDC, fetchImpl }),
      fetchImpl,
    })
    await expect(provider.put('reviews/u1/1.png', bytes, { contentType: 'image/png' }))
      .rejects.toThrow(WifExchangeError)
    expect(provider.id).toBe('gcs')
  })
})

describe('production wiring', () => {
  // J — default is unchanged
  it('still defaults to blob', () => {
    expect(getMediaProvider({} as NodeJS.ProcessEnv).id).toBe('blob')
  })

  it('builds a gcs provider with a WIF source when MEDIA_PROVIDER=gcs', async () => {
    const env = { MEDIA_PROVIDER: 'gcs' } as unknown as NodeJS.ProcessEnv
    const p = getMediaProvider(env)
    expect(p.id).toBe('gcs')
    // No VERCEL_OIDC_TOKEN in env -> fails closed rather than uploading.
    await expect(p.put('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' }))
      .rejects.toThrow(WifExchangeError)
  })
})

describe('no key material in the credential path', () => {
  const root = join(__dirname, '..', '..', '..')
  it.each(['src/lib/media/gcpAuth.ts', 'src/lib/media/index.ts'])('%s has no key config', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8')
    expect(src).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
    expect(src).not.toMatch(/"type"\s*:\s*"service_account"/)
    expect(src).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/)
    expect(src).not.toMatch(/private_key/)
  })
})
