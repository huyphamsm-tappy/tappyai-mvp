import { describe, it, expect } from 'vitest'
import { suppressUngroundedVenues, isGrounded, normalizeHeading, stripCtaButtonsFor, isVenueHeading } from './groundingGate'

// ── BUG 1 — a venue the application never retrieved must never be recommended ─
//
// The measured failure: "Tìm nhà hàng buffet ở Hà Nội" returned ten ordinary
// restaurants, none of them a buffet, and the reply presented four buffet
// restaurants that existed nowhere in the tool result.
//
// 🔑 THESE TESTS ASSERT THE DETERMINISTIC GATE, NOT MODEL OUTPUT. Asserting on a
// sentence the model happened to produce would be a test of the weather.

/** The ten names the provider actually returned on the reproduced turn. */
const TOOL_NAMES = [
  'Nhà Hàng Chay Phương Nam', 'Nhà Hàng New Day', 'Cây Si', 'Nha Hang Indochine',
  'Nhà Hàng Little Hanoi', 'Nha Hang Little Italian', 'Nhà hàng Nam Phương',
  'Quán Ăn Ngon - Phan Bội Châu', 'Sushi Hokkaido Sachi', 'Xoi Van Anh',
]

describe('the exact production failure, pinned', () => {
  const reply = [
    'Mình tìm được vài lựa chọn buffet ở Hà Nội!',
    '',
    '**Nhà Hàng New Day** là một lựa chọn chay rất ổn.',
    '',
    '**Maison Sen Buffet** buffet cao cấp với hơn 200 món.',
    '',
    '**Buffet Poseidon** hải sản tươi sống, giá 599k.',
    '',
    '**Cây Si** quán nhỏ ở phố cổ.',
  ].join('\n')

  const out = suppressUngroundedVenues(reply, TOOL_NAMES, 'vi')

  it('removes both fabricated venues', () => {
    expect(out.text).not.toContain('Maison Sen Buffet')
    expect(out.text).not.toContain('Buffet Poseidon')
    expect(out.suppressed).toEqual(['Maison Sen Buffet', 'Buffet Poseidon'])
  })

  it('removes the fabricated CLAIMS with them, not just the names', () => {
    // A price invented for a venue that does not exist is the worst of it.
    expect(out.text).not.toContain('599k')
    expect(out.text).not.toContain('hơn 200 món')
  })

  it('keeps every real venue and its description', () => {
    expect(out.text).toContain('**Nhà Hàng New Day**')
    expect(out.text).toContain('lựa chọn chay rất ổn')
    expect(out.text).toContain('**Cây Si**')
  })

  it('keeps the opening line', () => {
    expect(out.text).toContain('Mình tìm được vài lựa chọn buffet ở Hà Nội!')
  })
})

describe('[A, invented D, B] → D suppressed', () => {
  const out = suppressUngroundedVenues(
    '**A Quán** one.\n\n**D Quán** two.\n\n**B Quán** three.',
    ['A Quán', 'B Quán'],
  )
  it('drops D', () => expect(out.suppressed).toEqual(['D Quán']))
  it('keeps A and B in order', () => {
    expect(out.text.indexOf('A Quán')).toBeLessThan(out.text.indexOf('B Quán'))
  })
  it('leaves no gap where D was', () => expect(out.text).not.toMatch(/\n{3,}/))
})

