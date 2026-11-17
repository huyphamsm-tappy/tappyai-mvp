// Layout slices 2-3 (14/11/2026): the pure part of "the model declares the blocks it wants".
//   - every data tool result of the turn gets an id (`r1`, `r2`, ...) the model can point at;
//   - the partner links a result carries stay on the server, with that id;
//   - a declared contract is checked against the turn: a booking must point at a result of a tool that fits its kind and name a partner the registry knows, a compare row's reference to a result
//     that does not exist is removed, nothing is trusted from the model but plain words;
//   - a booking gets the partner link of ITS OWN result (the model never writes one) and a booking with no link is dropped.
import { describe, it, expect } from 'vitest'
import { ResultLedger, withResultIds, validateDeclared, resolveBookingLinks, makeProviderOfUrl, linkCandidatesOf, presentationAnnotation, PRESENTATION_ANNOTATION_KIND } from './declare'

const PROVIDERS = new Set(['agoda', 'tripcom', 'vexere'])
const REGISTRY = [
  { providerId: 'vexere', allowedHosts: ['vexere.com'] },
  { providerId: 'tripcom', allowedHosts: ['trip.com', 'vn.trip.com'] },
  { providerId: 'agoda', allowedHosts: ['agoda.com'] },
]
const providerOf = makeProviderOfUrl(REGISTRY)
const ledgerWith = (...tools: string[]) => { const l = new ResultLedger(); const ids = tools.map(t => l.register(t)); return { l, ids } }

describe('ResultLedger evidence (the text the declared cards are fact-checked against)', () => {
  it('keeps the text of each lookup result; the newest comes first, each is cut, and the whole is bounded', () => {
    const l = new ResultLedger()
    l.register('web_search', [], 'older result about Madame Lam')
    l.register('search_places', [], 'newer result: TRE Dining ' + 'x'.repeat(100))
    l.register('get_weather', [])
    const ev = l.evidence(10_000, 40)
    expect(ev.indexOf('TRE Dining')).toBeLessThan(ev.indexOf('Madame Lam'))
    expect(ev).toContain('[search_places]')
    expect(ev).not.toContain('x'.repeat(41)) // cut per result
    const bounded = l.evidence(150, 5000)
    expect(bounded).toContain('TRE Dining')
    expect(bounded).not.toContain('Madame Lam') // total bound: the older one no longer fits and is skipped
    expect(new ResultLedger().evidence()).toBe('')
  })

  it('withResultIds writes every object result into the evidence, errors included in what the model saw', async () => {
    const l = new ResultLedger()
    const set = withResultIds({ web_search: { execute: async () => ({ results: [{ title: 'Madame Lam', snippet: 'mở cửa 07:00-22:00' }] }) } }, l, new Set())
    const r = await (set.web_search as unknown as { execute: () => Promise<Record<string, unknown>> }).execute()
    expect(r.result_id).toBe('r1')
    expect(l.evidence()).toContain('mở cửa 07:00-22:00')
  })

  it('links and picture addresses do not take the room of the facts: they are left out of the evidence text, the facts after them stay', async () => {
    const l = new ResultLedger()
    const set = withResultIds({ search_products: { execute: async () => ({ _tappy_data: 'x', products: [{ title: 'Xiaomi 15', link: 'https://www.google.com/search?' + 'a'.repeat(9000), image: 'https://img/' + 'b'.repeat(9000), price_vnd: 15250000 }] }) } }, l, new Set())
    await (set.search_products as unknown as { execute: () => Promise<unknown> }).execute()
    const ev = l.evidence()
    expect(ev).toContain('15250000')
    expect(ev).not.toContain('aaaa')
    expect(ev).not.toContain('bbbb')
  })
})

describe('ResultLedger', () => {
  it('numbers results in order and remembers which tool made each', () => {
    const l = new ResultLedger()
    expect(l.register('get_hotel_prices')).toBe('r1')
    expect(l.register('web_search')).toBe('r2')
    expect(l.toolOf('r1')).toBe('get_hotel_prices')
    expect(l.toolOf('r2')).toBe('web_search')
    expect(l.toolOf('r3')).toBeUndefined()
    expect(l.toolOf('constructor')).toBeUndefined()
    expect(l.toolOf('__proto__')).toBeUndefined()
    expect(l.linksOf('constructor')).toEqual([])
  })
})

