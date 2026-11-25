import { describe, expect, it } from 'vitest'
import {
  budgetRows, buildEntityProfile, calloutTips, filterTips, headerBadges, matchPlace, planTips, splitDayLabel, timeChip, tipBelongsTo, tipsByStop, tripFacts,
  type EntityLabels, type V206Plan,
} from '@/lib/chat/v206'

const L: EntityLabels = {
  status: 'Trạng thái', address: 'Địa chỉ', rating: 'Đánh giá', reviews: n => `${n} lượt`, stars: 'Hạng sao', hours: 'Giờ mở cửa', openNow: 'Đang mở', closedNow: 'Đang đóng', phone: 'Điện thoại',
  price: 'Giá', time: 'Giờ', category: 'Loại', distance: 'Khoảng cách', maps: 'Bản đồ', booking: 'Đặt chỗ', call: 'Gọi', description: 'Ghi chú',
}

const plan: V206Plan = {
  title: 'Đà Lạt 3N2Đ', people: 3, budget_total: '9.800.000đ',
  days: [
    { label: 'Ngày 1: Hồ Tuyền Lâm', items: [{ time: '9h30', name: 'Sân bay Liên Khương' }, { time: '14:00', name: 'Terracotta Hotel & Resort Dalat', address: 'Hồ Tuyền Lâm' }] },
    { label: 'Ngày 2', items: [{ time: 'Sáng', name: 'Nông trại Cún Puppy Farm' }] },
  ],
  cost_breakdown: { 'Lưu trú': '3.700.000đ', 'Ăn uống': '', '  ': 'x' },
  local_tips: [
    { text: 'Đến lúc 08:30 khi cún hoạt bát.', basis: 'tool', place: 'Puppy Farm' },
    { text: 'Mang áo khoác.', basis: 'general' },
    { text: '   ' },
  ],
}

describe('timeChip', () => {
  it('normalises clock times and keeps other words', () => {
    expect(timeChip('9h30')).toBe('09:30')
    expect(timeChip('14:00')).toBe('14:00')
    expect(timeChip('7')).toBe('7')
    expect(timeChip('25:00')).toBe('25:00')
    expect(timeChip('Sáng')).toBe('Sáng')
    expect(timeChip('  ')).toBeNull()
    expect(timeChip(undefined)).toBeNull()
  })
})

describe('splitDayLabel', () => {
  it('splits the tab from the theme', () => {
    expect(splitDayLabel('Ngày 2: Puppy Farm')).toEqual({ tab: 'Ngày 2', theme: 'Puppy Farm' })
    expect(splitDayLabel('Ngày 1')).toEqual({ tab: 'Ngày 1', theme: '' })
    expect(splitDayLabel('Một nhãn rất dài không có dấu hai chấm gần đầu câu - sau')).toEqual({ tab: 'Một nhãn rất dài không có dấu hai chấm gần đầu câu - sau', theme: '' })
  })
})

describe('plan tips', () => {
  it('keeps only tips with text and puts each beside the stop it names', () => {
    const tips = planTips(plan)
    expect(tips.map(t => t.text)).toEqual(['Đến lúc 08:30 khi cún hoạt bát.', 'Mang áo khoác.'])
    expect(tips[1].general).toBe(true)
    const by = tipsByStop(plan, tips)
    expect([...by.keys()]).toEqual(['1:0'])
    expect(by.get('1:0')![0].place).toBe('Puppy Farm')
  })
  it('a tip with no place belongs to no stop; short names do not match by containment', () => {
    expect(tipBelongsTo({ id: 'x', text: 't', source: 'plan' }, 'Puppy Farm')).toBe(false)
    expect(tipBelongsTo({ id: 'x', text: 't', place: 'Hồ', source: 'plan' }, 'Hồ Tuyền Lâm')).toBe(false)
    expect(tipBelongsTo({ id: 'x', text: 't', place: 'ho tuyen lam', source: 'plan' }, 'Hồ Tuyền Lâm')).toBe(true)
  })
  it('a tip is placed once even when two stops match', () => {
    const p: V206Plan = { title: 't', days: [{ label: 'd', items: [{ name: 'Puppy Farm Đà Lạt' }, { name: 'Puppy Farm' }] }] }
    const by = tipsByStop(p, planTips({ local_tips: [{ text: 'x', place: 'Puppy Farm' }] }))
    expect([...by.entries()].flatMap(([, v]) => v).length).toBe(1)
  })
})

describe('budget and facts', () => {
  it('lists the plan\'s own rows without blanks', () => {
    expect(budgetRows(plan)).toEqual([{ label: 'Lưu trú', value: '3.700.000đ' }])
    expect(budgetRows({})).toEqual([])
  })
  it('counts days and stops; people only above one', () => {
    expect(tripFacts(plan)).toEqual({ days: 2, stops: 3, people: 3, budget: '9.800.000đ' })
    expect(tripFacts({ title: 't', days: [], people: 1 })).toEqual({ days: 0, stops: 0, people: null, budget: null })
  })
})

