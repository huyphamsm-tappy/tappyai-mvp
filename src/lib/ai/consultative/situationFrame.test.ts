import { describe, it, expect } from 'vitest'
import { deriveSituation, buildSituationBlock } from './situationFrame'

// Consultative V1 §1 — the situation frame is read from the user's OWN words,
// diacritics or not, slang included; whatever was not said is an ASSUMPTION the
// reply must state, never a question it must ask.

const need = (budget: unknown = null, location: string | null = null) =>
  ({ budget: budget as never, location: { text: location, gps: null } })

describe('deriveSituation — who / occasion / time / mood / hard, accented and folded alike', () => {
  const cases: Array<[string, Partial<ReturnType<typeof deriveSituation>>]> = [
    ['Tìm quán ăn tối ngon gần Quận 1 cho 2 người', { who: 'couple', partySize: 2, time: 'tonight' }],
    ['tim quan an toi ngon gan quan 1 cho 2 nguoi', { who: 'couple', partySize: 2, time: 'tonight' }],
    ['đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh', { who: 'couple', occasion: 'date', time: 'tonight', mood: 'romantic', hard: ['quiet'] }],
    ['di date voi gau toi nay cho nao lang man yen tinh', { who: 'couple', occasion: 'date', mood: 'romantic', hard: ['quiet'] }],
    ['sinh nhật sếp, tiếp khách 8 người, cần phòng riêng', { who: 'colleagues', partySize: 8, occasion: 'birthday', hard: ['private_room'] }],
    ['ăn trưa nhanh gần công ty 1 mình', { who: 'solo', time: 'lunch', occasion: 'quick_bite' }],
    ['cả nhà đi ăn cuối tuần có con nít, có chỗ đậu xe', { who: 'family', occasion: 'family_meal', time: 'weekend', hard: ['parking', 'kids'] }],
    ['hội bạn 6 đứa đi nhậu khuya', { who: 'friends', partySize: 6, time: 'late_night', occasion: 'hangout' }],
    ['quán chay bình dân gần đây', { hard: ['vegetarian'], mood: 'cheap_good' }],
    ['rooftop bar sôi động có nhạc sống', { hard: ['outdoor', 'live_music'], mood: 'lively' }],
    ['cafe view đẹp chill ngày mai', { hard: ['view'], mood: 'chill', time: 'tomorrow', occasion: 'hangout' }],
    ['kỷ niệm 1 năm với người yêu, sang trọng chút', { who: 'couple', occasion: 'celebration', mood: 'fancy' }],
    ['quán mở khuya có máy lạnh giao tận nơi', { hard: ['late_open', 'delivery', 'air_con'] }],
    ['dinner for 4 people tonight, quiet place with parking', { who: 'friends', partySize: 4, time: 'tonight', hard: ['quiet', 'parking'] }],
    ['family lunch with kids this weekend', { who: 'family', time: 'lunch', hard: ['kids'] }],
    ['romantic date night, fancy', { occasion: 'date', mood: 'romantic' }],
  ]
  it.each(cases)('"%s"', (text, expected) => {
    const frame = deriveSituation([text], need())
    for (const [k, v] of Object.entries(expected)) {
      expect(frame[k as keyof typeof frame], k).toEqual(v)
    }
  })

  it('"cho tôi 3 quán bún bò" is not a party of three, and "tôi" is not tonight', () => {
    const frame = deriveSituation(['cho toi 3 quan bun bo ngon o q1'], need())
    expect(frame.partySize).toBeNull()
    expect(frame.time).toBeNull()
  })

  it('"quán nào hợp" is not a business meeting', () => {
    expect(deriveSituation(['quán nào hợp để ăn tối'], need()).occasion).toBeNull()
  })
})

describe('deriveSituation — multi-turn window and assumptions', () => {
  it('"cho 2 người" on turn 1 still holds on turn 3; the newest statement of a field wins', () => {
    const frame = deriveSituation(['tìm quán ăn cho 2 người', 'gần quận 1', 'thôi đổi qua trưa mai đi'], need())
    expect(frame.partySize).toBe(2)
    expect(frame.who).toBe('couple')
    expect(frame.time).toBe('tomorrow')
  })
  it('outside the window an old statement no longer holds', () => {
    const frame = deriveSituation(['cho 2 người', 'a', 'b', 'c'], need())
    expect(frame.partySize).toBeNull()
  })
  it('nothing said ⇒ every field is an assumption and confidence is 0', () => {
    const frame = deriveSituation(['quán ăn ngon'], need())
    expect(frame.assumptions).toEqual(['1-2 người', 'đi trong hôm nay', 'tầm giá phổ thông', 'khu vực gần bạn'])
    expect(frame.confidence).toBe(0)
  })
  it('everything stated ⇒ no assumptions and confidence 1', () => {
    const frame = deriveSituation(['2 người tối nay dưới 500k gần đây'], need({ max: 500000 }))
    expect(frame.assumptions).toEqual([])
    expect(frame.confidence).toBe(1)
    expect(frame.place.nearMe).toBe(true)
  })
  it('GPS counts as "near me"; a stated city counts as a place', () => {
    expect(deriveSituation(['quán ăn'], need(), { hasGps: true }).place.nearMe).toBe(true)
    expect(deriveSituation(['quán ăn'], need(null, 'Đà Nẵng')).assumptions).not.toContain('khu vực gần bạn')
  })
})

describe('buildSituationBlock', () => {
  it('marks stated fields (user nói) and assumptions (giả sử), and never asks', () => {
    const block = buildSituationBlock(deriveSituation(['đi date tối nay 2 người'], need()))
    expect(block).toContain('===== TINH HUONG (V1) =====')
    expect(block).toContain('Ai đi: đi 2 người / cặp đôi (2 người) (user nói)')
    expect(block).toContain('Dịp: hẹn hò (user nói)')
    expect(block).toContain('tầm giá phổ thông (giả sử')
    expect(block).toContain('khu vực gần bạn (giả sử')
    expect(block).not.toContain('đi trong hôm nay (giả sử')
  })
})
