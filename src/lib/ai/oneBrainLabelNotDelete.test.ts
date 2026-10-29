// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { guardTravelClaimsInText } from './travelGuard'

// P0-2 (29/10 audit): after the one-brain model has written, a stage may LABEL or SOFTEN what the evidence does not back; it never deletes the name, the row or the
// bullet around it. The strings are the real reply of the 29/10 run (Q01) and the guards' own documented cases.

const TRIP_USER = 'Mình với bạn gái muốn đi Phú Quốc 3 ngày 2 đêm từ Hà Nội vào giữa tháng 12/2026, tổng ngân sách khoảng 15 triệu cho 2 người, gồm vé máy bay. Lên giúp mình lịch trình từng ngày và chia chi phí từng khoản.'
const SPLIT = '**Ngân sách 15 triệu cho hai người có thể làm được**, nếu săn được vé khứ hồi Hà Nội–Phú Quốc khoảng **5–6 triệu đồng tổng cộng**, ở nhà nghỉ/khách sạn bình dân và đi tự túc.\n\n- **Vé máy bay:** Hiện chưa thể chốt giá chính xác nếu chưa có ngày bay cụ thể; hãy đặt mục tiêu tối đa **6 triệu đồng/2 người**, gồm hành lý cần thiết.\n- **Lưu trú:** Dự trù **1,4 triệu/2 đêm** cho phòng đôi bình dân ở Dương Đông.\n- **Ăn uống và đi lại:** Dự trù **2,1 triệu** ăn uống, **700.000 đồng** thuê xe máy và xăng.\n- **Tổng dự toán:** Khoảng **11–12 triệu đồng**, còn khoảng **3–4 triệu dự phòng** cho giá vé hoặc phòng tăng.'

describe('travel guard money: "label" replaces the figure no evidence backs, never the line', () => {
  it('judge (default) cuts the line; label keeps every bullet and name and writes "chưa xác minh" where the figure was', () => {
    const judged = guardTravelClaimsInText(SPLIT, [], TRIP_USER)
    expect(judged.text).not.toContain('**Ăn uống và đi lại:**')
    const r = guardTravelClaimsInText(SPLIT, [], TRIP_USER, { money: 'label' })
    for (const keep of ['**Vé máy bay:**', '**Lưu trú:**', '**Ăn uống và đi lại:**', '**Tổng dự toán:**', 'phòng đôi bình dân ở Dương Đông', 'thuê xe máy và xăng']) expect(r.text).toContain(keep)
    for (const gone of ['2,1 triệu', '700.000', '1,4 triệu', '11–12', '3–4 triệu', '5–6 triệu']) expect(r.text).not.toContain(gone)
    expect(r.text).toContain('chưa xác minh')
    expect(r.redacted).toBeGreaterThan(0)
    // the label is the disclosure: no second, code-written "không xác nhận được … trang đặt chỗ" line
    expect(r.text).not.toContain('trang đặt')
  })
  it('the hedge word right before the figure goes with it ("khoảng 700.000 đồng" → "chưa xác minh", not "khoảng chưa xác minh")', () => {
    const r = guardTravelClaimsInText('Mình gợi ý thuê xe máy ở đảo.\n\nGiá thuê xe máy khoảng 700.000 đồng một ngày, nhớ đổ xăng.', [], TRIP_USER, { money: 'label' })
    expect(r.text).toContain('Giá thuê xe máy chưa xác minh một ngày, nhớ đổ xăng.')
    expect(r.text).not.toContain('khoảng chưa xác minh')
  })
  it('a figure a live fare backs, or the user said, stays as it was', () => {
    const r = guardTravelClaimsInText(SPLIT, [6_000_000], TRIP_USER, { money: 'label' })
    expect(r.text).toContain('**6 triệu đồng/2 người**')
    expect(r.text).toContain('15 triệu cho hai người')
  })
  it('a departure time / seat count no evidence backs is still cut as a sentence (label touches money only)', () => {
    const r = guardTravelClaimsInText('Mình gợi ý đi buổi sáng cho thoải mái.\n\nChuyến bay khởi hành lúc 8h sáng, còn 3 chỗ.', [], TRIP_USER, { money: 'label', availability: 'counted' })
    expect(r.text).not.toContain('còn 3 chỗ')
    expect(r.text).toContain('buổi sáng cho thoải mái')
  })
})

interface Run { text: string; logs: Array<Record<string, any>> }
async function run(user: string, frames: string[], oneBrain: boolean, travel = false, placeIntent = false): Promise<Run> {
  const collector = createEnrichmentCollector(user)
  if (oneBrain) collector.oneBrain = true
  const lines: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { lines.push(String(a[0])) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, travel, user, placeIntent)
    const body = await new Response(res.body).text()
    const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    return { text, logs: lines.map(l => { try { return JSON.parse(l) as Record<string, any> } catch { return null } }).filter((x): x is Record<string, any> => !!x) }
  } finally { console.log = orig }
}
const placeFrames = (call: Record<string, unknown>, rows: Array<Record<string, unknown>>, reply: string): string[] => [
  '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'search_places', args: call }),
  'a:' + JSON.stringify({ toolCallId: 't1', result: { source: 'Serper Maps', count: rows.length, location: String(call.location), results: rows, _tappy_place_domain: 'food', place_search_status: 'has_results' } }),
  '0:' + JSON.stringify(reply),
  'd:{"finishReason":"stop"}',
]