describe('withResultIds', () => {
  const tools = {
    get_hotel_prices: { description: 'h', execute: async () => ({ hotels: [1] }) },
    web_search: { description: 's', execute: () => ({ results: [] }) },
    calculate: { description: 'c', execute: async () => 42 },
    get_news: { description: 'n', execute: async () => [{ a: 1 }] },
    present_plan: { description: 'p', execute: async () => ({ ok: true }) },
    noExec: { description: 'x' },
  }
  it('adds result_id to an object result, sync or async, and registers the tool', async () => {
    const l = new ResultLedger()
    const w = withResultIds(tools, l, new Set(['present_plan']))
    expect(await w.get_hotel_prices.execute!()).toEqual({ hotels: [1], result_id: 'r1' })
    expect(await w.web_search.execute!()).toEqual({ results: [], result_id: 'r2' })
    expect(l.toolOf('r1')).toBe('get_hotel_prices')
  })
  it('leaves non-object results and skipped tools alone, and a tool without execute as it is', async () => {
    const l = new ResultLedger()
    const w = withResultIds(tools, l, new Set(['present_plan']))
    expect(await w.calculate.execute!()).toBe(42)
    expect(await w.get_news.execute!()).toEqual([{ a: 1 }])
    expect(await w.present_plan.execute!()).toEqual({ ok: true })
    expect(w.noExec).toBe(tools.noExec)
    expect(l.toolOf('r1')).toBeUndefined()
  })
  it('does not change the original result object', async () => {
    const original = { hotels: [1] }
    const l = new ResultLedger()
    const w = withResultIds({ t: { execute: async () => original } }, l, new Set())
    await w.t.execute!()
    expect(original).toEqual({ hotels: [1] })
  })
  it('a failing tool still fails the same way', async () => {
    const w = withResultIds({ t: { execute: async () => { throw new Error('boom') } } }, new ResultLedger(), new Set())
    await expect(w.t.execute!()).rejects.toThrow('boom')
  })
})

describe('makeProviderOfUrl: which partner a link belongs to, by where it lands', () => {
  it('reads the host, a subdomain, and the target behind an affiliate wrapper', () => {
    expect(providerOf('https://vexere.com/vn/ve-tau-hoa/x')).toBe('vexere')
    expect(providerOf('https://www.vexere.com/x')).toBe('vexere')
    expect(providerOf('https://go.isclix.com/deep_link/1/2?url=https%3A%2F%2Fvn.trip.com%2Fflights%2Fshowfarefirst')).toBe('tripcom')
  })
  it('unknown hosts, look-alike hosts, a wrapper to nowhere and junk give nothing', () => {
    expect(providerOf('https://evil.example/x')).toBeUndefined()
    expect(providerOf('https://notvexere.com/x')).toBeUndefined()
    expect(providerOf('https://vexere.com.evil.example/x')).toBeUndefined()
    expect(providerOf('https://go.isclix.com/deep_link/1/2')).toBeUndefined()
    expect(providerOf('not a url')).toBeUndefined()
  })
})

describe('linkCandidatesOf: the partner links a tool result carries', () => {
  it('reads link arrays and single URLs on the result, and the same on its rows (one level)', () => {
    const wrapped = 'https://go.isclix.com/deep_link/1/2?url=https%3A%2F%2Fvn.trip.com%2Fflights'
    const c = linkCandidatesOf({
      booking_links: [{ name: 'Vé máy bay', platform: 'Trip.com', url: wrapped }],
      train_booking_link: 'https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi',
      hotels: [{ name: 'A', agoda_link: 'https://www.agoda.com/a' }, { name: 'B' }],
    }, providerOf)
    expect(c.map(x => [x.providerId, x.label])).toEqual([['tripcom', 'Trip.com'], ['vexere', 'Vexere'], ['agoda', 'Agoda']])
    expect(c[0].url).toBe(wrapped)
  })
  it('the partner layer\'s own link rows are read, search handoffs are marked, malformed rows are not kept', () => {
    const row = (over: Record<string, unknown>) => ({ linkId: 'l', requestId: 'q', url: 'https://vexere.com/x', destinationUrl: 'https://vexere.com/x', kind: 'DEEP_LINK', providerId: 'vexere', merchantName: 'Vexere', intentType: 'book_transport', depth: 3, authRequiredAt: 'none', handoff: 'guest', freshness: { freshnessType: 'near_realtime' }, ...over })
    const c = linkCandidatesOf({ commerce_links: [row({}), row({ url: 'https://vexere.com/s', kind: 'SEARCH_HANDOFF', fallback: 'search' }), { url: 'https://x.example' }, 5, null] }, providerOf)
    expect(c.map(x => [x.url, !!x.search])).toEqual([['https://vexere.com/x', false], ['https://vexere.com/s', true]])
  })
  it('a link with no label and no known partner is not offered; the same URL twice is one candidate', () => {
    const c = linkCandidatesOf({ booking_links: [{ url: 'https://unknown.example/a' }, { platform: 'X', url: 'https://x.example/b' }, { platform: 'X', url: 'https://x.example/b' }] }, providerOf)
    expect(c.map(x => x.url)).toEqual(['https://x.example/b'])
  })
  it('withResultIds keeps them for that result id, and only for it', async () => {
    const l = new ResultLedger()
    const w = withResultIds({
      get_transport_options: { execute: async () => ({ train_booking_link: 'https://vexere.com/vn/x' }) },
      web_search: { execute: async () => ({ results: [] }) },
    }, l, new Set(), providerOf)
    await w.get_transport_options.execute!()
    await w.web_search.execute!()
    expect(l.linksOf('r1').map(x => x.providerId)).toEqual(['vexere'])
    expect(l.linksOf('r2')).toEqual([])
    expect(l.linksOf('r9')).toEqual([])
  })
})

