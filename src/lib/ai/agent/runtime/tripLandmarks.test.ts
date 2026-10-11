// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { withTripLandmarks, isMappedDestination } from './tripLandmarks'
import { tripDataTool } from '../index'

describe('destinations the city table knows / does not know', () => {
  it('mapped: cities in the table; unmapped: islands and small destinations', () => {
    for (const d of ['Quy Nhơn', 'Đà Nẵng', 'Phú Quốc', 'Nha Trang']) expect(isMappedDestination(d), d).toBe(true)
    for (const d of ['Lý Sơn', 'Côn Đảo', 'Cô Tô', 'Hòn Sơn']) expect(isMappedDestination(d), d).toBe(false)
  })
})

describe('withTripLandmarks', () => {
  const trip = { destination: 'x', hotels: { results: [] } }
  it('mapped destination: untouched — primary gets the same args, no web search', async () => {
    const primary = vi.fn(async () => trip)
    const web = vi.fn(async () => ({ results: [] }))
    await withTripLandmarks(primary, web, { lang: 'vi' })({ destination: 'Quy Nhơn' }, {})
    expect(primary).toHaveBeenCalledWith({ destination: 'Quy Nhơn' }, {})
    expect(web).not.toHaveBeenCalled()
  })
  it('unmapped destination: map searches skipped, ONE web search, landmarks attached with a citation note', async () => {
    const primary = vi.fn(async () => trip)
    const web = vi.fn(async () => ({ results: [{ title: 'Cổng Tò Vò', link: 'https://example.vn/to-vo' }] }))
    const r = await withTripLandmarks(primary, web, { lang: 'vi' })({ destination: 'Lý Sơn' }, {}) as Record<string, unknown>
    expect(primary).toHaveBeenCalledWith({ destination: 'Lý Sơn', skipPlaces: true }, {})
    expect(web).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(web.mock.calls[0][0])).toContain('Lý Sơn')
    expect((r.landmarks_web as { results: unknown[] }).results).toHaveLength(1)
    expect(String(r.landmarks_note)).toMatch(/\[S#\]/)
  })
  it('no web search tool, or it fails: the plan is told the stops are not verified', async () => {
    const primary = vi.fn(async () => trip)
    await withTripLandmarks(primary, null, { lang: 'vi' })({ destination: 'Lý Sơn' }, {})
    expect(primary).toHaveBeenCalledWith({ destination: 'Lý Sơn' }, {}) // no tool → old behaviour
    const r = await withTripLandmarks(primary, async () => { throw new Error('x') }, { lang: 'vi' })({ destination: 'Lý Sơn' }, {}) as Record<string, unknown>
    expect(String(r.landmarks_note)).toMatch(/chưa xác minh/)
  })
})

describe('get_trip_data skipPlaces', () => {
  const rows = (name: string) => ({ execute: vi.fn(async () => ({ value: { name, results: [{ name: 'r' }] } })) })
  it('skipPlaces: only the hotel part runs, the two map searches do not', async () => {
    const base = { get_hotel_prices: rows('h'), search_places: rows('p') } as never
    const t = tripDataTool(base, () => {}) as unknown as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> }
    const r = await t.execute({ destination: 'Lý Sơn', skipPlaces: true })
    expect((base as { search_places: { execute: ReturnType<typeof vi.fn> } }).search_places.execute).not.toHaveBeenCalled()
    expect(String((r.attractions as { note: string }).note)).toMatch(/landmarks_web/)
  })
  it('default: all three parts run as before', async () => {
    const base = { get_hotel_prices: rows('h'), search_places: rows('p') } as never
    const t = tripDataTool(base, () => {}) as unknown as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> }
    await t.execute({ destination: 'Quy Nhơn' })
    expect((base as { search_places: { execute: ReturnType<typeof vi.fn> } }).search_places.execute).toHaveBeenCalledTimes(2)
  })
})
