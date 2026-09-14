// The planning contract — the deterministic half of "a plan request produces a
// plan", pinned after the 2026-09-14 reproduction:
//
//   "lập kế hoạch ăn chơi nhảy múa tối nay cho 2 người, budget 5 triệu ở Sài Gòn đi"
//   → planning mode detected, TWO parallel place searches ran, and the reply was
//     581 characters, no [TAPPY_PLAN], ending with "bạn muốn thay đổi quán nào không?".
//
// Three deterministic causes, each with its own pin below: the first-reply WORD
// LIMIT block ("≤150 words, end with a follow-up question") was emitted AFTER the
// planning block and won; the planning trigger missed most planning phrasings and
// every English one; and the budget was per-item while a plan's budget is a total.
// The model's half — actually writing the block — is asserted by the live probe
// (docs) and made measurable by `planEmitted` in the usage record.

import { describe, it, expect } from 'vitest'
import { buildSystem, buildPlanningBlock } from './promptBuilder'
import { detectPlanningIntent, detectPlanActivities, detectForcedTool, isSimpleQuery, classifyIntent } from './intent'
import { extractBudget, extractPlanTotalBudget } from './budget'
import { deriveNeedProfile } from './consultative/needProfile'

const BUG = 'lập kế hoạch ăn chơi nhảy múa tối nay cho 2 người, budget 5 triệu ở sài gòn đi'
const msgs = (text: string) => [{ role: 'user' as const, content: text }] as never

describe('🚨 prompt precedence — a planning turn is owned by the planning block', () => {
  const planning = buildSystem(extractBudget(BUG), 'unknown', true, '', 'vi', '', null, 'evening', false, undefined, undefined, { totalBudget: 5_000_000, activities: ['restaurant', 'bar'] })
  const normal = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
  const followUp = buildSystem(null, 'unknown', false, '', 'vi', '', null, null, false)

  it('planning turn: the planning block is present and no word-limit / "end with a question" instruction is', () => {
    expect(planning.dynamic).toContain('CHẾ ĐỘ LÊN KẾ HOẠCH')
    expect(planning.dynamic).not.toContain('WORD LIMIT - REPLY DAU TIEN')
    expect(planning.dynamic).not.toContain('WORD LIMIT - CO CONTEXT')
    expect(planning.dynamic).not.toContain('Cau cuoi phai la follow-up question')
    expect(planning.dynamic).not.toContain('toi da 150 tu')
    // The ≤1-question closing rule still applies — it does not conflict with a plan.
    expect(planning.dynamic).toContain('TOI DA MOT dau hoi')
  })

  it('the planning block is the LAST instruction in the dynamic segment, after the pick/closing blocks, with the pre-send check', () => {
    const d = planning.dynamic
    const plan = d.indexOf('CHẾ ĐỘ LÊN KẾ HOẠCH')
    expect(plan).toBeGreaterThan(d.indexOf('BUDGET FILTER - LUAT BAT BUOC'))
    expect(plan).toBeGreaterThan(d.indexOf('TOI DA MOT dau hoi'))
    expect(d.indexOf('KIEM TRA KE HOACH')).toBeGreaterThan(plan)
    expect(d.trimEnd().endsWith('never to the block itself.)')).toBe(true)
    expect(normal.dynamic).not.toContain('KIEM TRA KE HOACH')
  })

  it('non-planning turns keep the word limit exactly as before', () => {
    expect(normal.dynamic).toContain('WORD LIMIT - REPLY DAU TIEN')
    expect(normal.dynamic).toContain('Cau cuoi phai la follow-up question')
    expect(followUp.dynamic).toContain('WORD LIMIT - CO CONTEXT')
    expect(normal.dynamic).not.toContain('CHẾ ĐỘ LÊN KẾ HOẠCH')
  })

  it('the cached rulebook is byte-identical with and without planning', () => {
    expect(planning.shared).toBe(normal.shared)
    expect(planning.shared).not.toContain('CHẾ ĐỘ LÊN KẾ HOẠCH')
  })
})