describe('validateDeclared', () => {
  const booking = (over: Record<string, unknown> = {}) => ({ id: 'b1', type: 'booking', kind: 'hotel', title: 'Grand Hyams', providerId: 'agoda', ref: 'r1', ...over })
  const raw = (...blocks: unknown[]) => ({ v: 1, blocks })

  it('a booking that points at a fitting tool result and a known partner is kept', () => {
    const { l } = ledgerWith('get_hotel_prices')
    expect(validateDeclared(raw(booking()), l, PROVIDERS)!.blocks).toHaveLength(1)
  })
  it.each([
    ['unknown result id', booking({ ref: 'r9' })],
    ['the tool does not fit the kind (a flight booking pointing at a hotel result)', booking({ kind: 'flight' })],
    ['partner the registry does not know', booking({ providerId: 'evilmart' })],
  ])('a booking with %s is dropped', (_n, b) => {
    const { l } = ledgerWith('get_hotel_prices')
    expect(validateDeclared(raw(b), l, PROVIDERS)).toBeNull()
  })
  it('kinds map to the tools that can ground them', () => {
    const { l } = ledgerWith('get_flight_prices', 'get_transport_options', 'search_products', 'web_search')
    const ok = (kind: string, ref: string, providerId?: string) => validateDeclared(raw({ id: 'x', type: 'booking', kind, title: 't', ref, ...(providerId ? { providerId } : {}) }), l, PROVIDERS) !== null
    expect(ok('flight', 'r1', 'tripcom')).toBe(true)
    expect(ok('transport', 'r2', 'vexere')).toBe(true)
    expect(ok('product', 'r3')).toBe(true)
    expect(ok('ticket', 'r4')).toBe(true)
    expect(ok('activity', 'r4')).toBe(true)
    expect(ok('flight', 'r2')).toBe(false)
    expect(ok('product', 'r4')).toBe(false)
  })
  it('a compare row that references a result that does not exist keeps its text and loses the reference', () => {
    const { l } = ledgerWith('get_hotel_prices')
    const p = validateDeclared(raw({ id: 'c', type: 'compare', columns: ['A', 'B'], rows: [{ label: 'x', cells: ['1', '2'], ref: 'r1' }, { label: 'y', cells: ['3', '4'], ref: 'r7' }] }), l, PROVIDERS)!
    const c = p.blocks[0]
    expect(c.type === 'compare' && c.rows).toEqual([{ label: 'x', cells: ['1', '2'], ref: 'r1' }, { label: 'y', cells: ['3', '4'] }])
  })
  it('ask blocks need no result; garbage and an empty contract give null', () => {
    const { l } = ledgerWith()
    expect(validateDeclared(raw({ id: 'a', type: 'ask', questions: [{ text: 'Ở đâu?', options: ['Gần biển', 'Trung tâm'] }] }), l, PROVIDERS)!.blocks[0].type).toBe('ask')
    expect(validateDeclared(null, l, PROVIDERS)).toBeNull()
    expect(validateDeclared({ v: 1, blocks: [] }, l, PROVIDERS)).toBeNull()
    expect(validateDeclared('x', l, PROVIDERS)).toBeNull()
  })
  it('one dropped block does not cost the others', () => {
    const { l } = ledgerWith('get_hotel_prices')
    const p = validateDeclared(raw(booking({ ref: 'r9', id: 'bad' }), booking({ id: 'good' })), l, PROVIDERS)!
    expect(p.blocks.map(b => b.id)).toEqual(['good'])
  })
})

