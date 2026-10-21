// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react'

// ── Round 42 round 2 (stored location), STEP 1 — REPRODUCTION, no product code changed ─────────────────────────────────────────────────────
// The real ChatInterface / LocationProvider, jsdom, `useChat` mocked to CAPTURE the request body (the same pattern as chatExploreClipContextWiring.test.tsx),
// navigator.geolocation mocked per case, fetch mocked (no network: Nominatim and /api/preferences answer from the test).
// `it.fails` = the DESIRED behaviour (Huy's location rules, 13/10/2026), RED today. Plain `it` = today's behaviour recorded, or a control.
// LIMIT: this checks the CODE (what the app asks the browser for and what it sends). It does NOT prove a real browser returns a fresh fix — that is device UAT.

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

const captured: Array<Record<string, unknown>> = []
const append = vi.fn()
// typed messages: the mocked useChat exposes `input` (set by the test before render) and records the body each `handleSubmit` was called with
let mockInput = ''
const submittedWith: Array<Record<string, unknown> | null> = []
const handleSubmitSpy = vi.fn(() => { submittedWith.push((captured[captured.length - 1]?.body as Record<string, unknown>)?.userLocation as Record<string, unknown> ?? null) })
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('ai/react', () => ({
  useChat: (opts: Record<string, unknown>) => {
    captured.push(opts)
    return { messages: [], input: mockInput, handleInputChange: vi.fn(), handleSubmit: handleSubmitSpy, isLoading: false, setInput: vi.fn(), append, reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages: vi.fn() }
  },
}))

import ChatInterface from './ChatInterface'
import LocationProvider from './LocationProvider'

const DAY = 24 * 3600 * 1000
// a fix stored by an EARLIER session (Đà Nẵng, three days old) and the device's position NOW (TP.HCM, Quận 1)
const STALE_DN = { lat: 16.0544, lng: 108.2022, address: 'Đà Nẵng', ts: Date.now() - 3 * DAY }
const NOW_HCM = { lat: 10.7769, lng: 106.7009 }
const lastBody = () => (captured[captured.length - 1]?.body ?? {}) as Record<string, unknown>
const sentLocation = () => (lastBody().userLocation ?? null) as { lat: number; lng: number; address?: string } | null

type GeoMode = { kind: 'ok'; at: { lat: number; lng: number } } | { kind: 'denied' } | { kind: 'timeout' } | { kind: 'none' }
let geoCalls: Array<{ options: PositionOptions | undefined }> = []
function installGeo(mode: GeoMode) {
  geoCalls = []
  if (mode.kind === 'none') { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined }); return }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, err?: PositionErrorCallback, options?: PositionOptions) => {
        geoCalls.push({ options })
        if (mode.kind === 'ok') ok({ coords: { latitude: mode.at.lat, longitude: mode.at.lng, accuracy: 10 }, timestamp: Date.now() } as unknown as GeolocationPosition)
        else err?.({ code: mode.kind === 'denied' ? 1 : 3, message: mode.kind } as unknown as GeolocationPositionError)
      },
    },
  })
}
let savedPreferences: string[] = []
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('tappy_onboarded', '1') // no onboarding modal in these renders
  savedPreferences = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/preferences')) return { ok: true, json: async () => ({ preferences: savedPreferences }) }
    if (String(url).includes('nominatim')) return { ok: true, json: async () => ({ display_name: 'Quận 1, TP.HCM' }) }
    return { ok: false, json: async () => ({}) }
  }))
})
afterEach(() => { cleanup(); captured.length = 0; append.mockReset(); handleSubmitSpy.mockClear(); submittedWith.length = 0; mockInput = ''; sessionStorage.clear(); vi.unstubAllGlobals() })
const pressEnter = () => fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const nearbyChip = () => screen.getAllByRole('button').find(b => /Tìm quanh đây|Nearby/i.test(b.textContent ?? '')) as HTMLElement
const record = (name: string, o: Record<string, unknown>) => console.log('CASE ' + JSON.stringify({ name, ...o }))

