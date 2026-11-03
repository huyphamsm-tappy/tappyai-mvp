import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Gate 2 N1/N2 (I1): an external image URL enters only as a safe https URL ──
//
// Four places take an image URL from outside — a venue's og:image, the Serper /images pool, the
// Serper /shopping imageUrl and the Serper /maps thumbnail — and none checked its scheme or host:
// `http:`, `data:`, `javascript:`, an internal host, a private IP or a URL with userinfo all
// reached the client. Each source now admits only `isSafeHttpsUrl`. Unit-level on purpose: the
// receivers check again (imageUrlReceivers.test.ts), so a stream-level test could not tell which
// layer did the work. NT-* ids are the cases registered in gate2/n12/N12-ADDENDUM.md.

const safeGetText = vi.hoisted(() => vi.fn())
vi.mock('@/lib/security/safeFetch', () => ({ safeGetText }))

import { fetchOfficialWebsiteImage, pickEmbeddableImageUrls, serperShopping, __clearToolCache } from './common'
import { serperPlaces, serperPlaceToRow } from './serperPlaces'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { __resetSerperAlerts } from './serperClient'

const BAD = [
  'http://cdn.example/a.jpg',
  'data:image/png;base64,iVBORw0KGgo',
  'javascript:alert(1)',
  'httpfoo://x/a.jpg',
  'https://localhost/a.jpg',
  'https://127.0.0.1/a.jpg',
  'https://10.0.0.5/a.jpg',
  'https://u:p@cdn.example/a.jpg',
  'https://[::1]/a.jpg',
]
const GOOD = 'https://cdn.example/a.jpg'

describe('NT-1 — og:image of the venue website (S-1)', () => {
  beforeEach(() => safeGetText.mockReset())
  const page = (img: string, finalUrl = 'https://site.example/') => ({
    contentType: 'text/html; charset=utf-8',
    text: `<html><head><meta property="og:image" content="${img}"></head>`,
    finalUrl,
  })

  for (const bad of BAD) {
    it(`returns null for ${bad.slice(0, 32)}`, async () => {
      safeGetText.mockResolvedValue(page(bad))
      expect(await fetchOfficialWebsiteImage('https://site.example/')).toBeNull()
    })
  }

  it('returns null for a relative og:image resolved against an http: final URL', async () => {
    safeGetText.mockResolvedValue(page('/img/a.jpg', 'http://site.example/'))
    expect(await fetchOfficialWebsiteImage('https://site.example/')).toBeNull()
  })

  it('control: a public https og:image is returned unchanged', async () => {
    safeGetText.mockResolvedValue(page(GOOD))
    expect(await fetchOfficialWebsiteImage('https://site.example/')).toBe(GOOD)
  })
})

describe('NT-2 — the Serper /images pool (S-2, every branch of pickFromPool)', () => {
  it('no unsafe URL is picked, from imageUrl or thumbnailUrl, in any pass', () => {
    const pool = [
      ...BAD.map(u => ({ imageUrl: u })),
      ...BAD.map(u => ({ thumbnailUrl: u })),
      { imageUrl: GOOD },
    ]
    const picked = pickEmbeddableImageUrls(pool as never, 50)
    for (const bad of BAD) expect(picked).not.toContain(bad)
    expect(picked).toContain(GOOD)
  })

  it('the last-resort pass (first imageUrl when nothing else qualified) does not admit an unsafe URL', () => {
    expect(pickEmbeddableImageUrls([{ imageUrl: 'http://cdn.example/only.jpg' }] as never, 3)).toEqual([])
  })
})

describe('Serper providers (fetch stubbed — no network)', () => {
  let shoppingRows: Array<Record<string, unknown>> = []
  let placeRows: Array<Record<string, unknown>> = []
  beforeEach(() => {
    __clearToolCache(); __resetKvCounters(); __resetSerperAlerts()
    vi.stubEnv('SERPER_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url === 'https://google.serper.dev/shopping') return new Response(JSON.stringify({ shopping: shoppingRows }), { status: 200 })
      if (url === 'https://google.serper.dev/maps') return new Response(JSON.stringify({ places: placeRows }), { status: 200 })
      throw new Error(`unexpected fetch ${url}`)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('NT-3 — /shopping imageUrl (S-3): an unsafe image is not carried; the safe one is', async () => {
    shoppingRows = [...BAD, GOOD].map((imageUrl, i) => ({ title: `Tai nghe ${i}`, link: `https://shop.example/p${i}`, price: '1.000.000đ', source: 'Shop', imageUrl }))
    const records = await serperShopping('tai nghe nt3', 20)
    expect(records).not.toBeNull()
    const byTitle = new Map(records!.map(r => [r.title, r]))
    BAD.forEach((_, i) => expect(byTitle.get(`Tai nghe ${i}`)?.imageUrl).toBeUndefined())
    expect(byTitle.get(`Tai nghe ${BAD.length}`)?.imageUrl).toBe(GOOD)
  })

  it('NT-4 — /maps thumbnail (S-4): an unsafe thumbnail is not carried, so the row has no photo; the safe one is', async () => {
    placeRows = [...BAD, GOOD].map((thumbnailUrl, i) => ({ title: `Quán ${i}`, address: `${i} Phố Huế, Hà Nội`, thumbnailUrl }))
    const recs = await serperPlaces('phở nt4', null)
    expect(recs).not.toBeNull()
    const byTitle = new Map(recs!.map(r => [r.title, r]))
    const opts = { ratingText: (r: number) => `${r}` }
    BAD.forEach((_, i) => {
      const rec = byTitle.get(`Quán ${i}`)!
      expect(rec.thumbnailUrl).toBeUndefined()
      expect(serperPlaceToRow(rec, opts).photo_url).toBeUndefined()
    })
    const good = byTitle.get(`Quán ${BAD.length}`)!
    expect(good.thumbnailUrl).toBe(GOOD)
    expect(serperPlaceToRow(good, opts).photo_url).toBe(GOOD)
  })
})
