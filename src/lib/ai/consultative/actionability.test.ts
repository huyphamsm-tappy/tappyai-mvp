import { describe, it, expect } from 'vitest'
import { assessActionability, isClarifyReply } from './actionability'

/**
 * Item 1.0 — the 40 eval queries, classified and FROZEN. Eval runs with GPS (`--loc`), so the
 * area is always known. Follow-ups (F5 F6 S3 T3 P3 E4) inherit their parent and are not gated on
 * their own.
 *
 * RE-FROZEN 2026-09-28 (owner, "answer first, ask after"): a request with a KIND of service and an
 * area is searched; a missing budget / party size is asked at the end of the answer, never before.
 * Only truly vague requests are asked first: no kind of service (S5 a gift with no product, S6
 * "mua gì bây giờ", T5 "đi chơi ở đâu", E5 "cuối tuần làm gì") or no area at all. F7 "ăn gì ngon
 * giờ", P5 "massage", P7 "gội đầu dưỡng sinh gần đây" and E2 "rap phim nao gan q1" moved from N to
 * A — the golden set failed 6 cases on the old rule (G1b "Tối nay đi xem phim ở rạp nào gần Quận 7"
 * got "Tầm giá? Mấy người?" and no cards).
 */
const CLASS: Record<string, ['A' | 'N', string]> = {
  F1: ['A', 'Tìm quán ăn tối ngon gần Quận 1 cho 2 người'],
  F2: ['A', 'tim quan bun bo ngon o q1 duoi 80k'],
  F3: ['A', 'Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?'],
  F4: ['A', 'Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận'],
  F7: ['A', 'ăn gì ngon giờ'],
  F8: ['A', 'Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1'],
  S1: ['A', 'Mua tai nghe bluetooth dưới 1 triệu, pin trâu'],
  S2: ['A', 'mua laptop van phong duoi 15tr'],
  S4: ['A', 'Robot hút bụi cho nhà có chó, tầm 5-7 triệu'],
  S5: ['N', 'quà sinh nhật cho bạn gái tầm 1tr'],
  S6: ['N', 'mua gì bây giờ'],
  S7: ['A', 'Máy lọc không khí cho phòng ngủ 20m2'],
  S8: ['A', 'Nồi chiên không dầu 5L loại nào tốt'],
  T1: ['A', 'Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu'],
  T2: ['A', 'khach san da nang gan bien duoi 1tr/dem'],
  T4: ['A', 'Cuối tuần này gia đình 4 người đi đâu gần Sài Gòn?'],
  T5: ['N', 'đi chơi ở đâu'],
  T6: ['A', 'Hội An có gì hay, đi 1 ngày'],
  T7: ['A', 'Vé máy bay Sài Gòn Hà Nội tuần sau rẻ nhất'],
  T8: ['A', 'Resort Phú Quốc cho kỷ niệm 1 năm, sang chút'],
  P1: ['A', 'Spa nào tốt rẻ ở Đà Nẵng'],
  P2: ['A', 'spa massage chan gan q1 duoi 300k'],
  P4: ['A', 'Đi spa với mẹ cuối tuần, chỗ nào yên tĩnh sạch sẽ Quận 7'],
  P5: ['A', 'massage'],
  P6: ['A', 'Spa couple cho 2 người tối nay gần Quận 1'],
  P7: ['A', 'gội đầu dưỡng sinh gần đây'],
  P8: ['A', 'Spa nào mở khuya sau 22h ở Quận 3'],
  E1: ['A', 'Tối nay đi chơi gì với hội bạn 5 người ở Quận 1'],
  E2: ['A', 'rap phim nao gan q1'],
  E3: ['A', 'quán bar nào chill có nhạc sống Quận 1'],
  E5: ['N', 'cuối tuần làm gì'],
  E6: ['A', 'Karaoke cho 10 người tầm 100k/người Gò Vấp'],
  E7: ['A', 'Xem phim gì hay tối nay'],
  E8: ['A', 'Chỗ chơi cho trẻ em 5 tuổi cuối tuần ở Sài Gòn'],
}

const assess = (text: string, opts: { gps?: boolean; lang?: string; last?: string | null; movie?: boolean } = {}) =>
  assessActionability({ messages: [{ role: 'user', content: text }], hasGps: opts.gps ?? true, lang: opts.lang ?? 'vi', lastAssistantText: opts.last ?? null, movieRecommend: opts.movie ?? false })

