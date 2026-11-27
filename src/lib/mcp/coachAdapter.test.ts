import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCoachAdapter, coachAdapter } from './coachAdapter'

// search_coach: "which Vexere page do I book this coach route on?" (27/11/2026). Tappy has NO timetable, price or seat source for coaches (Vexere publishes no API to us),
// so the tool says exactly what it has: the DATED Vexere route page with Tappy's tracking, found by the same discovery the chat uses, or nothing. Never a front door, never a price.
// The commerce layer (CCP) is the REAL one here: it validates the page against Vexere's URL grammar and adds the date.

const ROUTE = 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-1t4573.html'
const hit = (url = ROUTE, title = 'Vé xe Sài Gòn Đà Lạt') => ({ url, title })
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

const discover = vi.fn<(subject: string) => Promise<Array<{ url: string; title?: string }>>>()
const adapter = makeCoachAdapter(discover)
const ask = (over: Record<string, unknown> = {}) => adapter({ query: '', origin: 'Sài Gòn', destination: 'Đà Lạt', departDate: day(5), lang: 'vi', limit: 3, ...over } as never)

beforeEach(() => discover.mockReset())

describe('coachAdapter', () => {
  it('is wired to the chat\'s own discovery by default', () => {
    expect(coachAdapter).toBeTypeOf('function')
  })

  it('returns the dated Vexere route page for the two places, with the date in the link and in the row', async () => {
    discover.mockResolvedValue([hit()])
    const date = day(10)
    const { rows } = await ask({ departDate: date })
    expect(rows).toHaveLength(1)
    const r = rows[0] as Record<string, string>
    expect(r.merchant).toBe('Vexere')
    expect(r.route).toBe('Sài Gòn → Đà Lạt')
    expect(r.departDate).toBe(date)
    expect(r.url).toMatch(/^https:\/\//)
    expect(r.url).toMatch(/vexere\.com|isclix/)
    expect(decodeURIComponent(r.url)).toContain(`${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`)
  })

  it('discovery is asked for coaches between the two places, and only one search is made', async () => {
    discover.mockResolvedValue([hit()])
    await ask()
    expect(discover).toHaveBeenCalledTimes(1)
    const subject = discover.mock.calls[0][0]
    expect(subject).toMatch(/xe khách/i)
    expect(subject).toMatch(/Sài Gòn/)
    expect(subject).toMatch(/Đà Lạt/)
  })

  it('🚨 no route page found, or the search failing → NO row: never the Vexere front door, never a made-up link', async () => {
    discover.mockResolvedValue([])
    expect((await ask()).rows).toEqual([])
    // a plain throwing function, not a spy: vitest 4 reports a spy's rejection as unhandled even though the adapter catches it
    const failing = makeCoachAdapter(async () => { throw new Error('serper down') })
    expect((await failing({ query: '', origin: 'Sài Gòn', destination: 'Đà Lạt', departDate: day(5), lang: 'vi', limit: 3 })).rows).toEqual([])
  })

  it('a route page of OTHER places than the ones asked is not offered', async () => {
    discover.mockResolvedValue([hit('https://vexere.com/vi-VN/ve-xe-khach-tu-ha-noi-di-hai-phong-1t99.html')])
    expect((await ask()).rows).toEqual([])
  })

  it('a page that is not on Vexere is not offered', async () => {
    discover.mockResolvedValue([hit('https://evil.example/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-1t4573.html')])
    expect((await ask()).rows).toEqual([])
  })

  it('without a date the page is dated a week ahead and the row says which date it is; a date in the past gives no row', async () => {
    discover.mockResolvedValue([hit()])
    const r = (await ask({ departDate: undefined })).rows[0] as Record<string, string>
    expect(r.departDate).toBe(day(7))
    expect((await ask({ departDate: day(-3) })).rows).toEqual([])
  })

  it('both places are required', async () => {
    expect((await ask({ destination: undefined })).rows).toEqual([])
    expect(discover).not.toHaveBeenCalled()
  })
})
