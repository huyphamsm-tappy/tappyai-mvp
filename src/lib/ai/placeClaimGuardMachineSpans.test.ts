/**
 * The place-claim guard must never judge machine payload as a claim.
 *
 * Measured on the 2026-09-17 V3 capture (audit env, real model output): the model's
 * own [CTA_BUTTONS] block carries Google Maps links like `?cid=3700468258469518959`,
 * PHONE_RE read "0468258469" out of the digits, no venue's evidence owned that
 * "phone", and the whole block — every button the user would have tapped — was
 * deleted on 11/15 turns. The earlier 36-turn baseline shows the same: the model
 * wrote a CTA block on every place turn and it reached the user on 7/30.
 */
import { describe, expect, it } from 'vitest'
import { guardPlaceClaimsInText, type PlaceClaimEvidence } from './placeClaimGuard'

const EVIDENCE: PlaceClaimEvidence = {
  ratings: [], distancesKm: [], texts: [], entityTexts: new Map(),
  placeNames: ['Izakaya Kamura', 'Nori - Modern Izakaya'], orderablePlaces: new Set(),
  ratingsByEntity: new Map([['Izakaya Kamura', [4.9]]]), reviewCountsByEntity: new Map([['Izakaya Kamura', [3961]]]),
  phonesByEntity: new Map([['Izakaya Kamura', ['+84 28 3535 7098']]]), ticketablePlaces: new Set(),
}
const CTA = '[CTA_BUTTONS]{"buttons":[{"label":"📍 Xem Izakaya Kamura trên Maps","type":"maps","url":"https://maps.google.com/?cid=3700468258469518959","primary":true},{"label":"📍 Xem Nori - Modern Izakaya trên Maps","type":"maps","url":"https://maps.google.com/?cid=3421613120693832923","primary":false}]}[/CTA_BUTTONS]'
const FOLLOWUPS = '[FOLLOWUPS]Đặt bàn trước không|Giá cụ thể các món|Quán khác yên tĩnh hơn[/FOLLOWUPS]'

for (const v2 of [false, true]) {
  describe(`machine spans survive (attributionV2: ${v2})`, () => {
    const opts = { scope: 'all' as const, attributionV2: v2 }
    it('a CTA block whose Maps cid looks like a phone number is kept verbatim', () => {
      const text = `Mình chọn **Izakaya Kamura** cho bạn.\n\n${CTA}\n\n${FOLLOWUPS}`
      const r = guardPlaceClaimsInText(text, EVIDENCE, opts)
      expect(r.text).toContain(CTA)
      expect(r.text).toContain(FOLLOWUPS)
      expect(r.redacted).toBe(0)
    })
    it('a phone inside a markdown link in a prose sentence is not a stated phone', () => {
      const text = 'Mình chọn **Izakaya Kamura** cho bạn — [xem trên Maps](https://maps.google.com/?cid=3700468258469518959).'
      expect(guardPlaceClaimsInText(text, EVIDENCE, opts).text).toBe(text)
    })
    it("a real phone that is not the venue's own is still removed", () => {
      const text = 'Mình chọn **Izakaya Kamura** cho bạn. Số điện thoại: 0903 636 940.'
      expect(guardPlaceClaimsInText(text, EVIDENCE, opts).text).not.toContain('0903 636 940')
    })
    it("the venue's own phone survives", () => {
      const text = 'Mình chọn **Izakaya Kamura** cho bạn. Số điện thoại: +84 28 3535 7098.'
      expect(guardPlaceClaimsInText(text, EVIDENCE, opts).text).toBe(text)
    })
  })
}
