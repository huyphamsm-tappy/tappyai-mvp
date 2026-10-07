import { describe, expect, it } from 'vitest'
import fixtures from '../../../shared/place-card/copy-fixtures.json'
import { reasonText } from './reasonText'
import { formatPriceBandText } from './priceBand'
import { buildPlacesLiveView } from './liveView'
import { translate } from '@/lib/i18n/useTranslation'

// ── F-050 (2026-09-22): the place card's copy is one contract for web and Android ────
//
// `shared/place-card/copy-fixtures.json` is asserted here against web's `reasonText` +
// `formatPriceBandText` (the reference) and, in Android's `PlaceCardCopyContractTest.kt`, against
// `PlaceCardCopy` (the mirror). A case that passes on one side and fails on the other is a copy
// drift between the two cards — the defect F-050 was.

const t = (locale: string) => (key: string, vars?: Record<string, string>) => translate(locale as 'vi' | 'en', key, vars)

describe('shared place-card copy fixtures — web is the reference', () => {
  for (const c of fixtures.reasons) {
    it(`reason: ${c.name}`, () => {
      expect(reasonText(c.reason as never, t('vi'), 'vi')).toBe(c.vi)
      expect(reasonText(c.reason as never, t('en'), 'en')).toBe(c.en)
    })
  }
  for (const c of fixtures.bands) {
    it(`band: ${c.name}`, () => {
      expect(formatPriceBandText(c.text, 'vi')).toBe(c.vi)
      expect(formatPriceBandText(c.text, 'en')).toBe(c.en)
    })
  }
})

// A neighbouring defect this work surfaced (emulator, 2026-09-24): the snippet-price CLAIM carries
// the marker 'price_search_results' as its value, and BOTH cards printed it — "Giá tham khảo:
// price_search_results". The same string sits in docs/uat/evidence/golden/after2/T3.json, so web
// would have shown it too. A reference price is shown only when there is a real one.
describe('the card never shows a price-signal marker as a price', () => {
  const rec = (priceSignalValue: string) => ({
    entity: {
      id: 'p1', domain: 'food', kind: 'restaurant', identity: { name: 'Quán Test' },
      quality: { rating: { value: 4.5 }, ratingCount: { value: 100 }, tappyRating: null },
      location: { address: 'Quận 1', coordinates: null, distanceKm: null },
      availability: { openingHours: { value: null }, openNow: null },
      pricing: { price: { value: null }, priceRange: null, priceLevel: null, priceSignal: { value: priceSignalValue }, priceRangeText: { value: null } },
      attributes: { categories: [], phone: null }, images: { primary: null, gallery: [] },
      reviews: { actions: [], availability: 'none' }, actions: [], ext: undefined,
    },
    rank: 0, shortlistPosition: null, role: null, recommended: false, reasons: [], tradeOff: null, contextualActions: [],
  })
  it('drops the marker, keeps a real snippet price', () => {
    expect(buildPlacesLiveView([rec('price_search_results') as never], {})!.items[0].priceSignal).toBeUndefined()
    expect(buildPlacesLiveView([rec('~50.000đ/tô') as never], {})!.items[0].priceSignal).toBe('~50.000đ/tô')
  })
})
