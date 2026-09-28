// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, selectPlacesNeedingEnrichment } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'
import { placesRenderOrder, readPlacesLiveView, type PlacesLiveView } from '@/lib/recommendation/liveView'
import { attachCommerceLinks } from './tools/commerce'
import { cachedDiscoverySearch } from './tools/commerceDiscovery'
import { __clearToolCache } from './tools/common'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { __resetSerperAlerts } from './tools/serperClient'
import { COMMERCE_LINKS_KEY, type CommerceLinkRow } from '@/lib/ccp'

// ─────────────────────────────────────────────────────────────────────────────
// ONLY WHAT IS SHOWN PAYS (owner rule 2026-09-29: quality not worse, cost not up).
//
// Measured on the offline replay (scripts/consult/replay, SPA-1 t2 "massage toàn thân, quận 1,
// 500k, tối nay"): 9 Serper calls on one pick turn. Two of them were /images lookups for the two
// Klook listing rows — one was card #3 (seen), the other item #4 behind "Xem thêm" (not seen).
// Three were Klook venue lookups that came back EMPTY and were not remembered, so the next turn
// about the same venues paid for them again.
// ─────────────────────────────────────────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const THUMB = (i: number) => `https://lh3.googleusercontent.com/p/thumb-${i}=w400`
const TT = (i: number) => `https://www.tiktok.com/@reviewer${i}/video/760000000000000000${i}`

