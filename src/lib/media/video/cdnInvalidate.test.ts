import { describe, it, expect, vi } from 'vitest'
import { CdnInvalidationError, createCdnInvalidator, getCdnInvalidator } from './cdnInvalidate'

const OWNER = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const make = (fetchImpl: typeof fetch, over: Partial<Parameters<typeof createCdnInvalidator>[0]> = {}) =>
  createCdnInvalidator({ projectId: 'my-project-1', urlMapName: 'tappy-video-map', getAccessToken: async () => 'tok', fetchImpl, timeoutMs: 1000, ...over })

describe('createCdnInvalidator', () => {
  it('invalidates ONE video folder: POST urlMaps.invalidateCache with a bearer token and the path', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    await make(fetchImpl).invalidate(`/vdel/${OWNER}/${ASSET}/*`)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://compute.googleapis.com/compute/v1/projects/my-project-1/global/urlMaps/tappy-video-map/invalidateCache')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init.body))).toEqual({ path: `/vdel/${OWNER}/${ASSET}/*` })
  })

  it('can invalidate ONE owner (account deletion) but never anything wider', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const inv = make(fetchImpl)
    await inv.invalidate(`/vdel/${OWNER}/*`)
    for (const bad of ['/*', '/vdel/*', '/vdel/*/*', `/vdel/${OWNER}`, `/vdel/${OWNER}/${ASSET}/manifest.m3u8`, `/vsrc/${OWNER}/*`, `/vdel/${OWNER}/../*`, '']) {
      await expect(inv.invalidate(bad), bad).rejects.toBeInstanceOf(CdnInvalidationError)
    }
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('a refusal or a network failure throws with the status only (no body, no path, no token)', async () => {
    const refused = (async () => new Response(JSON.stringify({ error: { message: `bad ${OWNER}` } }), { status: 403 })) as unknown as typeof fetch
    const err = await make(refused, { getAccessToken: async () => 'SECRET-TOKEN' }).invalidate(`/vdel/${OWNER}/${ASSET}/*`).catch(e => e as Error)
    expect(err).toBeInstanceOf(CdnInvalidationError)
    expect((err as Error).message).toContain('HTTP 403')
    expect((err as Error).message).not.toContain(OWNER)
    expect((err as Error).message).not.toContain('SECRET-TOKEN')
    const down = (async () => { throw new Error('socket') }) as unknown as typeof fetch
    await expect(make(down).invalidate(`/vdel/${OWNER}/${ASSET}/*`)).rejects.toBeInstanceOf(CdnInvalidationError)
  })

  it('refuses a malformed project or url map name at construction', () => {
    expect(() => make(fetch, { projectId: 'x/../y' })).toThrow()
    expect(() => make(fetch, { urlMapName: 'a b' })).toThrow()
  })
})

describe('getCdnInvalidator', () => {
  it('has NO default for the url map or the service account: either missing means not configured', () => {
    expect(getCdnInvalidator({})).toBeNull()
    expect(getCdnInvalidator({ CDN_URL_MAP_NAME: 'tappy-video-map' })).toBeNull()
    expect(getCdnInvalidator({ GCP_CDN_SERVICE_ACCOUNT: 'cdn@p.iam.gserviceaccount.com' })).toBeNull()
    expect(getCdnInvalidator({ CDN_URL_MAP_NAME: 'tappy-video-map', GCP_CDN_SERVICE_ACCOUNT: 'cdn@p.iam.gserviceaccount.com' })).not.toBeNull()
  })
})
