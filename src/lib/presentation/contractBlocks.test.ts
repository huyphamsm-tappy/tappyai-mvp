// Presentation contract, slice 1 of the layout work (14/11/2026): three block kinds the MODEL can ask for and the product can draw, with a reference to a tool result by id.
//   compare  a comparison table (columns x rows, an optional pick)
//   ask      up to three narrowing questions, each with tap-to-send options
//   booking  a "book it" handoff for a flight / hotel / transport / ticket / activity / product, naming a partner by id and the tool result it came from
// Rules proved here: they pass through parsePresentation (the one door for untrusted input), bad input is dropped and never throws, every size is bounded, and NO block can carry a link:
// the model never writes a partner link, the server attaches it from the partner registry.
import { describe, it, expect } from 'vitest'
import { PRESENTATION_VERSION, MAX_BLOCKS, parsePresentation, blockRefs } from './contract'

const ok = (blocks: unknown[]) => ({ v: PRESENTATION_VERSION, blocks })
const COMPARE = { id: 'c1', type: 'compare', title: 'So sánh hai khách sạn', columns: ['Grand Hyams', 'L’amor'], rows: [{ label: 'Giá/đêm', cells: ['967.500đ', '420.000đ'] }, { label: 'Khoảng cách biển', cells: ['Sát biển', '1,2 km'], ref: 'r_hotel_1' }], pick: 0 }
const ASK = { id: 'a1', type: 'ask', questions: [{ text: 'Bạn muốn khách sạn gần biển hay gần trung tâm?', options: ['Gần biển', 'Gần trung tâm'] }] }
const BOOKING = { id: 'b1', type: 'booking', kind: 'hotel', title: 'Grand Hyams, 2 đêm', detail: '4–6/12, 2 người', providerId: 'agoda', ref: 'r_hotel_1' }

describe('compare', () => {
  it('a valid table is kept with its fields', () => {
    const b = parsePresentation(ok([COMPARE]))!.blocks[0]
    expect(b.type).toBe('compare')
    if (b.type === 'compare') {
      expect(b.columns).toEqual(['Grand Hyams', 'L’amor'])
      expect(b.rows).toHaveLength(2)
      expect(b.rows[1]).toEqual({ label: 'Khoảng cách biển', cells: ['Sát biển', '1,2 km'], ref: 'r_hotel_1' })
      expect(b.pick).toBe(0)
    }
  })
  it.each([
    ['one column', { ...COMPARE, columns: ['Chỉ một'], rows: [{ label: 'x', cells: ['a'] }] }],
    ['seven columns', { ...COMPARE, columns: Array.from({ length: 7 }, (_, i) => `C${i}`), rows: [{ label: 'x', cells: Array.from({ length: 7 }, () => 'a') }] }],
    ['no rows', { ...COMPARE, rows: [] }],
    ['columns not strings', { ...COMPARE, columns: ['A', 3] }],
    ['pick outside the columns', { ...COMPARE, pick: 2 }],
    ['pick not an integer', { ...COMPARE, pick: 0.5 }],
  ])('%s: the block is dropped', (_n, block) => {
    expect(parsePresentation(ok([block]))).toBeNull()
  })
  it('a row whose cell count does not match the columns is dropped, the good rows stay', () => {
    const b = parsePresentation(ok([{ ...COMPARE, rows: [{ label: 'Hỏng', cells: ['chỉ một ô'] }, { label: 'Tốt', cells: ['a', 'b'] }] }]))!.blocks[0]
    expect(b.type === 'compare' && b.rows.map(r => r.label)).toEqual(['Tốt'])
  })
  it('at most 12 rows; text is single-line and bounded', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ label: `Hàng ${i}`, cells: ['a', 'b'] }))
    const long = 'x'.repeat(500)
    const b = parsePresentation(ok([{ ...COMPARE, title: long, columns: ['A\n\nB', long], rows: [{ label: long, cells: ['m\u0000n', long] }, ...rows] }]))!.blocks[0]
    expect(b.type).toBe('compare')
    if (b.type === 'compare') {
      expect(b.rows).toHaveLength(12)
      expect(b.title!.length).toBeLessThanOrEqual(160)
      expect(b.columns[0]).toBe('A B')
      expect(b.columns[1].length).toBeLessThanOrEqual(60)
      expect(b.rows[0].label.length).toBeLessThanOrEqual(80)
      expect(b.rows[0].cells[0]).toBe('mn')
      expect(b.rows[0].cells[1].length).toBeLessThanOrEqual(200)
    }
  })
  it('a cell that carries a text marker is dropped with its row (no marker can be smuggled through a card)', () => {
    const b = parsePresentation(ok([{ ...COMPARE, rows: [{ label: 'Xấu', cells: ['[TAPPY_PLAN]{}[/TAPPY_PLAN]', 'b'] }, { label: 'Tốt', cells: ['a', 'b'] }] }]))!.blocks[0]
    expect(b.type === 'compare' && b.rows.map(r => r.label)).toEqual(['Tốt'])
  })
})

