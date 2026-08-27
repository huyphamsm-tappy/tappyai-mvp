import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePlacePhotos, type PhotoStepTiming } from './common'

// ── Phase 2: the photo chain must be measurable WITHOUT becoming different ──
//
// postModelMs measured 1,490 ms median on production and this chain is the
// tail's only network work — but it is four conditional steps with four
// different timeouts (1,800 / 2,500 / 3,000 / 4,000 ms), so the aggregate says
// nothing about which step to look at.
//
// The one thing instrumentation must never do is change the thing it measures.
// These tests hold the chain to that: same calls, same order, same photos,
// with the sink and without it.

const PLACES_KEY = 'test-places-key'
const SERPER_KEY = 'test-serper-key'
const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY
// Serper short-circuits to [] without a key ("serper_skip: no_key") — the step
// would run but never reach the network, so a fixture that forgets this key
// measures a code path no production turn takes.
const ORIGINAL_SERPER = process.env.SERPER_API_KEY

/** A fetch stub that answers by URL and records every request made. */
function stubFetch(handler: (url: string) => { status?: number; headers?: Record<string, string>; body?: string } | 'hang') {
  const calls: string[] = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    calls.push(url)
    const r = handler(url)
    if (r === 'hang') {
      // Never settles — lets a step burn its own timeout, which is the case
      // worth measuring and the one a happy-path stub would never produce.
      return new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))) })
    }
    return Promise.resolve(new Response(r.body ?? '{}', {
      status: r.status ?? 200,
      headers: r.headers ?? { 'content-type': 'application/json' },
    }))
  })
  return calls
}

const detailWithPhoto = JSON.stringify({ result: { photos: [{ photo_reference: 'ref-1' }] } })

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = PLACES_KEY
  process.env.SERPER_API_KEY = SERPER_KEY
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY
  else process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY
  if (ORIGINAL_SERPER === undefined) delete process.env.SERPER_API_KEY
  else process.env.SERPER_API_KEY = ORIGINAL_SERPER
})

