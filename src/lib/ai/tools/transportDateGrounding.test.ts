// @vitest-environment node
// Round 42 round 3, STEP 1 (reproduction only): PRICE-DATE-01 at the tool level — what get_transport_options tells the model about the date of the coach fares.
// serperSearch is mocked with FIXED snippets (the live Vexere one has no date); every fetch fails. Flag ON passes the user's date to the tool (route.ts:2671), flag OFF does not.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const serper = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('@/lib/ai/tools/common', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  getCache: () => null,
  setCache: () => undefined,
  serperSearch: serper.search,
}))

import { getTransportOptions } from './travel'

beforeAll(() => { globalThis.fetch = (async (input: unknown) => { throw new Error('network disabled: ' + String(input).slice(0, 60)) }) as typeof fetch })

const VEXERE = { title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html', snippet: 'Với giá vé chỉ từ 410000 đ và các tiện ích trên xe như: Đang cập nhật. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' }

describe('get_transport_options (intercity) — date of the fares in the tool result', () => {
  beforeEach(() => { serper.search.mockReset(); serper.search.mockImplementation(async (q: string) => (q.startsWith('ve xe khach') ? [VEXERE] : [])) })
  for (const [label, date] of [['flag ON (date passed)', '2026-10-24'], ['flag OFF (no date passed)', undefined]] as const) {
    it(`TODAY ${label}: the result carries the undated snippet and a generic note; NO field says the fares are not for the user's date, and the date itself is not in the result`, async () => {
      const r = await getTransportOptions('TP.HCM', 'Quy Nhơn', undefined, 'vi', date) as Record<string, unknown>
      console.log('CASE ' + JSON.stringify({ name: 'tool_intercity', label, keys: Object.keys(r).sort(), note: r.note, query: serper.search.mock.calls[0]?.[0] }))
      expect((r.bus_search_results as unknown[]).length).toBe(1)
      expect(r.note).toBe('Gia/chuyen xe-tau la tham khao tu ket qua tim kiem hien tai, co the khac theo gio chay, loai ghe va da thay doi.')
      expect(Object.keys(r).sort()).toEqual(['bus_search_results', 'destination', 'note', 'origin', 'train_search_results', 'type'])
      expect(JSON.stringify(r)).not.toMatch(/not_verified|fare_status|chua xac (?:minh|nhan)|theo ngay/)
    })
  }
  it('flag ON: the coach QUERY is worded with the day (so the snippets look like an answer for that day), the snippet itself states none', async () => {
    await getTransportOptions('TP.HCM', 'Quy Nhơn', undefined, 'vi', '2026-10-24')
    expect(serper.search.mock.calls[0][0]).toContain('ngay 24/10/2026')
    expect(VEXERE.snippet).not.toMatch(/\d{1,2}\/\d{1,2}/)
  })
})
