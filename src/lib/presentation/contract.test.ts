// The presentation contract v1: ONE typed, validated description of what an answer shows besides its text (places, an itinerary, subject/option/news cards, a research report).
// Two jobs, both tested here: (1) parsePresentation turns an UNTRUSTED value (stored, forged or sent by the server) into a contract the renderer can trust, dropping what is wrong
// and never throwing; (2) presentationFromMessage reads the channels the product already has (text markers, the places annotation, the report's shape) into that one contract, so
// there is a single place to look. Pure: no network, no model.
import { describe, it, expect } from 'vitest'
import { PRESENTATION_VERSION, MAX_BLOCKS, parsePresentation, presentationFromMessage, type Presentation } from './contract'

const PLAN = { type: 'trip', title: 'Đà Lạt 2N1Đ', people: 2, days: [{ label: 'Ngày 1', items: [{ time: '09:00', emoji: '📍', category: 'entertainment', name: 'Hồ Xuân Hương' }] }, { label: 'Ngày 2', items: [{ time: '08:00', emoji: '☕', category: 'food', name: 'Quán Cà Phê Mẫu' }] }] }
const ENTITIES = { v: 1, kind: 'entities', entities: [{ name: 'Elon Musk', summary: 'Doanh nhân.', href: 'https://en.wikipedia.org/wiki/Elon_Musk', source: 'Wikipedia' }, { name: 'Sam Altman', summary: 'Doanh nhân.', href: 'https://en.wikipedia.org/wiki/Sam_Altman', source: 'Wikipedia' }] }
const PLACE = (id: string, name: string) => ({ id, domain: 'food', kind: 'place', name, rank: 0, actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://www.google.com/maps/search/?api=1&query=x', labelKey: 'v3.action.maps', priority: 1 }] })
const VIEW = (names: string[]) => ({ kind: 'tappy.places.v1', v: 1, domain: 'food', ranked: true, items: names.map((n, i) => PLACE(`p${i}`, n)) })
const REPORT_TEXT = '# Báo cáo mẫu\n\n' + ['Bối cảnh', 'Phân tích', 'So sánh', 'Rủi ro'].map(h => `## ${h}\n\n${'Đoạn mẫu cho báo cáo nghiên cứu. '.repeat(60)}`).join('\n\n') + '\n\n## Nguồn\n\n1. Nguồn một — site1.vn\n2. Nguồn hai — site2.vn\n3. Nguồn ba — site3.vn'

const ok = (blocks: unknown[]) => ({ v: PRESENTATION_VERSION, blocks })

describe('parsePresentation: an untrusted value becomes a contract the renderer can trust, or null', () => {
  it.each([null, undefined, 0, 'x', [], {}, { v: 2, blocks: [] }, { v: 1 }, { v: 1, blocks: 'no' }, { blocks: [] }])('%j is not a contract', (raw) => {
    expect(parsePresentation(raw)).toBeNull()
  })

  it('keeps a valid block of each type, in the given order', () => {
    const p = parsePresentation(ok([
      { id: 'a', type: 'media', media: ENTITIES },
      { id: 'b', type: 'plan', plan: PLAN },
      { id: 'c', type: 'places', view: VIEW(['Quán Gió Mẫu', 'Quán Mưa Mẫu']) },
      { id: 'd', type: 'report', title: 'Báo cáo mẫu', sourceCount: 3 },
    ]))!
    expect(p.blocks.map(b => b.type)).toEqual(['media', 'plan', 'places', 'report'])
    const plan = p.blocks[1]
    expect(plan.type === 'plan' && plan.plan.days).toHaveLength(2)
    const places = p.blocks[2]
    expect(places.type === 'places' && places.view.items.map(i => i.name)).toEqual(['Quán Gió Mẫu', 'Quán Mưa Mẫu'])
  })

  it('a wrong block is dropped and the right ones around it are kept (one bad card never costs the answer)', () => {
    const p = parsePresentation(ok([
      { id: 'a', type: 'plan', plan: { type: 'trip', days: 'nope' } },
      { id: 'b', type: 'report', title: 'Còn dùng được', sourceCount: 2 },
      { id: 'c', type: 'hologram', data: {} },
      { id: 'd', type: 'media', media: { v: 1, kind: 'entities', entities: [{ name: 'X', summary: 'y', href: 'javascript:alert(1)', source: 'Wikipedia' }] } },
      null, 7, 'x',
    ]))!
    expect(p.blocks.map(b => b.id)).toEqual(['b'])
  })

  it('no valid block at all: null (nothing to draw)', () => {
    expect(parsePresentation(ok([{ id: 'a', type: 'plan', plan: {} }, { id: 'b', type: 'zzz' }]))).toBeNull()
    expect(parsePresentation(ok([]))).toBeNull()
  })

  it('an id must be a short non-empty string and unique: the second use of an id is dropped', () => {
    const p = parsePresentation(ok([
      { id: 'a', type: 'report', title: 'Một', sourceCount: 1 },
      { id: 'a', type: 'report', title: 'Hai', sourceCount: 2 },
      { id: '', type: 'report', title: 'Ba', sourceCount: 3 },
      { id: 'x'.repeat(65), type: 'report', title: 'Bốn', sourceCount: 4 },
      { id: 5, type: 'report', title: 'Năm', sourceCount: 5 },
    ]))!
    expect(p.blocks.map(b => b.id)).toEqual(['a'])
    expect((p.blocks[0] as { title: string }).title).toBe('Một')
  })

  it(`at most ${MAX_BLOCKS} blocks are read`, () => {
    const many = Array.from({ length: MAX_BLOCKS + 8 }, (_, i) => ({ id: `r${i}`, type: 'report', title: `T${i}`, sourceCount: 1 }))
    expect(parsePresentation(ok(many))!.blocks).toHaveLength(MAX_BLOCKS)
  })

  it('media goes through the product\'s own card validation: a link on a host that is not allowed drops the card', () => {
    expect(parsePresentation(ok([{ id: 'a', type: 'media', media: { v: 1, kind: 'entities', entities: [{ name: 'A', summary: 'a', href: 'https://evil.example/x', source: 'Wikipedia' }, { name: 'B', summary: 'b', href: 'https://evil.example/y', source: 'Wikipedia' }] } }]))).toBeNull()
    expect(parsePresentation(ok([{ id: 'a', type: 'media', media: ENTITIES }]))).not.toBeNull()
  })

  it('places go through the product\'s own reader: no item with a name means no block; an item list is cleaned', () => {
    expect(parsePresentation(ok([{ id: 'a', type: 'places', view: { kind: 'tappy.places.v1', v: 1, domain: 'food', items: [] } }]))).toBeNull()
    expect(parsePresentation(ok([{ id: 'a', type: 'places', view: { kind: 'something.else', items: [PLACE('p', 'X')] } }]))).toBeNull()
    const p = parsePresentation(ok([{ id: 'a', type: 'places', view: { ...VIEW(['A']), items: [PLACE('p0', 'A'), { id: 'p1', name: '' }] } }]))!
    expect((p.blocks[0] as { view: { items: unknown[] } }).view.items).toHaveLength(1)
  })

  it('a plan goes through the product\'s own plan parser (prices projected, days required) and is size-bounded', () => {
    expect(parsePresentation(ok([{ id: 'a', type: 'plan', plan: { ...PLAN, days: [] } }]))).not.toBeNull() // an empty days array is a plan the product accepts; the renderer decides
    expect(parsePresentation(ok([{ id: 'a', type: 'plan', plan: { ...PLAN, days: undefined } }]))).toBeNull()
    const huge = { ...PLAN, days: [{ label: 'Ngày 1', items: Array.from({ length: 4000 }, (_, i) => ({ time: '09:00', emoji: '📍', category: 'x', name: `Điểm ${i}`, description: 'x'.repeat(40) })) }] }
    expect(parsePresentation(ok([{ id: 'a', type: 'plan', plan: huge }]))).toBeNull()
  })

  it('a report block needs a title and a small non-negative whole source count', () => {
    for (const bad of [{ title: '', sourceCount: 2 }, { title: 'T', sourceCount: -1 }, { title: 'T', sourceCount: 1.5 }, { title: 'T', sourceCount: 100000 }, { title: 'T', sourceCount: '3' }, { title: 5, sourceCount: 2 }]) {
      expect(parsePresentation(ok([{ id: 'a', type: 'report', ...bad }]))).toBeNull()
    }
    const p = parsePresentation(ok([{ id: 'a', type: 'report', title: 'T'.repeat(400), sourceCount: 0 }]))!
    expect((p.blocks[0] as { title: string }).title).toHaveLength(160)
  })

  it('only the known fields survive: extra properties are not carried (nothing smuggled into the renderer)', () => {
    const p = parsePresentation(ok([{ id: 'a', type: 'report', title: 'T', sourceCount: 1, onClick: 'alert(1)', html: '<img onerror=x>', __proto__: { polluted: true } }]))!
    expect(Object.keys(p.blocks[0]).sort()).toEqual(['id', 'sourceCount', 'title', 'type'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(p).sort()).toEqual(['blocks', 'v'])
  })

  it('never throws, whatever it is handed (cyclic object, getter that throws, huge array)', () => {
    const cyc: Record<string, unknown> = { v: 1 }; cyc.blocks = [cyc]
    const evil = { v: 1, get blocks(): unknown { throw new Error('boom') } }
    expect(() => parsePresentation(cyc)).not.toThrow()
    expect(() => parsePresentation(evil)).not.toThrow()
    expect(parsePresentation(evil)).toBeNull()
    expect(() => parsePresentation({ v: 1, blocks: new Array(1e6).fill(null) })).not.toThrow()
  })
})

describe('presentationFromMessage: the channels the product already has, read into ONE contract', () => {
  it('a plain answer has no contract and its text is untouched', () => {
    const r = presentationFromMessage({ content: 'Thủ đô của Việt Nam là Hà Nội.' })
    expect(r.presentation).toBeNull()
    expect(r.text).toBe('Thủ đô của Việt Nam là Hà Nội.')
  })

  it('a [TAPPY_PLAN] marker becomes a plan block and is removed from the text', () => {
    const r = presentationFromMessage({ content: `Lịch đây.\n\n[TAPPY_PLAN]${JSON.stringify(PLAN)}[/TAPPY_PLAN]` })
    expect(r.presentation!.blocks.map(b => b.type)).toEqual(['plan'])
    expect(r.text).toBe('Lịch đây.')
  })

  it('a [TAPPY_MEDIA] marker becomes a media block (only a valid one) and is removed from the text', () => {
    const r = presentationFromMessage({ content: `Hai người.\n\n[TAPPY_MEDIA]${JSON.stringify(ENTITIES)}[/TAPPY_MEDIA]` })
    expect(r.presentation!.blocks.map(b => b.type)).toEqual(['media'])
    expect(r.text).toBe('Hai người.')
    const bad = presentationFromMessage({ content: `Hai người.\n\n[TAPPY_MEDIA]${JSON.stringify({ v: 1, kind: 'entities', entities: [{ name: 'A', summary: 'a', href: 'javascript:1', source: 'Wikipedia' }] })}[/TAPPY_MEDIA]` })
    expect(bad.presentation).toBeNull()
    expect(bad.text).toBe('Hai người.')
  })

  it('the places annotation becomes a places block; the tab\'s remembered view is used only when the message carries no annotation', () => {
    const live = presentationFromMessage({ content: 'Có vài chỗ.', annotations: [VIEW(['Từ Chú Thích'])], recalledPlaces: VIEW(['Từ Bộ Nhớ']) as never })
    expect((live.presentation!.blocks[0] as { view: { items: Array<{ name: string }> } }).view.items[0].name).toBe('Từ Chú Thích')
    const recalled = presentationFromMessage({ content: 'Có vài chỗ.', recalledPlaces: VIEW(['Từ Bộ Nhớ']) as never })
    expect((recalled.presentation!.blocks[0] as { view: { items: Array<{ name: string }> } }).view.items[0].name).toBe('Từ Bộ Nhớ')
    expect(presentationFromMessage({ content: 'Có vài chỗ.', annotations: [{ kind: 'tappy.places.v1', items: [] }] }).presentation).toBeNull()
  })

  it('a long, headed answer is a report block: its title from the first heading and the number of sources it lists', () => {
    const r = presentationFromMessage({ content: REPORT_TEXT })
    const b = r.presentation!.blocks[0]
    expect(b.type).toBe('report')
    expect(b.type === 'report' && b.title).toBe('Báo cáo mẫu')
    expect(b.type === 'report' && b.sourceCount).toBe(3)
    expect(r.text).toBe(REPORT_TEXT)
  })

  it('a research card on a message that has no report yet (still being written) is NOT a report block', () => {
    const r = presentationFromMessage({ content: 'Đang viết…', annotations: [{ type: 'tappy.research.v1', title: 'T', phase: 'researching', steps: [], links: [] }] })
    expect(r.presentation).toBeNull()
  })

  it('the cited links of a live research card raise the source count when they are more than the text lists', () => {
    const links = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `L${i}`, url: `https://site${i}.vn/x` }))
    const r = presentationFromMessage({ content: REPORT_TEXT, annotations: [{ type: 'tappy.research.v1', title: 'T', phase: 'done', steps: [], links }] })
    const b = r.presentation!.blocks[0]
    expect(b.type === 'report' && b.sourceCount).toBe(7)
  })

  it('a mixed answer gets its blocks in one fixed order (report, media, plan, places), with unique stable ids', () => {
    const content = `Mở đầu.\n\n[TAPPY_PLAN]${JSON.stringify(PLAN)}[/TAPPY_PLAN]\n\n[TAPPY_MEDIA]${JSON.stringify(ENTITIES)}[/TAPPY_MEDIA]`
    const r = presentationFromMessage({ content, annotations: [VIEW(['Quán A'])] })
    expect(r.presentation!.blocks.map(b => b.type)).toEqual(['media', 'plan', 'places'])
    const ids = r.presentation!.blocks.map(b => b.id)
    expect(new Set(ids).size).toBe(3)
    expect(presentationFromMessage({ content, annotations: [VIEW(['Quán A'])] }).presentation!.blocks.map(b => b.id)).toEqual(ids)
  })

  it('what it produces is itself a valid contract, and parsing it again changes nothing (idempotent)', () => {
    const content = `Mở đầu.\n\n[TAPPY_PLAN]${JSON.stringify(PLAN)}[/TAPPY_PLAN]\n\n[TAPPY_MEDIA]${JSON.stringify(ENTITIES)}[/TAPPY_MEDIA]`
    const p = presentationFromMessage({ content, annotations: [VIEW(['Quán A', 'Quán B'])] }).presentation as Presentation
    expect(parsePresentation(p)).toEqual(p)
    expect(parsePresentation(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('a broken marker never leaks into the text and never makes a block', () => {
    const r = presentationFromMessage({ content: 'Trước.\n\n[TAPPY_PLAN]{"type":"trip","days":[{"label":"x" BROKEN[/TAPPY_PLAN]\n\nSau.' })
    expect(r.presentation).toBeNull()
    expect(r.text).toContain('Trước.')
    expect(r.text).toContain('Sau.')
    expect(r.text).not.toMatch(/TAPPY_PLAN|BROKEN/)
  })

  it('never throws on garbage input', () => {
    for (const content of [undefined, null, 5, {}, [], '\u0000', 'x'.repeat(2_000_000)]) {
      expect(() => presentationFromMessage({ content: content as never })).not.toThrow()
    }
    expect(() => presentationFromMessage({ content: 'x', annotations: 'no' as never })).not.toThrow()
  })
})
