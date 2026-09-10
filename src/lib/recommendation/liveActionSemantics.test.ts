import { describe, it, expect } from 'vitest'
import { actionLabel, platformOf } from './actionLabel'
import type { Action } from './actions'
import { translate } from '@/lib/i18n/useTranslation'

// ─────────────────────────────────────────────────────────────────────────────
// THE ACTION SEMANTICS GATE, BUILT FROM WHAT PRODUCTION ACTUALLY EMITS.
//
// Every tuple below was harvested from live `[TAPPY_PLACES]` annotations on
// localhost across all five domains (Food, Shopping, Travel, Spa,
// Entertainment) — kind × urlKind × attributed × host, with the occurrence
// count each was seen with. This is not a hand-written matrix of cases someone
// imagined; it is the set the product really renders.
//
// The rule under test is one sentence: A LABEL MAY NOT PROMISE MORE THAN ITS
// URL DELIVERS. A search page may not be called "Đặt phòng", a YouTube search
// may not be called "Xem review", and a Google redirect may never be dressed up
// as a seller, a booking, a review or a website.
// ─────────────────────────────────────────────────────────────────────────────

const vi = (k: string, v?: Record<string, string>) => translate('vi', k, v)
const en = (k: string, v?: Record<string, string>) => translate('en', k, v)

const act = (over: Partial<Action>): Action => ({
  kind: 'website', urlKind: 'direct', url: 'https://example.com',
  priority: 1, labelKey: 'v3.action.website', ...over,
})

/** domain, kind, urlKind, attributed, url, expected VI, expected EN */
const LIVE: Array<[string, Action['kind'], 'direct' | 'search', boolean, string, string, string]> = [
  // ── seen 36× (entertainment) + 72× (food) + 104× (spa) ────────────────────
  ['food',          'maps',    'direct', false, 'https://www.google.com/maps?q=21.02,105.85', 'Xem bản đồ', 'Open in Maps'],
  // ── tel: — seen 16× / 9× / 29× ────────────────────────────────────────────
  ['spa',           'call',    'direct', false, 'tel:+842838234567',                          'Gọi',        'Call'],
  // ── food order links are SEARCHES on the platform, seen 72× each ──────────
  ['food',          'order',   'search', false, 'https://shopeefood.vn/tim-kiem?q=Bun+Bo',    'Tìm trên ShopeeFood', 'Search on ShopeeFood'],
  ['food',          'order',   'search', false, 'https://food.grab.com/vn/en/s?q=Bun+Bo',     'Tìm trên GrabFood',   'Search on GrabFood'],
  // ── spa: a venue's own site, seen 9× ──────────────────────────────────────
  ['spa',           'website', 'direct', false, 'https://nailkitchen.wixsite.com/site',       'Website',    'Website'],
  // ── travel: the hotel's OWN page vs a search, seen 24× / 30× / 30× ────────
  ['travel',        'booking', 'direct', false, 'https://www.booking.com/hotel/vn/x.vi.html', 'Đặt phòng',  'Book'],
  ['travel',        'booking', 'search', false, 'https://www.booking.com/searchresults.html', 'Tìm phòng trên Booking.com', 'Find rooms on Booking.com'],
  ['travel',        'booking', 'search', false, 'https://www.agoda.com/search?city=DaNang',   'Tìm phòng trên Agoda',       'Find rooms on Agoda'],
  // ── travel review: a YouTube SEARCH, unattributed — seen 30× ──────────────
  ['travel',        'review',  'search', false, 'https://www.youtube.com/results?search_query=x', 'Tìm review trên YouTube', 'Search reviews on YouTube'],
]

describe('🚨 every action shape production emits, labelled honestly', () => {
  for (const [domain, kind, urlKind, attributed, url, viText, enText] of LIVE) {
    it(`${domain}: ${kind}/${urlKind} → ${viText}`, () => {
      const a = act({ kind, urlKind, attributed, url })
      expect(actionLabel(a, vi)).toBe(viText)
      expect(actionLabel(a, en)).toBe(enText)
    })
  }

  it('🚨 a search destination NEVER reads as a direct promise', () => {
    for (const [, kind, urlKind, attributed, url] of LIVE) {
      if (urlKind !== 'search') continue
      const label = actionLabel(act({ kind, urlKind, attributed, url }), vi)
      expect(label, url).toMatch(/^Tìm/)
      expect(label, url).not.toBe('Đặt phòng')
      expect(label, url).not.toBe('Xem review')
      expect(label, url).not.toBe('Xem sản phẩm')
    }
  })

  it('🚨 no label leaks a raw i18n key or an unfilled placeholder, in EITHER language', () => {
    for (const [, kind, urlKind, attributed, url] of LIVE) {
      for (const t of [vi, en]) {
        const label = actionLabel(act({ kind, urlKind, attributed, url }), t)
        expect(label).not.toMatch(/^v3\.action\./)
        expect(label).not.toContain('{platform}')
        expect(label.trim().length).toBeGreaterThan(0)
      }
    }
  })
})

describe('🚨 a Google destination is never dressed up as something better', () => {
  // Serper's /shopping rows name a merchant but link to a google.com redirect;
  // Travel and Places fall back to Google search too. Whatever the kind, the
  // label must say Google and must say search.
  const GOOGLE = 'https://www.google.com/search?q=op+lung+iphone&tbm=shop'

  it('names Google, not the merchant the row happens to mention', () => {
    expect(platformOf({ url: GOOGLE })).toBe('Google')
  })

  for (const kind of ['purchase', 'booking', 'ticket', 'order'] as const) {
    it(`${kind} on a Google search URL says "Tìm ... trên Google"`, () => {
      const label = actionLabel(act({ kind, urlKind: 'search', url: GOOGLE }), vi)
      expect(label).toContain('Google')
      expect(label).toMatch(/^Tìm/)
      // The four promises it must never make.
      for (const lie of ['Xem sản phẩm', 'Đặt phòng', 'Đặt vé', 'Website']) {
        expect(label).not.toBe(lie)
      }
    })
  }

  it('🚨 an UNATTRIBUTED review on Google is a search, never "Xem review"', () => {
    const label = actionLabel(act({ kind: 'review', urlKind: 'search', attributed: false, url: GOOGLE }), vi)
    expect(label).toBe('Tìm review trên Google')
  })
})

describe('attribution is what earns the word "review"', () => {
  it('an attributed TikTok video may say review; a search may not', () => {
    const attributed = act({ kind: 'review', urlKind: 'direct', attributed: true, url: 'https://www.tiktok.com/@a/video/1' })
    const search = act({ kind: 'review', urlKind: 'search', attributed: false, url: 'https://www.youtube.com/results?search_query=x' })
    expect(actionLabel(attributed, vi)).toBe('Review trên TikTok')
    expect(actionLabel(search, vi)).toBe('Tìm review trên YouTube')
    expect(actionLabel(search, vi)).not.toContain('Xem review')
  })
})