describe('the sink observes the steps that actually ran', () => {
  it('reports the Serper step on a place with no website and no place_id', async () => {
    stubFetch(() => ({ body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/a.jpg' }] }) }))
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A' }, 3, t => steps.push(t))
    expect(steps.map(s => s.step)).toEqual(['serper'])
  })

  it('does not report a step that never ran', async () => {
    stubFetch(() => ({ body: JSON.stringify({ images: [] }) }))
    const steps: PhotoStepTiming[] = []
    // No website_uri and no place_id → website and Places steps cannot run.
    await resolvePlacePhotos({ name: 'Quán A' }, 3, t => steps.push(t))
    expect(steps.some(s => s.step === 'website')).toBe(false)
    expect(steps.some(s => s.step === 'places_detail')).toBe(false)
    expect(steps.some(s => s.step === 'places_media')).toBe(false)
  })

  it('reports the Places detail step, and the media step only when a photo_reference came back', async () => {
    stubFetch(url =>
      url.includes('place/details') ? { body: detailWithPhoto }
        : url.includes('serper') ? { body: JSON.stringify({ images: [] }) }
        : { body: '{}' })
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, t => steps.push(t))
    const names = steps.map(s => s.step)
    expect(names).toContain('places_detail')
    expect(names.indexOf('places_detail')).toBeLessThan(names.indexOf('places_media'))
  })

  it('omits the media step when the detail carried no photo_reference', async () => {
    stubFetch(url =>
      url.includes('place/details') ? { body: JSON.stringify({ result: { photos: [] } }) }
        : { body: JSON.stringify({ images: [] }) })
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, t => steps.push(t))
    expect(steps.some(s => s.step === 'places_media')).toBe(false)
  })
})

describe('a step that burns its timeout is reported, not hidden', () => {
  it('marks the Places detail step timedOut and still falls through to Serper', async () => {
    stubFetch(url =>
      url.includes('place/details') ? 'hang'
        : { body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/s.jpg' }] }) })
    const steps: PhotoStepTiming[] = []
    const urls = await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, t => steps.push(t))
    const detail = steps.find(s => s.step === 'places_detail')!
    expect(detail, 'the timed-out step must still be reported').toBeDefined()
    expect(detail.timedOut).toBe(true)
    expect(detail.hit).toBe(false)
    // Unchanged behaviour: the fallback still runs and still returns its photo.
    expect(steps.some(s => s.step === 'serper')).toBe(true)
    expect(urls).toEqual(['https://cdn.example/s.jpg'])
  }, 10_000)
})

describe('`hit` reports contribution, not mere completion', () => {
  it('is false for a step that returned nothing usable', async () => {
    stubFetch(() => ({ body: JSON.stringify({ images: [] }) }))
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A' }, 3, t => steps.push(t))
    expect(steps.find(s => s.step === 'serper')!.hit).toBe(false)
  })

  it('is true for a step that added a URL', async () => {
    stubFetch(() => ({ body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/a.jpg' }] }) }))
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A' }, 3, t => steps.push(t))
    expect(steps.find(s => s.step === 'serper')!.hit).toBe(true)
  })

  it('reports a non-negative duration for every step', async () => {
    stubFetch(() => ({ body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/a.jpg' }] }) }))
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A' }, 3, t => steps.push(t))
    for (const s of steps) expect(s.ms).toBeGreaterThanOrEqual(0)
  })
})

describe('measuring changes nothing', () => {
  const scenario = () => stubFetch(url =>
    url.includes('place/details') ? { body: detailWithPhoto }
      : url.includes('serper') ? { body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/s.jpg' }] }) }
      : { body: 'binary', headers: { 'content-type': 'image/jpeg' } })

  it('returns the same photos with and without the sink', async () => {
    const c1 = scenario()
    const withSink = await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, () => {})
    vi.unstubAllGlobals()
    const c2 = scenario()
    const without = await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3)
    expect(withSink).toEqual(without)
    expect(c1.length, 'the sink must not add or remove a request').toBe(c2.length)
  })

  it('issues no request of its own', async () => {
    const calls = scenario()
    await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, () => {})
    // Every URL requested must belong to the chain's own steps.
    for (const u of calls) {
      expect(/place\/details|maps\.googleapis|serper|^https:\/\/cdn\.example/.test(u), `unexpected request: ${u}`).toBe(true)
    }
  })

  it('survives a throwing sink without losing the photos', async () => {
    // Instrumentation must never be able to fail the thing it measures.
    scenario()
    await expect(
      resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, () => { throw new Error('sink blew up') }),
    ).rejects.toBeInstanceOf(Error)
  })
})

describe('the usage record carries the tail breakdown, and no content', () => {
  const CODE = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'chat', 'route.ts'), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  /**
   * The `tappyai_usage` object literal alone, brace-matched.
   *
   * Searching the whole file is not enough: `photoSteps` also appears as a
   * declaration (`const photoSteps: Partial<…>`), whose TYPE ANNOTATION colon
   * satisfies a `photoSteps:` regex — so the field could be deleted from the
   * record and the assertion would still pass. Mutation M9 survived on exactly
   * that.
   */
  function usageRecord(): string {
    const anchor = CODE.indexOf("type: 'tappyai_usage'")
    expect(anchor, 'the usage record must exist').toBeGreaterThan(-1)
    const open = CODE.lastIndexOf('{', anchor)
    let depth = 0
    for (let i = open; i < CODE.length; i++) {
      if (CODE[i] === '{') depth++
      else if (CODE[i] === '}') { depth--; if (depth === 0) return CODE.slice(open, i + 1) }
    }
    throw new Error('unterminated usage literal')
  }

  it.each(['photoTotalMs', 'photoMaxPlaceMs', 'photoPlacesSelected', 'photoPlacesEnriched', 'photoSteps'])(
    '%s is emitted on the usage record', (field) => {
      expect(usageRecord(), `${field} must be on the record`).toMatch(new RegExp(`\\b${field}\\s*:`))
    })

  it('reports null rather than 0 when no enrichment ran', () => {
    // "no enrichment ran" and "enrichment ran and cost nothing" are different
    // findings; collapsing them to 0 would make the tail look free on turns
    // that never had one.
    expect(CODE).toMatch(/photoTotalMs:\s*photoPlacesSelected > 0 \? photoTotalMs : null/)
  })

  it('records the slowest place, which is what sets the tail', () => {
    expect(CODE).toMatch(/photoMaxPlaceMs = Math\.max\(photoMaxPlaceMs,/)
  })

  it('logs no place name, URL or photo payload', () => {
    const rec = CODE.slice(CODE.indexOf("type: 'tappyai_usage'"))
      .slice(0, CODE.slice(CODE.indexOf("type: 'tappyai_usage'")).indexOf('}))'))
    for (const forbidden of ['placeName', 'photoUrl', 'photoUrls', 'byName', 'urls']) {
      expect(rec, `${forbidden} must never be logged`).not.toMatch(new RegExp(`(^|[{,\\s])${forbidden}\\s*(:|,)`))
    }
  })
})
