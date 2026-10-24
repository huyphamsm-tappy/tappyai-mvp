// @vitest-environment node
// Round 3b-1 · Việc 3: the flight pattern for the aviation word "hàng không" (intent.ts) no longer matches "chính hãng không" / "còn hàng không"
// when ROUTE_FLIGHT_HANG_KHONG_GUARD is ON. OFF (the default) is the old behaviour; the OFF expectations for the round 3a cases are the results
// observed in round 3a (consultative-round3a/report.md, section 2), locked, not chosen.
// Scope: regression cases and a locked list of ambiguous cases, INCLUDING known wrong answers (marked KNOWN). These are NOT evidence about
// Vietnamese intent accuracy in general, and the rule is a hand-written phrase rule, not a general intent model.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectForcedTool, detectTravelIntent } from './intent'

const FLAG = 'ROUTE_FLIGHT_HANG_KHONG_GUARD'
const KEYS = [FLAG]
beforeEach(() => { for (const k of KEYS) delete process.env[k] })
afterEach(() => { for (const k of KEYS) delete process.env[k] })
const on = () => { process.env[FLAG] = '1' }

describe('OFF (default): the old behaviour, locked to the round 3a observations', () => {
  it('the two false positives of round 3a still go to get_flight_prices', () => {
    expect(detectForcedTool('iPhone 15 128GB trên Shopee có chính hãng không')).toBe('get_flight_prices')
    expect(detectForcedTool('Ốp lưng iPhone 16 Pro Max UAG trên Tiki còn hàng không')).toBe('get_flight_prices')
  })
  it('the two other round 3a cases keep their result', () => {
    expect(detectForcedTool('Shopee có bán sạc Anker 20W không')).toBe('search_places')
    expect(detectForcedTool('thời gian giao hàng của Tiki NOW')).toBe('search_places')
  })
})

describe('OFF and ON: flight requests that the old pattern (or a flight phrase) already routes', () => {
  const flights = [
    'vé máy bay Hà Nội đi Đà Nẵng',
    've may bay Ha Noi di Da Nang',
    'giá vé máy bay đi Đà Nẵng tuần sau',
    'chuyến bay Hà Nội Sài Gòn sáng mai',
    'chuyen bay Ha Noi Sai Gon',
    'Vietnam Airlines có chuyến nào không',
    'Bamboo Airways bay Phú Quốc giá bao nhiêu',
    'vietjet bay từ HCM đi Nha Trang',
    'hãng hàng không nào bay Đà Nẵng rẻ nhất',
    'đặt vé bay đi Phú Quốc cuối tuần',
    'dat ve bay di Nha Trang',
  ]
  for (const text of flights) {
    it(`OFF and ON: ${text}`, () => {
      expect(detectForcedTool(text)).toBe('get_flight_prices')
      on()
      expect(detectForcedTool(text)).toBe('get_flight_prices')
    })
  }
})

describe('ON: the flight phrases the guard keeps (hàng không with its airline, by-air or flight-word context)', () => {
  const kept = [
    'đi Đà Nẵng bằng hàng không giá bao nhiêu',
    'vé hàng không Hà Nội Đà Nẵng tuần sau',
  ]
  for (const text of kept) {
    it(`ON: ${text}`, () => {
      on()
      expect(detectForcedTool(text)).toBe('get_flight_prices')
    })
  }
})

// Scope of this describe: the stock and brand phrases of round 3a. "về" and "bay màu" are not flight words here because the ON rule matches
// diacritic text with "vé", "máy bay", "sân bay", "chuyến bay" only; the sentences below do not show that in a flight-like context.
describe('ON: stock and brand phrases are not flights', () => {
  const notFlight = [
    'iPhone 15 128GB trên Shopee có chính hãng không',
    'Ốp lưng iPhone 16 Pro Max UAG trên Tiki còn hàng không',
    'Ốp lưng iPhone 16 Pro Max UAG còn hàng không',
    'Shopee còn hàng không, giao về Hà Nội được không?',
    'ốp lưng còn hàng không, bay màu không?',
  ]
  for (const text of notFlight) {
    it(`ON: not get_flight_prices: ${text}`, () => {
      on()
      expect(detectForcedTool(text)).not.toBe('get_flight_prices')
    })
  }
})

// The travel guard (detectTravelIntent) reads the same phrase with the same flag. Round 3a reviewer: it matched bare "hang khong" and sent
// "còn hàng không" to the travel guard even with detectForcedTool fixed. slotAdmission.ts:75 is NOT covered by this flag (it sees normalized text only).
describe('the travel guard (detectTravelIntent) follows the same flag', () => {
  it('OFF: "còn hàng không" is a travel turn (old behaviour)', () => {
    expect(detectTravelIntent('Ốp lưng iPhone 16 Pro Max UAG trên Tiki còn hàng không')).toBe(true)
  })
  it('ON: the same stock question is not a travel turn', () => {
    on()
    expect(detectTravelIntent('Ốp lưng iPhone 16 Pro Max UAG trên Tiki còn hàng không')).toBe(false)
  })
  it('ON: "bằng hàng không" (by air) is a travel turn', () => {
    on()
    expect(detectTravelIntent('đi Đà Nẵng bằng hàng không giá bao nhiêu')).toBe(true)
  })
})