describe('item 1.0 — the frozen classification of the 40 eval queries (GPS known)', () => {
  const counts = { A: 0, N: 0 }
  for (const [id, [cls, text]] of Object.entries(CLASS)) {
    counts[cls]++
    it(`${id} is ${cls === 'A' ? 'ACTIONABLE' : 'NOT actionable'} — ${text}`, () => {
      const r = assess(text, { movie: id === 'E7' })
      expect(r.actionable, JSON.stringify({ domain: r.domain, signals: r.signals, missing: r.missing })).toBe(cls === 'A')
    })
  }
  it('counts: 30 actionable, 4 not, 6 follow-ups (34 classified here)', () => {
    expect(counts).toEqual({ A: 30, N: 4 })
  })
})

describe('the clarify turn', () => {
  // Re-frozen 2026-09-28 (owner, "answer first, ask after").
  it('answer first: a kind + GPS is searched; the missing budget is ONE question for the end of the answer', () => {
    const r = assess('ăn gì ngon giờ')
    expect(r.actionable).toBe(true)
    expect(r.reply).toBeNull()
    expect(r.askAfter).toEqual({ q: 'Tầm giá?', options: ['dưới 100k/người', '100–200k/người', 'trên 200k/người'] })
  })
  it('with a budget stated, the one question after the answer is the party size; with both, none', () => {
    expect(assess('ăn gì ngon giờ dưới 100k').askAfter?.q).toBe('Mấy người?')
    expect(assess('ăn gì ngon giờ dưới 100k cho 2 người').askAfter ?? null).toBeNull()
  })
  it('without GPS or a named area it asks ONLY the area first, offering only "gần tôi"', () => {
    const r = assess('quán bún bò ngon', { gps: false })
    expect(r.actionable).toBe(false)
    expect(r.missing).toEqual(['area'])
    expect(r.questions).toEqual([{ q: 'Bạn ở khu nào?', options: ['Gần tôi'] }])
    expect(r.reply).toMatch(/^Để chọn đúng chỗ, mình cần biết thêm:\n• Bạn ở khu nào\? \(Gần tôi\)\n/)
    expect(isClarifyReply(r.reply)).toBe(true)
  })
  it('no kind of service ("đi chơi ở đâu") is asked first, with the kind options as chips', () => {
    const r = assess('đi chơi ở đâu')
    expect(r.actionable).toBe(false)
    expect(r.missing).toEqual(['subject'])
    expect(r.reply).toMatch(/\[FOLLOWUPS\]ăn uống\|đi chơi \/ giải trí\|spa & làm đẹp\[\/FOLLOWUPS\]$/)
  })
  it('a generic outing WITH a signal is searched ("đi chơi gì với hội bạn 5 người ở Quận 1")', () => {
    expect(assess('Tối nay đi chơi gì với hội bạn 5 người ở Quận 1').actionable).toBe(true)
  })
  it('shopping without a product asks for the product, no chips', () => {
    const r = assess('mua gì bây giờ')
    expect(r.actionable).toBe(false)
    expect(r.missing).toEqual(['subject'])
    expect(r.reply).toBe('Để chọn đúng, mình cần biết:\n• Bạn muốn mua món gì?\nBạn trả lời phần nào cũng được, phần còn lại mình tự giả sử và nói rõ.')
  })
  it('never asks twice in a row: after a clarify, the turn proceeds even when the answer is partial', () => {
    const first = assess('ăn gì ngon giờ', { gps: false })
    expect(first.actionable).toBe(false)
    const r = assessActionability({
      messages: [{ role: 'user', content: 'ăn gì ngon giờ' }, { role: 'assistant', content: first.reply }, { role: 'user', content: '2 người' }],
      hasGps: false, lang: 'vi', lastAssistantText: first.reply,
    })
    expect(r.actionable).toBe(true)
  })
  it('an answer that carries the signal makes the thread actionable on its own too', () => {
    const r = assessActionability({
      messages: [{ role: 'user', content: 'ăn gì ngon giờ' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'dưới 100k/người' }],
      hasGps: true, lang: 'vi', lastAssistantText: 'x',
    })
    expect(r.actionable).toBe(true)
  })
  it('english wording', () => {
    expect(assess('where to eat', { lang: 'en' }).askAfter?.q).toBe('Budget?')
    const r = assess('where to eat', { lang: 'en', gps: false })
    expect(r.actionable).toBe(false)
    expect(r.reply).toMatch(/^To pick the right place, I need a little more:\n• Which area\? \(Near me\)/)
  })
})

