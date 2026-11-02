import { describe, it, expect } from 'vitest'
import { distinguishingLabels, newestShopCardTitles, resolveShownReference, shopCardTitles } from './shownProductRef'

// Product names written for this test (not taken from any benchmark file or run).
const SHOWN = [
  'Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe',
  'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor',
  'Ốp lưng iPhone 17 Pro Max UAG Plasma Magsafe Clear',
  'Ốp lưng iPhone 17 Pro Casetify Impact',
  'Ốp lưng iPhone 17 Pro Max ESR Halolock Magsafe',
  'Ốp lưng iPhone 17 Pro Max Apple Clear With Magsafe',
]
const card = (names: unknown[]) => `Mình chọn một mẫu.\n[TAPPY_SHOPPING]${JSON.stringify({ v: 1, entities: names.map((name, i) => ({ key: `e${i}`, name })) })}[/TAPPY_SHOPPING]\nGhi chú.`

describe('shopCardTitles / newestShopCardTitles: the names come from the card payload', () => {
  it('reads the names of the shopping payload, de-duplicated, ignoring blanks and non-strings', () => {
    expect(shopCardTitles(card(['A one', 'A one', '  ', 12, null, 'B two']))).toEqual(['A one', 'B two'])
  })
  it('a text without a card, or with a malformed payload, yields nothing', () => {
    expect(shopCardTitles('Chỉ là lời văn.')).toEqual([])
    expect(shopCardTitles('[TAPPY_SHOPPING]{not json[/TAPPY_SHOPPING]')).toEqual([])
    expect(shopCardTitles('[TAPPY_SHOPPING]{"entities":"x"}[/TAPPY_SHOPPING]')).toEqual([])
  })
  it('newest card wins; a later reply with no card does not hide it', () => {
    expect(newestShopCardTitles([card(['Old one']), card(['New one', 'New two']), 'Trả lời không thẻ.'])).toEqual(['New one', 'New two'])
    expect(newestShopCardTitles(['x', 'y'])).toEqual([])
  })
})

