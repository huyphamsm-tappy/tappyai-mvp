// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { discoveryGate } from './discoveryGate'

const g = (userTexts: string[], hasGps = false, planningIntent: string | null = null, lang = 'vi') => discoveryGate({ userTexts, hasGps, planningIntent, lang })
const OPEN = 'nay có gì dzui ko pa'

describe('discoveryGate — a vague discovery opener is asked about first', () => {
  it('"nay có gì dzui ko pa", no location → ONE question about where AND what', () => {
    const v = g([OPEN])!
    expect(v).toMatchObject({ action: 'ask', kind: 'where_and_what', threadTurns: 1 })
    expect(v.note).toContain('KHÔNG gọi công cụ nào')
    expect(v.note).toContain('khu vực nào')
  })
  it('the same opener with a location (GPS) → only what / with whom', () => {
    const v = g([OPEN], true)!
    expect(v).toMatchObject({ action: 'ask', kind: 'what' })
    expect(v.note).not.toContain('khu vực nào')
    expect(v.note).toContain('đi với ai')
  })
  it('other openers of the same shape are caught', () => {
    for (const t of ['nay có gì dzui ko', 'nay có gì vui hok', 'tối nay đi đâu chơi', 'cuối tuần làm gì cho vui', 'chơi gì giờ ta', 'có gì chơi ko', 'hôm nay có chỗ nào vui không']) expect(g([t])?.action, t).toBe('ask')
  })
  it('the note forbids guessing tastes and suggesting places (the live case: "hợp đi chơi nhẹ mà vẫn có cái để quậy")', () => {
    const n = g([OPEN])!.note
    expect(n).toContain('KHÔNG đoán hay nhận xét sở thích')
    for (const w of ['chơi nhẹ', 'xõa', 'quậy', 'chill']) expect(n).toContain(w) // named only inside the prohibition
    expect(n).toContain('không gợi ý địa điểm')
    expect(g([OPEN], false, null, 'en')!.note).toContain('Do NOT guess')
  })
})

describe('discoveryGate — the thread: replies, the escape, the limit of two questions', () => {
  it('(c) the user answers only a place → still not searched: ask what', () => {
    const v = g([OPEN, 'TP.HCM'])!
    expect(v).toMatchObject({ action: 'ask', kind: 'what_again', threadTurns: 2 })
    expect(v.note).toContain('Đây là câu hỏi cuối')
  })
  it('(c) only the company ("đi nhóm") → still ask what', () => {
    expect(g([OPEN, 'đi nhóm bạn'], true)).toMatchObject({ action: 'ask', kind: 'what_again' })
  })
  it('(d) the user names an activity → search at once (no verdict)', () => {
    expect(g([OPEN, 'chơi game / bida'])).toBeNull()
    expect(g([OPEN, 'TP.HCM, thích chơi game/bida.'])).toBeNull()
    expect(g([OPEN, 'xem phim'])).toBeNull()
  })
  it('(e) still vague after two questions → search with the assumption said out loud; never a third question', () => {
    const v = g([OPEN, 'TP.HCM', 'gì cũng được'])!
    expect(v).toMatchObject({ action: 'assume', kind: null })
    expect(v.note).toContain('KHÔNG hỏi thêm')
    expect(v.note).toContain('giả định')
    expect(g([OPEN, 'gì cũng được', 'tùy'])!.action).toBe('assume')
  })
  it('a longer message or a question after the opener is a NEW topic: the gate steps aside', () => {
    expect(g([OPEN, 'biết tesla ko'])).toBeNull()
    expect(g([OPEN, 'mình đang phân vân giữa học tiếng Nhật hay tiếng Hàn nữa'])).toBeNull()
  })
  it('an opener older than three messages is not a thread of this turn', () => {
    expect(g([OPEN, 'a', 'b', 'c', 'd'])).toBeNull()
  })
})

describe('discoveryGate — a clear request is never asked anything', () => {
  it('(d) "tìm quán chay Quận 1 dưới 200k" and similar: no gate', () => {
    for (const t of ['tìm quán chay Quận 1 dưới 200k', 'quán cà phê yên tĩnh gần đây', 'phim đang chiếu hôm nay', 'tối nay có phim gì hay', 'chỗ chơi bida ở quận 3', 'có gì vui ở cgv', 'đi đâu chơi game tối nay']) expect(g([t]), t).toBeNull()
  })
  it('enough need + area + time → no extra question', () => {
    expect(g(['tối nay tìm chỗ chơi bida ở quận 3 dưới 150k'])).toBeNull()
  })
  it('a trip request is the trip flow\'s business, not this gate\'s', () => {
    expect(g(['cuối tuần đi đâu chơi du lịch Đà Lạt'])).toBeNull()
    expect(g([OPEN], true, 'trip')).toBeNull()
  })
  it('ordinary chat and other questions are untouched', () => {
    for (const t of ['xin chào', 'biết tesla ko', 'giá xăng RON 95 hôm nay', 'nay có gì mới trong tin tức']) expect(g([t]), t).toBeNull()
    expect(g([])).toBeNull()
  })
})
