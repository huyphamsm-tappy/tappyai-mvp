// @vitest-environment node
// UAT 2026-10-07 — "tìm vé máy bay từ sài gòn về qui nhơn ngày mai": the route resolves under BOTH spellings, the provider links are
// well-formed dated route pages, and a tracked affiliate link is never labelled "official".
import { describe, it, expect } from 'vitest'
import { cityToIATA, getFlightPrices } from './travel'
import { cityInText } from './vietnamCities'
import { buildFlightLinks } from '@/lib/platformLinks/travel'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'

describe('Quy Nhơn / Qui Nhơn → UIH', () => {
  it.each(['Quy Nhơn', 'Qui Nhơn', 'quy nhon', 'qui nhon', 'QUY NHƠN', 'Qui Nhon', 'sân bay Phù Cát', 'UIH'])('%s', n => expect(cityToIATA(n)).toBe('UIH'))
  it.each(['Sài Gòn', 'TP.HCM', 'tp hcm', 'Sai Gon', 'SGN'])('origin %s → SGN', n => expect(cityToIATA(n)).toBe('SGN'))
  it('the city list (planner gate, tools) knows both spellings', () => {
    expect(cityInText('lập kế hoạch 3 ngày ở qui nhơn')).toBeTruthy()
    expect(cityInText('lập kế hoạch 3 ngày ở quy nhơn')).toBeTruthy()
  })
})

describe('the flight tool result and its provider links', () => {
  it('SGN → UIH with the spelling the user typed: both provider pages, dated, well-formed; no Google Flights, no fare', async () => {
    const r = await getFlightPrices('sài gòn', 'qui nhơn', 'vi', '2026-10-08') as { origin: string; destination: string; fare_status: string; booking_links: Array<{ name: string; url: string }> }
    expect(r).toMatchObject({ origin: 'SGN', destination: 'UIH', fare_status: 'not_verified' })
    const by = Object.fromEntries(r.booking_links.map(l => [l.name, new URL(l.url)]))
    expect(Object.keys(by).sort()).toEqual(['Traveloka', 'Trip.com'])
    expect(by['Trip.com'].origin + by['Trip.com'].pathname).toBe('https://vn.trip.com/flights/showfarefirst')
    expect(by['Trip.com'].searchParams.get('dcity')).toBe('sgn')
    expect(by['Trip.com'].searchParams.get('acity')).toBe('uih')
    expect(by['Trip.com'].searchParams.get('ddate')).toBe('2026-10-08')
    expect(by['Traveloka'].origin + by['Traveloka'].pathname).toBe('https://www.traveloka.com/vi-VN/flight/fullsearch')
    expect(by['Traveloka'].searchParams.get('ap')).toBe('SGN.UIH')
    expect(by['Traveloka'].searchParams.get('dt')).toMatch(/^08-10-2026\./)
    expect(JSON.stringify(r)).not.toMatch(/google\./)
    expect(JSON.stringify(r)).not.toMatch(/"(?:price|fare|amount)"\s*:\s*\d/)
  })
  it('an unmapped city yields NO link (never a dead one)', async () => {
    const r = await getFlightPrices('sài gòn', 'thành phố không tồn tại', 'vi', '2026-10-08') as { booking_links: unknown[]; error?: string }
    expect(r.booking_links).toEqual([])
    expect(r.error).toBeTruthy()
  })
  it('buildFlightLinks never returns a relative or malformed URL', () => {
    for (const l of buildFlightLinks('SGN', 'UIH', '2026-10-08')) expect(() => new URL(l.url)).not.toThrow()
    for (const l of buildFlightLinks('SGN', 'UIH', '2026-10-08')) expect(new URL(l.url).protocol).toBe('https:')
  })
})

describe('the links label: "official" is for a provider URL, a tracked affiliate link is a partner link', () => {
  const run = async (links: Array<{ name: string; url: string }>) => {
    const c = createEnrichmentCollector('tìm vé máy bay SGN UIH ngày mai', []); c.agentMode = true
    const result = { origin: 'SGN', destination: 'UIH', fare_status: 'not_verified', booking_links: links, _tappy_commerce: [] }
    const lines = ['9:{"toolCallId":"f1","toolName":"get_flight_prices","args":{"origin":"SGN","destination":"UIH"}}', `a:${JSON.stringify({ toolCallId: 'f1', result })}`, `0:${JSON.stringify('Mình đã tìm chặng SGN → UIH ngày mai; giá vé chưa xác minh được, bạn xem ở các nút bên dưới.')}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
    const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c).body).text()
    return raw.split('\n').filter(x => x.startsWith('0:')).map(x => JSON.parse(x.slice(2)) as string).join('')
  }
  it('signed /go/at tracking links → "Liên kết đối tác"', async () => {
    const out = await run([
      { name: 'Xem giá trên Trip.com', url: 'https://www.tappyai.com/go/at?u=https%3A%2F%2Fgo.isclix.com%2Fdeep_link%2F1%2F2%3Furl%3Dhttps%253A%252F%252Fvn.trip.com&p=tripcom&a=x&h=y&s=z' },
      { name: 'Xem giá trên Traveloka', url: 'https://www.tappyai.com/go/at?u=https%3A%2F%2Fgo.isclix.com%2Fdeep_link%2F1%2F3%3Furl%3Dhttps%253A%252F%252Fwww.traveloka.com&p=traveloka&a=x&h=y&s=z' },
    ])
    expect(out).toContain('🔗 Liên kết đối tác:')
    expect(out).not.toContain('Liên kết chính thức')
    expect(out).toContain('[Xem giá trên Trip.com](https://www.tappyai.com/go/at?')
  })
  it('a provider\'s own URL keeps "Liên kết chính thức"', async () => {
    const out = await run([{ name: 'Vietnam Airlines', url: 'https://www.vietnamairlines.com/vn/vi/home' }])
    expect(out).toContain('🔗 Liên kết chính thức:')
  })
})

describe('the chat opens Tappy\'s own click redirect on the origin the person is on', async () => {
  const { sameSiteClickHref, formatMessage } = await import('@/components/ChatInterface')
  const tracked = 'https://www.tappyai.com/go/at?u=https%3A%2F%2Fgo.isclix.com%2Fdeep_link%2F1%2F2%3Furl%3Dhttps%253A%252F%252Fvn.trip.com&p=tripcom&a=x&h=y&s=z'
  it('a /go/at link on the site host becomes relative (works on localhost, preview and production alike)', () => {
    expect(sameSiteClickHref(tracked)).toBe('/go/at?u=https%3A%2F%2Fgo.isclix.com%2Fdeep_link%2F1%2F2%3Furl%3Dhttps%253A%252F%252Fvn.trip.com&p=tripcom&a=x&h=y&s=z')
    expect(sameSiteClickHref(tracked.replace(/&/g, '&amp;'))).toMatch(/^\/go\/at\?u=/)
  })
  it('every other link is untouched (provider pages, other paths, other hosts)', () => {
    for (const u of ['https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=uih&ddate=2026-10-08', 'https://www.tappyai.com/users/abc', 'https://evil.example/go/at?u=x', 'not a url'])
      expect(sameSiteClickHref(u)).toBe(u)
  })
  it('the rendered chip for the Trip.com / Traveloka buttons carries the relative href', () => {
    const html = formatMessage(`🔗 Liên kết đối tác: [Xem giá trên Trip.com](${tracked})`)
    expect(html).toContain('href="/go/at?u=')
    expect(html).not.toContain('https://www.tappyai.com/go/at')
    expect(html).toContain('Xem giá trên Trip.com')
  })
})