describe('resolveShownReference: a message points at a shown product only through a word that tells products apart AND a demonstrative (Wave 2E)', () => {
  it('ONE: exactly one product carries the strongest match', () => {
    for (const msg of ['lấy cái uag đó, đặt online', 'UAG đó nhé', 'mình thích bản Spigen này', 'tôi chọn casetify đó']) {
      const r = resolveShownReference(msg, SHOWN)
      expect(r.kind, msg).toBe('one')
      expect(r.titles, msg).toHaveLength(1)
    }
    expect(resolveShownReference('lấy cái uag đó', SHOWN).titles[0]).toContain('UAG')
  })
  it('without a demonstrative nothing points - not even the whole shown title typed back (Wave 2D read it as that product)', () => {
    expect(resolveShownReference(SHOWN[1], SHOWN).kind).toBe('none')
    for (const msg of ['lấy cái uag đi, đặt online', 'UAG nhé', 'mình thích bản Spigen', 'tôi chọn casetify']) expect(resolveShownReference(msg, SHOWN).kind, msg).toBe('none')
  })
  it('MANY (2-4): the data cannot tell them apart - the candidates are returned', () => {
    const r = resolveShownReference('lấy bản apple đó', SHOWN)
    expect(r.kind).toBe('many')
    expect(r.titles).toEqual([SHOWN[0], SHOWN[5]])
  })
  it('the strongest match narrows: two matching tokens beat one', () => {
    expect(resolveShownReference('apple clear đó', SHOWN)).toMatchObject({ kind: 'one', titles: [SHOWN[5]] })
  })
  it('NONE: words every title shares, ordinary lower-case words, numbers, and a match broader than half of the card point at nothing', () => {
    expect(resolveShownReference('ốp lưng iphone đó', SHOWN).kind).toBe('none') // the category words are in every title
    expect(resolveShownReference('cho mình xem cái khác nha, mua online', SHOWN).kind).toBe('none') // function words never count
    expect(resolveShownReference('bản 17 đó', SHOWN).kind).toBe('none') // a bare number is never a name
    expect(resolveShownReference('lấy bản max đó', SHOWN).kind).toBe('none') // "Max" is in 5 of 6 titles: the category, not a pointer
    expect(resolveShownReference('lấy bản magsafe đó', SHOWN).kind).toBe('none') // "Magsafe" is in 4 of 6: more than half
    expect(resolveShownReference('lấy bản clear đó', SHOWN)).toMatchObject({ kind: 'many', titles: [SHOWN[2], SHOWN[5]] }) // "Clear" is in 2 of 6: it tells them apart, but not one from the other
    expect(resolveShownReference('lấy bản pro đó', SHOWN).kind).toBe('none') // every title
    expect(resolveShownReference('', SHOWN).kind).toBe('none')
  })
  it('NONE with fewer than two products on the card (nothing to tell apart), and for duplicates of one product', () => {
    expect(resolveShownReference('uag đó', ['Ốp lưng UAG Plasma']).kind).toBe('none')
    expect(resolveShownReference('uag đó', ['Ốp lưng UAG Plasma', 'ốp lưng uag plasma']).kind).toBe('none')
  })
  it('diacritics and case do not matter in the NAME; the demonstrative needs its own diacritics', () => {
    const shown = ['Tai nghe Sony WH-1000XM5 Đen', 'Tai nghe Bose QuietComfort Đen', 'Tai nghe JBL Tune Trắng', 'Tai nghe Marshall Major Kem']
    expect(resolveShownReference('lấy cái SONY đó', shown)).toMatchObject({ kind: 'one', titles: [shown[0]] })
    expect(resolveShownReference('lay cai sony đó', shown)).toMatchObject({ kind: 'one', titles: [shown[0]] })
    expect(resolveShownReference('lay cai sony do', shown).kind).toBe('none') // "do" is "by", not "that"
    expect(resolveShownReference('màu đen đó', shown)).toMatchObject({ kind: 'many', titles: [shown[0], shown[1]] })
  })
  it('a descriptive phrase of a request is not a pointer even when a title carries its words', () => {
    const shown = ['Loa Marshall cho phòng khách', 'Loa JBL Charge', 'Loa Sony Extra Bass']
    expect(resolveShownReference('cho phòng ngủ', shown).kind).toBe('none')
    expect(resolveShownReference('cho phòng ngủ đó', shown).kind).toBe('none')
  })
  it('a negation just before the name turns the message away from it; a word the consultation already used is its own description', () => {
    expect(resolveShownReference('không lấy cái uag đó đâu', SHOWN).kind).toBe('none')
    expect(resolveShownReference('bỏ cái Spigen đó đi', SHOWN).kind).toBe('none')
    expect(resolveShownReference('cái uag đó', SHOWN, { established: ['tìm ốp UAG cho iphone'] }).kind).toBe('none')
    expect(resolveShownReference('cái uag đó', SHOWN, { established: ['tìm ốp lưng cho iphone'] }).kind).toBe('one')
  })
})

describe('distinguishingLabels: the words that tell the candidates apart', () => {
  it('drops what every candidate carries and keeps at most three words', () => {
    expect(distinguishingLabels([SHOWN[0], SHOWN[5]])).toEqual(['Silicon', 'Clear'])
  })
  it('a candidate whose label would be empty or equal to another is built from the first words of its own title plus its position, so two options are never the same text', () => {
    expect(distinguishingLabels(['Loa Alpha Bass Đen', 'Loa Alpha Bass Trắng'])).toEqual(['Đen', 'Trắng'])
    // "Loa Alpha" is wholly contained in the other title: its label would be empty
    const labels = distinguishingLabels(['Loa Alpha', 'Loa Alpha Mini Bass'])
    expect(labels[0]).toBe('Loa Alpha 1')
    expect(labels[1]).toBe('Mini Bass')
    expect(new Set(labels).size).toBe(labels.length)
  })
})