describe('one brain: the travel guard labels a figure instead of cutting its line (stream)', () => {
  const frames = ['0:' + JSON.stringify(SPLIT), 'd:{"finishReason":"stop"}']
  it('no plan card: every bullet stays with its name, the unbacked figures read "chưa xác minh"', async () => {
    const out = (await run(TRIP_USER, frames, true, true)).text
    for (const keep of ['**Vé máy bay:**', '**Lưu trú:**', '**Ăn uống và đi lại:**', '**Tổng dự toán:**']) expect(out).toContain(keep)
    expect(out).not.toContain('2,1 triệu')
    expect(out).toContain('chưa xác minh')
  })
  it('without one brain the same reply still loses the line, as before', async () => {
    expect((await run(TRIP_USER, frames, false, true)).text).not.toContain('**Ăn uống và đi lại:**')
  })
})

// the guards that rewrite the model's wording from the USER's words (a district, a screen format, an asked feature): shadow in one brain, rewritten elsewhere
describe('one brain: format / district / unsupported-claim stages only log what they would rewrite', () => {
  const PHO_USER = 'quán phở ngon ở Quận 3'
  const PHO_ROWS = [
    { name: 'Phở Việt Nam - Bến Thành', address: '112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh 700000, Việt Nam', rating_value: 4.4, rating_count: 800, opening_hours: '06:00–22:00', maps_link: 'https://maps.google.com/?cid=1' },
    { name: 'Phở Hòa Pasteur', address: '260C Pasteur, Xuân Hòa, Hồ Chí Minh, Việt Nam', rating_value: 4.3, rating_count: 900, opening_hours: '06:00–22:00', maps_link: 'https://maps.google.com/?cid=2' },
  ]
  const call = { query: 'phở', location: 'Quận 3, TP.HCM', type: 'restaurant' }
  it('district: a venue in another district keeps the sentence the model wrote (the stage is logged)', async () => {
    const reply = 'Phở Việt Nam ở Quận 3 là lựa chọn ngon, nước dùng đậm. Phở Hòa Pasteur cũng ở Quận 3.'
    const on = await run(PHO_USER, placeFrames(call, PHO_ROWS, reply), true)
    expect(on.text).toContain('Phở Việt Nam ở Quận 3 là lựa chọn ngon')
    expect(on.logs.some(l => l.guard === 'legacy_stage' && l.stage === 'shadow:district_claim')).toBe(true)
    const off = await run(PHO_USER, placeFrames(call, PHO_ROWS, reply), false)
    expect(off.text).toContain('Phở Việt Nam ở Quận 1')
  })
  const CINEMA_USER = 'rạp chiếu phim IMAX ở TP HCM'
  const CINEMA_ROWS = [{ name: 'CGV Vincom Đồng Khởi', address: '72 Lê Thánh Tôn, Quận 1', rating_value: 4.3, rating_count: 500, opening_hours: '09:00–23:00', maps_link: 'https://maps.google.com/?cid=3' }]
  const cinemaCall = { query: 'rạp chiếu phim', location: 'TP.HCM', type: 'movie_theater' }
  it('format: an IMAX claim no row carries is not reworded and gets no code-written line', async () => {
    const reply = 'Mình gợi ý **CGV Vincom Đồng Khởi** — có sảnh IMAX, 4,3⭐ từ 500 đánh giá.'
    const on = await run(CINEMA_USER, placeFrames(cinemaCall, CINEMA_ROWS, reply), true)
    expect(on.text).toContain('có sảnh IMAX')
    expect(on.logs.some(l => l.guard === 'legacy_stage' && l.stage === 'shadow:format_claim')).toBe(true)
    const off = await run(CINEMA_USER, placeFrames(cinemaCall, CINEMA_ROWS, reply), false)
    expect(off.text).toContain('phòng chiếu IMAX')
  })
  it('unsupported claim: an absolute "không có" the data never says is left to the model (the stage is logged)', async () => {
    const reply = 'Mình gợi ý **CGV Vincom Đồng Khởi**. Rạp này không có IMAX.'
    const on = await run(CINEMA_USER, placeFrames(cinemaCall, CINEMA_ROWS, reply), true)
    expect(on.text).toContain('Rạp này không có IMAX')
    const off = await run(CINEMA_USER, placeFrames(cinemaCall, CINEMA_ROWS, reply), false)
    expect(off.text).not.toContain('Rạp này không có IMAX')
  })
})

describe('one brain: the per-stage counters are on without a flag (counts only, never text)', () => {
  it('a stage that would change the reply is logged with its sizes', async () => {
    const reply = 'Phở Việt Nam ở Quận 3 là lựa chọn ngon, nước dùng đậm.'
    const rows = [{ name: 'Phở Việt Nam - Bến Thành', address: '112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh 700000, Việt Nam', rating_value: 4.4, rating_count: 800, opening_hours: '06:00–22:00', maps_link: 'https://maps.google.com/?cid=1' }]
    const on = await run('quán phở ngon ở Quận 3', placeFrames({ query: 'phở', location: 'Quận 3, TP.HCM', type: 'restaurant' }, rows, reply), true)
    const rec = on.logs.find(l => l.guard === 'legacy_stage' && l.stage === 'shadow:district_claim')
    expect(rec).toBeTruthy()
    expect(typeof rec!.chars_before).toBe('number')
    expect(JSON.stringify(rec)).not.toContain('Phở Việt Nam ở Quận')
    const off = await run('quán phở ngon ở Quận 3', placeFrames({ query: 'phở', location: 'Quận 3, TP.HCM', type: 'restaurant' }, rows, reply), false)
    // (the flag-less counters are one-brain only: another route logs no stage record unless LEGACY_STREAM_TRACE is set)
    expect(off.logs.some(l => l.guard === 'legacy_stage')).toBe(false)
  })
})
