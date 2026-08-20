import { describe, expect, it } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, type TurnEvidence } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

/**
 * Task 3F-2.4 — preparation for the pre-search gate. Nothing calls `seed` in
 * production yet.
 *
 * The filter currently learns everything from the LLM's own frames: `9:` sets
 * bufferMode / the tool-name map / productQueries, `a:` fills latestPlaces and
 * the money guard's productRecords. Once a search runs server-side those frames
 * never arrive, and the failure is SILENT — photos and order links quietly stop
 * being injected and the money guard loses its entity list. These tests pin
 * that an explicit seed reproduces the same behaviour, that the old path is
 * untouched, and that having both at once does not double anything.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Build a data stream from raw frame lines. */
function streamOf(lines: string[]): Response {
  const body = new ReadableStream({
    start(c) { c.enqueue(enc.encode(lines.join('\n') + '\n')); c.close() },
  })
  return new Response(body)
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += dec.decode(value, { stream: true })
  }
  return out
}

/** The visible assistant text after the filter has run. */
function textOf(raw: string): string {
  let t = ''
  for (const line of raw.split('\n')) if (line.startsWith('0:')) { try { t += JSON.parse(line.slice(2)) } catch { /* partial */ } }
  return t
}

const PLACE = { name: 'Cà Phê AnAn', address: '22 Lý Quốc Sư', photo_url: 'https://img/anan.jpg' }
const PRODUCT_RESULT = { title: 'MacBook Pro M1 - Shopee', link: 'https://shopee.vn/x', price: '25.800.000 ₫' }

/** CASE A: the LLM-driven path exactly as it works today. */
const liveFrames = (toolName: string, result: unknown, query?: string) => [
  `f:${JSON.stringify({ messageId: 'm1' })}`,
  `9:${JSON.stringify({ toolCallId: 't1', toolName, args: query ? { query } : {} })}`,
  `a:${JSON.stringify({ toolCallId: 't1', result })}`,
  `0:${JSON.stringify('Quán **Cà Phê AnAn** rất hợp để làm việc.')}`,
  `d:${JSON.stringify({ finishReason: 'stop' })}`,
]

/** CASE B: no tool frames at all — the shape a pre-search turn will produce. */
const seededFrames = () => [
  `f:${JSON.stringify({ messageId: 'm1' })}`,
  `0:${JSON.stringify('Quán **Cà Phê AnAn** rất hợp để làm việc.')}`,
  `d:${JSON.stringify({ finishReason: 'stop' })}`,
]

const seedOf = (over: Partial<TurnEvidence> = {}): TurnEvidence => ({
  places: [], productRecords: [], productQueries: [], ...over,
})

describe('CASE A — existing 9:/a: path is unchanged', () => {
  it('still buffers and enriches a place result', async () => {
    const out = await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(liveFrames('search_places', { results: [PLACE] })), 'vi',
    ))

    expect(textOf(out)).toContain('Cà Phê AnAn')
    // Buffered path re-emits the text at 'd:' rather than streaming it live.
    expect(out).toContain('0:')
  })

  it('still collects the money guard\'s evidence from a product turn', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(liveFrames('search_products', { search_results: [PRODUCT_RESULT] }, 'macbook pro m1')),
      'vi', undefined, undefined, async e => { captured = e },
    ))

    expect(captured!.productQueries).toEqual(['macbook pro m1'])
    expect(captured!.productRecords).toHaveLength(1)
    expect(captured!.productRecords[0].price).toBe('25.800.000 ₫')
  })
})

describe('CASE B — explicit seed reproduces the same evidence with NO tool frames', () => {
  it('a seeded place turn buffers and reaches the same text', async () => {
    const seeded = await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined, undefined, undefined,
      seedOf({ places: [PLACE] }),
    ))
    const live = await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(liveFrames('search_places', { results: [PLACE] })), 'vi',
    ))

    expect(textOf(seeded)).toBe(textOf(live))
  })

  it('a seeded product turn gives the money guard the same grounding', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined, undefined, async e => { captured = e },
      seedOf({ productRecords: [PRODUCT_RESULT], productQueries: ['macbook pro m1'] }),
    ))

    expect(captured!.productQueries).toEqual(['macbook pro m1'])
    expect(captured!.productRecords[0].price).toBe('25.800.000 ₫')
  })

  it('seeded places reach the photo resolver — enrichment is not lost', async () => {
    const asked: string[] = []
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined,
      async (places) => { asked.push(...places.map(p => p.name || '')); return new Map() },
      undefined, seedOf({ places: [{ name: 'Cà Phê AnAn' }] }),
    ))

    expect(asked).toContain('Cà Phê AnAn')
  })
})

