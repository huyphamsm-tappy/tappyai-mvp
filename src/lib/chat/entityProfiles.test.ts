import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchEntityProfiles, readProfile, chipsOf, __clearEntityProfileCache } from './entityProfiles'

const musk = { name: 'Elon Musk', title: 'Elon Musk', description: 'Doanh nhân', extract: 'Elon Musk là doanh nhân.', image: 'https://upload.wikimedia.org/a.jpg', href: 'https://vi.wikipedia.org/wiki/Elon_Musk', lang: 'vi', source: 'Wikipedia' }
const reply = (profiles: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ profiles }), { status: 200 })) as unknown as typeof fetch

beforeEach(() => __clearEntityProfileCache())

describe('readProfile re-checks what the server sent', () => {
  it('accepts a good profile', () => { expect(readProfile(musk)).toMatchObject({ name: 'Elon Musk', lang: 'vi' }) })
  it('refuses a wrong source, a foreign link, an empty extract; drops a foreign picture', () => {
    expect(readProfile({ ...musk, source: 'Evidence Verified' })).toBeNull()
    expect(readProfile({ ...musk, href: 'https://evil.test/wiki/Elon' })).toBeNull()
    expect(readProfile({ ...musk, href: 'javascript:alert(1)' })).toBeNull()
    expect(readProfile({ ...musk, extract: '' })).toBeNull()
    expect(readProfile({ ...musk, image: 'https://evil.test/p.jpg' })?.image).toBeNull()
    expect(readProfile(null)).toBeNull()
  })
})

describe('fetchEntityProfiles', () => {
  it('asks ONCE for all names, with no credentials, and returns only the resolved ones', async () => {
    const f = reply([musk])
    const out = await fetchEntityProfiles(['Elon Musk', 'Sam Altman'], f)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(f).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/entity-profile?t=Elon%20Musk&t=Sam%20Altman')
    expect(init.credentials).toBe('omit')
    expect([...out.keys()]).toEqual(['elon musk'])
  })

  it('does not ask again for a name asked before (also for one that did not resolve)', async () => {
    const f = reply([musk])
    await fetchEntityProfiles(['Elon Musk', 'Sam Altman'], f)
    await fetchEntityProfiles(['Sam Altman', 'elon musk'], f)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('ignores a profile for a name that was not asked (the server cannot add a chip)', async () => {
    const out = await fetchEntityProfiles(['Sam Altman'], reply([musk]))
    expect(out.size).toBe(0)
  })

  it('a failure gives no chip and is not remembered', async () => {
    const bad = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect((await fetchEntityProfiles(['Elon Musk'], bad)).size).toBe(0)
    const non200 = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    expect((await fetchEntityProfiles(['Elon Musk'], non200)).size).toBe(0)
    expect((await fetchEntityProfiles(['Elon Musk'], reply([musk]))).size).toBe(1)
  })

  it('no names, no request', async () => {
    const f = reply([])
    expect((await fetchEntityProfiles([], f)).size).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })

  it('chipsOf gives each resolved name its icon from the description', async () => {
    const out = await fetchEntityProfiles(['Elon Musk'], reply([musk]))
    expect(chipsOf(out).get('elon musk')).toEqual({ name: 'Elon Musk', icon: '👤' })
  })
})