describe('(a) a fix stored by an earlier session vs the device position now', () => {
  // Pre-fix (5b7657a, location-step1.md): mount sent the Đà Nẵng fix; the chip asked the device for nothing and sent it.
  it('(1a) a fix stored by an earlier session is NOT sent as the current location; it stays in storage', async () => {
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    installGeo({ kind: 'ok', at: NOW_HCM })
    render(<ChatInterface />)
    await flush()
    record('a_mount_stale', { stored: STALE_DN, sent: sentLocation(), geoCalls: geoCalls.length })
    expect(sentLocation()).toBeNull()
    expect(geoCalls.length).toBe(0) // mount itself asks nothing (only the chip, typed "gần tôi" and LocationProvider do)
    expect(JSON.parse(localStorage.getItem('tappy_location') ?? 'null')).toEqual(STALE_DN)
  })
  it('(2a) "📍 Tìm quanh đây" requests a FRESH device fix (maximumAge: 0) and sends that, not the stored one', async () => {
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    installGeo({ kind: 'ok', at: NOW_HCM })
    render(<ChatInterface />)
    await flush()
    fireEvent.click(nearbyChip())
    await flush()
    record('a_nearby_stale', { geoCalls: geoCalls.map(c => c.options ?? null), appended: append.mock.calls.map(c => (c[0] as { content: string }).content), sent: sentLocation() })
    expect(geoCalls.length).toBe(1)
    expect(geoCalls[0].options).toEqual({ maximumAge: 0, timeout: 10000 })
    expect(append).toHaveBeenCalledTimes(1)
    expect(sentLocation()?.lat).toBe(NOW_HCM.lat)
    const stored = JSON.parse(localStorage.getItem('tappy_location') ?? 'null')
    expect(stored.lat).toBe(NOW_HCM.lat)
    expect(sessionStorage.getItem('tappy_location_session')).toBe(String(stored.ts))
  })
})

describe('(c) the device refuses or times out', () => {
  for (const kind of ['denied', 'timeout'] as const) {
    // Pre-fix: with a stored fix the chip never asked the device and sent Đà Nẵng; with none it asked with NO options.
    it(`(3a, ${kind}) the fresh fix is requested; when it fails, the stale stored fix is NOT sent, and storage is untouched`, async () => {
      localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
      installGeo({ kind })
      render(<ChatInterface />)
      await flush()
      fireEvent.click(nearbyChip())
      await flush()
      record('c_nearby_' + kind + '_stale', { geoCalls: geoCalls.length, sent: sentLocation(), appended: append.mock.calls.length })
      expect(geoCalls.length).toBe(1)
      expect(geoCalls[0].options).toEqual({ maximumAge: 0, timeout: 10000 })
      expect(append).toHaveBeenCalledTimes(1)
      expect(sentLocation()).toBeNull()
      expect(JSON.parse(localStorage.getItem('tappy_location') ?? 'null')).toEqual(STALE_DN)
    })
    it(`(3b, ${kind}) with NO stored fix, the chip asks with { maximumAge: 0, timeout: 10000 } and sends without a location`, async () => {
      installGeo({ kind })
      render(<ChatInterface />)
      await flush()
      fireEvent.click(nearbyChip())
      await flush()
      record('c_nearby_' + kind + '_nostore', { geoCalls: geoCalls.map(c => c.options ?? null), sent: sentLocation(), appended: append.mock.calls.length })
      expect(geoCalls.length).toBe(1)
      expect(geoCalls[0].options).toEqual({ maximumAge: 0, timeout: 10000 })
      expect(sentLocation()).toBeNull()
      expect(append).toHaveBeenCalledTimes(1)
    })
  }
})

describe('LocationProvider (the app-wide prefetch)', () => {
  // Pre-fix: ANY stored fix younger than 30 min (whatever session took it) skipped the refresh.
  it('(1b/1c) a fix of THIS session younger than 30 min is reused without asking; one from an earlier session, however young, is not a reason to skip', async () => {
    const youngOwn = { ...NOW_HCM, address: 'Quận 1, TP.HCM', ts: Date.now() - 10 * 60 * 1000 }
    localStorage.setItem('tappy_location', JSON.stringify(youngOwn))
    sessionStorage.setItem('tappy_location_session', String(youngOwn.ts))
    installGeo({ kind: 'ok', at: NOW_HCM })
    render(<LocationProvider />)
    await flush()
    const ownCalls = geoCalls.length
    cleanup(); sessionStorage.clear()
    localStorage.setItem('tappy_location', JSON.stringify({ ...STALE_DN, ts: Date.now() - 10 * 60 * 1000 }))
    installGeo({ kind: 'ok', at: NOW_HCM })
    render(<LocationProvider />)
    await flush()
    const stored = JSON.parse(localStorage.getItem('tappy_location') ?? 'null')
    record('lp_ttl', { own_young_calls: ownCalls, other_session_calls: geoCalls.length, options: geoCalls[0]?.options ?? null, stored_after: stored })
    expect(ownCalls).toBe(0)
    expect(geoCalls.length).toBe(1)
    expect(geoCalls[0].options).toEqual({ timeout: 8000, maximumAge: 5 * 60 * 1000 }) // prefetch options unchanged
    expect(stored.lat).toBe(NOW_HCM.lat)
    expect(sessionStorage.getItem('tappy_location_session')).toBe(String(stored.ts))
  })
  it('(3d) when the device refuses, the stale stored fix stays in storage untouched (ChatInterface no longer sends it — see 1a)', async () => {
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    installGeo({ kind: 'denied' })
    render(<LocationProvider />)
    await flush()
    record('lp_denied', { stored_after: JSON.parse(localStorage.getItem('tappy_location') ?? 'null') })
    expect(JSON.parse(localStorage.getItem('tappy_location') ?? 'null')).toEqual(STALE_DN)
  })
})

