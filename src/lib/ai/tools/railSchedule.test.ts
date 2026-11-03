import { describe, it, expect } from 'vitest'
import { fetchRailSchedule, parseRailRows } from './railSchedule'
import type { PageFetchResult } from '@/lib/security/safePageFetch'

// 29/10: the Vexere rail route page states each train in its HTML (measured live: "06:00 Ga Sài Gòn 13:43 Ga Nha Trang SE8 315.000đ").
// A trimmed copy of that table's shape - cells in separate elements, a script that must not be read, a price-less teaser.
const PAGE_HTML = `<html><head><script>window.__NEXT_DATA__={"x":"07:00 Ga Giả 09:00 Ga Giả SE99 199.000đ"}</script></head><body>
<h2>Bảng giá vé tàu Ga Sài Gòn Ga Nha Trang theo thời gian thực</h2>
<p>Giá vé rẻ nhất từ 261.000đ/vé, trung bình khoảng 755.000đ/vé.</p>
<table>
<tr><td><b>06:00</b><div>Ga Sài Gòn</div></td><td><b>13:43</b><div>Ga Nha Trang</div></td><td>SE8</td><td>315.000đ<div>Ngồi mềm</div></td><td>Đặt vé</td></tr>
<tr><td><b>08:45</b><div>Ga Sài Gòn</div></td><td><b>16:06</b><div>Ga Nha Trang</div></td><td>SE6</td><td>363.000đ<div>Ngồi mềm</div></td><td>Đặt vé</td></tr>
<tr><td><b>21:45</b><div>Ga Sài Gòn</div></td><td><b>05:40</b><div>Ga Nha Trang</div></td><td>SNT2</td><td>460.000đ<div>Giường khoang 4</div></td><td>Đặt vé</td></tr>
<tr><td><b>06:00</b><div>Ga Sài Gòn</div></td><td><b>13:43</b><div>Ga Nha Trang</div></td><td>SE8</td><td>315.000đ</td></tr>
</table></body></html>`
const PAGE = 'https://vexere.com/vn/ve-tau-hoa/tu-ho-chi-minh-di-nha-trang-khanh-hoa.29.417.vi'
const ok = (body: string): PageFetchResult => ({ ok: true, url: PAGE, finalUrl: PAGE, status: 200, contentType: 'text/html', body, bytes: body.length, truncated: false, redirects: 0, ms: 1 })

describe('parseRailRows', () => {
  it('reads each train once, in page order, with stations, times and its lowest fare; never the script, never a teaser price', () => {
    expect(parseRailRows(PAGE_HTML)).toEqual([
      { train: 'SE8', depart: '06:00', arrive: '13:43', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 315000 },
      { train: 'SE6', depart: '08:45', arrive: '16:06', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 363000 },
      { train: 'SNT2', depart: '21:45', arrive: '05:40', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 460000 },
    ])
  })
  it('a page without the table gives no row', () => {
    expect(parseRailRows('<p>Vé tàu từ 261.000đ</p>')).toEqual([])
  })
})

describe('fetchRailSchedule', () => {
  it('reads a rail route page; refuses any other URL without fetching; a failed read gives null', async () => {
    let calls = 0
    const r = await fetchRailSchedule(PAGE, { fetch: async () => { calls++; return ok(PAGE_HTML) } })
    expect(r?.rows.map(x => x.train)).toEqual(['SE8', 'SE6', 'SNT2'])
    expect(r?.page_url).toBe(PAGE)
    for (const other of ['https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html', 'https://evil.example/vn/ve-tau-hoa/tu-a-di-b.1.2.vi']) {
      expect(await fetchRailSchedule(other, { fetch: async () => { calls++; return ok(PAGE_HTML) } })).toBeNull()
    }
    expect(calls).toBe(1)
    const page2 = PAGE.replace('.29.417.', '.24.15.')
    expect(await fetchRailSchedule(page2, { fetch: async () => ({ ok: false, url: page2, reason: 'robots_disallowed', redirects: 0, ms: 1 }) })).toBeNull()
  })
  it('one read per page within the cache window', async () => {
    const page3 = PAGE.replace('.29.417.', '.29.15.')
    let calls = 0
    const f = async () => { calls++; return ok(PAGE_HTML) }
    await fetchRailSchedule(page3, { fetch: f })
    const again = await fetchRailSchedule(page3, { fetch: f })
    expect(calls).toBe(1)
    expect(again?.rows).toHaveLength(3)
  })
})