type Row = Record<string, unknown>
const venue = (name: string, i: number, extra: Row = {}): Row => ({
  place_id: `g-${i}`,
  name,
  address: `${10 + i} Lê Thánh Tôn, Quận 1`,
  rating_value: 4 + i / 10,
  rating_count: 100 + i,
  maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}`,
  ...extra,
})

/** SPA-1 t2's shape: three /maps venues with their thumbnail, two Klook listing rows without one. */
const SPA_ROWS = (): Row[] => [
  venue('MOON SPA Quận 1', 0, { photo_url: THUMB(0) }),
  venue('Gội Đầu & Massage tại Charm Garden Spa', 1),
  venue('Trải nghiệm La Spa & Massage Premium', 2),
  venue('Massage Hạ Spa Quận 1', 3, { photo_url: THUMB(3) }),
  venue('Qispa Head & Massage', 4, { photo_url: THUMB(4) }),
]

const SPA_PROSE = [
  'Mình chọn: **MOON SPA Quận 1** — massage body, mở tới 23h.',
  '',
  '- **Massage Hạ Spa Quận 1**: gần Lê Thánh Tôn.',
  '- **Qispa Head & Massage**: gội đầu dưỡng sinh.',
].join('\n')

async function turn(opts: {
  rows: Row[]
  prose: string
  photos?: (names: string[]) => Map<string, string[]>
  tiktok?: Map<string, string>
}) {
  const result = { source: 'serper_maps', count: opts.rows.length, results: opts.rows, _tappy_place_domain: 'spa' }
  const collector = createEnrichmentCollector('massage quận 1')
  collector.add(result.results)
  collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM'), producerSubject('search_places', 'spa'))
  collector.setRendersDecisionCard(rendersDecisionCard('web'))
  const photoAsks: string[][] = []
  const tiktokAsks: string[][] = []
  const res = applyPlaceEnrichmentStreamFilter(
    new Response([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"massage","location":"Quận 1"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result }),
      line0(opts.prose),
      END,
    ].join('\n') + '\n'),
    'vi', collector,
    async places => {
      const names = places.map(p => p.name as string)
      photoAsks.push(names)
      return opts.photos ? opts.photos(names) : new Map()
    },
    undefined, undefined, false, '', true,
    async names => {
      tiktokAsks.push([...names])
      return { perPlace: opts.tiktok ?? new Map(), batch: null }
    },
    'TP HCM',
  )
  const out = await new Response(res.body).text()
  const annotations = out.split('\n').filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as unknown[])
  const view = readPlacesLiveView(annotations) as PlacesLiveView
  const shown = placesRenderOrder(view).visible
  return { photoAsks, tiktokAsks, view, shown, text: out }
}

describe('photos — only the cards above the fold, only without a provider thumbnail', () => {
  it('SPA-1 t2 shape: the three shown cards already have thumbnails ⇒ NO /images call (was 2, both for hidden rows)', async () => {
    const { photoAsks, shown } = await turn({ rows: SPA_ROWS(), prose: SPA_PROSE })
    expect(photoAsks).toEqual([]) // the resolver is not even invoked
    // What is displayed is exactly what it was: the three named venues, each with its own thumbnail.
    expect(shown.map(i => [i.name, i.image])).toEqual([
      ['MOON SPA Quận 1', THUMB(0)],
      ['Massage Hạ Spa Quận 1', THUMB(3)],
      ['Qispa Head & Massage', THUMB(4)],
    ])
  })

  it('the pre-change selection (no fold passed) would have bought both hidden rows — the saving is real', () => {
    const places = SPA_ROWS() as Array<{ name?: string; photo_url?: string }>
    expect(selectPlacesNeedingEnrichment(places, SPA_PROSE).map(p => p.name)).toEqual([
      'Gội Đầu & Massage tại Charm Garden Spa',
      'Trải nghiệm La Spa & Massage Premium',
    ])
    expect(selectPlacesNeedingEnrichment(places, SPA_PROSE, { cardNames: ['MOON SPA Quận 1', 'Massage Hạ Spa Quận 1', 'Qispa Head & Massage'] })).toEqual([])
  })

  it('a fold card WITHOUT a thumbnail still gets its photo, and it lands on that card exactly as before', async () => {
    // The reply names only MOON; the engine's order fills the fold — one fill card has no thumbnail.
    const rows = [
      venue('MOON SPA Quận 1', 0, { photo_url: THUMB(0) }),
      venue('Sen Spa Nguyễn Huệ', 1),
      venue('Massage Hạ Spa Quận 1', 2, { photo_url: THUMB(2) }),
      venue('Hidden Spa Bốn', 3),
      venue('Hidden Spa Năm', 4),
    ]
    const RESOLVED = 'https://img.example/sen-spa.jpg'
    const { photoAsks, shown } = await turn({
      rows,
      prose: 'Mình chọn: **MOON SPA Quận 1** — massage body, mở tới 23h.',
      photos: names => new Map(names.map(n => [n, [`https://img.example/${n === 'Sen Spa Nguyễn Huệ' ? 'sen-spa' : 'other'}.jpg`]])),
    })
    const fold = shown.map(i => i.name)
    expect(fold).toHaveLength(3)
    expect(fold[0]).toBe('MOON SPA Quận 1')
    // Exactly the photo-less cards of the fold were asked for — the two hidden rows were not.
    const photoless = fold.filter(n => !rows.find(r => r.name === n)?.photo_url)
    expect(photoAsks).toEqual([photoless])
    expect(photoAsks.flat()).not.toContain('Hidden Spa Năm')
    for (const item of shown) {
      const row = rows.find(r => r.name === item.name)!
      expect(item.image).toBe(row.photo_url ?? (item.name === 'Sen Spa Nguyễn Huệ' ? RESOLVED : 'https://img.example/other.jpg'))
    }
  })

  it('🚨 SPA-1 t2: the alternatives the reply names (engine rank 9/10) are ON the card, right after the pick — text = card; only the fold without a thumbnail pays a photo', async () => {
    // Descending ratings keep the engine order = provider order; rows 8 and 9 used to fall past the 8-item card.
    const rows = Array.from({ length: 10 }, (_, i) => venue(
      ['MOON SPA Quận 1', 'CHARM SPA Garden', 'Gội Đầu tại Charm Garden Spa', 'Trải nghiệm La Spa Premium', 'Sen Spa Bốn', 'Sen Spa Năm', 'Sen Spa Sáu', 'Sen Spa Bảy', 'Massage Hạ Spa Quận 1', 'Qispa Head & Massage'][i],
      i,
      { rating_value: 4.9 - i / 10, ...([8].includes(i) ? {} : { photo_url: THUMB(i) }) },
    ))
    const { photoAsks, shown, view } = await turn({
      rows, prose: SPA_PROSE,
      photos: names => new Map(names.map(n => [n, [`https://img.example/${encodeURIComponent(n)}.jpg`]])),
    })
    expect(view.items).toHaveLength(8)
    // Consult V2 (liveView.ts): the named alternatives follow the lead in the reply's order.
    expect(shown.map(i => i.name)).toEqual(['MOON SPA Quận 1', 'Massage Hạ Spa Quận 1', 'Qispa Head & Massage'])
    // Only the shown card without a provider thumbnail pays a photo lookup.
    expect(photoAsks).toEqual([['Massage Hạ Spa Quận 1']])
    expect(shown[1].image).toBe(`https://img.example/${encodeURIComponent('Massage Hạ Spa Quận 1')}.jpg`)
  })

  it('a reply that names NO venue keeps the old provider-order selection (the no-card trailing block reads it)', () => {
    const places = SPA_ROWS() as Array<{ name?: string; photo_url?: string }>
    const text = 'Mình chưa xác nhận được chỗ nào còn trống tối nay.'
    expect(selectPlacesNeedingEnrichment(places, text, { cardNames: ['MOON SPA Quận 1'] }))
      .toEqual(selectPlacesNeedingEnrichment(places, text))
  })
})

