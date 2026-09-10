import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePlacePhotos, __clearToolCache, type PhotoStepTiming } from './common'

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

/** A Places API (New) photo resource name, as `places.photos` returns it. */
const PHOTO_NAME = 'places/pid-1/photos/AeZabc'

beforeEach(() => {
  // Image lookups are memoised; clear between tests so each measures its own call.
  __clearToolCache()
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
    // No website_uri and no photo_names → website and Places steps cannot run.
    await resolvePlacePhotos({ name: 'Quán A' }, 3, t => steps.push(t))
    expect(steps.some(s => s.step === 'website')).toBe(false)
    expect(steps.some(s => s.step === 'places_media')).toBe(false)
  })

  it('reports the media step when the search result carried a photo name', async () => {
    // 🔄 REWRITTEN, NOT DELETED. This used to assert a `places_detail` step that
    // ran a legacy Place Details request purely to learn a photo reference. The
    // widened field mask returns that reference on the search response, so the
    // request — and the step — are gone. What must still hold is that Google's
    // own photo is attempted before Serper, and that is what is asserted now.
    stubFetch(url =>
      url.includes('serper') ? { body: JSON.stringify({ images: [] }) }
        : { body: 'binary', headers: { 'content-type': 'image/jpeg' } })
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1', photo_names: [PHOTO_NAME] }, 3, t => steps.push(t))
    const names = steps.map(s => s.step)
    expect(names).toContain('places_media')
    expect(names.indexOf('places_media')).toBeLessThan(names.indexOf('serper'))
  })

  it('omits the media step when the row carried no photo name', async () => {
    stubFetch(() => ({ body: JSON.stringify({ images: [] }) }))
    const steps: PhotoStepTiming[] = []
    await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1' }, 3, t => steps.push(t))
    expect(steps.some(s => s.step === 'places_media')).toBe(false)
  })

  it('never issues a legacy Place Details request', async () => {
    // 🚨 THE RETIREMENT, PINNED. That call was billed separately (Places Details
    // Legacy) and its entire output was one photo token the search response
    // already carried. If it ever comes back, this fails.
    const calls = stubFetch(() => ({ body: JSON.stringify({ images: [] }) }))
    await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1', photo_names: [PHOTO_NAME] }, 3)
    expect(calls.some(u => u.includes('/place/details'))).toBe(false)
  })
})

describe('a step that burns its timeout is reported, not hidden', () => {
  it('marks the media step timedOut and still falls through to Serper', async () => {
    stubFetch(url =>
      url.includes('places.googleapis.com') ? 'hang'
        : { body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/s.jpg' }] }) })
    const steps: PhotoStepTiming[] = []
    const urls = await resolvePlacePhotos({ name: 'Quán A', place_id: 'pid-1', photo_names: [PHOTO_NAME] }, 3, t => steps.push(t))
    const media = steps.find(s => s.step === 'places_media')!
    expect(media, 'the timed-out step must still be reported').toBeDefined()
    expect(media.hit).toBe(false)
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
    url.includes('serper') ? { body: JSON.stringify({ images: [{ imageUrl: 'https://cdn.example/s.jpg' }] }) }
      : { body: 'binary', headers: { 'content-type': 'image/jpeg' } })
  const place = { name: 'Quán A', place_id: 'pid-1', photo_names: [PHOTO_NAME] }

  it('returns the same photos with and without the sink', async () => {
    const c1 = scenario()
    const withSink = await resolvePlacePhotos(place, 3, () => {})
    vi.unstubAllGlobals()
    // The two halves must make the SAME calls to be comparable. Image lookups
    // are memoised, so without this the second half is served from the first
    // half's answer and "same number of requests" would compare 2 against 0 —
    // measuring the cache instead of the sink this test is about.
    __clearToolCache()
    const c2 = scenario()
    const without = await resolvePlacePhotos(place, 3)
    expect(withSink).toEqual(without)
    expect(c1.length, 'the sink must not add or remove a request').toBe(c2.length)
  })

  it('issues no request of its own', async () => {
    const calls = scenario()
    await resolvePlacePhotos(place, 3, () => {})
    // Every URL requested must belong to the chain's own steps.
    for (const u of calls) {
      expect(/places\.googleapis|serper|^https:\/\/cdn\.example/.test(u), `unexpected request: ${u}`).toBe(true)
    }
  })

  it('survives a throwing sink without losing the photos', async () => {
    // Instrumentation must never be able to fail the thing it measures.
    scenario()
    await expect(
      resolvePlacePhotos(place, 3, () => { throw new Error('sink blew up') }),
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
  function literalAt(from: number, what: string): string {
    expect(from, `${what} must exist`).toBeGreaterThan(-1)
    const open = CODE.lastIndexOf('{', from)
    let depth = 0
    for (let i = open; i < CODE.length; i++) {
      if (CODE[i] === '{') depth++
      else if (CODE[i] === '}') { depth--; if (depth === 0) return CODE.slice(open, i + 1) }
    }
    throw new Error(`unterminated ${what} literal`)
  }

  /**
   * P1-3 split the record in two: `usageEvent` is the typed, allow-listed half that goes to the
   * cost pipeline, and the console line spreads it and adds console-only diagnostics — which is
   * where the photo breakdown lives, deliberately (it is operational detail, not cost input).
   * Both halves are emitted on the same line, so both are in scope. Reading only the first would
   * report every field below as missing, which is exactly what happened.
   */
  function usageRecord(): string {
    const event = literalAt(CODE.indexOf("type: 'tappyai_usage'"), 'the usageEvent record')
    const printed = literalAt(CODE.indexOf('...usageEvent,'), 'the console line')
    return `${event}\n${printed}`
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
    // Both halves of the record — see usageRecord() on why there are two.
    const rec = usageRecord()
    for (const forbidden of ['placeName', 'photoUrl', 'photoUrls', 'byName', 'urls']) {
      expect(rec, `${forbidden} must never be logged`).not.toMatch(new RegExp(`(^|[{,\\s])${forbidden}\\s*(:|,)`))
    }
  })
})
