// A place card belongs under the text that talks about that place. The rule is about the TEXT AND THE DATA, never about a question, a keyword or a kind of venue: a name that the answer
// writes decides where its card goes, whatever the venue is (a restaurant, a hotel, a repair shop) and whatever the question was.
import { describe, it, expect } from 'vitest'
import { parseDoc } from '@/lib/answerDoc/parse'
import { mentionAnchor, embedAnchorsNamed, placeEmbedPlan } from './placeAnchoring'

const blocks = (t: string) => parseDoc(t)

describe('mentionAnchor: the block a named place\'s card goes AFTER', () => {
  const sections = '## La Villa French Restaurant\n\nMô tả La Villa, biệt thự Pháp.\n\n## The Deck Saigon\n\nMô tả The Deck, ven sông.\n\nCâu cuối.'

  it('a heading that names the place: the card follows the first paragraph of that section, not the heading', () => {
    const b = blocks(sections)
    expect(b[mentionAnchor(b, 'La Villa French Restaurant', ['La Villa French Restaurant', 'The Deck Saigon'])!].t).toBe('para')
    expect(mentionAnchor(b, 'La Villa French Restaurant', ['La Villa French Restaurant', 'The Deck Saigon'])).toBe(1)
    expect(mentionAnchor(b, 'The Deck Saigon', ['La Villa French Restaurant', 'The Deck Saigon'])).toBe(3)
  })

  it('a paragraph that names it: the card follows THAT paragraph', () => {
    const b = blocks('Mở đầu chung chung.\n\nVề **Quán Gió Mẫu**: không gian thoáng.\n\nVề **Quán Mưa Mẫu**: ấm cúng.')
    const names = ['Quán Gió Mẫu', 'Quán Mưa Mẫu']
    expect(mentionAnchor(b, names[0], names)).toBe(1)
    expect(mentionAnchor(b, names[1], names)).toBe(2)
  })

  it('accents, case and punctuation do not matter', () => {
    const b = blocks('Mở đầu.\n\nrất thích CƠM TẤM BA GHIỀN, đông khách.')
    expect(mentionAnchor(b, 'Cơm Tấm Ba Ghiền', ['Cơm Tấm Ba Ghiền'])).toBe(1)
  })

  it('a place the text never names has no anchor (it will go with the others)', () => {
    const b = blocks('Mở đầu.\n\nChỉ nói chuyện khác.')
    expect(mentionAnchor(b, 'Nhà hàng Không Được Nhắc', ['Nhà hàng Không Được Nhắc'])).toBeNull()
  })

  it('a name that is a whole-word part of another word does not match (no substring accidents)', () => {
    const b = blocks('Mở đầu.\n\nQuán Bachelor rất đông.')
    expect(mentionAnchor(b, 'Bach', ['Bach'])).toBeNull()
  })

  it('the shortened name the text uses still matches when it is unambiguous ("La Villa" for "La Villa French Restaurant")', () => {
    const b = blocks('Mở đầu.\n\nTôi chọn La Villa vì không gian riêng tư.')
    expect(mentionAnchor(b, 'La Villa French Restaurant', ['La Villa French Restaurant', 'The Deck Saigon'])).toBe(1)
  })

  it('...but not when two places share that start (ambiguous: nobody guesses)', () => {
    const b = blocks('Mở đầu.\n\nTôi chọn La Villa vì riêng tư.')
    const names = ['La Villa French Restaurant', 'La Villa Spa Garden']
    expect(mentionAnchor(b, names[0], names)).toBeNull()
    expect(mentionAnchor(b, names[1], names)).toBeNull()
  })

  it('a name of three words or fewer must match in full (a short generic start would hit everything)', () => {
    const b = blocks('Mở đầu.\n\nQuán ăn ở đây rất nhiều.')
    expect(mentionAnchor(b, 'Quán Ăn Ngon', ['Quán Ăn Ngon'])).toBeNull()
  })

  it('a paragraph that ends with a colon introduces what follows: the card goes after the following block', () => {
    const b = blocks('Mở đầu.\n\nTôi gợi ý **Quán Gió Mẫu**:\n\n- Không gian thoáng\n- Giá vừa')
    expect(mentionAnchor(b, 'Quán Gió Mẫu', ['Quán Gió Mẫu'])).toBe(2)
  })

  it('a summary that names several places is not where a card goes when a block later talks about that place alone', () => {
    const b = blocks('Hai chỗ đáng thử: **Quán Gió Mẫu** và **Quán Mưa Mẫu**.\n\nVề Quán Gió Mẫu: không gian thoáng.\n\nVề Quán Mưa Mẫu: ấm cúng.')
    const names = ['Quán Gió Mẫu', 'Quán Mưa Mẫu']
    expect(mentionAnchor(b, names[0], names)).toBe(1)
    expect(mentionAnchor(b, names[1], names)).toBe(2)
  })

  it('...and when only the summary names them, the summary is where they go', () => {
    const b = blocks('Hai chỗ đáng thử: **Quán Gió Mẫu** và **Quán Mưa Mẫu**.\n\nChúc bạn vui.')
    const names = ['Quán Gió Mẫu', 'Quán Mưa Mẫu']
    expect(mentionAnchor(b, names[0], names)).toBe(0)
    expect(mentionAnchor(b, names[1], names)).toBe(0)
  })

  it('no blocks, or a table-only answer: nothing to anchor to', () => {
    expect(mentionAnchor([], 'X Y Z', ['X Y Z'])).toBeNull()
  })

  it('works for any kind of venue (a hotel, a repair shop): the rule never looks at what the place is', () => {
    const b = blocks('## Khách sạn Biển Xanh Mẫu\n\nPhòng hướng biển.\n\n## Tiệm sửa xe Thành Mẫu\n\nSửa nhanh, bảo hành 6 tháng.')
    const names = ['Khách sạn Biển Xanh Mẫu', 'Tiệm sửa xe Thành Mẫu']
    expect(mentionAnchor(b, names[0], names)).toBe(1)
    expect(mentionAnchor(b, names[1], names)).toBe(3)
  })
})

