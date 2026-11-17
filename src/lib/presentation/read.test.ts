// Layout slice 3 (14/11/2026): the client's reader of the live frame `tappy.presentation.v1`, and the tab-lifetime hand-off that keeps the blocks across the save navigation.
// The client trusts nothing in the frame: the contract goes through parsePresentation again, a booking button needs a valid https link for that block (else the booking is dropped), and the
// frame can only produce the three block kinds the model may declare.
import { describe, it, expect, beforeEach } from 'vitest'
import { readPresentationFrame, rememberPresentation, recallPresentation, presentationKey, __resetPresentationCache } from './read'

const ASK = { id: 'a1', type: 'ask', questions: [{ text: 'Đi ghế ngồi hay giường nằm?', options: ['Ghế ngồi', 'Giường nằm'] }] }
const CMP = { id: 'c1', type: 'compare', columns: ['A', 'B'], rows: [{ label: 'Giá', cells: ['1', '2'] }] }
const BOOK = { id: 'b1', type: 'booking', kind: 'transport', title: 'Tàu SE8', providerId: 'vexere', ref: 'r1' }
const LINK = { url: 'https://vexere.com/vn/x', label: 'Vexere', providerId: 'vexere', handoff: 'guest' }
const frame = (blocks: unknown[], links?: Record<string, unknown>) => ({ kind: 'tappy.presentation.v1', v: 1, presentation: { v: 1, blocks }, ...(links ? { links } : {}) })

describe('readPresentationFrame', () => {
  it('reads the three kinds, with the booking\'s link', () => {
    const r = readPresentationFrame([frame([CMP, ASK, BOOK], { b1: LINK })])!
    expect(r.presentation.blocks.map(b => b.type)).toEqual(['compare', 'ask', 'booking'])
    expect(r.links.b1).toEqual(LINK)
  })
  it.each([undefined, null, [], [{}], [{ kind: 'tappy.places.v1' }], 'x', [5, null], [{ kind: 'tappy.presentation.v1', v: 2, presentation: { v: 1, blocks: [ASK] } }], [frame([])]])('%j gives nothing', (a) => {
    expect(readPresentationFrame(a as unknown)).toBeNull()
  })
  it('a booking without a valid https link for ITS id is dropped; the other blocks stay', () => {
    const none = readPresentationFrame([frame([BOOK, ASK])])!
    expect(none.presentation.blocks.map(b => b.id)).toEqual(['a1'])
    for (const bad of [{ ...LINK, url: 'http://vexere.com/x' }, { ...LINK, url: 'javascript:alert(1)' }, { ...LINK, url: 'https://' + 'a'.repeat(2100) + '.com' }, { ...LINK, label: '' }, { ...LINK, handoff: 'rocket' }, 'x', null]) {
      expect(readPresentationFrame([frame([BOOK, ASK], { b1: bad })])!.presentation.blocks.map(b => b.id)).toEqual(['a1'])
    }
    expect(readPresentationFrame([frame([BOOK], { b1: { ...LINK, url: 'http://x.example' } })])).toBeNull()
  })
  it('a link for a block that is not a booking, or does not exist, is ignored', () => {
    const r = readPresentationFrame([frame([ASK], { a1: LINK, zz: LINK })])!
    expect(r.links).toEqual({})
  })
  it('only the three declared kinds are drawn: a places / plan / report block in the frame is ignored', () => {
    const r = readPresentationFrame([frame([{ id: 'x', type: 'report', title: 'T', sourceCount: 2 }, ASK])])!
    expect(r.presentation.blocks.map(b => b.type)).toEqual(['ask'])
    expect(readPresentationFrame([frame([{ id: 'x', type: 'report', title: 'T', sourceCount: 2 }])])).toBeNull()
  })
  it('a declared gallery is read (it was dropped when only four kinds were known: the pictures never reached the page)', () => {
    const GAL = { id: 'g1', type: 'gallery', images: [{ caption: 'Model S', query: 'Tesla Model S' }, { caption: 'Model 3', query: 'Tesla Model 3' }] }
    const r = readPresentationFrame([frame([GAL, CMP])])!
    expect(r.presentation.blocks.map(b => b.type)).toEqual(['gallery', 'compare'])
  })
  it('the last frame of the message wins', () => {
    const r = readPresentationFrame([frame([ASK]), { kind: 'tappy.places.v1' }, frame([CMP])])!
    expect(r.presentation.blocks.map(b => b.type)).toEqual(['compare'])
  })
  it('a hostile frame never throws', () => {
    const evil: Record<string, unknown> = { kind: 'tappy.presentation.v1', v: 1 }
    Object.defineProperty(evil, 'presentation', { get() { throw new Error('boom') }, enumerable: true })
    expect(() => readPresentationFrame([evil, frame([ASK], { get b1() { throw new Error('x') } })])).not.toThrow()
  })
})

describe('the tab-lifetime hand-off', () => {
  beforeEach(() => __resetPresentationCache())
  const value = () => readPresentationFrame([frame([ASK])])!
  it('a remembered frame is recalled by the message text, as the places view is', () => {
    rememberPresentation('Câu trả lời A', value())
    expect(recallPresentation('Câu trả lời A')).toEqual(value())
    expect(recallPresentation('Câu trả lời B')).toBeNull()
  })
  it('the key is the whole text\'s shape, so two answers that open alike do not share blocks', () => {
    const open = 'Mình chọn tàu SE8 vì hợp giờ. '
    expect(presentationKey(open + 'Phần sau một.')).not.toBe(presentationKey(open + 'Phần sau hai, dài hơn.'))
    rememberPresentation(open + 'Phần sau một.', value())
    expect(recallPresentation(open + 'Phần sau hai, dài hơn.')).toBeNull()
  })
  it('is bounded, and an empty text is never stored', () => {
    for (let i = 0; i < 40; i++) rememberPresentation(`câu trả lời số ${i}`, value())
    expect(recallPresentation('câu trả lời số 0')).toBeNull()
    expect(recallPresentation('câu trả lời số 39')).not.toBeNull()
    rememberPresentation('   ', value())
    expect(recallPresentation('   ')).toBeNull()
  })
})
