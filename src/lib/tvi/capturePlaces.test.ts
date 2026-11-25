import { describe, it, expect, vi, beforeEach } from 'vitest'
import { placeFactsFromRow, captureTviFromPlaces, tviCaptureOn, CAPTURE_MAX_ROWS } from './capturePlaces'
import { attachEvidence, type StageFactInput } from './tviStore'

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

const FULL = {
  name: 'Quán Bún Chả Hương Liên', address: '24 Lê Văn Hưu, Hai Bà Trưng, Hà Nội', phone: '024 3943 4106', website_uri: 'https://example.vn/huonglien',
  place_id: 'ChIJxyz', lat: 21.0, lng: 105.85, maps_link: 'https://www.google.com/maps/place/?q=place_id:ChIJxyz',
  opening_hours_week: { 'Thứ Hai': '08:00–21:00', 'Thứ Ba': '08:00–21:00' }, rating_value: 4.5, google_rating: '4,5 (1.200)', price_range_text: '1-100.000 ₫',
}

describe('the flag', () => {
  it('is off by default, on only for "1", and locked in a production runtime unless the owner lists it', () => {
    expect(tviCaptureOn({})).toBe(false)
    expect(tviCaptureOn({ TVI_CAPTURE: 'true' })).toBe(false)
    expect(tviCaptureOn({ TVI_CAPTURE: '1' })).toBe(true)
    expect(tviCaptureOn({ TVI_CAPTURE: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(tviCaptureOn({ TVI_CAPTURE: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'TVI_CAPTURE' })).toBe(true)
  })
})

describe('placeFactsFromRow', () => {
  it('takes the stable facts of a full row, keyed by the provider id', () => {
    const c = placeFactsFromRow(FULL, 'Hà Nội')!
    expect(c.entityKey).toBe('place:ChIJxyz')
    expect(c.canonicalName).toBe('Quán Bún Chả Hương Liên')
    expect(c.facts.map(f => f.factType)).toEqual(['address', 'phone', 'website', 'opening_hours'])
    expect(c.facts[0].value).toEqual({ text: '24 Lê Văn Hưu, Hai Bà Trưng, Hà Nội' })
    expect(c.facts[3].value).toEqual({ week: { 'Thứ Hai': '08:00–21:00', 'Thứ Ba': '08:00–21:00' } })
    expect([c.lat, c.lng]).toEqual([21.0, 105.85])
    expect(c.mapsLink).toContain('place_id:ChIJxyz')
  })
  it('does not capture what is not a stable fact: ratings and the price band are left out', () => {
    const types = placeFactsFromRow(FULL, 'Hà Nội')!.facts.map(f => f.factType)
    expect(types).not.toContain('menu_price')
    expect(JSON.stringify(placeFactsFromRow(FULL)!.facts)).not.toContain('4,5')
  })
  it('a missing fact stays missing: silence is never turned into a value', () => {
    const c = placeFactsFromRow({ name: 'Quán X', place_id: 'p1' })!
    expect(c.facts).toEqual([])
    expect(placeFactsFromRow({ name: 'Quán X', place_id: 'p1', phone: '   ', address: '' })!.facts).toEqual([])
  })
  it('keys by normalised name and city when there is no provider id; nothing to key on is null', () => {
    expect(placeFactsFromRow({ name: 'Quán Ăn Ngon', address: 'x' }, 'Hồ Chí Minh')!.entityKey).toBe('place:name:quan-an-ngon|ho-chi-minh')
    expect(placeFactsFromRow({ address: 'x' })).toBeNull()
    expect(placeFactsFromRow({ name: '  ' })).toBeNull()
  })
  it('refuses a website that is not http(s), ignores a week that is not a record, and bounds long text', () => {
    expect(placeFactsFromRow({ name: 'A', place_id: 'p', website_uri: 'javascript:alert(1)' })!.facts).toEqual([])
    expect(placeFactsFromRow({ name: 'A', place_id: 'p', opening_hours_week: ['x'] })!.facts).toEqual([])
    expect(placeFactsFromRow({ name: 'A', place_id: 'p', opening_hours_week: { Mon: '  ', '': '9-5' } })!.facts).toEqual([])
    const long = placeFactsFromRow({ name: 'A', place_id: 'p', address: 'a'.repeat(1000) })!.facts[0].value as { text: string }
    expect(long.text.length).toBe(300)
  })
})

describe('captureTviFromPlaces', () => {
  const okStage = (outcome: 'created' | 'staged' | 'unchanged' = 'created') =>
    vi.fn(async (_input: StageFactInput) => ({ ok: true as const, outcome, factId: 'f', versionId: 'v', versionNumber: 1 }))
  const okAttach = () => vi.fn(async () => ({ ok: true as const, outcome: 'attached' as const, evidenceId: 'e' }))

  it('stages every fact of a row with the time the rows were really read, then attaches the evidence', async () => {
    const stage = okStage(); const attach = okAttach()
    const counts = await captureTviFromPlaces({ results: [FULL], retrieved_at: '2026-11-10T07:00:00.000Z' }, { city: 'Hà Nội' }, { stage, attach: attach as unknown as typeof attachEvidence })
    expect(counts).toEqual({ rows: 1, created: 4, staged: 0, unchanged: 0, evidence: 4, failed: 0 })
    const first = stage.mock.calls[0][0]
    expect(first.entityKey).toBe('place:ChIJxyz'); expect(first.city).toBe('Hà Nội'); expect(first.retrievedAt.toISOString()).toBe('2026-11-10T07:00:00.000Z')
    const ev = (attach.mock.calls as unknown as Array<[{ domain: string; sourceType: string; reference: string; versionId: string }]>)[0][0]
    expect(ev.domain).toBe('maps.google.com'); expect(ev.sourceType).toBe('PROVIDER_API'); expect(ev.reference).toContain('place_id:ChIJxyz'); expect(ev.versionId).toBe('v')
  })
  it('an unchanged fact attaches no new evidence', async () => {
    const attach = okAttach()
    const counts = await captureTviFromPlaces({ results: [FULL] }, {}, { stage: okStage('unchanged'), attach: attach as unknown as typeof attachEvidence })
    expect(counts.unchanged).toBe(4); expect(counts.evidence).toBe(0)
    expect(attach).not.toHaveBeenCalled()
  })
  it('without a retrieval time it uses now; it reads at most the first rows', async () => {
    const stage = okStage(); const now = new Date('2026-11-10T09:00:00Z')
    const rows = Array.from({ length: 12 }, (_, i) => ({ ...FULL, place_id: `p${i}` }))
    const counts = await captureTviFromPlaces({ results: rows }, { now }, { stage, attach: okAttach() as unknown as typeof attachEvidence })
    expect(counts.rows).toBe(CAPTURE_MAX_ROWS)
    expect(stage.mock.calls[0][0].retrievedAt).toEqual(now)
  })
  it('failures are counted, never thrown; junk input does nothing', async () => {
    const failing = vi.fn(async () => ({ ok: false as const, reason: 'store_error' as const }))
    const c1 = await captureTviFromPlaces({ results: [FULL] }, {}, { stage: failing, attach: okAttach() as unknown as typeof attachEvidence })
    expect(c1.failed).toBe(4); expect(c1.created).toBe(0)
    const boom = vi.fn(async () => { throw new Error('db down') })
    const c2 = await captureTviFromPlaces({ results: [FULL] }, {}, { stage: boom as never, attach: okAttach() as unknown as typeof attachEvidence })
    expect(c2.failed).toBe(1)
    expect(await captureTviFromPlaces(null)).toMatchObject({ rows: 0, failed: 0 })
    expect(await captureTviFromPlaces({ results: 'x' })).toMatchObject({ rows: 0 })
  })
  it('logs counts only, never a name, address or phone', async () => {
    const log = vi.spyOn(console, 'log')
    await captureTviFromPlaces({ results: [FULL] }, {}, { stage: okStage(), attach: okAttach() as unknown as typeof attachEvidence })
    const line = String(log.mock.calls.at(-1)?.[0])
    expect(line).toContain('tappyai_tvi_capture')
    for (const secret of ['Hương Liên', 'Lê Văn Hưu', '3943', 'example.vn']) expect(line).not.toContain(secret)
  })
})
