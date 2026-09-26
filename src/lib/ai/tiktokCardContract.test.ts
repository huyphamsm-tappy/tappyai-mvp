// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { readPlacesLiveView } from '@/lib/recommendation/liveView'

// ─────────────────────────────────────────────────────────────────────────────
// THE FULL CHAIN, END TO END:
//
//   TikTok evidence exists
//     → entity attribution succeeds
//     → the URL survives projection
//     → a TikTok action appears on the recommendation card
//
// This is the regression V1/V2 shipped and V3 lost. Unit tests prove each hop;
// this proves the hops are connected, which is exactly what stopped being true.
// ─────────────────────────────────────────────────────────────────────────────

const VENUES = ['Bún Bò Huế Đông Ba', 'Bánh Mì Huỳnh Hoa', 'Phở Hòa Pasteur']

/** Real post URLs from the live 2026-09-10 probe. */
const REAL = {
  'Bún Bò Huế Đông Ba': 'https://www.tiktok.com/@dbtuyen_/photo/7666723553600916757',
  'Bánh Mì Huỳnh Hoa': 'https://www.tiktok.com/@kieu_van_thai/video/6926100708349562114',
}

const toolResult = (names: string[]) => ({
  source: 'Serper Maps',
  _tappy_place_domain: 'food',
  amenity_type: 'restaurant',
  location: 'TP.HCM',
  results: names.map((n, i) => ({
    name: n,
    address: `${i + 1} Đường Test, Quận 1`,
    amenity: 'restaurant',
    rating_value: 4.5,
    rating_count: 100,
    maps_link: `https://maps.google.com/?cid=${i + 1}`,
  })),
})

async function runTurn(opts: {
  names: string[]
  perPlace: Map<string, string>
  batch?: string | null
  onAsk?: (names: readonly string[]) => void
}) {
  const collector = createEnrichmentCollector('quán bún bò ngon ở TP.HCM')
  collector.setPlacesRecommendations(placeRecommendations(toolResult(opts.names)), 'food')

  const lines = [
    '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
    `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult(opts.names))}}`,
    '0:' + JSON.stringify(`Mình gợi ý **${opts.names[0]}** nhé.`),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(lines.join('\n') + '\n'), 'vi', collector, undefined,
    undefined, undefined, false, '', true,
    async (names) => {
      opts.onAsk?.(names)
      return { perPlace: opts.perPlace, batch: opts.batch ?? null }
    },
    'TP.HCM',
  )
  const text = await new Response(res.body).text()
  // A1(a): the preliminary set rides first; the decision is the LAST place frame — read them all.
  const view = readPlacesLiveView(text.split('\n').filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as unknown[]))
  return { text, view }
}

const tiktokActions = (view: ReturnType<typeof readPlacesLiveView>, name: string) =>
  (view?.items.find(i => i.name === name)?.actions ?? [])
    .filter(a => a.kind === 'review' && a.url.includes('tiktok.com'))

describe('TikTok evidence reaches the card', () => {
  it('renders a TikTok review action for every attributed venue', async () => {
    const { view } = await runTurn({ names: VENUES, perPlace: new Map(Object.entries(REAL)) })
    expect(view).not.toBeNull()

    const a = tiktokActions(view, 'Bún Bò Huế Đông Ba')
    expect(a).toHaveLength(1)
    expect(a[0].url).toBe(REAL['Bún Bò Huế Đông Ba'])
    expect(a[0].urlKind).toBe('direct')
    // `attributed` is what lets the label say "review" instead of "search".
    expect(a[0].attributed).toBe(true)
    expect(a[0].platform).toBe('TikTok')

    expect(tiktokActions(view, 'Bánh Mì Huỳnh Hoa')).toHaveLength(1)
  })

  it('gives NO action — and no placeholder — to a venue with no evidence', async () => {
    const { view } = await runTurn({ names: VENUES, perPlace: new Map(Object.entries(REAL)) })
    expect(tiktokActions(view, 'Phở Hòa Pasteur')).toHaveLength(0)
    // The card must still render everything else about it.
    expect(view!.items.find(i => i.name === 'Phở Hòa Pasteur')).toBeTruthy()
  })

  it('no evidence at all leaves the card intact, just without TikTok', async () => {
    const { view } = await runTurn({ names: VENUES, perPlace: new Map() })
    expect(view!.items).toHaveLength(3)
    for (const n of VENUES) expect(tiktokActions(view, n)).toHaveLength(0)
  })
})