// ── Bước 3 additions (allowlist cuối: 1c, 2b, 2c, 3c) ──
describe('(1c) a fix taken in THIS tab session (sessionStorage mark matches its ts)', () => {
  it('on mount it is sent as the current location (today and after the fix)', async () => {
    const fresh = { lat: NOW_HCM.lat, lng: NOW_HCM.lng, address: 'Quận 1, TP.HCM', ts: Date.now() - 60_000 }
    localStorage.setItem('tappy_location', JSON.stringify(fresh))
    sessionStorage.setItem('tappy_location_session', String(fresh.ts))
    installGeo({ kind: 'none' })
    render(<ChatInterface />)
    await flush()
    expect(sentLocation()).toEqual({ lat: fresh.lat, lng: fresh.lng, address: fresh.address })
  })
})

describe('(2b/2c/3c) typed messages', () => {
  // Pre-fix: a typed "quán phở gần tôi" + Enter was sent at once with the stale Đà Nẵng fix; the device was not asked.
  it('(2b) a typed "quán phở gần tôi" asks the device for a fresh fix (maximumAge 0) BEFORE sending, and the message carries it', async () => {
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    installGeo({ kind: 'ok', at: NOW_HCM })
    mockInput = 'quán phở gần tôi'
    render(<ChatInterface />)
    await flush()
    pressEnter()
    await flush()
    record('2b_typed_near_me', { geoCalls: geoCalls.map(c => c.options ?? null), submittedWith: submittedWith[0] ?? null })
    expect(geoCalls.length).toBe(1)
    expect(geoCalls[0].options).toEqual({ maximumAge: 0, timeout: 10000 })
    expect(handleSubmitSpy).toHaveBeenCalledTimes(1)
    expect(submittedWith[0]?.lat).toBe(NOW_HCM.lat)
  })
  it('(3c) a typed "gần mình có quán cafe nào" when the device refuses is sent WITHOUT a location (never the stale one)', async () => {
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    installGeo({ kind: 'denied' })
    mockInput = 'gần mình có quán cafe nào'
    render(<ChatInterface />)
    await flush()
    pressEnter()
    await flush()
    expect(geoCalls.length).toBe(1)
    expect(handleSubmitSpy).toHaveBeenCalledTimes(1)
    expect(submittedWith[0]).toBeNull()
  })
  it('CONTROL (2c): a typed message without the phrase ("quán phở ở Quận 3", "phim gần đây có gì hay") is sent at once, the device is not asked', async () => {
    for (const text of ['quán phở ở Quận 3', 'phim gần đây có gì hay']) {
      cleanup(); handleSubmitSpy.mockClear()
      installGeo({ kind: 'ok', at: NOW_HCM })
      mockInput = text
      render(<ChatInterface />)
      await flush()
      pressEnter()
      await flush()
      expect(geoCalls.length).toBe(0)
      expect(handleSubmitSpy).toHaveBeenCalledTimes(1)
    }
  })
})

describe('(d) controls that must stay as they are', () => {
  it('a preference the user saved ("Thường ở khu vực Quận 3", /api/preferences) is sent with the request, whatever the GPS state', async () => {
    savedPreferences = ['Thường ở khu vực Quận 3']
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    installGeo({ kind: 'denied' })
    render(<ChatInterface />)
    await flush()
    record('d_preference', { userPreferences: lastBody().userPreferences ?? null })
    expect(lastBody().userPreferences).toEqual(['Thường ở khu vực Quận 3'])
  })
  it('the location chip × removes the location from the request and from storage (user-controlled; must stay)', async () => {
    // Fixture: the chip shows the CURRENT location, so the fix is one of this tab session (an earlier session's fix is no longer shown, 1a).
    localStorage.setItem('tappy_location', JSON.stringify(STALE_DN))
    sessionStorage.setItem('tappy_location_session', String(STALE_DN.ts))
    installGeo({ kind: 'none' })
    render(<ChatInterface />)
    await flush()
    fireEvent.click(screen.getByTestId('location-context-remove'))
    await flush()
    expect(sentLocation()).toBeNull()
    expect(localStorage.getItem('tappy_location')).toBeNull()
  })
  it('no stored fix and no geolocation API: nothing is sent and nothing is asked (unchanged)', async () => {
    installGeo({ kind: 'none' })
    render(<ChatInterface />)
    await flush()
    expect(sentLocation()).toBeNull()
  })
})
