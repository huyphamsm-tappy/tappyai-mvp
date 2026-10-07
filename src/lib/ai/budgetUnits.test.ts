import { describe, it, expect } from 'vitest'
import { extractBudget, extractPlanTotalBudget } from './budget'
import { budgetFromHistory } from './consultative/shoppingConstraints'
import { currentSubjectMessages } from './consultative/subjectScope'

// PRELAUNCH 5a (Session D, 2026-09-24). A PERCENTAGE IS NEVER MONEY — and neither is a head count,
// an age, a weight, a distance, a year or a time. The unit-optional money forms (range, dưới, khoảng)
// read any bare number ≤ 9999 as thousands of đồng, so "pin 98-99%" became a 98k–99k budget.

describe('extractBudget refuses numbers that carry a non-money unit', () => {
  it.each([
    'iPhone 15 Pro Max cũ pin 98-99%',
    'pin 98-99 %',
    'máy còn 98-99 phần trăm pin',
    'quán cho gia đình 5-6 người',
    'có bé dưới 5 tuổi',
    'khoảng 2 km quanh đây',
    'vali 20-25kg',
    'xe đời từ 2020 đến 2023',
    'tầm 7-9h tối',
    'chụp ảnh 48-50 MP',
    'điện thoại 8-12 GB RAM',
    'màn hình khoảng 6 inch',
    'mở cửa từ 7 đến 22 giờ',
    'nhà 3-4 phòng ngủ',
  ])('no budget in %j', (text) => expect(extractBudget(text)).toBeNull())

  it.each([
    ['từ 50 đến 60k', { min: 50_000, max: 60_000 }],
    ['50-60k thôi', { min: 50_000, max: 60_000 }],
    ['dưới 100k', { min: 0, max: 100_000 }],
    ['khoảng 5 triệu', { min: 4_000_000, max: 6_000_000 }],
    ['từ 100 đến 200', { min: 100_000, max: 200_000 }],
    ['ngân sách 20 triệu', { min: 0, max: 20_000_000 }],
    ['iPhone cũ pin 98-99% giá dưới 15 triệu', { min: 0, max: 15_000_000 }],
  ])('%j is still money', (text, want) => expect(extractBudget(text)).toMatchObject(want))

  it('a plan envelope is not read from a percentage or a head count either', () => {
    expect(extractPlanTotalBudget('lịch trình 3 ngày cho 5-6 người, pin sạc dự phòng 98-99%')).toBeNull()
    expect(extractPlanTotalBudget('lịch trình 3 ngày, ngân sách 20 triệu')).toBe(20_000_000)
  })
})

describe('a budget does not outlive its subject', () => {
  const opts = { hasGps: true, lang: 'vi' }
  const u = (content: string) => ({ role: 'user', content })
  const a = (content: string) => ({ role: 'assistant', content })

  it('the lunch budget does not follow the user into a phone purchase', () => {
    const msgs = [u('Trưa nay ăn gì ngon dưới 100k ở Quận 1'), a('Gợi ý quán...'), u('Tư vấn giúp mình mua điện thoại Samsung tầm trung chụp ảnh đẹp')]
    expect(budgetFromHistory(msgs, extractBudget)).toMatchObject({ max: 100_000 }) // the old, unscoped walk
    expect(budgetFromHistory(currentSubjectMessages(msgs, opts), extractBudget)).toBeNull()
  })

  it('…nor into a refinement of the phone subject', () => {
    const msgs = [u('Trưa nay ăn gì ngon dưới 100k ở Quận 1'), a('...'), u('Tư vấn mua điện thoại Samsung tầm trung'), a('...'), u('Rẻ hơn thì có lựa chọn nào?')]
    expect(budgetFromHistory(currentSubjectMessages(msgs, opts), extractBudget)).toBeNull()
  })

  it('a budget stated for the same subject is still carried', () => {
    const msgs = [u('Tư vấn điện thoại Samsung dưới 10 triệu'), a('...'), u('Rẻ hơn thì có lựa chọn nào?')]
    expect(budgetFromHistory(currentSubjectMessages(msgs, opts), extractBudget)).toMatchObject({ max: 10_000_000 })
  })

  it('a food follow-up keeps the food budget', () => {
    const msgs = [u('Trưa nay ăn gì ngon dưới 100k ở Quận 1'), a('...'), u('Còn quán nào khác không?')]
    expect(budgetFromHistory(currentSubjectMessages(msgs, opts), extractBudget)).toMatchObject({ max: 100_000 })
  })
})