describe('legitimate names survive — the over-filtering guard', () => {
  it('Vietnamese names with full diacritics survive', () => {
    for (const n of TOOL_NAMES) {
      const r = suppressUngroundedVenues(`**${n}** ngon lắm.`, TOOL_NAMES)
      expect(r.suppressed, n).toEqual([])
    }
  })

  it('a shortened form of a provider name survives', () => {
    // The model routinely writes "Chay Phương Nam" for "Nhà Hàng Chay Phương Nam".
    expect(suppressUngroundedVenues('**Chay Phương Nam** ngon.', TOOL_NAMES).suppressed).toEqual([])
    expect(suppressUngroundedVenues('**Quán Ăn Ngon** đông khách.', TOOL_NAMES).suppressed).toEqual([])
  })

  it('list numbering and trailing punctuation do not break matching', () => {
    expect(suppressUngroundedVenues('**1. Cây Si:** quán nhỏ.', TOOL_NAMES).suppressed).toEqual([])
    expect(suppressUngroundedVenues('**2) Nhà Hàng New Day —** ngon.', TOOL_NAMES).suppressed).toEqual([])
  })

  it('punctuation inside a provider name survives', () => {
    expect(suppressUngroundedVenues('**Quán Ăn Ngon - Phan Bội Châu** ngon.', TOOL_NAMES).suppressed).toEqual([])
  })

  it('near-duplicate real names BOTH survive — neither is a fabrication', () => {
    // 🚨 The pair that caused the link bug. Both are real rows; the gate must
    // not mistake either for an invention of the other.
    const r = suppressUngroundedVenues(
      '**Nhà Hàng Chay Phương Nam** a.\n\n**Nhà hàng Nam Phương** b.',
      TOOL_NAMES,
    )
    expect(r.suppressed).toEqual([])
    expect(r.text).toContain('Nhà Hàng Chay Phương Nam')
    expect(r.text).toContain('Nhà hàng Nam Phương')
  })

  it('bold used for emphasis, not a venue, is left alone', () => {
    const r = suppressUngroundedVenues('Quán này **rất ngon** nhé.', TOOL_NAMES)
    expect(r.text).toContain('**rất ngon**')
  })
})

describe('the gate disables itself when there is nothing to check against', () => {
  it('no tool names → no suppression (chitchat turns are untouched)', () => {
    const t = '**Bất Cứ Quán Nào** ngon lắm.'
    expect(suppressUngroundedVenues(t, [])).toEqual({ text: t, suppressed: [] })
  })
  it('empty text is returned as-is', () => {
    expect(suppressUngroundedVenues('', TOOL_NAMES).suppressed).toEqual([])
  })
})

describe('an honest answer replaces an empty one', () => {
  const out = suppressUngroundedVenues('**Maison Sen Buffet** tuyệt vời.', TOOL_NAMES, 'vi')
  // CCP Phase 8 (P2-5): the tool DID return venues (TOOL_NAMES) — the prose just named others.
  // "Found nothing" would contradict the card under it; the honest line points at the card.
  it('points at the card rather than claiming nothing was found when the tool returned venues', () => {
    expect(out.text).toContain('thẻ bên dưới')
    expect(out.text).not.toContain('Mình chưa tìm thấy')
  })
  it('invents no substitute venue', () => {
    for (const n of TOOL_NAMES) expect(out.text).not.toContain(n)
  })
  it('answers in English for an English turn', () => {
    const en = suppressUngroundedVenues('**Fake Place** great.', TOOL_NAMES, 'en')
    expect(en.text).toContain('on the card below')
  })
  it('does NOT add the line when a real venue still stands', () => {
    const r = suppressUngroundedVenues('**Cây Si** ngon.\n\n**Fake Place** tuyệt.', TOOL_NAMES, 'vi')
    expect(r.text).not.toContain('Mình chưa tìm thấy')
  })
})

describe('machine content is never cut into', () => {
  const withMarkers = '**Fake Place** tuyệt.\n\n[FOLLOWUPS]["a","b"][/FOLLOWUPS]'
  it('a marker block survives suppression of the prose before it', () => {
    expect(suppressUngroundedVenues(withMarkers, TOOL_NAMES).text).toContain('[FOLLOWUPS]["a","b"][/FOLLOWUPS]')
  })
})

