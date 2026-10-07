// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces } from './food'

// A5 (2026-09-20): the `fn_entry` line of every place search states the GPS the search centred on
// — two decimals (≈1 km: a district, never a doorstep) — and `centeredOnUser`. The UAT that found
// the emulator in Mountain View (P1, 2026-09-19) had to read the provider debug for that fact.

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('searchPlaces fn_entry', () => {
  it('logs gps to two decimals and centeredOnUser:true for a near-me search with a bias', async () => {
    vi.stubEnv('PLACES_PROVIDER', 'osm')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await searchPlaces('quán ăn ngon a5 ' + Date.now(), undefined, 'restaurant', 'vi', { lat: 10.776901, lng: 106.700912 })
    const entry = log.mock.calls.map(c => { try { return JSON.parse(String(c[0])) } catch { return null } }).find(l => l?.step === 'fn_entry')
    expect(entry).toBeTruthy()
    expect(entry.gps).toEqual({ lat: 10.78, lng: 106.7 })
    expect(entry.centeredOnUser).toBe(true)
    // Never more than two decimals — the log is district-level, by design.
    expect(JSON.stringify(entry.gps)).not.toMatch(/\d\.\d{3}/)
  })
  it('logs gps:null and centeredOnUser:false when the client sent no location', async () => {
    vi.stubEnv('PLACES_PROVIDER', 'osm')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await searchPlaces('quán ăn ngon a5b ' + Date.now(), 'Quận 1, TP.HCM', 'restaurant', 'vi', null)
    const entry = log.mock.calls.map(c => { try { return JSON.parse(String(c[0])) } catch { return null } }).find(l => l?.step === 'fn_entry')
    expect(entry.gps).toBeNull()
    expect(entry.centeredOnUser).toBe(false)
  })
})
