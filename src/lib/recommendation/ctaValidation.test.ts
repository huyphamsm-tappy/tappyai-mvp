import { describe, it, expect } from 'vitest'
import { validateModelCtaButton, validateModelCtaButtons, promisedKind, unlinkMislabelledMerchantLinks } from './ctaValidation'
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
