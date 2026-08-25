import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, type TurnEvidence } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { parseShoppingMarker } from './consultative/synthesisView'

// ── Safe-speed Phase 1: the shopping decision ships as soon as it exists ─────
//
// The decision is finished at tool-result time — route.ts builds it inside the
// tool's own execute() from frozen evidence — but it used to wait behind the
// prose buffer and arrive near the end of the turn. Sending it early is a pure
// delivery change: same object, same channel (message TEXT, so it survives
// reload), just not held back.
//
// What has to stay true while it moves:
//   • exactly one copy reaches the client (two would render two cards)
//   • the prose still arrives, after it
//   • nothing model-authored rides along
//   • the guards and Decision Evidence still see the reply they saw before
//   • non-shopping turns are untouched
//   • an absent or malformed decision produces no early frame at all

const line0 = (s: string) => '0:' + JSON.stringify(s)

async function run(lines: string[], collector?: ReturnType<typeof createEnrichmentCollector>,
                   onEvidence?: (e: TurnEvidence) => Promise<void>): Promise<string> {
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, onEvidence)
  return await new Response(res.body).text()
}

const textFrames = (out: string) =>
  out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string)

const SHOP_TURN = [
  '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"MacBook Pro 14 M1"}}',
  'a:{"toolCallId":"t1","result":{"search_results":[{"title":"MacBook Pro 14 M1 32GB 512GB","price":"25.800.000đ","link":"https://shop.example/mbp"}]}}',
  line0('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.'),
  'd:{"finishReason":"stop"}',
]

const PLACE_TURN = [
  '9:{"toolCallId":"p1","toolName":"search_places","args":{}}',
  'a:{"toolCallId":"p1","result":{"results":[{"name":"Quán Bún Bò Huế 3A","address":"12 Phan Xích Long"}]}}',
  line0('**Quán Bún Bò Huế 3A** rất đáng thử.'),
  'd:{"finishReason":"stop"}',
]

const VIEW = {
  v: 1,
  entities: [{
    key: 'm1', config: 'M1 · 32GB · 512GB', matchesRequest: 'khop', recommended: true,
    priceLow: 25800000, priceHigh: 25800000,
    offers: [{ seller: 'shop.example', url: 'https://shop.example/mbp', price: 25800000, currency: 'VND', condition: 'new' }],
  }],
  recommendation: null,
}
const MARKER = `[TAPPY_SHOPPING]${JSON.stringify(VIEW)}[/TAPPY_SHOPPING]`

const withMarker = () => {
  const c = createEnrichmentCollector()
  c.setShoppingMarker(MARKER)
  return c
}

describe('1 — synthesis available means the decision goes out early', () => {
  it('emits it right after the tool result, before any prose', async () => {
    const frames = textFrames(await run(SHOP_TURN, withMarker()))
    const marker = frames.findIndex(f => f.includes('[TAPPY_SHOPPING]'))
    const prose = frames.findIndex(f => f.includes('Mình gợi ý cấu hình'))
    expect(marker).toBeGreaterThan(-1)
    expect(marker).toBeLessThan(prose)
  })

  it('does not wait for the prose buffer to flush', async () => {
    // The turn's LAST text frame is the reconstructed prose. If the decision
    // were still riding on it, this would be the frame carrying the marker.
    const frames = textFrames(await run(SHOP_TURN, withMarker()))
    expect(frames[frames.length - 1]).not.toContain('[TAPPY_SHOPPING]')
  })
})

describe('2 — the early frame carries only server-built evidence', () => {
  it('is byte-identical to what the collector was given', async () => {
    const frames = textFrames(await run(SHOP_TURN, withMarker()))
    const carrier = frames.find(f => f.includes('[TAPPY_SHOPPING]'))!
    // Trailing separator only — no other content may be folded in.
    expect(carrier.trim()).toBe(MARKER)
  })

  it('carries no model-authored prose', async () => {
    const frames = textFrames(await run(SHOP_TURN, withMarker()))
    const carrier = frames.find(f => f.includes('[TAPPY_SHOPPING]'))!
    expect(carrier).not.toContain('Mình gợi ý cấu hình')
  })

  it('parses back to exactly the synthesis object the server built', async () => {
    const joined = textFrames(await run(SHOP_TURN, withMarker())).join('')
    const { view } = parseShoppingMarker(joined)
    expect(view).toEqual(VIEW)
  })
})

