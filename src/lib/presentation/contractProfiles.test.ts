// 15/11 (owner's layout for a comparison or a list of two or more subjects): the 'profiles' block - one card per subject - and the door it comes in by. The model declares it; nothing here knows a topic.
import { describe, it, expect } from 'vitest'
import { parsePresentation, PRESENTATION_VERSION } from './contract'
import { readPresentationFrame } from './read'
import { presentBlocksParameters, PRESENT_BLOCKS_DESCRIPTION } from './declare'

const block = (items: unknown[], extra: Record<string, unknown> = {}) => ({ v: PRESENTATION_VERSION, blocks: [{ id: 'p1', type: 'profiles', items, ...extra }] })
const elon = { name: 'Elon Musk', subtitle: '1971 · 55 tuổi', points: [{ lead: 'Tesla', text: 'xe điện.' }, { lead: 'SpaceX', text: 'tên lửa tái sử dụng.' }], sources: ['Tesla Investor Relations', 'TechCrunch'] }
const sam = { name: 'Sam Altman', points: [{ lead: 'OpenAI', text: 'đồng sáng lập và CEO.' }, { text: 'Một ý không có nhãn.' }] }

describe('the profiles block', () => {
  it('two or more subjects with points become cards; lead, subtitle and sources are kept as the model wrote them', () => {
    const p = parsePresentation(block([elon, sam], { title: 'So sánh thành tích' }))!
    const b = p.blocks[0] as Extract<typeof p.blocks[number], { type: 'profiles' }>
    expect(b.type).toBe('profiles')
    expect(b.title).toBe('So sánh thành tích')
    expect(b.items).toHaveLength(2)
    expect(b.items[0]).toEqual({ name: 'Elon Musk', subtitle: '1971 · 55 tuổi', points: [{ lead: 'Tesla', text: 'xe điện.' }, { lead: 'SpaceX', text: 'tên lửa tái sử dụng.' }], sources: ['Tesla Investor Relations', 'TechCrunch'] })
    expect(b.items[1].points[1]).toEqual({ text: 'Một ý không có nhãn.' }) // a point may have no label
    expect('subtitle' in b.items[1]).toBe(false)
  })
  it('one subject is a valid block (the fact check may leave one); a subject with no point is not a card, and nothing usable is no block', () => {
    expect((parsePresentation(block([elon]))!.blocks[0] as { items: unknown[] }).items).toHaveLength(1)
    expect((parsePresentation(block([elon, { name: 'Trống', points: [] }]))!.blocks[0] as { items: unknown[] }).items).toHaveLength(1)
    expect(parsePresentation(block([{ name: 'Trống', points: [] }]))).toBeNull()
  })
  it('a repeated name, a card with no usable point, and everything past six are dropped; the sizes are bounded', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Chủ thể ${i}`, points: [{ text: 'x'.repeat(500) }] }))
    const b = parsePresentation(block([elon, { ...elon, name: 'ELON MUSK' }, ...many]))!.blocks[0] as { items: Array<{ name: string; points: Array<{ text: string }> }> }
    expect(b.items.map(i => i.name)).toEqual(['Elon Musk', 'Chủ thể 0', 'Chủ thể 1', 'Chủ thể 2', 'Chủ thể 3', 'Chủ thể 4'])
    expect(b.items[1].points[0].text.length).toBeLessThanOrEqual(260)
    const long = parsePresentation(block([{ name: 'A', points: Array.from({ length: 12 }, (_, i) => ({ text: `ý ${i}` })) }, sam]))!.blocks[0] as { items: Array<{ points: unknown[] }> }
    expect(long.items[0].points).toHaveLength(6)
  })
  it('a source is a NAME: an address is refused, so a card never carries a link of the model\'s own; a text marker voids the field', () => {
    const b = parsePresentation(block([{ ...elon, sources: ['https://evil.example/x', 'www.evil.example', 'Reuters', 'Reuters'] }, sam]))!.blocks[0] as { items: Array<{ sources?: string[] }> }
    expect(b.items[0].sources).toEqual(['Reuters'])
    const marked = parsePresentation(block([{ name: 'A', points: [{ text: 'ok [TAPPY_PLAN]{}[/TAPPY_PLAN]' }, { text: 'tốt' }] }, sam]))!.blocks[0] as { items: Array<{ points: Array<{ text: string }> }> }
    expect(marked.items[0].points.map(p => p.text)).toEqual(['tốt'])
  })
  it('the client reads it from the live frame like the other declared blocks (and still drops a block kind the model may not declare)', () => {
    const frame = { kind: 'tappy.presentation.v1', v: 1, presentation: { v: 1, blocks: [{ id: 'p1', type: 'profiles', items: [elon, sam] }, { id: 'r1', type: 'report', title: 'T', sourceCount: 3 }] } }
    const got = readPresentationFrame([frame])!
    expect(got.presentation.blocks.map(b => b.type)).toEqual(['profiles'])
  })
})

describe('what the model is told', () => {
  it('present_blocks accepts "profiles" with its items, and says when to use it - for any kind of subject, with the facts in the cards, not repeated in the text', () => {
    const ok = presentBlocksParameters.safeParse({ blocks: [{ id: 'p1', type: 'profiles', title: 'T', items: [{ name: 'A', subtitle: 's', points: [{ lead: 'l', text: 't' }], sources: ['Reuters'] }, { name: 'B', points: [{ text: 't' }] }] }] })
    expect(ok.success).toBe(true)
    expect(PRESENT_BLOCKS_DESCRIPTION).toMatch(/"profiles"/)
    expect(PRESENT_BLOCKS_DESCRIPTION).toMatch(/TWO OR MORE named subjects/)
    expect(PRESENT_BLOCKS_DESCRIPTION).toMatch(/not again in the text/)
    expect(PRESENT_BLOCKS_DESCRIPTION).toMatch(/never an address/)
  })
})
