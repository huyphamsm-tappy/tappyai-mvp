import { describe, it, expect } from 'vitest'
import { assessActionability, isClarifyReply } from './actionability'

/**
 * Item 1.0 — the 40 eval queries, classified and FROZEN. Eval runs with GPS (`--loc`), so the
 * area is always known and the verdict rests on "budget OR occasion OR stated constraint / mood".
 * A bare subject ("bún bò", "gội đầu") is not a signal (owner's example: "Quán bún bò ngon ở
 * TP.HCM" is too broad); time alone is not a signal. Follow-ups (F5 F6 S3 T3 P3 E4) inherit their
 * parent and are not gated on their own.
 */
const CLASS: Record<string, ['A' | 'N', string]> = {
  F1: ['A', 'Tìm quán ăn tối ngon gần Quận 1 cho 2 người'],
  F2: ['A', 'tim quan bun bo ngon o q1 duoi 80k'],
  F3: ['A', 'Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?'],
  F4: ['A', 'Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận'],
  F7: ['N', 'ăn gì ngon giờ'],
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
  P5: ['N', 'massage'],
  P6: ['A', 'Spa couple cho 2 người tối nay gần Quận 1'],
  P7: ['N', 'gội đầu dưỡng sinh gần đây'],
  P8: ['A', 'Spa nào mở khuya sau 22h ở Quận 3'],
  E1: ['A', 'Tối nay đi chơi gì với hội bạn 5 người ở Quận 1'],
  E2: ['N', 'rap phim nao gan q1'],
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
  it('counts: 26 actionable, 8 not, 6 follow-ups (34 classified here)', () => {
    expect(counts).toEqual({ A: 26, N: 8 })
  })
})

describe('the clarify turn', () => {
  it('asks at most 3 short questions with options, chips for the first multi-option question, no venue names', () => {
    const r = assess('ăn gì ngon giờ')
    expect(r.actionable).toBe(false)
    expect(r.missing).toEqual(['signal'])
    expect(r.questions.map(q => q.q)).toEqual(['Tầm giá?', 'Mấy người?'])
    expect(r.reply).toMatch(/^Để chọn đúng chỗ, mình cần biết thêm:\n• Tầm giá\? \(dưới 100k\/người \/ 100–200k\/người \/ trên 200k\/người\)\n• Mấy người\? \(1–2 người \/ 3–5 người \/ nhóm đông\)\n/)
    expect(r.reply).toMatch(/\[FOLLOWUPS\]dưới 100k\/người\|100–200k\/người\|trên 200k\/người\[\/FOLLOWUPS\]$/)
    expect(isClarifyReply(r.reply)).toBe(true)
  })
  it('without GPS or a named area it asks the area first, offering only "gần tôi"', () => {
    const r = assess('quán bún bò ngon ở TP.HCM', { gps: false })
    expect(r.actionable).toBe(false)
    expect(r.missing).toContain('signal')
    expect(r.questions[0]).toEqual({ q: 'Bạn ở khu nào?', options: ['Gần tôi'] })
    expect(r.questions.length).toBeLessThanOrEqual(3)
  })
  it('shopping without a product asks for the product, no chips', () => {
    const r = assess('mua gì bây giờ')
    expect(r.actionable).toBe(false)
    expect(r.missing).toEqual(['subject'])
    expect(r.reply).toBe('Để chọn đúng, mình cần biết:\n• Bạn muốn mua món gì?\nBạn trả lời phần nào cũng được, phần còn lại mình tự giả sử và nói rõ.')
  })
  it('never asks twice in a row: after a clarify, the turn proceeds even when the answer is partial', () => {
    const first = assess('ăn gì ngon giờ')
    const r = assessActionability({
      messages: [{ role: 'user', content: 'ăn gì ngon giờ' }, { role: 'assistant', content: first.reply }, { role: 'user', content: '2 người' }],
      hasGps: true, lang: 'vi', lastAssistantText: first.reply,
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
    const r = assess('where to eat', { lang: 'en' })
    expect(r.actionable).toBe(false)
    expect(r.reply).toMatch(/^To pick the right place, I need a little more:\n• Budget\?/)
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
  it('a cinema KIND with nothing else stated is still gated like any place pick', () => {
    expect(assess('rạp chiếu phim nào gần đây?').actionable).toBe(false)
  })
})