describe('calloutTips', () => {
  it('turns quote blocks into tips, with the bold label as the title', () => {
    const md = 'Mở bài.\n\n> **Mẹo chống say xe:** Cho bé uống nước ấm trước 20 phút.\n\nĐoạn giữa.\n\n> Nhớ mang áo ấm.\n'
    const tips = calloutTips(md)
    expect(tips).toHaveLength(2)
    expect(tips[0]).toMatchObject({ title: 'Mẹo chống say xe', text: 'Cho bé uống nước ấm trước 20 phút.', source: 'answer' })
    expect(tips[1]).toMatchObject({ text: 'Nhớ mang áo ấm.' })
    expect(tips[1].title).toBeUndefined()
  })
  it('no quotes, no tips; a bare ">" yields nothing', () => {
    expect(calloutTips('Chỉ có đoạn văn.')).toEqual([])
    expect(calloutTips('>\n')).toEqual([])
  })
})

describe('filterTips', () => {
  it('ignores accents and case, empty query keeps all', () => {
    const tips = planTips(plan)
    expect(filterTips(tips, '').length).toBe(2)
    expect(filterTips(tips, 'AO KHOAC').map(t => t.text)).toEqual(['Mang áo khoác.'])
    expect(filterTips(tips, 'puppy').length).toBe(1)
    expect(filterTips(tips, 'zzz')).toEqual([])
  })
})

describe('buildEntityProfile', () => {
  it('shows only real fields', () => {
    const p = buildEntityProfile({ name: 'La Villa', address: '4 Thảo Điền', rating: 4.66, ratingCount: 540, openingHours: '18:00 – 22:30', openNow: true, phone: '+84 28 3744 6000', categories: ['Pháp'], image: 'https://example.com/a.jpg' }, { name: 'La Villa', maps_link: 'https://maps.google.com/?q=x', booking_link: 'http://insecure.example.com' } as never, L)!
    expect(p.facts.map(f => f.label)).toEqual(['Địa chỉ', 'Đánh giá', 'Giờ mở cửa', 'Trạng thái', 'Loại'])
    expect(p.facts[1].value).toBe('4.7 (540 lượt)')
    expect(p.links.map(l => l.kind)).toEqual(['maps', 'phone'])
    expect(p.links[1].href).toBe('tel:+842837446000')
    expect(p.image).toBe('https://example.com/a.jpg')
  })
  it('never invents: a bare name has no profile; an unsafe image or link is dropped', () => {
    expect(buildEntityProfile({ name: 'Quán X' }, null, L)).toBeNull()
    expect(buildEntityProfile(null, { name: '' }, L)).toBeNull()
    const p = buildEntityProfile({ name: 'Quán X', image: 'http://x.test/a.jpg', address: 'Q1' }, { name: 'Quán X', maps_link: 'javascript:alert(1)' }, L)!
    expect(p.image).toBeUndefined()
    expect(p.links).toEqual([])
  })
  it('a plan stop alone can have a profile (description, time, price)', () => {
    const p = buildEntityProfile(null, { name: 'Puppy Farm', time: '8h30', price: '100.000đ', description: 'Trang trại.', address: 'Xem bản đồ' }, L)!
    expect(p.facts.map(f => f.value)).toEqual(['08:30', '100.000đ'])
    expect(p.note).toBe('Trang trại.')
  })
  it('a rating of zero or an absent review count is not shown', () => {
    const p = buildEntityProfile({ name: 'A', rating: 0, address: 'x' }, null, L)!
    expect(p.facts.map(f => f.label)).toEqual(['Địa chỉ'])
    const q = buildEntityProfile({ name: 'A', rating: 4, address: 'x' }, null, L)!
    expect(q.facts[1].value).toBe('4.0')
  })
})

describe('matchPlace', () => {
  const places = [{ id: 'p1', name: 'La Villa French Restaurant' }, { id: 'p2', name: 'Pendolasco' }]
  it('matches by id, exact name, or containment of at least four letters', () => {
    expect(matchPlace(places, 'whatever', 'p2')?.id).toBe('p2')
    expect(matchPlace(places, 'la villa french restaurant')?.id).toBe('p1')
    expect(matchPlace(places, 'La Villa')?.id).toBe('p1')
    expect(matchPlace(places, 'Bar')).toBeNull()
    expect(matchPlace(null, 'La Villa')).toBeNull()
    expect(matchPlace(places, '')).toBeNull()
  })
})

describe('headerBadges', () => {
  it('uses only the conversation\'s own metadata', () => {
    expect(headerBadges(null)).toEqual([])
    expect(headerBadges({ is_pinned: true, project_id: 'p' })).toEqual(['pinned', 'project'])
    expect(headerBadges({ is_pinned: true, is_archived: true })).toEqual(['archived'])
    expect(headerBadges({})).toEqual([])
  })
})