describe('a fabricated venue loses its buttons too', () => {
  const cta = '[CTA_BUTTONS]' + JSON.stringify({
    buttons: [
      { label: '🛵 ShopeeFood - Cây Si', type: 'website', url: 'https://shopeefood.vn/tim-kiem?q=C%C3%A2y%20Si', primary: true },
      { label: '🛵 ShopeeFood - Maison Sen Buffet', type: 'website', url: 'https://shopeefood.vn/tim-kiem?q=Maison%20Sen', primary: false },
    ],
  }) + '[/CTA_BUTTONS]'

  it('drops only the suppressed venue’s button', () => {
    const out = stripCtaButtonsFor(cta, ['Maison Sen Buffet'])
    expect(out).toContain('Cây Si')
    expect(out).not.toContain('Maison Sen Buffet')
  })

  it('removes the block entirely when every button was fabricated', () => {
    expect(stripCtaButtonsFor(cta, ['Cây Si', 'Maison Sen Buffet'])).toBe('')
  })

  it('leaves a malformed block untouched rather than mangling it', () => {
    const bad = '[CTA_BUTTONS]{not json[/CTA_BUTTONS]'
    expect(stripCtaButtonsFor(bad, ['Maison Sen Buffet'])).toBe(bad)
  })

  it('end-to-end: suppression also strips the venue’s button', () => {
    const reply = `**Cây Si** ngon.\n\n**Maison Sen Buffet** tuyệt.\n\n${cta}`
    const out = suppressUngroundedVenues(reply, TOOL_NAMES)
    expect(out.text).not.toContain('Maison Sen Buffet')
    expect(out.text).toContain('q=C%C3%A2y%20Si')
  })
})

describe('the matching primitives', () => {
  it('normalizeHeading strips numbering and trailing punctuation', () => {
    expect(normalizeHeading('1. Cây Si:')).toBe(normalizeHeading('Cây Si'))
  })
  it('isGrounded admits a substring in either direction', () => {
    const known = [normalizeHeading('Nhà Hàng Chay Phương Nam')]
    expect(isGrounded(normalizeHeading('Chay Phương Nam'), known)).toBe(true)
    expect(isGrounded(normalizeHeading('Maison Sen Buffet'), known)).toBe(false)
  })
  it('a very short heading is never treated as a venue claim', () => {
    expect(isGrounded('ab', ['khong lien quan'])).toBe(true)
  })
})

describe('a lead-in must not outlive the list it introduced', () => {
  // 🚨 REPRODUCED from the phone UAT 2026-09-09. The model answered that the
  // venue had no public number, wrote "Bạn có thể:" and listed alternatives.
  // Every alternative was ungrounded and cut; the colon survived, so the reply
  // promised options and then said there were none.
  const DANGLING = [
    'Tuy nhiên, quán này hiện chưa có số điện thoại công khai trong hệ thống.',
    '',
    'Bạn có thể:',
    '',
    '- **Quán Bún Bò Không Có Thật** — 12 Lê Lợi',
    '- **Bún Bò Ảo** — 34 Nguyễn Huệ',
  ].join('\n')

  it('removes the colon lead-in when every venue it introduced was suppressed', () => {
    const out = suppressUngroundedVenues(DANGLING, [], 'vi', { placeSearch: 'empty' })
    expect(out.suppressed.length).toBeGreaterThan(0)
    expect(out.text).not.toContain('Bạn có thể:')
    // The honest parts stay: the real answer, and the not-found line.
    expect(out.text).toContain('chưa có số điện thoại công khai')
    expect(out.text).toContain('Mình chưa tìm thấy địa điểm nào đủ dữ liệu')
  })

  it('keeps the lead-in when a grounded venue still follows it', () => {
    const partial = [
      'Bạn có thể:',
      '',
      '- **Bún Bò Huế Đông Ba** — 19 Trần Cao Vân',
      '- **Bún Bò Ảo** — 34 Nguyễn Huệ',
    ].join('\n')
    const out = suppressUngroundedVenues(partial, ['Bún Bò Huế Đông Ba'], 'vi', { placeSearch: 'has_results' })
    expect(out.text).toContain('Bạn có thể:')
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toContain('Bún Bò Ảo')
  })

  it('leaves prose that simply ends in a colon alone when nothing was suppressed', () => {
    const text = 'Các lựa chọn của bạn:\n\n- **Bún Bò Huế Đông Ba** — 19 Trần Cao Vân'
    const out = suppressUngroundedVenues(text, ['Bún Bò Huế Đông Ba'], 'vi', { placeSearch: 'has_results' })
    expect(out.text).toBe(text)
  })
})