describe('resolveBookingLinks: the link comes from the result, never from the model', () => {
  const book = (over: Record<string, unknown> = {}) => ({ id: 'b1', type: 'booking', kind: 'transport', title: 'Tàu SE8', providerId: 'vexere', ref: 'r1', ...over })
  const TRAIN = 'https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?x=1'
  const setup = async (result: Record<string, unknown>) => {
    const l = new ResultLedger()
    const w = withResultIds({ get_transport_options: { execute: async () => result } }, l, new Set(), providerOf)
    await w.get_transport_options.execute!()
    return l
  }
  const declared = (l: ResultLedger, ...blocks: unknown[]) => validateDeclared({ v: 1, blocks }, l, PROVIDERS)!

  it('a booking gets the link of its own result and the named partner; the contract itself still carries no link', async () => {
    const l = await setup({ train_booking_link: TRAIN, booking_links: [{ platform: 'Trip.com', url: 'https://vn.trip.com/a' }] })
    const r = resolveBookingLinks(declared(l, book()), l)!
    expect(r.links.b1).toEqual({ url: TRAIN, label: 'Vexere', providerId: 'vexere', handoff: 'guest' })
    expect(JSON.stringify(r.presentation)).not.toMatch(/https?:/)
  })
  it('without a named partner the first non-search link is taken', async () => {
    const l = await setup({ commerce_links: [{ linkId: 's', requestId: 'q', url: 'https://vexere.com/search', destinationUrl: 'https://vexere.com/search', kind: 'SEARCH_HANDOFF', fallback: 'search', providerId: 'vexere', merchantName: 'Vexere', intentType: 'book_transport', depth: 2, authRequiredAt: 'none', freshness: { freshnessType: 'near_realtime' } }], train_booking_link: TRAIN })
    expect(resolveBookingLinks(declared(l, book({ providerId: undefined })), l)!.links.b1.url).toBe(TRAIN)
  })
  it('only a search-page link: it is used', async () => {
    const l = await setup({ commerce_links: [{ linkId: 's', requestId: 'q', url: 'https://vexere.com/search', destinationUrl: 'https://vexere.com/search', kind: 'SEARCH_HANDOFF', fallback: 'search', providerId: 'vexere', merchantName: 'Vexere', intentType: 'book_transport', depth: 2, authRequiredAt: 'none', freshness: { freshnessType: 'near_realtime' } }] })
    expect(resolveBookingLinks(declared(l, book()), l)!.links.b1.url).toBe('https://vexere.com/search')
  })
  it('a booking with no usable link is dropped (a booking card is always actionable); other blocks stay', async () => {
    const l = await setup({ train_booking_link: 'http://vexere.com/insecure', vexere_link: 'javascript:alert(1)' })
    const r = resolveBookingLinks(declared(l, book(), { id: 'a1', type: 'ask', questions: [{ text: 'Q?', options: ['a', 'b'] }] }), l)!
    expect(r.presentation.blocks.map(b => b.id)).toEqual(['a1'])
    expect(r.links).toEqual({})
  })
  it('nothing left at all: null', async () => {
    const l = await setup({ note: 'no links here' })
    expect(resolveBookingLinks(declared(l, book()), l)).toBeNull()
  })
  it('a named partner whose link is absent does not borrow another partner\'s link', async () => {
    const l = await setup({ booking_links: [{ platform: 'Trip.com', url: 'https://vn.trip.com/a' }] })
    expect(resolveBookingLinks(declared(l, book({ providerId: 'vexere' })), l)).toBeNull()
  })
})

describe('presentationAnnotation', () => {
  it('wraps the contract in one live frame, with the booking links only when there are some', () => {
    const { l } = ledgerWith()
    const p = validateDeclared({ v: 1, blocks: [{ id: 'a', type: 'ask', questions: [{ text: 'Q?', options: ['a', 'b'] }] }] }, l, PROVIDERS)!
    expect(presentationAnnotation(p)).toEqual({ kind: PRESENTATION_ANNOTATION_KIND, v: 1, presentation: p })
    expect(PRESENTATION_ANNOTATION_KIND).toBe('tappy.presentation.v1')
    const links = { b1: { url: 'https://x.example/a', label: 'X', providerId: 'x', handoff: 'guest' as const } }
    expect(presentationAnnotation(p, links)).toEqual({ kind: PRESENTATION_ANNOTATION_KIND, v: 1, presentation: p, links })
    expect(presentationAnnotation(p, {})).not.toHaveProperty('links')
  })
})