describe('embedAnchorsNamed: named embeds follow their text, the others are spread as before', () => {
  it('with no names at all it is exactly the former spread', async () => {
    const { embedAnchors } = await import('./presentation')
    const b = blocks('A.\n\nB.\n\nC.\n\nD.')
    expect(embedAnchorsNamed(b, [undefined, undefined, undefined])).toEqual(embedAnchors(b, 3))
  })

  it('a named embed goes under its place and an unnamed one is spread over the gaps; the order of embeds is kept', () => {
    const b = blocks('Mở đầu.\n\nVề **Quán Gió Mẫu**: thoáng.\n\nChuyện khác.\n\nKết.')
    const a = embedAnchorsNamed(b, [undefined, 'Quán Gió Mẫu'], ['Quán Gió Mẫu'])
    expect(a[1]).toBe(1)
    expect(a[0]).toBe(0)
  })

  it('a named embed whose place the text does not name falls back to the spread (never dropped)', () => {
    const b = blocks('Mở đầu.\n\nChuyện khác.')
    const a = embedAnchorsNamed(b, ['Quán Vắng Mặt Mẫu'], ['Quán Vắng Mặt Mẫu'])
    expect(a).toHaveLength(1)
    expect(a[0]).toBeGreaterThanOrEqual(0)
  })

  it('never right after a heading, except the heading that IS the place and has no text under it', () => {
    const b = blocks('## Quán Gió Mẫu\n\n## Quán Mưa Mẫu\n\nÂm cúng.')
    const names = ['Quán Gió Mẫu', 'Quán Mưa Mẫu']
    const a = embedAnchorsNamed(b, names, names)
    expect(a[0]).toBe(0)
    expect(b[a[1]].t).toBe('para')
  })
})

describe('placeEmbedPlan: which places stand alone under their text and which go together', () => {
  const place = (id: string, name: string) => ({ id, name })
  it('named places stand alone, in the engine\'s order; the rest go to the group', () => {
    const text = '## Quán Gió Mẫu\n\nThoáng.\n\n## Quán Mưa Mẫu\n\nẤm.'
    const plan = placeEmbedPlan(text, [place('a', 'Quán Gió Mẫu'), place('b', 'Quán Nắng Mẫu'), place('c', 'Quán Mưa Mẫu')])
    expect(plan.solo.map(p => p.id)).toEqual(['a', 'c'])
    expect(plan.rest.map(p => p.id)).toEqual(['b'])
  })

  it('no place named at all: nobody stands alone (the former single group, unchanged)', () => {
    const plan = placeEmbedPlan('Chỉ lời khuyên chung.', [place('a', 'Quán Gió Mẫu'), place('b', 'Quán Mưa Mẫu')])
    expect(plan.solo).toEqual([])
    expect(plan.rest.map(p => p.id)).toEqual(['a', 'b'])
  })

  it('every place named: no group is left over', () => {
    const plan = placeEmbedPlan('Quán Gió Mẫu và Quán Mưa Mẫu.', [place('a', 'Quán Gió Mẫu'), place('b', 'Quán Mưa Mẫu')])
    expect(plan.solo.map(p => p.id)).toEqual(['a', 'b'])
    expect(plan.rest).toEqual([])
  })

  it('a single place the text names stands alone', () => {
    const plan = placeEmbedPlan('Tôi chọn Quán Gió Mẫu.', [place('a', 'Quán Gió Mẫu')])
    expect(plan.solo.map(p => p.id)).toEqual(['a'])
  })
})
