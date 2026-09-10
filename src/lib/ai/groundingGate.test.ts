import { describe, it, expect } from 'vitest'
import { suppressUngroundedVenues, isGrounded, normalizeHeading, stripCtaButtonsFor } from './groundingGate'

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
  it('says nothing was found rather than leaving a promise unfulfilled', () => {
    expect(out.text).toContain('Mình chưa tìm thấy')
  })
  it('invents no substitute venue', () => {
    for (const n of TOOL_NAMES) expect(out.text).not.toContain(n)
  })
  it('answers in English for an English turn', () => {
    const en = suppressUngroundedVenues('**Fake Place** great.', TOOL_NAMES, 'en')
    expect(en.text).toContain("couldn't find")
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
