/**
 * NFC before tokenising — an ALWAYS-ON change (no flag): `wordsOf` feeds
 * `placeTokensFor` / `textNamesPlace` / `placeNamedBy`, i.e. the v1 place guard,
 * the v1 snippet-price guard, TikTok attribution and the food tool's price/order
 * scoping. Serper delivers some names decomposed (NFD); before this, "Giãn" split
 * into "gia" + "n" and such a venue could never be matched by that word.
 */
import { describe, expect, it } from 'vitest'
import { placeTokensFor, textNamesPlace, placeNamedBy, wordsOf } from './placeAttribution'

const NFC = 'Trạm Sạc Đầu | Gội Đầu Thư Giãn An Đông'
const NFD = NFC.normalize('NFD')

describe('decomposed provider names', () => {
  it('tokenise like their composed form', () => {
    expect(wordsOf(NFD)).toEqual(wordsOf(NFC))
    expect(wordsOf(NFD)).toContain('giãn')
  })
  it('get the same distinctive tokens, so the v1 rule can attribute to them', () => {
    const names = [NFD, 'Sunyata Retreat Hill Spa', 'Massage Quang Thư Quận 10']
    const [nfd] = placeTokensFor(names)
    expect(nfd.distinctive).toEqual(placeTokensFor([NFC, names[1], names[2]])[0].distinctive)
    expect(textNamesPlace('Mình chọn Trạm Sạc Đầu Gội Đầu Thư Giãn An Đông cho bạn.', '', nfd)).toBe(true)
    expect(placeNamedBy('Review Trạm Sạc Đầu - Gội Đầu Thư Giãn An Đông', '', placeTokensFor(names))).toBe(NFD)
  })
})
