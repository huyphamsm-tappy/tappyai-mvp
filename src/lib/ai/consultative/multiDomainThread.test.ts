import { describe, it, expect } from 'vitest'
import { currentSubjectUserTexts, inheritedPlanningIntent } from './subjectScope'
import { deriveShoppingConstraints } from './shoppingConstraints'
import { deriveNeedProfile } from './needProfile'
import { detectPlanningIntent, isPlanningRefinement } from '../intent'

// ── UAT3 P0 (2026-09-27): a long multi-domain thread must not mix subjects ─────────────────────
//
// The owner's own UAT thread, user turns verbatim (conversation 8e2f56dd on AUDIT): an evening in
// Sài Gòn, then a Quy Nhơn trip plan, then a used MacBook. Measured before the fix:
//   · "vậy lập kế hoạch đi quy nhơn đi" was read as a CLOTHING purchase ("vậy" folds to "vay",
//     the pattern for "váy"), so the MacBook turn did not start a new subject;
//   · "kiếm con nào m1 dram 32gb, ổ cứng 512 á" then inherited the `trip` plan three turns up,
//     the planning block went out on a laptop question, and the reply ran flights, hotels and
//     weather and appended the Quy Nhơn plan under the MacBook cards.
// The same thread is golden case M1 (docs/uat/ai-golden-set.jsonl) for the live run.

const USER_TURNS = [
  'tối nay đi đâu chơi ở sài gòn thì được',
  'chưa biết ăn gì uống gì hay chơi gì mới đi hỏi, đi có 1 mình à',
  'uhm ăn đại cơm hay cháo mì gì cũng được 50-60k là được, kiếm chổ xõa đi',
  'kiếm mấy quán quận 1 đi cho tiện',
  'rồi còn chổ chơi thì sao',
  'cái nào cũng được đang chán, lên kế hoạch đi tối nay chơi tới nóc luôn',
  'coi lên kế hoạch tui đi quy nhơn thứ 2 tuần sau, cho 2 người, budget 20 triệu, nhớ check vé máy bay rồi khách sạn chốn ăn chơi luôn nha',
  'vậy lập kế hoạch đi quy nhơn đi',
  'giờ tui muốn mua cái máy Macbook',
  'mua về để code á, pro 1 là được máy cũ thôi',
  'kiếm con nào m1 dram 32gb, ổ cứng 512 á',
  'mua máy cũ thì cần check cái gì',
]
const OPTS = { hasGps: false, lang: 'vi' }

/** The thread up to and including user turn `n` (1-based), with an assistant turn between. */
function upTo(n: number) {
  return USER_TURNS.slice(0, n).flatMap((t, i) => (i < n - 1 ? [{ role: 'user', content: t }, { role: 'assistant', content: 'ok' }] : [{ role: 'user', content: t }]))
}

describe('multi-domain thread — subject boundaries', () => {
  it('the Quy Nhơn plan starts its own subject, and keeps both of its turns', () => {
    expect(currentSubjectUserTexts(upTo(8), OPTS)).toEqual(USER_TURNS.slice(6, 8))
  })

  it('the MacBook purchase starts a new subject — no trip turn belongs to it', () => {
    for (const n of [9, 10, 11, 12]) {
      const subject = currentSubjectUserTexts(upTo(n), OPTS)
      expect(subject[0]).toBe('giờ tui muốn mua cái máy Macbook')
      expect(subject.some(t => /quy nhơn/i.test(t))).toBe(false)
    }
  })

  it('no MacBook turn inherits the trip plan', () => {
    for (const n of [9, 10, 11, 12]) {
      const subject = currentSubjectUserTexts(upTo(n), OPTS)
      const last = USER_TURNS[n - 1]
      const inherited = detectPlanningIntent(last) === null && isPlanningRefinement(last) ? inheritedPlanningIntent(subject.slice(-4, -1), OPTS) : null
      expect(detectPlanningIntent(last)).toBeNull()
      expect(inherited).toBeNull()
    }
  })
})

describe('inheritedPlanningIntent', () => {
  it("a plan's own follow-ups still inherit it (golden T1)", () => {
    expect(inheritedPlanningIntent(['Mình muốn đi Đà Nẵng 3 ngày, 2 người, thích tham quan và ăn hải sản'], OPTS)).toBe('trip')
    expect(inheritedPlanningIntent(['Mình muốn đi Đà Nẵng 3 ngày, 2 người, thích tham quan và ăn hải sản', 'mai đi mốt về, budget 20 triệu'], OPTS)).toBe('trip')
  })

  it('never across a purchase or another tool subject', () => {
    expect(inheritedPlanningIntent(['vậy lập kế hoạch đi quy nhơn đi', 'giờ tui muốn mua cái máy Macbook', 'mua về để code á, pro 1 là được máy cũ thôi'], OPTS)).toBeNull()
    expect(inheritedPlanningIntent(['Lên lịch trình 1 ngày ở Vũng Tàu cho 2 người', 'giá vàng hôm nay'], OPTS)).toBeNull()
  })
})

describe('folded-text collisions in the product lexicon', () => {
  const type = (t: string) => deriveShoppingConstraints([{ role: 'user', content: t }], null).productType
  const np = (t: string) => deriveNeedProfile([{ role: 'user', content: t }] as never, { gps: null })

  it.each([
    'vậy lập kế hoạch đi quy nhơn đi', // vậy ≠ váy
    'đám cưới bạn thân cuối tuần này', // đám ≠ đầm
    'đợi 30 giây nữa nha', // giây ≠ giày
    'làm giấy tờ ở đâu', // giấy ≠ giày
    'quán nem nướng ngon quận 3', // nem ≠ nệm
  ])('%s is not a product purchase', (t) => {
    expect(type(t)).toBeNull()
    expect(np(t).domain).not.toBe('shopping')
  })

  it('bim bim is a snack, not nappies (buying it is still shopping)', () => {
    expect(type('mua bim bim ăn vặt')).not.toBe('baby')
  })

  it.each([
    ['váy cưới giá dưới 5 triệu', 'clothing'],
    ['mua váy đi tiệc', 'clothing'],
    ['đầm dự tiệc màu đen', 'clothing'],
    ['giày chạy bộ size 42', 'shoes'],
    ['giày Nike size 42', 'shoes'],
    ['nệm cao su 1m6', 'furniture'],
    ['bỉm cho bé 6 tháng', 'baby'],
  ])('%s is still %s', (t, want) => {
    expect(type(t)).toBe(want)
  })
})