describe('TikTok — one batched lookup for the fold, skipped when the fold is already verified', () => {
  it('asks for the three shown cards only, in card order, and the attributed review reaches its card', async () => {
    const tiktok = new Map([['Massage Hạ Spa Quận 1', TT(1)]])
    const { tiktokAsks, shown } = await turn({ rows: SPA_ROWS(), prose: SPA_PROSE, tiktok })
    expect(tiktokAsks).toEqual([['MOON SPA Quận 1', 'Massage Hạ Spa Quận 1', 'Qispa Head & Massage']])
    const ha = shown.find(i => i.name === 'Massage Hạ Spa Quận 1')!
    expect(ha.actions.filter(a => a.kind === 'review' && a.url === TT(1))).toHaveLength(1)
  })

  it('no lookup at all when every shown card already carries a verified TikTok review — the links stay', async () => {
    const rows: Row[] = SPA_ROWS().map((r, i) => ({ ...r, tiktok_review_url: TT(i), has_tiktok_review: true }))
    const { tiktokAsks, shown } = await turn({ rows, prose: SPA_PROSE })
    expect(tiktokAsks).toEqual([])
    for (const item of shown) {
      const i = rows.findIndex(r => r.name === item.name)
      expect(item.actions.some(a => a.kind === 'review' && a.url === TT(i))).toBe(true)
    }
  })

  it('still looks up when only SOME shown cards are verified (the batch is one credit either way)', async () => {
    const rows = SPA_ROWS().map((r, i) => (i === 0 ? { ...r, tiktok_review_url: TT(0), has_tiktok_review: true } : r))
    const { tiktokAsks } = await turn({ rows, prose: SPA_PROSE })
    expect(tiktokAsks).toHaveLength(1)
  })
})

// ── Commerce discovery: 24 h per (provider, entity), empty answers included ───────────────────

const KV = 'https://kv.test'
let kv: Map<string, string>
let serperQueries: string[]
let serperAnswer: (q: string) => { status: number; body: unknown }

function installFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body ?? 'null'))
    if (url === 'https://google.serper.dev/search') {
      serperQueries.push(body.q)
      const a = serperAnswer(body.q)
      return new Response(JSON.stringify(a.body), { status: a.status })
    }
    if (url === `${KV}/pipeline`) return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 })
    if (url === KV) {
      const cmd = body as string[]
      if (cmd[0] === 'GET') return new Response(JSON.stringify({ result: kv.get(cmd[1]) ?? null }), { status: 200 })
      if (cmd[0] === 'SET') { kv.set(cmd[1], cmd[2]); return new Response(JSON.stringify({ result: 'OK' }), { status: 200 }) }
    }
    return new Response('{}', { status: 200 })
  }))
}