describe('3 — exactly one decision reaches the client', () => {
  it('emits the open and close markers once each', async () => {
    const joined = textFrames(await run(SHOP_TURN, withMarker())).join('')
    expect((joined.match(/\[TAPPY_SHOPPING\]/g) ?? []).length).toBe(1)
    expect((joined.match(/\[\/TAPPY_SHOPPING\]/g) ?? []).length).toBe(1)
  })

  it('yields a single card when the client parses the whole message', async () => {
    // The client concatenates every 0: delta into msg.content, then parses once.
    const joined = textFrames(await run(SHOP_TURN, withMarker())).join('')
    const { text, view } = parseShoppingMarker(joined)
    expect(view).not.toBeNull()
    // After stripping, no second marker can be left behind.
    expect(text).not.toContain('TAPPY_SHOPPING')
  })
})

describe('4 — the prose still arrives after the decision', () => {
  it('keeps the reply text intact', async () => {
    const joined = textFrames(await run(SHOP_TURN, withMarker())).join('')
    expect(parseShoppingMarker(joined).text).toContain('Mình gợi ý cấu hình')
  })
})

describe('5 — what the UI renders is unchanged', () => {
  it('strips cleanly, leaving prose the card can sit beside', async () => {
    const joined = textFrames(await run(SHOP_TURN, withMarker())).join('')
    const { text, view } = parseShoppingMarker(joined)
    expect(view!.entities[0].config).toBe('M1 · 32GB · 512GB')
    expect(view!.entities[0].offers[0].seller).toBe('shop.example')
    expect(text.trim().startsWith('Mình gợi ý')).toBe(true)
  })

  it('survives a reload — the decision lives in the message text, not a tool field', async () => {
    // Reload replays persisted content: the concatenated text, nothing else.
    const persisted = textFrames(await run(SHOP_TURN, withMarker())).join('')
    expect(parseShoppingMarker(persisted).view).toEqual(VIEW)
  })
})

describe('6 — Decision Evidence is unchanged', () => {
  it('still resolves presented candidates against the reply INCLUDING the decision', async () => {
    let ev: TurnEvidence | null = null
    await run(SHOP_TURN, withMarker(), async e => { ev = e })
    expect(ev).not.toBeNull()
    // The product was named in the prose-side evidence exactly as before the
    // split; moving the marker must not shrink what the turn recorded.
    expect(ev!.productRecords.length).toBe(1)
    expect(ev!.productQueries).toContain('MacBook Pro 14 M1')
  })

  it('records the same evidence with and without an early decision', async () => {
    let withEv: TurnEvidence | null = null
    let withoutEv: TurnEvidence | null = null
    await run(SHOP_TURN, withMarker(), async e => { withEv = e })
    await run(SHOP_TURN, createEnrichmentCollector(), async e => { withoutEv = e })
    expect(withEv!.productRecords).toEqual(withoutEv!.productRecords)
    expect(withEv!.productQueries).toEqual(withoutEv!.productQueries)
    expect(withEv!.presentedNames).toEqual(withoutEv!.presentedNames)
  })
})

describe('3b — one decision even when the turn has several tool results', () => {
  it('does not re-send on a second result frame', async () => {
    // A shopping turn can search more than once. The marker is batch-level —
    // first one wins — so a later result must not push a second copy out.
    const twoResults = [
      '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"MacBook Pro 14 M1"}}',
      'a:{"toolCallId":"t1","result":{"search_results":[{"title":"MacBook Pro 14 M1 32GB 512GB","price":"25.800.000đ","link":"https://shop.example/mbp"}]}}',
      '9:{"toolCallId":"t2","toolName":"search_products","args":{"query":"MacBook Pro 14 M1 refurb"}}',
      'a:{"toolCallId":"t2","result":{"search_results":[{"title":"MacBook Pro 14 M1 refurb","price":"21.000.000đ","link":"https://shop.example/mbp2"}]}}',
      line0('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.'),
      'd:{"finishReason":"stop"}',
    ]
    const joined = textFrames(await run(twoResults, withMarker())).join('')
    expect((joined.match(/\[TAPPY_SHOPPING\]/g) ?? []).length).toBe(1)
  })
})