describe('🚨 the planning block: total budget, real data, named activities, no cuisine question', () => {
  const block = buildPlanningBlock('evening', 'vi', { totalBudget: 5_000_000, activities: ['restaurant', 'bar'] })

  it('states the TOTAL budget and the arithmetic rule, and forbids invented prices', () => {
    expect(block).toContain('TỔNG NGÂN SÁCH của cả kế hoạch: 5.000.000 VND')
    expect(block).toContain('TỔNG cost_breakdown PHẢI ≤ budget_total')
    expect(block).toContain('KHÔNG bịa giá')
    expect(block).toContain('chưa có giá')
    expect(block).toContain('còn dư')
  })

  it('lists exactly the searches for the named activities — restaurant + bar — and no others', () => {
    expect(block).toContain('search_places (type=restaurant)')
    expect(block).toContain('search_places (type=bar)')
    expect(block).not.toContain('type=spa')
    expect(block).not.toContain('type=cinema')
    expect(block).not.toContain('get_hotel_prices')
    expect(block).toContain('SONG SONG')
    expect(block).toContain('Không dùng search_products')
  })

  it('grounds hours and decision fields in tool data', () => {
    expect(block).toContain('opening_hours / open_now')
    expect(block).toContain('KHÔNG khẳng định quán mở/đóng')
    expect(block).toContain('google_rating')
    expect(block).toContain('distance_km')
  })

  it('forbids the cuisine clarification and names the default priority', () => {
    expect(block).toContain('KHÔNG HỎI LẠI KHI ĐÃ ĐỦ')
    expect(block).toContain('bạn muốn ăn loại gì')
    expect(block).toContain('MEMORY và PREFERENCES')
    expect(block).toContain('ĐÚNG MỘT câu')
  })

  it('falls back to the plan type defaults when no activity is named, and lists every named one', () => {
    expect(buildPlanningBlock('evening', 'vi')).toContain('type=restaurant')
    expect(buildPlanningBlock('evening', 'vi')).toContain('type=bar')
    expect(buildPlanningBlock('trip', 'vi')).toContain('get_hotel_prices')
    expect(buildPlanningBlock('trip', 'vi')).toContain('type=attraction')
    const three = buildPlanningBlock('evening', 'vi', { activities: ['restaurant', 'cinema', 'bar'] })
    for (const t of ['restaurant', 'cinema', 'bar']) expect(three).toContain(`type=${t}`)
    expect(buildPlanningBlock('evening', 'vi', { totalBudget: null })).toContain('user chưa nêu — KHÔNG bịa')
  })

  it('keeps the [TAPPY_PLAN] schema the clients already parse', () => {
    expect(block).toContain('[TAPPY_PLAN]')
    expect(block).toContain('"type":"evening"')
    for (const key of ['"title"', '"people"', '"budget_total"', '"days"', '"items"', '"time"', '"emoji"', '"category"', '"name"', '"description"', '"price"', '"address"', '"maps_link"', '"booking_link"', '"place_id"', '"cost_breakdown"', '"share_text"']) {
      expect(block).toContain(key)
    }
    expect(block).not.toMatch(/"rating"\s*:|"opening_hours"\s*:/) // no new fields
  })
})

describe('planning trigger — Vietnamese and English planning language', () => {
  it.each([
    [BUG, 'evening'],
    ['Lập kế hoạch đi chơi cuối tuần', 'trip'],
    ['lên kế hoạch ăn tối rồi xem phim tối nay', 'evening'],
    ['lập plan cho 2 người tối nay', 'evening'],
    ['lên plan ăn uống hôm nay', 'evening'],
    ['giúp tôi sắp xếp tối nay đi đâu làm gì', 'evening'],
    ['sắp xếp cuối tuần này đi đâu', 'trip'],
    ['lịch trình 2 ngày ở Đà Lạt', 'trip'],
    ['itinerary Đà Nẵng 3 ngày', 'trip'],
    ['Tìm chỗ ăn, chỗ chơi và tối ưu trong 5 triệu', 'evening'],
    ['Lập kế hoạch du lịch 3 ngày Đà Nẵng', 'trip'],
    ['Đà Nẵng 2 ngày: khách sạn + ăn', 'trip'],
    ['plan an evening out in Saigon for 2, budget 5 million', 'evening'],
    ['plan a night out in Hanoi', 'evening'],
    ['plan a weekend in Da Nang', 'trip'],
    ['plan a trip to Phu Quoc', 'trip'],
    ['create an itinerary for tonight', 'evening'],
    ['help me plan for 2 people tonight', 'evening'],
    ['help me plan a 3 day trip', 'trip'],
  ])('%s → %s', (text, expected) => {
    expect(detectPlanningIntent(text)).toBe(expected)
  })

  it.each([
    'Tìm quán ăn tối nay',
    'Mua điện thoại 20 triệu',
    'Giá vàng hôm nay',
    'Tìm khách sạn Đà Nẵng',
    'Ăn tối rồi mua quà 2 triệu',
    'Mua laptop + tai nghe trong 25 triệu',
    'budget 3 triệu thôi',
    'cafe view đẹp quận 1',
    // The bare noun is not a request — caught by the pre-commit audit 2026-09-14.
    'kế hoạch của Vingroup năm nay là gì',
    'lịch trình xe buýt số 8',
    'itinerary là gì',
  ])('not a plan request: %s', (text) => {
    expect(detectPlanningIntent(text)).toBeNull()
  })

  it('a short planning ask no longer reads as a "simple" query (it would run on the fast model)', () => {
    // isSimpleQuery is unchanged; the route routes on planningIntent FIRST, so
    // the pin is that the intent fires for the shapes that used to slip through.
    expect(isSimpleQuery('Lập kế hoạch đi chơi cuối tuần', true)).toBe(true)
    expect(detectPlanningIntent('Lập kế hoạch đi chơi cuối tuần')).toBe('trip')
    expect(classifyIntent(BUG)).toBe('tool')
  })
})

