import { describe, it, expect } from 'vitest'
import { validateModelCtaButton, validateModelCtaButtons, promisedKind, unlinkMislabelledMerchantLinks, validateModelCtaBlock, isMisleadingModelCta, stripFalseDisconnectClaims, unemphasizeLinks } from './ctaValidation'
import { vi as viDict } from '@/lib/i18n/w5/placeDecision'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 A MODEL-AUTHORED BUTTON NEVER WENT THROUGH `actionLabel`.
//
// Measured on the event turn 2026-09-09. The reply had just said it found no
// events, and still emitted:
//
//     "🎫 Ticketbox - Mua vé sự kiện"  →  https://ticketbox.vn/
//
// a purchase promise pointing at an aggregator HOMEPAGE. `parseCTA` returned the
// model's buttons verbatim, so nothing checked the label against the URL.
// ─────────────────────────────────────────────────────────────────────────────

/** The real dictionary, so a downgraded label is the one users actually see. */
const t = (key: string, vars?: Record<string, string>) => {
  const raw = (viDict as Record<string, string>)[key] ?? key
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : raw
}

/** Verbatim from the measured turn. */
const AGGREGATOR_HOMEPAGE = 'https://ticketbox.vn/'
const SEARCH_URL = 'https://ticketbox.vn/search?q=concert'
/** A real entity-level page, the shape `website_uri` carried for CGV. */
const ENTITY_TICKET_URL = 'https://www.cgv.vn/default/cinox/site/cgv-vincom-dong-khoi/'

describe('what a label promises', () => {
  it('recognises a purchase promise', () => {
    expect(promisedKind('🎫 Ticketbox - Mua vé sự kiện')).toBe('ticket')
    expect(promisedKind('Đặt vé ngay')).toBe('ticket')
    expect(promisedKind('Đặt phòng')).toBe('booking')
    expect(promisedKind('Đặt bàn')).toBe('reservation')
    expect(promisedKind('Đặt món')).toBe('order')
  })

  it('leaves an honest label alone', () => {
    expect(promisedKind('Tìm vé trên Ticketbox')).toBeNull()
    expect(promisedKind('📍 Xem trên Maps')).toBeNull()
    expect(promisedKind('Lịch sự kiện TP.HCM')).toBeNull()
  })
})

describe('1. aggregator homepage + "Mua vé" is downgraded', () => {
  const out = validateModelCtaButton(
    { label: '🎫 Ticketbox - Mua vé sự kiện', type: 'website', url: AGGREGATOR_HOMEPAGE, primary: true }, t)

  it('no longer promises a purchase', () => {
    expect(out.label).not.toMatch(/Mua vé/)
  })

  it('says what it actually does, naming the platform', () => {
    expect(out.label).toBe('Tìm vé trên Ticketbox')
  })

  it('is marked as a search on the wire', () => {
    expect(out.type).toBe('search')
  })

  it('keeps the destination — nothing is invented or dropped', () => {
    expect(out.url).toBe(AGGREGATOR_HOMEPAGE)
  })
})

describe('2. search URL + "Mua vé" is downgraded', () => {
  it('stays a search action', () => {
    const out = validateModelCtaButton(
      { label: 'Mua vé ngay', type: 'booking', url: SEARCH_URL, primary: true }, t)
    expect(out.type).toBe('search')
    expect(out.label).toBe('Tìm vé trên Ticketbox')
  })
})

describe('2b. a query-string search is a search even on a deep path', () => {
  // 🚨 A DEEP PATH IS NOT ENOUGH. This URL has a real path segment, so the
  // "is it a homepage" test passes it — only the query-string rule catches it.
  // The earlier fixture had "/search" in the PATH, so it was caught twice and
  // proved nothing about the query rule.
  const DEEP_SEARCH = 'https://www.galaxycine.vn/dat-ve?q=phim'

  it('is downgraded despite the deep path', () => {
    const out = validateModelCtaButton({ label: 'Mua vé', type: 'booking', url: DEEP_SEARCH }, t)
    expect(out.type).toBe('search')
    expect(out.label).toMatch(/Tìm vé/)
  })
})

describe('3. a direct entity-level ticket URL remains valid', () => {
  it('keeps the model label and type', () => {
    const btn = { label: '🎫 Mua vé CGV Vincom Đồng Khởi', type: 'booking', url: ENTITY_TICKET_URL, primary: true }
    expect(validateModelCtaButton(btn, t)).toEqual(btn)
  })
})