describe('a lead-in at the end of prose still goes', () => {
  // The reply keeps an EARLIER grounded venue and then ends on a lead-in whose
  // only item was suppressed. A `groundedRemain === 0` guard would leave it —
  // this is the case that proves the guard is wrong, not merely redundant.
  it('strips a trailing lead-in even when an earlier venue survived', () => {
    const text = [
      '- **Bún Bò Huế Đông Ba** — 19 Trần Cao Vân',
      '',
      'Bạn có thể xem thêm:',
      '',
      '- **Bún Bò Ảo** — 34 Nguyễn Huệ',
    ].join('\n')
    const out = suppressUngroundedVenues(text, ['Bún Bò Huế Đông Ba'], 'vi', { placeSearch: 'has_results' })
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toContain('Bún Bò Ảo')
    expect(out.text).not.toContain('Bạn có thể xem thêm:')
  })
})

// ── G1 RECURRING (measured 2026-09-19, 7× in one day): a bold LABEL is not a venue ──────────
//
// "**Lưu ý:** Mình chưa xác nhận được quán nào có phòng riêng…" was read as a venue called
// "Lưu ý", found in no row, and the paragraph — the hedge — was cut. Same for the itinerary
// labels "**Bữa trưa:**", "**Khám phá phố cổ:**", "**Thời tiết 26-28/9:**".
describe('a bold segment ending in a colon is a label, never a venue name', () => {
  const ROWS = ['Izakaya Unatoto Việt Nam', 'The Street Nguyễn Thái Bình']
  const HEDGE = 'Mình chưa xác nhận được quán nào có phòng riêng từ danh sách, nên bạn nên gọi trước.'
  const pick = 'Mình chọn **Izakaya Unatoto Việt Nam** với 4.9⭐ (7.110 đánh giá), cách bạn 0.7km.'

  it.each([
    ['**Lưu ý:**'], ['**Bữa trưa:**'], ['**Gợi ý:**'], ['**Tổng kết:**'], ['**Thời tiết 26-28/9:**'], ['**Khám phá phố cổ:**'],
  ])('%s keeps its paragraph (the measured F8 memory-pass cut)', (label) => {
    const text = `${pick}\n\n${label} ${HEDGE}`
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual([])
    expect(out.text).toBe(text)
    expect(out.text).toContain(HEDGE)
  })

  it('**Lưu ý** without a colon is a label too (closed lexicon)', () => {
    const text = `${pick}\n\n**Lưu ý** ${HEDGE}`
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual([])
    expect(out.text).toContain(HEDGE)
  })

  it('a real bold venue name is STILL matched — grounded stays, ungrounded goes', () => {
    const text = [
      '**Izakaya Unatoto Việt Nam** — 4.9⭐, phòng riêng cho 8 người.',
      '',
      '**Quán Bịa Đặt** — 5⭐, cũng có phòng riêng.',
      '',
      '**Lưu ý:** ' + HEDGE,
    ].join('\n')
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Quán Bịa Đặt'])
    expect(out.text).toContain('Izakaya Unatoto Việt Nam')
    expect(out.text).not.toContain('Quán Bịa Đặt')
    expect(out.text).toContain(HEDGE)
  })

  it('a label ends the block before it: the ungrounded venue above loses only its own paragraph', () => {
    const text = ['**Quán Bịa Đặt** — 5⭐.', '', '**Lưu ý:** ' + HEDGE].join('\n')
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Quán Bịa Đặt'])
    expect(out.text).toContain(HEDGE)
  })

  it('labels alone are not grounded venues: when every venue was cut the honest line still appears', () => {
    const text = ['**Quán Bịa Đặt** — 5⭐.', '', '**Lưu ý:** gọi trước.'].join('\n')
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.text).toContain('nằm ở thẻ bên dưới')
  })

  it('a venue whose name merely CONTAINS a label word is a venue ("Quán Gợi Ý Ngon" is not "Gợi ý:")', () => {
    const text = '**Quán Gợi Ý Ngon** — 4.5⭐.'
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Quán Gợi Ý Ngon'])
  })
})