describe('4b — the decision is never lost when the early send did not fire', () => {
  it('still ships at the end of a turn whose tool produced no result frame', async () => {
    // A tool call that never returns a result (aborted/failed) leaves the early
    // path untaken. The decision must then fall back to end-of-turn delivery
    // rather than silently vanishing.
    const noResult = [
      '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"MacBook Pro 14 M1"}}',
      line0('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.'),
      'd:{"finishReason":"stop"}',
    ]
    const joined = textFrames(await run(noResult, withMarker())).join('')
    expect(parseShoppingMarker(joined).view).toEqual(VIEW)
    expect((joined.match(/\[TAPPY_SHOPPING\]/g) ?? []).length).toBe(1)
  })
})

describe('6b — the decision still counts as having presented its candidates', () => {
  it('records a product named only inside the card as presented', async () => {
    // presentedNames answers "which candidates did the user actually see?" —
    // and the card IS something the user sees. A product that appears only in
    // the decision, never in the prose, is still presented, so the reply the
    // evidence is resolved against has to keep carrying the marker.
    const CARD_ONLY = 'Dell XPS 13 Plus'
    const view = { ...VIEW, entities: [{ ...VIEW.entities[0], config: CARD_ONLY }] }
    const c = createEnrichmentCollector()
    c.setShoppingMarker(`[TAPPY_SHOPPING]${JSON.stringify(view)}[/TAPPY_SHOPPING]`)
    const lines = [
      '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"laptop"}}',
      `a:{"toolCallId":"t1","result":{"search_results":[{"title":"${CARD_ONLY}","price":"31.000.000đ","link":"https://shop.example/xps"}]}}`,
      line0('Đây là gợi ý của mình.'),
      'd:{"finishReason":"stop"}',
    ]
    let ev: TurnEvidence | null = null
    await run(lines, c, async e => { ev = e })
    expect(ev!.presentedNames).toContain(CARD_ONLY)
  })
})

describe('7 — non-shopping turns are untouched', () => {
  it('emits no decision frame on a places turn', async () => {
    const joined = textFrames(await run(PLACE_TURN, createEnrichmentCollector())).join('')
    expect(joined).not.toContain('TAPPY_SHOPPING')
    expect(joined).toContain('Quán Bún Bò Huế 3A')
  })

  it('leaves a no-tool turn alone', async () => {
    const out = await run([line0('Xin chào!'), 'd:{"finishReason":"stop"}'], createEnrichmentCollector())
    expect(textFrames(out).join('')).toBe('Xin chào!')
  })
})

describe('8 — an absent decision produces no early frame', () => {
  it('emits nothing extra when the collector carries no marker', async () => {
    const joined = textFrames(await run(SHOP_TURN, createEnrichmentCollector())).join('')
    expect(joined).not.toContain('TAPPY_SHOPPING')
    expect(joined).toContain('Mình gợi ý cấu hình')
  })

  it('degrades to no card when the marker is malformed', async () => {
    const c = createEnrichmentCollector()
    c.setShoppingMarker('[TAPPY_SHOPPING]{not json[/TAPPY_SHOPPING]')
    const joined = textFrames(await run(SHOP_TURN, c)).join('')
    // It still ships (the server owns it), but the client refuses to render a
    // card it cannot parse — never throws, never leaks raw JSON as prose.
    const { view } = parseShoppingMarker(joined)
    expect(view).toBeNull()
  })

  it('emits no frame when the collector is absent entirely', async () => {
    const joined = textFrames(await run(SHOP_TURN, undefined)).join('')
    expect(joined).not.toContain('TAPPY_SHOPPING')
  })
})

describe('9 — stream termination is unchanged', () => {
  it('still forwards the finish frame, and last', async () => {
    const out = await run(SHOP_TURN, withMarker())
    const lines = out.split('\n').filter(Boolean)
    expect(lines[lines.length - 1]).toContain('d:{"finishReason":"stop"}')
  })

  it('forwards the tool-call and tool-result frames untouched', async () => {
    const out = await run(SHOP_TURN, withMarker())
    expect(out).toContain('9:{"toolCallId":"t1","toolName":"search_products"')
    expect(out).toContain('a:{"toolCallId":"t1"')
  })

  it('emits the decision after the tool result, never before it', async () => {
    // Ordering matters for the client: the card is built from the same turn's
    // evidence, so it must not appear ahead of the result that produced it.
    const lines = (await run(SHOP_TURN, withMarker())).split('\n').filter(Boolean)
    const aIdx = lines.findIndex(l => l.startsWith('a:'))
    const mIdx = lines.findIndex(l => l.includes('TAPPY_SHOPPING'))
    expect(aIdx).toBeGreaterThan(-1)
    expect(mIdx).toBeGreaterThan(aIdx)
  })
})