describe('the flag is read at call time, in the same process', () => {
  it('turning it on and off changes the answer for the same text', () => {
    const t = 'Ốp lưng iPhone 16 Pro Max UAG trên Tiki còn hàng không'
    expect(detectForcedTool(t)).toBe('get_flight_prices')
    on()
    expect(detectForcedTool(t)).not.toBe('get_flight_prices')
    delete process.env[FLAG]
    expect(detectForcedTool(t)).toBe('get_flight_prices')
  })
  it('only "1", "on" and "true" turn it on', () => {
    const t = 'Ốp lưng iPhone 16 Pro Max UAG trên Tiki còn hàng không'
    for (const v of ['0', 'off', 'false', '']) { process.env[FLAG] = v; expect(detectForcedTool(t), `off-value ${v}`).toBe('get_flight_prices') }
    for (const v of ['1', 'on', 'true']) { process.env[FLAG] = v; expect(detectForcedTool(t), `on-value ${v}`).not.toBe('get_flight_prices') }
  })
})

// AMBIGUOUS AND KNOWN-WRONG rows, locked to what the code returns. They are NOT judgements of the right answer. A row marked KNOWN
// is a case the ON rule gets wrong or cannot decide; it is locked so that a change to the rule shows up, not because it is right.
describe('ambiguous and known-wrong phrases: observed results, OFF and ON (locked, not chosen)', () => {
  const rows: Array<[string, string | null, string | null]> = [
    ['hàng không nào rẻ nhất', 'get_flight_prices', null],
    ['tôi làm việc trong ngành hàng không', 'get_flight_prices', null],
    ['cổ phiếu hàng không tăng hôm nay', 'get_flight_prices', null],
    ['bảo hiểm hàng không là gì', 'get_flight_prices', null],
    ['ngành hàng không Việt Nam năm 2026', 'get_flight_prices', null],
    ['hãng không lồ Shopee là gì', 'get_flight_prices', 'search_products'],
    ['Shopee còn hàng không shop ơi', 'get_flight_prices', 'search_products'],
    ['iPhone 15 chính hãng bay màu gì', null, null],
    ['Lazada hết hàng không ạ', 'get_flight_prices', 'search_products'],
    ['sân bay Tân Sơn Nhất có bán hàng không', 'get_flight_prices', 'get_flight_prices'], // KNOWN FALSE POSITIVE: "sân bay" is a place here, not a flight
    ['tin tức hàng không hôm nay', 'get_flight_prices', 'get_news'],
    ['mua đồ hàng không lỗi có đổi được không', 'get_flight_prices', 'search_products'],
    ['hang hang khong nao bay Da Nang', 'get_flight_prices', null], // KNOWN: diacritic-free airline phrase, the ON rule needs diacritics
    ['gửi hàng không về Việt Nam mất bao lâu', 'get_flight_prices', null], // KNOWN: air freight, not a flight; ON returns null, not flight
    ['hàng không nào bay Đà Lạt có chuyến chiều không', 'get_flight_prices', null], // KNOWN: a real flight question with no flight word from the rule
    ['lịch bay Đà Nẵng hàng không hôm nay', 'get_flight_prices', null], // KNOWN: a real flight question; no flight word matches "hàng không" here
    ['hàng không giá rẻ đi Phú Quốc', 'get_flight_prices', null], // KNOWN: a real flight question with no flight word from the rule
    ['Đồ chơi máy bay còn hàng không?', 'get_flight_prices', 'get_flight_prices'], // KNOWN FALSE POSITIVE: a toy plane, the word "máy bay" is a travel word here
    ['Vé xem phim CGV còn hàng không?', 'get_flight_prices', 'get_flight_prices'], // KNOWN FALSE POSITIVE: "vé" is a cinema ticket here
    ['gửi bằng hàng không về Việt Nam mất bao lâu', 'get_flight_prices', 'get_flight_prices'], // KNOWN FALSE POSITIVE: air freight, "bằng hàng không" is by air
    ['lấy bằng hàng không ở đâu', 'get_flight_prices', 'get_flight_prices'], // KNOWN FALSE POSITIVE: a certificate, "bằng hàng không" is in the phrase list
  ]
  for (const [text, off, onExpected] of rows) {
    it(`OFF=${off} ON=${onExpected}: ${text}`, () => {
      expect(detectForcedTool(text)).toBe(off)
      on()
      expect(detectForcedTool(text)).toBe(onExpected)
    })
  }
})
