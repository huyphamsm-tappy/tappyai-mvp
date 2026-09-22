// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'

// ── What the app does when SERPER_DAILY_CREDIT_CEILING is hit (DEPLOY-CHECKLIST §4a) ────
//
// `serperPost` returns null once today's credits are over the ceiling. This pins the DEGRADE
// path of a place search from there: no throw, no raw error in the tool result — the tool falls
// through to OSM, and when OSM has nothing either it returns an EMPTY result with a Google Maps
// search link and a note the prompt turns into "chưa tìm thấy, xem trên Maps".

vi.mock('./serperClient', () => ({
  serperPost: vi.fn(async () => null),
  serperAdmit: vi.fn(async () => false),
  serperDailyCeiling: () => 15_000,
  serperOutageInstanceCeiling: () => 1_500,
  SERPER_CEILING_KEY: 'serper:credits',
  __resetSerperAlerts: () => undefined,
}))

afterEach(() => vi.restoreAllMocks())

describe('over the Serper ceiling', () => {
  it('a place search degrades to OSM, and with OSM down still answers with an empty result + Maps link, never an error', async () => {
    process.env.SERPER_API_KEY = 'test-key-never-sent'
    // OSM / Overpass down as well: every fetch rejects.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const { searchPlaces } = await import('./food')
    const r = await searchPlaces('quán phở ngon', 'Quận 1, TP HCM', 'restaurant', 'vi', { lat: 10.7769, lng: 106.7009 }) as Record<string, unknown>
    expect(r).toBeTruthy()
    expect(Array.isArray(r.results)).toBe(true)
    expect((r.results as unknown[]).length).toBe(0)
    expect(String(r.google_maps_search ?? '')).toMatch(/^https:\/\/(www\.)?(maps\.)?google\.com\/maps/)
    expect(String(r.note ?? '')).toMatch(/Google Maps|OpenStreetMap|OSM/)
    // The model reads a tool result, not a stack trace; the user never sees "error".
    expect(JSON.stringify(r)).not.toMatch(/network down|serper|ceiling/i)
    vi.unstubAllGlobals()
  })
})