// ── A.1 (owner 2026-09-19): the venue-name test is INVERTED — a bold segment is a venue heading only
// when it is PRESENTED as one (positive shape), never because it failed a list of labels.
describe('A.1 — a bold segment is a venue heading only by positive shape', () => {
  const ROWS = ['Izakaya Unatoto Việt Nam', 'The Street Nguyễn Thái Bình', 'Cơm Niêu Sài Gòn']
  const HEDGE = 'Mình chưa xác nhận được quán nào có phòng riêng từ danh sách, nên bạn nên gọi trước.'
  const pick = 'Mình chọn **Izakaya Unatoto Việt Nam** với 4.9⭐ (7.110 đánh giá), cách bạn 0.7km.'

  it.each([
    ['**Lưu ý:**'], ['**Gợi ý?**'], ['**Bữa trưa:**'], ['**Tổng kết**'], ['**Bạn muốn ăn gì?**'], ['**Ưu tiên chính của bạn là gì?**'],
    ['**Điểm cộng lớn nhất**'],   // bold text with no colon or question mark, above ordinary prose
  ])('%s is prose: its paragraph survives and nothing is suppressed', (label) => {
    const text = `${pick}

${label} ${HEDGE}

Bạn nên đặt bàn trước cho 8 người.`
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual([])
    expect(out.text).toBe(text)
  })

  it('a real bold venue name presented as a heading MUST still match — grounded stays, invented goes', () => {
    const text = ['**The Street Nguyễn Thái Bình** — 4.8⭐ (1.833 đánh giá), 0.8km.', '', '**Quán Bịa Đặt** — 5⭐, phòng riêng.', '', '**Lưu ý:** ' + HEDGE].join('\n')
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Quán Bịa Đặt'])
    expect(out.text).toContain('**The Street Nguyễn Thái Bình**')
    expect(out.text).toContain(HEDGE)
  })

  it.each([
    ['**the street nguyen thai binh** — 4.8⭐'],          // casing + no diacritics
    ['**The  Street Nguyễn Thái Bình** — 4.8⭐'],         // whitespace
    ['**Nhà hàng The Street Nguyễn Thái Bình** — 4.8⭐'], // venue-type prefix
    ['**Cơm Niêu** — 4.6⭐ (1.200 đánh giá)'],            // shortened form
  ])('a real venue written differently from the row (%s) still matches', (line) => {
    const out = suppressUngroundedVenues(line, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual([])
    expect(out.text).toBe(line)
  })

  it('an invented venue in every heading shape is still caught (the gate is not a no-op)', () => {
    for (const text of [
      '**The Workshop Coffee** – 27 Ngô Đức Kế, Bến Nghé, Quận 1.',
      '- **Soo Kafe** – góc ấm cúng.',
      '**Masstige Coffee**\n4.7⭐ (312 đánh giá) · 12 Lê Lợi',
      '**Po Cafe** cách bạn 0.5km, mở đến 22:00.',
    ]) {
      const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
      expect(out.suppressed.length, text).toBe(1)
    }
  })

  it('isVenueHeading — the positive shape, directly', () => {
    expect(isVenueHeading('Cơm Niêu Sài Gòn', ' — 4.6⭐')).toBe(true)
    expect(isVenueHeading('Cơm Niêu Sài Gòn', '', '4.6⭐ (1.200 đánh giá)')).toBe(true)
    expect(isVenueHeading('Cơm Niêu Sài Gòn', ' cách bạn 0.5km')).toBe(true)
    expect(isVenueHeading('Lưu ý:', ' mình chưa xác nhận')).toBe(false)
    expect(isVenueHeading('Gợi ý?', ' bạn nên')).toBe(false)
    expect(isVenueHeading('Tổng kết', '', 'Mình nghĩ bạn nên chọn quán 4.5⭐.')).toBe(false)
    expect(isVenueHeading('Điểm cộng lớn nhất', ' là vị trí.')).toBe(false)
    expect(isVenueHeading('Bạn muốn ăn gì?', '')).toBe(false)
  })
})

// ── PRE-RELEASE A.1 (owner 2026-09-19): the gate's action is PROPORTIONAL ─────────────────────
//
// An ungrounded name removes only the sentence that carries it — never the paragraph, never the
// block. A false positive (a Title-Cased section label the shape rule reads as a name) costs at
// most that sentence. Row match comes first: a lowercase bold that IS a row is a name.
describe('A.1 — proportional action: only the carrying sentence, never the paragraph', () => {
  const ROWS = ['bún bò Huế cô Ba', 'Cơm Niêu Sài Gòn']
  const PARA = (name: string) => `Mình chọn **Cơm Niêu Sài Gòn** cho tối nay.\n\n**${name}** quán này mở đến 22h, ăn ngon, cách bạn 1km. Không gian rộng. Giá vừa phải. Nên đặt bàn trước.\n\nBạn nhớ mang theo áo khoác.`

  it('an ungrounded name inside a 4-sentence paragraph removes that sentence and leaves the other 3 intact', () => {
    const out = suppressUngroundedVenues(PARA('Quán Bịa Đặt'), ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Quán Bịa Đặt'])
    expect(out.text).not.toContain('Quán Bịa Đặt')
    expect(out.text).not.toContain('mở đến 22h')
    for (const s of ['Không gian rộng.', 'Giá vừa phải.', 'Nên đặt bàn trước.', 'Bạn nhớ mang theo áo khoác.', 'Mình chọn **Cơm Niêu Sài Gòn**']) expect(out.text).toContain(s)
    expect(out.text).not.toContain('thẻ bên dưới')   // a grounded pick is still named — no fallback line
  })

  it.each([
    ['Bữa Trưa', 'prose (lexicon)'], ['Lưu Ý', 'prose (lexicon)'], ['Tổng Kết', 'prose (lexicon)'],
  ])('the owner strings — %s is %s: nothing is cut', (label) => {
    const text = PARA(label)
    expect(suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' }).text).toBe(text)
  })

  it.each([['Gợi Ý Thêm'], ['Món Ngon Hôm Nay']])('the owner strings — a Title-Cased label the shape reads as a name (%s) costs at most its own sentence', (label) => {
    const out = suppressUngroundedVenues(PARA(label), ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual([label])
    for (const s of ['Không gian rộng.', 'Giá vừa phải.', 'Nên đặt bàn trước.', 'Bạn nhớ mang theo áo khoác.']) expect(out.text).toContain(s)
  })

  it('the owner strings — a real row venue written lowercase (**bún bò Huế cô Ba**) is recognised as a name: grounded, kept, and counted', () => {
    const text = '**bún bò Huế cô Ba** — 4.6⭐ (300 đánh giá), 12 Lê Lợi.\n\n**Quán Bịa Đặt** — 5⭐.'
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Quán Bịa Đặt'])
    expect(out.text).toContain('**bún bò Huế cô Ba**')
    expect(out.text).not.toContain('thẻ bên dưới')   // the grounded lowercase venue still stands
  })

  it('a fabricated title line above its own description costs the title line only (the description is kept, logged nowhere else)', () => {
    const text = '**Masstige Coffee**\nquán nhỏ ở phố cổ, 4.7⭐ (312 đánh giá).\n\n**Cây Si** quán nhỏ.'
    const out = suppressUngroundedVenues(text, ['Cây Si'], 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Masstige Coffee'])
    expect(out.text).not.toContain('Masstige Coffee')
    expect(out.text).toContain('quán nhỏ ở phố cổ')
    expect(out.text).toContain('**Cây Si**')
  })

  it('worst case, measured: a false positive at the top of a 6-sentence reply loses ONE sentence, not the reply', () => {
    const text = '**Món Ngon Hôm Nay** mình gợi ý ba chỗ.\n\n**Cơm Niêu Sài Gòn** — 4.6⭐, cách bạn 1km.\n\nKhông gian rộng. Giá vừa phải. Nên đặt bàn trước. Nhớ mang áo khoác.'
    const out = suppressUngroundedVenues(text, ROWS, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Món Ngon Hôm Nay'])
    const lost = text.length - out.text.length
    expect(lost).toBeLessThanOrEqual('**Món Ngon Hôm Nay** mình gợi ý ba chỗ.\n\n'.length)
    expect(out.text).toContain('**Cơm Niêu Sài Gòn**')
    expect(out.text).toContain('Nhớ mang áo khoác.')
  })
})