// ── Phase D (2026-09-20): a question about a NAMED venue is never clarified ──
describe('Phase D — a named cinema question is actionable as asked', () => {
  it('measured live (run 22): the showtime question was answered with "Tầm giá? Mấy người?"', () => {
    for (const gps of [true, false]) {
      const r = assess('tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao nhiêu?', { gps })
      expect(r.actionable).toBe(true)
      expect(r.reply).toBeNull()
    }
  })
  // Re-frozen 2026-09-28 (owner): a cinema kind + an area is searched straight away (golden G1b, c40 E2).
  it('a cinema KIND with an area is searched, not gated', () => {
    expect(assess('rạp chiếu phim nào gần đây?').actionable).toBe(true)
    expect(assess('Tối nay đi xem phim ở rạp nào gần Quận 7', { gps: false }).actionable).toBe(true)
  })
})

describe('Phase D — a rare city-scale venue kind is actionable as asked', () => {
  it('measured live (run 27): the aquarium question was answered with "Tầm giá? Mấy người?"', () => {
    expect(assess('thủy cung nào ở Sài Gòn đáng đi cuối tuần này, giá vé sao?').actionable).toBe(true)
    expect(assess('công viên nước nào ở Sài Gòn hợp cho gia đình có trẻ em?').actionable).toBe(true)
  })
})

// ── E3 (2026-09-20, measured gate FK1 / SK1 / PK2 / FP1): named venues and named-but-unknown products ──
describe('E3 — a question about a NAMED venue, and a product the lexicon does not know, are actionable', () => {
  it.each([
    'quán Cơm Tấm Ba Ghiền Đặng Văn Ngữ mở đến mấy giờ?',
    'Sả Spa Quận 1 mở cửa đến mấy giờ, có cần đặt lịch không?',
    'CellphoneS Nguyễn Trãi Quận 5 mở cửa mấy giờ?',
    'Thế Giới Di Động gần Quận 1 mấy giờ đóng cửa tối nay?',
  ])('%s → no canned clarify', (text) => {
    const r = assess(text, { gps: false })
    expect(r.actionable).toBe(true)
    expect(r.reply).toBeNull()
  })
  it('"mua bánh trung thu Kinh Đô online, hộp 4 bánh" names its product (unknownType) — no "mua món gì?"', () => {
    const r = assess('mua bánh trung thu Kinh Đô online, hộp 4 bánh')
    expect(r.actionable).toBe(true)
  })
  it('"mua gì bây giờ" still asks', () => {
    expect(assess('mua gì bây giờ').actionable).toBe(false)
  })
})

describe('E3 — a buy-verb message naming an unknown product is actionable even with a venue noun in it', () => {
  it('"mua tinh dầu massage body chính hãng online" is not clarified (measured PP2)', () => {
    expect(assess('mua tinh dầu massage body chính hãng online').actionable).toBe(true)
  })
})

// UAT4 golden with V1 on (27 Sep 2026): purchase ADVICE questions were clarified ("Bạn muốn mua món gì?")
// or turned into a product pick. They are answered — no clarify, no product directive.
import { deriveDecisionFrame } from './decisionFrame'
import { deriveNeedProfile } from './needProfile'
import { deriveSituation } from './situationFrame'
import { deriveSearchNow } from './searchNow'
describe('purchase advice is answered, not clarified or searched (golden G5b / G5c / G5d)', () => {
  for (const text of ['mua đồ cũ trên group Facebook thì lưu ý gì', 'mua xe máy cũ Honda Wave cần kiểm tra gì', 'mua ô tô cũ tầm 300 triệu cần check gì']) {
    it(text, () => {
      const messages = [{ role: 'user', content: text }]
      expect(assessActionability({ messages, hasGps: true, lang: 'vi', lastAssistantText: null }).actionable).toBe(true)
      const need = deriveNeedProfile(messages, { gps: { lat: 10.77, lng: 106.7 } })
      const frame = deriveDecisionFrame({ messages, need, planningIntent: null, forcedTool: null, hasGps: true, storedPreferences: null, now: new Date('2026-09-27T05:00:00Z') })
      expect(frame.goal).toBe('inform')
      const situation = deriveSituation([text], need, { hasGps: true })
      expect(deriveSearchNow({ text, situation, frame, need, forcedTool: null, isFirstReply: true, movieRecommend: false })).toBeNull()
    })
  }
  it('a real purchase request is still a product request', () => {
    const messages = [{ role: 'user', content: 'mua xe máy cũ Honda Wave dưới 15 triệu' }]
    const need = deriveNeedProfile(messages, { gps: null })
    expect(deriveDecisionFrame({ messages, need, planningIntent: null, forcedTool: null, hasGps: false, storedPreferences: null, now: new Date('2026-09-27T05:00:00Z') }).goal).not.toBe('inform')
  })
})

