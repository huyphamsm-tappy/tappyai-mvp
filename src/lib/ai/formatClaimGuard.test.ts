import { describe, expect, it } from 'vitest'
import { guardFormatClaimsInText, requestedFormats } from './formatClaimGuard'

// Phase 7 group 1 (golden T2, 2026-09-22): Maps rows say nothing about screens; the reply
// said "sảnh IMAX" for eight cinemas anyway.

const ROWS = ['CGV Vincom Đồng Khởi', 'Lotte Cinema Nam Sài Gòn', 'Galaxy Nguyễn Du', '72 Lê Thánh Tôn, Quận 1', '09:00–23:00']

describe('guardFormatClaimsInText', () => {
  it('🚨 T2: an IMAX claim no row supports gets one honest line and the right word', () => {
    const text = 'Mình gợi ý **CGV Vincom Đồng Khởi** — có sảnh IMAX, 4.5⭐.\n\n[CTA_BUTTONS]…[/CTA_BUTTONS]'
    const out = guardFormatClaimsInText(text, 'Rạp chiếu phim IMAX ở TP HCM', ROWS, 'vi')
    expect(out.hedged).toEqual(['IMAX'])
    expect(out.reworded).toBe(1)
    expect(out.text).toContain('phòng chiếu IMAX')
    expect(out.text).not.toContain('sảnh IMAX')
    expect(out.text).toMatch(/chưa xác nhận rạp nào thật sự có phòng chiếu IMAX[\s\S]*\[CTA_BUTTONS\]/)
    expect((out.text.match(/Lưu ý: dữ liệu/g) ?? []).length).toBe(1)
  })

  it('"sàn chiếu IMAX" (after2 T2) is reworded too, and a hedge anywhere near a mention counts', () => {
    const text = 'Mình tìm được các rạp, nhưng **không có rạp IMAX chuyên biệt** trong kết quả. CGV có thể có sàn chiếu IMAX.'
    const out = guardFormatClaimsInText(text, 'Rạp chiếu phim IMAX ở TP HCM', ROWS, 'vi')
    expect(out.text).toContain('phòng chiếu IMAX')
    expect(out.hedged).toEqual([])
  })

  it('a row that carries the format is evidence — nothing is added', () => {
    const text = '**CGV Vincom Đồng Khởi (IMAX)** đang chiếu suất IMAX.'
    const out = guardFormatClaimsInText(text, 'rạp IMAX gần đây', [...ROWS, 'CGV Vincom Đồng Khởi (IMAX)'], 'vi')
    expect(out.hedged).toEqual([])
    expect(out.text).toBe(text)
  })

  it('a reply that already hedges the format is left alone', () => {
    const text = 'Mình chưa xác nhận được rạp nào có phòng chiếu IMAX từ dữ liệu, nhưng CGV Vincom Đồng Khởi là rạp lớn nhất gần bạn.'
    expect(guardFormatClaimsInText(text, 'rạp IMAX', ROWS, 'vi').hedged).toEqual([])
  })

  it('no format asked → inert; a format asked but never claimed → inert', () => {
    expect(guardFormatClaimsInText('CGV Vincom có sảnh IMAX.', 'rạp phim gần Quận 7', ROWS, 'vi')).toEqual({ text: 'CGV Vincom có sảnh IMAX.', hedged: [], reworded: 0 })
    expect(guardFormatClaimsInText('CGV Vincom Đồng Khởi 4.5⭐.', 'rạp IMAX', ROWS, 'vi').hedged).toEqual([])
    expect(requestedFormats('rạp 4DX hoặc IMAX')).toEqual(['IMAX', '4DX'])
  })

  it('English UI gets an English line', () => {
    const out = guardFormatClaimsInText('CGV Vincom has an IMAX screen.', 'IMAX cinema in HCMC', ROWS, 'en')
    expect(out.text).toContain('do not say which cinema actually has a IMAX screen')
  })
})