describe('4. an honest search CTA is untouched', () => {
  it('passes through unchanged', () => {
    const btn = { label: 'Tìm vé trên Ticketbox', type: 'search', url: AGGREGATOR_HOMEPAGE, primary: false }
    expect(validateModelCtaButton(btn, t)).toEqual(btn)
  })

  it('and so does a maps button', () => {
    const btn = { label: '📍 Xem trên Maps', type: 'maps', url: 'https://maps.google.com/maps?q=x', primary: false }
    expect(validateModelCtaButton(btn, t)).toEqual(btn)
  })
})

describe('5. the label cannot upgrade the action', () => {
  // 🔑 THE URL DECIDES THE KIND. Writing a stronger word must not buy a stronger
  // action — otherwise the model can promote any link to a purchase.
  it('a stronger word on a homepage still yields a search', () => {
    for (const label of ['Mua vé ngay hôm nay', 'Đặt vé', 'Buy tickets', 'Book tickets now']) {
      const out = validateModelCtaButton({ label, type: 'internal_booking', url: AGGREGATOR_HOMEPAGE }, t)
      expect(out.type).toBe('search')
      expect(out.label).toMatch(/Tìm vé/)
    }
  })

  it('the wire type the model chose does not survive either', () => {
    const out = validateModelCtaButton(
      { label: 'Mua vé', type: 'internal_booking', url: SEARCH_URL }, t)
    expect(out.type).not.toBe('internal_booking')
  })
})