describe('CASE C — seed AND live frames together must not double up', () => {
  it('the same place from both sources appears once', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(liveFrames('search_places', { results: [PLACE] })), 'vi',
      undefined, undefined, async e => { captured = e }, seedOf({ places: [PLACE] }),
    ))

    expect(captured!.places.filter(p => p.name === 'Cà Phê AnAn')).toHaveLength(1)
  })

  it('the same product record and query appear once', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(liveFrames('search_products', { search_results: [PRODUCT_RESULT] }, 'macbook pro m1')),
      'vi', undefined, undefined, async e => { captured = e },
      seedOf({ productRecords: [PRODUCT_RESULT], productQueries: ['macbook pro m1'] }),
    ))

    expect(captured!.productRecords).toHaveLength(1)
    expect(captured!.productQueries).toEqual(['macbook pro m1'])
  })

  it('a DIFFERENT place from each source keeps both', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(liveFrames('search_places', { results: [{ name: 'Cà Phê HAN' }] })), 'vi',
      undefined, undefined, async e => { captured = e }, seedOf({ places: [{ name: 'Cà Phê AnAn' }] }),
    ))

    expect(captured!.places.map(p => p.name).sort()).toEqual(['Cà Phê AnAn', 'Cà Phê HAN'])
  })
})

describe('negative cases — the seed must fail safe', () => {
  it('an EMPTY seed does not switch on buffering for an ordinary chat turn', async () => {
    // If it did, a plain "hello" turn would be withheld and re-emitted.
    const withEmpty = await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined, undefined, undefined, seedOf(),
    ))
    const without = await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi',
    ))

    expect(withEmpty).toBe(without)
  })

  it('no seed at all behaves exactly as before', async () => {
    const a = await readAll(applyPlaceEnrichmentStreamFilter(streamOf(seededFrames()), 'vi'))
    expect(textOf(a)).toContain('Cà Phê AnAn')
  })

  it('a malformed seed does not throw or enrich', async () => {
    const bad = { places: null, productRecords: undefined, productQueries: 'nope' } as unknown as TurnEvidence

    await expect(readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined, undefined, undefined, bad,
    ))).resolves.toBeTypeOf('string')
  })

  it('places with no name are ignored rather than injected blank', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined, undefined, async e => { captured = e },
      seedOf({ places: [{ name: '' }, { name: '   ' }] }),
    ))

    expect(captured!.places).toHaveLength(0)
  })

  it('duplicate entries INSIDE one seed collapse to one', async () => {
    let captured: TurnEvidence | null = null
    await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', undefined, undefined, async e => { captured = e },
      seedOf({
        places: [PLACE, PLACE],
        productRecords: [PRODUCT_RESULT, PRODUCT_RESULT],
        productQueries: ['q', 'q'],
      }),
    ))

    expect(captured!.places).toHaveLength(1)
    expect(captured!.productRecords).toHaveLength(1)
    expect(captured!.productQueries).toEqual(['q'])
  })
})

describe('security — the seed carries evidence only', () => {
  it('nothing from a seed leaks into user-visible text beyond enrichment', async () => {
    const out = await readAll(applyPlaceEnrichmentStreamFilter(
      streamOf(seededFrames()), 'vi', createEnrichmentCollector(), undefined, undefined,
      // Fields that must never surface even if a caller wrongly attaches them.
      seedOf({ places: [{ name: 'Cà Phê AnAn', ...({ ownerScope: 'SECRET', authToken: 'TOKEN' } as object) }] }),
    ))

    expect(out).not.toContain('SECRET')
    expect(out).not.toContain('TOKEN')
    expect(out).not.toContain('tappy:convstate')
  })
})