beforeEach(() => {
  __clearToolCache(); __resetKvCounters(); __resetSerperAlerts()
  kv = new Map(); serperQueries = []
  serperAnswer = () => ({ status: 200, body: { organic: [] } })
  vi.stubEnv('SERPER_API_KEY', 'test-key')
  vi.stubEnv('KV_REST_API_URL', KV)
  vi.stubEnv('KV_REST_API_TOKEN', 'kv-token')
  vi.stubEnv('VERCEL_ENV', '')
  installFetch()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('cachedDiscoverySearch', () => {
  const Q = '"MOON SPA Quận 1" quan 1 site:klook.com/vi/activity'

  it('an EMPTY answer is remembered: the same (provider, entity) query is paid once', async () => {
    expect(await cachedDiscoverySearch(Q)).toEqual([])
    expect(await cachedDiscoverySearch(Q)).toEqual([])
    expect(serperQueries).toEqual([Q])
  })

  it('…across instances too: a cold instance reads the shared 24 h entry, not Serper', async () => {
    await cachedDiscoverySearch(Q)
    __clearToolCache() // a different lambda: no L1
    expect(await cachedDiscoverySearch(Q)).toEqual([])
    expect(serperQueries).toHaveLength(1)
    const stored = [...kv.keys()].filter(k => k.includes(':search:ccp-none:'))
    expect(stored).toHaveLength(1)
    expect(stored[0]).not.toContain('MOON') // hashed, never the raw query
  })

  it('a FAILED call (HTTP 500 / timeout / ceiling ⇒ null) is never remembered as empty', async () => {
    serperAnswer = () => ({ status: 500, body: {} })
    expect(await cachedDiscoverySearch(Q)).toBeNull()
    serperAnswer = () => ({ status: 200, body: { organic: [] } })
    expect(await cachedDiscoverySearch(Q)).toEqual([])
    expect(serperQueries).toHaveLength(2)
  })

  it('a non-empty answer is unchanged (serperSearch\'s own 24 h cache) and never shadowed by the empty marker', async () => {
    const hit = { title: 'Ha Spa & Massage tại Hồ Chí Minh - Klook', link: 'https://www.klook.com/vi/activity/43345-ha-spa-massage-ho-chi-minh/', snippet: '' }
    serperAnswer = () => ({ status: 200, body: { organic: [hit] } })
    expect(await cachedDiscoverySearch(Q)).toEqual([hit])
    expect(await cachedDiscoverySearch(Q)).toEqual([hit])
    expect(serperQueries).toHaveLength(1)
    expect([...kv.keys()].some(k => k.includes(':search:ccp-none:'))).toBe(false)
  })
})

describe('attachCommerceLinks (spa) — the second turn about the same venues pays nothing, links identical', () => {
  const NOW = new Date('2026-09-29T08:00:00Z')
  const PACKAGE = { title: 'Gội Đầu & Massage tại Charm Garden Spa ở Quận 1 - Klook', link: 'https://www.klook.com/vi/activity/212930-charm-garden-spa-ha-noi/', snippet: '' }
  const spaTurn = async () => {
    const rows = [venue('MOON SPA Quận 1', 0), venue('Massage Hạ Spa Quận 1', 1), venue('Qispa Head & Massage', 2), venue('Gạo Spa', 3)]
    const result: Row = { results: rows, _tappy_place_domain: 'spa', source: 'serper_maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, location: 'quan 1', query: 'massage toàn thân quận 1', userTexts: ['massage toàn thân, quận 1, 500k, tối nay'] })
    const out = (result.results as Row[]).map(r => ({ name: r.name, links: ((r[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []).map(l => ({ providerId: l.providerId, url: l.url, kind: l.kind })) }))
    return out
  }

  it('turn 1 pays 3 venue lookups + 1 subject lookup; turn 2 (same venues) pays 0 — and attaches the same links', async () => {
    serperAnswer = q => (q.startsWith('massage toàn thân') ? { status: 200, body: { organic: [PACKAGE] } } : { status: 200, body: { organic: [] } })
    const first = await spaTurn()
    expect(serperQueries).toHaveLength(4)
    expect(first.some(r => r.links.some(l => l.providerId === 'klook'))).toBe(true)
    __clearToolCache() // even on a cold instance: the shared store answers
    const second = await spaTurn()
    expect(serperQueries).toHaveLength(4)
    expect(second).toEqual(first)
  })
})