describe('multi-domain request decomposition (deterministic layer)', () => {
  it('the bug case: evening plan, HCMC, total 5,000,000, restaurant + bar, places domain, no shopping', () => {
    expect(detectPlanningIntent(BUG)).toBe('evening')
    expect(extractPlanTotalBudget(BUG)).toBe(5_000_000)
    expect(detectPlanActivities(BUG)).toEqual(['restaurant', 'bar'])
    expect(detectForcedTool(BUG)).not.toBe('search_products')
    const need = deriveNeedProfile(msgs(BUG), { storedPreferences: null, gps: null })
    expect(need.domain).toBe('places')
    expect(need.location.text).toBe('sai gon')
    expect(need.budget?.max).toBe(5_000_000)
  })

  it.each([
    ['ăn tối rồi xem phim', ['restaurant', 'cinema']],
    ['ăn + xem phim + đi bar tối nay', ['restaurant', 'cinema', 'bar']],
    ['spa rồi ăn tối', ['spa', 'restaurant']],
    ['cafe chill rồi đi bar', ['cafe', 'bar']],
    ['Đà Nẵng 2 ngày: khách sạn + ăn', ['hotel', 'restaurant']],
    ['tham quan Hội An và ăn hải sản', ['attraction', 'restaurant']],
  ])('%s → %s', (text, expected) => {
    expect(detectPlanActivities(text)).toEqual(expected)
  })

  it('English: dinner and dancing → restaurant + bar ("night out" is itself a bar cue, so order follows the words)', () => {
    expect([...detectPlanActivities('plan a night out: dinner and dancing')].sort()).toEqual(['bar', 'restaurant'])
  })

  it('"nhảy múa" is dancing, not buying: no search_products, and nightlife resolves to places', () => {
    expect(detectForcedTool('nhảy múa')).not.toBe('search_products')
    expect(detectForcedTool('đi nhảy múa tối nay')).not.toBe('search_products')
    expect(detectForcedTool('mua điện thoại')).toBe('search_products')
    expect(detectForcedTool('Mua laptop + tai nghe trong 25 triệu')).toBe('search_products')
    expect(deriveNeedProfile(msgs('đi nhảy múa tối nay ở Sài Gòn'), { storedPreferences: null, gps: null }).domain).toBe('places')
    expect(deriveNeedProfile(msgs('night out in Saigon'), { storedPreferences: null, gps: null }).domain).toBe('places')
  })
})

describe('total budget of a plan', () => {
  it.each([
    ['budget 5 triệu', 5_000_000],
    ['trong 5 triệu', 5_000_000],
    ['tầm 5 triệu', 5_000_000],
    ['dưới 5 triệu', 5_000_000],
    ['20 triệu', 20_000_000],
    ['5 triệu cho 2 người', 5_000_000],
    ['ngân sách 1.500.000đ', 1_500_000],
    ['budget 5 million for 2', 5_000_000],
    ['500k thôi', 500_000],
    ['tối nay đi chơi 2 người', null],
    ['3 ngày 2 đêm', null],
  ])('%s → %s', (text, expected) => {
    expect(extractPlanTotalBudget(text)).toBe(expected)
  })

  it('does not change the per-item extractor other turns rely on', () => {
    expect(extractBudget('Mua điện thoại 20 triệu')).toBeNull()
    expect(extractBudget('dưới 5 triệu')?.max).toBe(5_000_000)
    expect(extractBudget(BUG)).toEqual({ min: 0, max: 5_000_000, type: 'under' })
  })
})