// UAT4 c40 T3 with V1 on: a follow-up about an answered hotel was cut as a new FOOD consultation.
import { turnStartsNewConsultation } from './actionability'
describe('a follow-up pointing back at an answered item continues the consultation (c40 T3)', () => {
  const hotelThread = [
    { role: 'user', content: 'Khách sạn Đà Nẵng gần biển dưới 1 triệu/đêm' },
    { role: 'assistant', content: 'Mình chọn Khách sạn A. Ngoài ra có Khách sạn B và Khách sạn C.' },
  ]
  it('"Cái thứ hai có bao gồm ăn sáng không?" is not a new (food) consultation, and is not clarified', () => {
    const messages = [...hotelThread, { role: 'user', content: 'Cái thứ hai có bao gồm ăn sáng không?' }]
    expect(turnStartsNewConsultation({ messages, hasGps: true, lang: 'vi' })).toBe(false)
    expect(assessActionability({ messages, hasGps: true, lang: 'vi', lastAssistantText: hotelThread[1].content }).actionable).toBe(true)
  })
  it('a real switch to food is still a new consultation', () => {
    const messages = [...hotelThread, { role: 'user', content: 'giờ tìm quán ăn sáng ngon gần đây' }]
    expect(turnStartsNewConsultation({ messages, hasGps: true, lang: 'vi' })).toBe(true)
  })
})

// UAT4 golden M4 with V1 on: a named hair dryer was answered with "Bạn muốn mua món gì?" ("máy" folds to "may" = "mấy").
describe('a machine is a product (golden M4 turn 2)', () => {
  it('"tiện mua máy sấy tóc Philips dưới 1 triệu" — alone and after a spa turn — is not clarified', () => {
    const t2 = { role: 'user', content: 'tiện mua máy sấy tóc Philips dưới 1 triệu' }
    for (const messages of [[t2], [{ role: 'user', content: 'spa massage chân ở Phú Nhuận dưới 300k' }, { role: 'assistant', content: 'Mình tìm được 10 spa.' }, t2]]) {
      const r = assessActionability({ messages, hasGps: true, lang: 'vi', lastAssistantText: null })
      expect(r.actionable, JSON.stringify(r.missing)).toBe(true)
    }
  })
  it('"mua mấy cái gì" and a bare "mua gì bây giờ" still ask for the product', () => {
    expect(assessActionability({ messages: [{ role: 'user', content: 'mua mấy cái gì giờ' }], hasGps: true, lang: 'vi', lastAssistantText: null }).actionable).toBe(false)
    expect(assessActionability({ messages: [{ role: 'user', content: 'mua gì bây giờ' }], hasGps: true, lang: 'vi', lastAssistantText: null }).actionable).toBe(false)
  })
})

// Answer first (2026-09-28): an area the user's memory or profile holds answers the only ask-first case left.
import { memorySignal } from './actionability'
describe('memory / profile area unblocks the no-area clarify', () => {
  const noArea = assessActionability({ messages: [{ role: 'user', content: 'quán bún bò ngon' }], hasGps: false, lang: 'vi', lastAssistantText: null })
  it('memory.location_base, then the profile city; nothing ⇒ still asked', () => {
    expect(noArea.missing).toEqual(['area'])
    expect(memorySignal({ location_base: 'Quận 3' }, null, noArea)).toBe('memory.location_base')
    expect(memorySignal(null, null, noArea, 'TP.HCM')).toBe('profile.city')
    expect(memorySignal({ location_base: null, budget: { food: { min: 0, max: 100000 } } }, null, noArea)).toBeNull()
  })
})
