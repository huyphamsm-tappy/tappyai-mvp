// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// Closeout round 3 (owner contract, PROPOSAL): no step after egress may change a URL that egress checked. The luxury pass renames
// brands in prose only; a URL keeps every byte, whether the brand sits in its host or in its path, in prose, in a markdown link or in a
// structured block's JSON. The stream filter and the stored names use the same function (see route.ts, state save).
import { describe, it, expect } from 'vitest'
import { filterLuxuryBrands, applyLuxuryStreamFilter } from './budget'

const HOST = 'https://www.hilton.com/en/hotels/hanhigi-hilton-garden-inn-hanoi/'
const PATH = 'https://www.booking.com/hotel/vn/hilton-garden-inn-hanoi.html'

describe('filterLuxuryBrands: prose renamed, URLs untouched', () => {
  it('renames the brand in prose', () => {
    expect(filterLuxuryBrands('Mình chọn: Hilton Garden Inn Hà Nội')).toBe('Mình chọn: khách sạn Garden Inn Hà Nội')
  })
  it('keeps a URL with the brand in its HOST byte for byte (bare and markdown)', () => {
    expect(filterLuxuryBrands(`Xem ${HOST} nhé`)).toBe(`Xem ${HOST} nhé`)
    expect(filterLuxuryBrands(`[Hilton](${HOST})`)).toBe(`[khách sạn](${HOST})`)
  })
  it('keeps a URL with the brand in its PATH byte for byte', () => {
    expect(filterLuxuryBrands(`[đặt phòng](${PATH})`)).toBe(`[đặt phòng](${PATH})`)
  })
  it('keeps URLs inside a structured block JSON; renames the visible label', () => {
    const block = `[CTA_BUTTONS]${JSON.stringify({ buttons: [{ label: 'Đặt Hilton', type: 'website', url: PATH }] })}[/CTA_BUTTONS]`
    const out = filterLuxuryBrands(block)
    const parsed = JSON.parse(out.slice('[CTA_BUTTONS]'.length, -'[/CTA_BUTTONS]'.length)) as { buttons: Array<{ label: string; url: string }> }
    expect(parsed.buttons[0].url).toBe(PATH)
    expect(parsed.buttons[0].label).toBe('Đặt khách sạn')
  })
  it('the stored name and the client text agree (same function)', () => {
    const shown = filterLuxuryBrands('**Mình chọn: Hilton Garden Inn Hà Nội** vì gần Hồ Gươm.')
    expect(shown).toContain(filterLuxuryBrands('Hilton Garden Inn Hà Nội'))
  })
  it('text without a brand or URL is unchanged', () => {
    expect(filterLuxuryBrands('Phở Hòa Pasteur, https://maps.google.com/?cid=11')).toBe('Phở Hòa Pasteur, https://maps.google.com/?cid=11')
  })
})

describe('applyLuxuryStreamFilter: text frames renamed, URLs untouched', () => {
  it('a 0: frame keeps the URL bytes; other frames pass unchanged', async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(`0:${JSON.stringify(`Mình chọn Hilton: ${PATH}`)}\n9:{"x":1}\n`)); c.close() } })
    const out = await applyLuxuryStreamFilter(new Response(body)).text()
    const lines = out.split('\n').filter(Boolean)
    expect(JSON.parse(lines[0].slice(2))).toBe(`Mình chọn khách sạn: ${PATH}`)
    expect(lines[1]).toBe('9:{"x":1}')
  })
})