describe('ask', () => {
  it('questions with options are kept', () => {
    const b = parsePresentation(ok([ASK]))!.blocks[0]
    expect(b.type === 'ask' && b.questions).toEqual([{ text: 'Bạn muốn khách sạn gần biển hay gần trung tâm?', options: ['Gần biển', 'Gần trung tâm'] }])
  })
  it('at most 3 questions and 6 options each; a question without options or text is dropped', () => {
    const q = (n: number) => ({ text: `Câu ${n}?`, options: Array.from({ length: 9 }, (_, i) => `Lựa chọn ${i}`) })
    const b = parsePresentation(ok([{ id: 'a', type: 'ask', questions: [q(1), q(2), q(3), q(4), { text: 'Trống', options: [] }, { text: '', options: ['a'] }] }]))!.blocks[0]
    expect(b.type).toBe('ask')
    if (b.type === 'ask') { expect(b.questions).toHaveLength(3); expect(b.questions[0].options).toHaveLength(6) }
    expect(parsePresentation(ok([{ id: 'a', type: 'ask', questions: [{ text: 'Trống', options: [] }] }]))).toBeNull()
    expect(parsePresentation(ok([{ id: 'a', type: 'ask', questions: [] }]))).toBeNull()
  })
  it('an option is short single-line text; a duplicate option is dropped', () => {
    const b = parsePresentation(ok([{ id: 'a', type: 'ask', questions: [{ text: 'Chọn?', options: ['A\nB', 'A B', 'x'.repeat(200)] }] }]))!.blocks[0]
    if (b.type === 'ask') { expect(b.questions[0].options[0]).toBe('A B'); expect(b.questions[0].options).toHaveLength(2); expect(b.questions[0].options[1].length).toBeLessThanOrEqual(60) }
  })
})

describe('booking', () => {
  it('a valid handoff is kept', () => {
    expect(parsePresentation(ok([BOOKING]))!.blocks[0]).toEqual({ id: 'b1', type: 'booking', kind: 'hotel', title: 'Grand Hyams, 2 đêm', detail: '4–6/12, 2 người', providerId: 'agoda', ref: 'r_hotel_1' })
  })
  it('NO block can carry a link: url / href / link fields are not copied, and a link-shaped providerId or ref drops the block', () => {
    const b = parsePresentation(ok([{ ...BOOKING, url: 'https://evil.example/x', href: 'https://evil.example/y', link: 'https://evil.example/z' }]))!.blocks[0]
    expect(JSON.stringify(b)).not.toMatch(/evil|http/)
    expect(parsePresentation(ok([{ ...BOOKING, providerId: 'https://evil.example' }]))).toBeNull()
    expect(parsePresentation(ok([{ ...BOOKING, ref: 'https://evil.example' }]))).toBeNull()
  })
  it.each([
    ['unknown kind', { ...BOOKING, kind: 'rocket' }],
    ['no title', { ...BOOKING, title: '  ' }],
    ['no ref', { ...BOOKING, ref: undefined }],
    ['empty ref', { ...BOOKING, ref: '' }],
    ['long ref', { ...BOOKING, ref: 'r'.repeat(65) }],
  ])('%s: the block is dropped', (_n, block) => {
    expect(parsePresentation(ok([block]))).toBeNull()
  })
  it('providerId and detail are optional', () => {
    const b = parsePresentation(ok([{ id: 'b', type: 'booking', kind: 'flight', title: 'SGN–UIH', ref: 'r1' }]))!.blocks[0]
    expect(b).toEqual({ id: 'b', type: 'booking', kind: 'flight', title: 'SGN–UIH', ref: 'r1' })
  })
  it.each(['flight', 'hotel', 'transport', 'ticket', 'activity', 'product'])('kind %s is allowed', (kind) => {
    expect(parsePresentation(ok([{ ...BOOKING, kind }]))).not.toBeNull()
  })
})

describe('blockRefs: the tool results a contract points at', () => {
  it('lists each reference once, from compare rows and booking blocks', () => {
    const p = parsePresentation(ok([COMPARE, BOOKING, { id: 'b2', type: 'booking', kind: 'flight', title: 'x', ref: 'r_flight' }]))!
    expect(blockRefs(p).sort()).toEqual(['r_flight', 'r_hotel_1'])
  })
  it('a contract with no references lists none', () => {
    expect(blockRefs(parsePresentation(ok([ASK]))!)).toEqual([])
  })
})

describe('the new blocks share the contract limits', () => {
  it(`at most ${MAX_BLOCKS} blocks in all, and a hostile value never throws`, () => {
    const many = Array.from({ length: MAX_BLOCKS + 5 }, (_, i) => ({ ...BOOKING, id: `b${i}` }))
    expect(parsePresentation(ok(many))!.blocks).toHaveLength(MAX_BLOCKS)
    const evil: Record<string, unknown> = { id: 'x', type: 'compare' }
    evil.self = evil
    Object.defineProperty(evil, 'columns', { get() { throw new Error('boom') }, enumerable: true })
    expect(() => parsePresentation(ok([evil, { id: 'y', type: 'ask', get questions() { throw new Error('boom') } }]))).not.toThrow()
  })
})