describe('cost: only entities that will actually render are asked about', () => {
  it('asks about the admitted card entities, and only those', async () => {
    let asked: readonly string[] = []
    await runTurn({ names: VENUES, perPlace: new Map(), onAsk: n => { asked = n } })
    expect([...asked].sort()).toEqual([...VENUES].sort())
  })

  /**
   * 🚨 THE ENTITY THAT NEVER REACHES THE CARD MUST NEVER BE PAID FOR. A row the
   * domain boundary rejects is not a recommendation — asking TikTok about it
   * spends a query on something nobody will see.
   */
  it('never asks about a row eligibility rejected', async () => {
    let asked: readonly string[] = []
    const collector = createEnrichmentCollector('quán bún bò ngon ở TP.HCM')
    const mixed = {
      ...toolResult(['Bún Bò Huế Đông Ba']),
      results: [
        { name: 'Bún Bò Huế Đông Ba', amenity: 'restaurant', maps_link: 'https://maps.google.com/?cid=1' },
        // A cinema in a FOOD result set: rejected before it can ever be a card.
        { name: 'CGV Vincom', amenity: 'cinema', maps_link: 'https://maps.google.com/?cid=2' },
      ],
    }
    collector.setPlacesRecommendations(placeRecommendations(mixed), 'food')
    const res = applyPlaceEnrichmentStreamFilter(
      new Response([
        '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
        `a:{"toolCallId":"t1","result":${JSON.stringify(mixed)}}`,
        '0:"x"', 'd:{"finishReason":"stop"}',
      ].join('\n') + '\n'), 'vi', collector, undefined,
      undefined, undefined, false, '', true,
      async (names) => { asked = names; return { perPlace: new Map(), batch: null } },
      'TP.HCM',
    )
    await new Response(res.body).text()
    expect(asked).not.toContain('CGV Vincom')
    expect(asked).toContain('Bún Bò Huế Đông Ba')
  })

  it('a resolver that throws does not break the card', async () => {
    const collector = createEnrichmentCollector('quán bún bò ngon ở TP.HCM')
    collector.setPlacesRecommendations(placeRecommendations(toolResult(VENUES)), 'food')
    const res = applyPlaceEnrichmentStreamFilter(
      new Response([
        '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
        `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult(VENUES))}}`,
        '0:"x"', 'd:{"finishReason":"stop"}',
      ].join('\n') + '\n'), 'vi', collector, undefined,
      undefined, undefined, false, '', true,
      vi.fn(async () => { throw new Error('serper down') }),
      'TP.HCM',
    )
    const text = await new Response(res.body).text()
    expect(readPlacesLiveView(text.split('\n').filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as unknown[]))!.items).toHaveLength(3)
  })
})

describe('duplicate evidence is not rendered twice', () => {
  it('the same URL is not added when the entity already carries it', async () => {
    const dup = new Map([
      ['Bún Bò Huế Đông Ba', REAL['Bún Bò Huế Đông Ba']],
      ['Bánh Mì Huỳnh Hoa', REAL['Bún Bò Huế Đông Ba']],
    ])
    const { view } = await runTurn({ names: VENUES, perPlace: dup })
    const urls = view!.items.flatMap(i => i.actions.filter(a => a.url.includes('tiktok.com')).map(a => a.url))
    // liveActions dedupes by URL across the card, so one URL renders once.
    expect(new Set(urls).size).toBe(urls.length)
  })
})