describe('the batch preserves order and count', () => {
  it('downgrades a promise on a non-CCP aggregator homepage and drops nothing', () => {
    // Ticketbox is a CCP provider since the Completion Pass (14 Sep 2026): its front door is
    // DROPPED (see below); a homepage the platform does not own is only downgraded.
    const buttons = [
      { label: '🎫 Eventbrite - Mua vé sự kiện', type: 'website', url: 'https://www.eventbrite.com/', primary: true },
      { label: '📅 Lịch sự kiện TP.HCM', type: 'website', url: 'https://sodulich.hochiminhcity.gov.vn/', primary: false },
    ]
    const out = validateModelCtaButtons(buttons, t)
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual(buttons[1])
    expect(out[0].label).toBe('Tìm vé trên Eventbrite')
  })
  it('drops a button whose label names a registry merchant but whose URL is another site (live UAT 14 Sep 2026: "Vexere - Phương Trang" → redBus)', () => {
    const out = validateModelCtaButtons([
      { label: '🚌 Vexere - Phương Trang', type: 'website', url: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', primary: true },
      { label: '🚌 Phương Trang', type: 'website', url: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', primary: false },
      { label: '🏨 Booking.com - Mường Thanh', type: 'booking', url: 'https://www.booking.com/searchresults.vi.html?ss=Muong+Thanh', primary: false },
    ], t)
    expect(out.map(b => b.label)).toEqual(['🚌 Phương Trang', '🏨 Booking.com - Mường Thanh'])
  })
  it('drops a model button on the Agoda front door even without a promise word: the front-door template is not a search grammar', () => {
    expect(validateModelCtaButtons([{ label: '🏨 Agoda - Phú Quốc', type: 'booking', url: 'https://www.agoda.com/vi-vn/', primary: false }], t)).toEqual([])
  })
  it('unlinks a prose link to a registry merchant front door (the button rule, applied to prose)', () => {
    expect(unlinkMislabelledMerchantLinks('Xem thêm trên [Ticketbox](https://ticketbox.vn/) hoặc [sự kiện này](https://ticketbox.vn/chao-show2026-25472).')).toBe('Xem thêm trên Ticketbox hoặc [sự kiện này](https://ticketbox.vn/chao-show2026-25472).')
  })
  it('unlinks a prose link whose label names a registry merchant but whose URL is another site; other links stay', () => {
    const prose = 'Xem tại [Điện Máy Xanh](https://www.dienmaycholon.vn) hoặc [Shopee](https://shopee.vn/search?keyword=iphone) và [Trip.com](https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=han&ddate=2026-10-10) · [Lịch sự kiện](https://sodulich.hochiminhcity.gov.vn/).'
    expect(unlinkMislabelledMerchantLinks(prose)).toBe('Xem tại Điện Máy Xanh hoặc [Shopee](https://shopee.vn/search?keyword=iphone) và [Trip.com](https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=han&ddate=2026-10-10) · [Lịch sự kiện](https://sodulich.hochiminhcity.gov.vn/).')
  })
  it('drops a Ticketbox front door (CCP-owned): the verified event link arrives as a Commerce Link instead', () => {
    expect(validateModelCtaButtons([{ label: '🎫 Ticketbox - Mua vé sự kiện', type: 'website', url: AGGREGATOR_HOMEPAGE, primary: true }], t)).toEqual([])
  })
})

describe('a named merchant unmakes prose links to OTHER registry merchants (live UAT 14 Sep 2026)', () => {
  it('"… trên Trip.com": [Booking.com] and [Agoda] prose links are unmade; a Trip.com link stays', () => {
    const text = 'Để đặt phòng, bạn có thể truy cập [Booking.com](https://www.booking.com/searchresults.vi.html?ss=Da+Nang) hoặc [Agoda](https://www.agoda.com/vi-vn/). Hoặc xem [Trip.com](https://vn.trip.com/hotels/detail/?hotelId=707332).'
    const out = unlinkMislabelledMerchantLinks(text, undefined, 'tripcom')
    expect(out).toBe('Để đặt phòng, bạn có thể truy cập Booking.com hoặc Agoda. Hoặc xem [Trip.com](https://vn.trip.com/hotels/detail/?hotelId=707332).')
  })
  it('without a named merchant, an honest OTA results-page link is left alone', () => {
    const text = 'Xem [Booking.com](https://www.booking.com/searchresults.vi.html?ss=Da+Nang).'
    expect(unlinkMislabelledMerchantLinks(text, undefined, null)).toBe(text)
  })
  it('a system-placed link to another merchant is never touched', () => {
    const url = 'https://www.booking.com/searchresults.vi.html?ss=Da+Nang'
    const text = `Xem [Booking.com](${url}).`
    expect(unlinkMislabelledMerchantLinks(text, new Set([url]), 'tripcom')).toBe(text)
  })
})

describe('a REMOVED provider never returns through the model (cross-platform UAT, 15 Sep 2026)', () => {
  it('drops a model "📦 Tiki" button (Tiki is forbidden) — under a Shopee request only Shopee survives', () => {
    const block = '[CTA_BUTTONS]{"buttons":[{"label":"🛒 Tìm trên Shopee","type":"search","url":"https://shopee.vn/search?keyword=iphone"},{"label":"📦 Tiki","type":"search","url":"https://tiki.vn/search?q=iphone"},{"label":"🛍️ Lazada","type":"search","url":"https://www.lazada.vn/catalog/?q=iphone"}]}[/CTA_BUTTONS]'
    const out = validateModelCtaBlock('Đây nhé.\n\n' + block, t, 'shopee')
    expect(out).toContain('Tìm trên Shopee')
    expect(out).not.toContain('Tiki')
    expect(out).not.toContain('Lazada')
  })
  it('drops Tiki even with NO named merchant (a general shopping turn)', () => {
    const block = '[CTA_BUTTONS]{"buttons":[{"label":"🛒 Shopee","type":"search","url":"https://shopee.vn/search?keyword=x"},{"label":"📦 Tiki","type":"search","url":"https://tiki.vn/search?q=x"}]}[/CTA_BUTTONS]'
    const out = validateModelCtaBlock('x\n\n' + block, t, null)
    expect(out).toContain('Shopee')
    expect(out).not.toContain('Tiki')
  })
  it('a Tiki button on a non-Tiki host (mislabelled) is dropped by name', () => {
    expect(isMisleadingModelCta({ label: '📦 Tiki', type: 'search', url: 'https://www.google.com/search?q=iphone' })).toBe(true)
  })
  it('unlinks a prose link to Tiki', () => {
    expect(unlinkMislabelledMerchantLinks('Bạn có thể xem trên [Tiki](https://tiki.vn/dien-thoai) nữa.')).toBe('Bạn có thể xem trên Tiki nữa.')
  })
  it('does not touch a legitimate registry merchant (Shopee)', () => {
    expect(isMisleadingModelCta({ label: '🛒 Shopee', type: 'search', url: 'https://shopee.vn/search?keyword=x' })).toBe(false)
  })
})

describe('a false "chưa kết nối" claim about a connected provider is removed (cross-platform UAT, 15 Sep 2026)', () => {
  it('drops the sentence claiming Trip.com is not connected; keeps the rest', () => {
    const text = 'Mình tìm thấy vài khách sạn ở Đà Nẵng. Tuy nhiên, hệ thống mình chưa kết nối trực tiếp với Trip.com. Bạn muốn xem thêm không?'
    const out = stripFalseDisconnectClaims(text, 'tripcom')
    expect(out).not.toContain('chưa kết nối')
    expect(out).toContain('Mình tìm thấy vài khách sạn ở Đà Nẵng.')
    expect(out).toContain('Bạn muốn xem thêm không?')
  })
  it('leaves a genuinely-unsupported claim that names no registry provider (table reservation)', () => {
    const text = 'TappyAI chưa hỗ trợ đặt bàn nhà hàng trực tuyến.'
    expect(stripFalseDisconnectClaims(text, null)).toBe(text)
    expect(stripFalseDisconnectClaims(text, 'shopee')).toBe(text) // "đặt bàn" names no provider
  })
  it('drops "không hỗ trợ Klook" when Klook was the named provider', () => {
    const out = stripFalseDisconnectClaims('Xin lỗi, mình không hỗ trợ Klook. Bạn thử cách khác nhé.', 'klook')
    expect(out).toBe('Bạn thử cách khác nhé.')
  })
  // 🚨 Denial by OMISSION: "chỉ kết nối với [other OTAs]" excludes the requested provider — false
  // (its card renders). Live Android UAT T1, 15 Sep 2026.
  it('drops "chỉ kết nối với Booking.com và Agoda" under a Trip.com request; keeps the rest', () => {
    // Exact live phrasing (T1): "chỉ kết nối TRỰC TIẾP với …" — an adverb sits between verb and "với".
    const text = 'Mình tìm được vài khách sạn ở Đà Nẵng cho ngày 10-12/10/2026. Tuy nhiên, bạn yêu cầu tìm trên Trip.com nhưng hệ thống mình chỉ kết nối trực tiếp với Booking.com và Agoda để xem giá phòng. Bạn bấm vào thẻ Trip.com bên dưới nhé.'
    const out = stripFalseDisconnectClaims(text, 'tripcom')
    expect(out).not.toContain('chỉ kết nối trực tiếp với Booking.com và Agoda')
    expect(out).toContain('Mình tìm được vài khách sạn ở Đà Nẵng cho ngày 10-12/10/2026.')
    expect(out).toContain('Bạn bấm vào thẻ Trip.com bên dưới nhé.')
  })
  it('KEEPS a true positive "chỉ kết nối với Trip.com" (requested provider is the one connected)', () => {
    const text = 'Hiện mình chỉ kết nối với Trip.com cho khách sạn này.'
    expect(stripFalseDisconnectClaims(text, 'tripcom')).toBe(text)
  })
  it('KEEPS "chỉ hỗ trợ thanh toán thẻ" — a feature limit, not a connectivity-scope claim', () => {
    const text = 'Trip.com chỉ hỗ trợ thanh toán thẻ quốc tế.'
    expect(stripFalseDisconnectClaims(text, 'tripcom')).toBe(text)
  })

  // 🚨 Final integrity pass (17 Sep 2026) — exact M2 terse-correction output, root-caused from M2DIAG.
  it('drops BOTH M2 shapes: "chỉ hỗ trợ tìm khách sạn trên Booking.com và Agoda" and "Trip.com không nằm trong danh sách … kết nối"', () => {
    const text = 'Mình hiểu, nhưng TappyAI chỉ hỗ trợ tìm khách sạn trên **Booking.com** và **Agoda** thôi. Trip.com không nằm trong danh sách nền tảng mình kết nối. Bạn có thể vào Trip.com trực tiếp để tìm khách sạn ở Đà Nẵng, được không? 🏨'
    const out = stripFalseDisconnectClaims(text, 'tripcom')
    expect(out).not.toContain('chỉ hỗ trợ tìm khách sạn trên')
    expect(out).not.toContain('không nằm trong danh sách')
    expect(out).toContain('Bạn có thể vào Trip.com trực tiếp') // the honest offer survives
  })
  // 🚨 English false limitation (objective #2) — the guard is now multilingual.
  it('drops the English "I only support hotel searches on Booking.com and Agoda" under a Trip.com request', () => {
    const text = 'I found some hotels in Da Nang. I only support hotel searches on Booking.com and Agoda. You can open Trip.com directly instead.'
    const out = stripFalseDisconnectClaims(text, 'tripcom')
    expect(out).not.toContain('I only support hotel searches on Booking.com and Agoda')
    expect(out).toContain('I found some hotels in Da Nang.')
    expect(out).toContain('You can open Trip.com directly instead.')
  })
  it('drops the English "I\'m not connected to Trip.com" (negation naming the requested provider)', () => {
    const out = stripFalseDisconnectClaims("Sorry, I'm not connected to Trip.com. Try another platform.", 'tripcom')
    expect(out).toBe('Try another platform.')
  })
  it('KEEPS a legitimate English capability limit ("only provide a direct handoff … pay on the merchant site")', () => {
    const text = 'I can only provide a direct handoff to the merchant; payment must be completed on the merchant site.'
    expect(stripFalseDisconnectClaims(text, 'tripcom')).toBe(text)
    expect(stripFalseDisconnectClaims('Showtime data is unavailable.', 'cgv')).toBe('Showtime data is unavailable.')
  })
  it('KEEPS the true positive English "I only support Trip.com for this" (requested provider IS the scope)', () => {
    const text = 'For this hotel I only support Trip.com right now.'
    expect(stripFalseDisconnectClaims(text, 'tripcom')).toBe(text)
  })
  // 🚨 M2-C exact live shape (product correction): both false parts joined by an em-dash in ONE sentence.
  it('drops the em-dash M2-C shape "chỉ hỗ trợ tìm kiếm trên Shopee và Lazada thôi — TikTok Shop chưa … kết nối" (TikTok Shop request)', () => {
    const text = 'Bạn có thể vào TikTok Shop trực tiếp. TappyAI chỉ hỗ trợ tìm kiếm trên Shopee và Lazada thôi — TikTok Shop chưa nằm trong danh sách nền tảng mình kết nối.'
    const out = stripFalseDisconnectClaims(text, 'tiktokshop')
    expect(out).not.toContain('chỉ hỗ trợ tìm kiếm trên Shopee và Lazada')
    expect(out).not.toContain('chưa nằm trong danh sách')
    expect(out).toContain('Bạn có thể vào TikTok Shop trực tiếp.')
  })
})

describe('a bold-wrapped markdown link is un-emphasised so Android linkifies it (cross-platform UAT, 15 Sep 2026)', () => {
  it('unwraps **[label](url)** → [label](url) (the exact live Ticketbox shape); trailing prose untouched', () => {
    const text = 'Mình tìm được: **[Chào Show - The Sound of Vietnam](https://ticketbox.vn/chao-show2026-25472)** — từ 19/9 đến 30/9.'
    expect(unemphasizeLinks(text)).toBe('Mình tìm được: [Chào Show - The Sound of Vietnam](https://ticketbox.vn/chao-show2026-25472) — từ 19/9 đến 30/9.')
  })
  it('unwraps *italic*, __bold__ and _italic_ link wrappers', () => {
    expect(unemphasizeLinks('*[a](https://x.vn/1)*')).toBe('[a](https://x.vn/1)')
    expect(unemphasizeLinks('__[b](https://x.vn/2)__')).toBe('[b](https://x.vn/2)')
    expect(unemphasizeLinks('_[c](https://x.vn/3)_')).toBe('[c](https://x.vn/3)')
  })
  it('leaves an UNwrapped link and ordinary bold text alone', () => {
    expect(unemphasizeLinks('[Đặt vé Vietnam Airlines](https://www.vietnamairlines.com/)')).toBe('[Đặt vé Vietnam Airlines](https://www.vietnamairlines.com/)')
    expect(unemphasizeLinks('Đây là **giá tốt nhất** cho bạn.')).toBe('Đây là **giá tốt nhất** cho bạn.')
  })
  // 🚨 Final integrity pass (17 Sep 2026) — the four Ticketbox render shapes (objective #10), verified
  // physically on Android (the unbolded shape D-row tapped through to ticketbox.vn).
  it('C) a plain link surrounded by prose keeps its URL and stays tappable (unbolded shape)', () => {
    const text = 'Mình sẽ tìm vé cho bạn.\n\n[Chao Show - The Sound of Vietnam](https://ticketbox.vn/chao-show2026-25472)\n\nShow diễn tại số 6 Nguyễn Siêu, TP.HCM.'
    expect(unemphasizeLinks(text)).toBe(text) // unchanged — already tappable
    expect(text).toContain('](https://ticketbox.vn/chao-show2026-25472)')
  })
  it('D) multiple links in one response — each preserved, bold ones unwrapped, URLs intact', () => {
    const text = 'Vé: **[Chao Show](https://ticketbox.vn/chao-show2026-25472)** và [U-KNOW](https://ticketbox.vn/u-know-project-26-scene1-in-hcm-26405).'
    expect(unemphasizeLinks(text)).toBe('Vé: [Chao Show](https://ticketbox.vn/chao-show2026-25472) và [U-KNOW](https://ticketbox.vn/u-know-project-26-scene1-in-hcm-26405).')
  })
  it('does not rewrite the URL when unwrapping (host + path preserved verbatim)', () => {
    const out = unemphasizeLinks('**[X](https://ticketbox.vn/a/b?c=d&e=f)**')
    expect(out).toBe('[X](https://ticketbox.vn/a/b?c=d&e=f)')
  })
})
