import { describe, it, expect } from 'vitest'
import { restorePlanHeadings } from './domainFrames'
import { onlyRowsNamed, travelPreCall, withoutShownRows, isoFromDayMonth } from './consultTravel'

describe('restorePlanHeadings', () => {
  const original = [
    'Mình giả định: 2 người.',
    '',
    '**Giờ đến & đặt bàn**',
    'Đến khoảng 19:00–19:30 để tránh giờ cao điểm.',
    '',
    '**Gọi món**',
    'Izakaya là quán Nhật nên thử edamame, gyoza.',
    '',
    '**Chi phí**',
    '2 × 300.000đ = 600.000đ',
  ].join('\n')

  it('puts a cut heading back above its own surviving content, in order', () => {
    const guarded = 'Mình giả định: 2 người.\n\nĐến khoảng 19:00–19:30 để tránh giờ cao điểm.\n\nIzakaya là quán Nhật nên thử edamame, gyoza.\n\n**Chi phí**\n2 × 300.000đ = 600.000đ'
    const out = restorePlanHeadings(original, guarded)
    const i = (s: string) => out.indexOf(s)
    expect(i('**Giờ đến & đặt bàn**')).toBeGreaterThan(-1)
    expect(i('**Giờ đến & đặt bàn**')).toBeLessThan(i('Đến khoảng'))
    expect(i('**Gọi món**')).toBeLessThan(i('Izakaya là'))
    expect(i('**Gọi món**')).toBeGreaterThan(i('Đến khoảng'))
  })

  it('a heading whose content was cut goes before the next surviving heading', () => {
    const out = restorePlanHeadings(original, 'Mình giả định: 2 người.\n\n**Chi phí**\n2 × 300.000đ = 600.000đ')
    expect(out.indexOf('**Gọi món**')).toBeLessThan(out.indexOf('**Chi phí**'))
  })

  it('never invents a heading the model did not write, and leaves a complete plan alone', () => {
    expect(restorePlanHeadings(original, original)).toBe(original)
    expect(restorePlanHeadings('no headings here', 'x')).toBe('x')
  })
})

describe('consult travel pre-search', () => {
  const now = new Date('2026-09-29T03:00:00Z')
  it('a flight with origin + destination calls the fare tool with the stated date', () => {
    expect(travelPreCall({ xuat_phat: 'Sài Gòn', diem_den: 'Hà Nội', ngay: '15/10', phuong_tien: 'máy bay' }, 'bay sáng', now))
      .toEqual({ name: 'get_flight_prices', args: { origin: 'Sài Gòn', destination: 'Hà Nội', departDate: '2026-10-15' } })
  })
  it('a trip with a destination calls the hotel tool; no date is invented', () => {
    expect(travelPreCall({ diem_den: 'Đà Nẵng' }, 'đi Đà Nẵng', now)).toEqual({ name: 'get_hotel_prices', args: { location: 'Đà Nẵng' } })
    expect(travelPreCall({ diem_den: 'Đà Nẵng', ngay: '10/10', so_ngay: '3 ngày' }, '', now))
      .toEqual({ name: 'get_hotel_prices', args: { location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12' } })
    expect(travelPreCall({}, 'đi chơi', now)).toBeNull()
  })
  it('a past day/month rolls to next year', () => {
    expect(isoFromDayMonth('01/01', now)).toBe('2027-01-01')
  })
})

describe('row filters', () => {
  const res = { results: [{ name: 'Izakaya Unatoto Việt Nam' }, { name: 'FEN Izakaya' }, { name: 'Michi Sushi' }] }
  it('more / reject drops rows an earlier reply named', () => {
    expect((withoutShownRows(res, ['Izakaya Unatoto']) as typeof res).results.map(r => r.name)).toEqual(['FEN Izakaya', 'Michi Sushi'])
  })
  it('keeps the rows when filtering would leave none', () => {
    expect(withoutShownRows(res, ['Izakaya Unatoto', 'FEN Izakaya', 'Michi Sushi'])).toEqual(res)
  })
  it('a plan reads only the chosen row', () => {
    expect((onlyRowsNamed(res, 'Michi Sushi', []) as typeof res).results).toEqual([{ name: 'Michi Sushi' }])
    expect((onlyRowsNamed(res, 'Không có', ['FEN Izakaya']) as typeof res).results).toEqual([{ name: 'FEN Izakaya' }])
  })
})

describe('event pre-search (R11)', () => {
  it('a concert thread searches events with Ticketbox, keeping the month', async () => {
    const { eventPreCall } = await import('./consultTravel')
    expect(eventPreCall('vé concert tháng 10 . Chưa biết · 1 người · Dưới 500k', {})).toEqual({ name: 'web_search', args: { query: 'concert tháng 10 vé ticketbox' } })
    expect(eventPreCall('karaoke quận 1 tối nay', {})).toBeNull()
  })
})

describe('pick written as a link (R11)', () => {
  it('becomes the canonical pick sentence with the link kept', async () => {
    const { normalizePickSentence } = await import('./consultBrain')
    const out = normalizePickSentence('Mình hiểu rồi.\n\nMình chọn: [Tinh Hà Concert](https://ticketbox.vn/tinh-ha-26508)\n\n- [B](https://ticketbox.vn/b-1)', 'Tinh Hà Concert')
    expect(out).toContain('**Mình chọn: Tinh Hà Concert** — [Tinh Hà Concert](https://ticketbox.vn/tinh-ha-26508)')
    expect(out.match(/Mình chọn/g)).toHaveLength(1)
  })
})

describe('sealPlanHeadings (prevention, not repair)', () => {
  it('gives only approved heading lines an invisible sentence end, and removes it cleanly', async () => {
    const { sealPlanHeadings, unsealPlanHeadings } = await import('./domainFrames')
    const plan = '**Gọi món**\nBún bò 50k.\n**Không phải tiêu đề**\n## Chi phí'
    const sealed = sealPlanHeadings(plan)
    expect(sealed).toContain('**Gọi món**\u2063.')
    expect(sealed).toContain('## Chi phí\u2063.')
    expect(sealed).toContain('**Không phải tiêu đề**\n')
    expect(unsealPlanHeadings(sealed)).toBe(plan)
  })
})
