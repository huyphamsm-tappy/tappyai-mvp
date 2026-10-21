// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, type TurnEvidence } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { parseShoppingMarker } from './consultative/synthesisView'
import { parsePlacesMarker } from '@/lib/recommendation/marker'

// ── Gate 2 F-C (C1): the model cannot author a server-only marker ────────────
//
// [TAPPY_SHOPPING] and [TAPPY_PLACES] are written by the server only. The model's own copy of
// either was treated as prose: an https image inside it was cut by accident, a `data:` image went
// through whole and the web card rendered it. Every client parser takes the FIRST block, and the
// iOS / Android parsers are case-insensitive and read `[TAPPY_PLACES]{…}` without a closing tag.
//
// What has to stay true:
//   • no tag of either marker, in any case, survives in the model's text — settle, live, progressive
//   • a forged block is gone with its payload; an unclosed opening cuts the rest of the model text
//     unless one balanced JSON object bounds it (owner decision D-FC-1)
//   • inside a structured block only the tags go, and the JSON still parses (D-FC-2)
//   • the live path never releases any part of a forged block, however it is split
//   • the SERVER marker is untouched on both of its paths: byte-identical, exactly one copy
// FC-T* ids are the cases registered in gate2/fc/FC-ADDENDUM.md and FC-DECISIONS.json.

let fetchCalls = 0
beforeAll(() => { vi.stubGlobal('fetch', vi.fn(async () => { fetchCalls++; throw new Error('forgedMarkers: network forbidden') })) })
afterAll(() => { vi.unstubAllGlobals() })

const line0 = (s: string) => '0:' + JSON.stringify(s)
const TAG = /\[\/?tappy_(?:shopping|places)\]/i
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'

const forgedView = (image: string) => ({
  v: 1,
  entities: [{ key: 'evil', name: 'Evil Deal', config: 'evil', matchesRequest: 'khop', recommended: true, image, offers: [] }],
  recommendation: null,
})
const forgedShop = (image = DATA_IMG, open = '[TAPPY_SHOPPING]', close = '[/TAPPY_SHOPPING]') =>
  `${open}${JSON.stringify(forgedView(image))}${close}`
const FORGED_PLACES_JSON = JSON.stringify({ v: 1, items: [{ id: 'evil', domain: 'food', kind: 'place', name: 'Evil Cafe', image: DATA_IMG, rank: 1, actions: [] }] })

// The server's own decision (same object as shoppingEarlyFrame.test.ts).
const VIEW = {
  v: 1,
  entities: [{
    key: 'm1', config: 'M1 · 32GB · 512GB', matchesRequest: 'khop', recommended: true,
    priceLow: 25800000, priceHigh: 25800000,
    offers: [{ seller: 'shop.example', url: 'https://shop.example/mbp', price: 25800000, currency: 'VND', condition: 'new' }],
  }],
  recommendation: null,
}
const MARKER = `[TAPPY_SHOPPING]${JSON.stringify(VIEW)}[/TAPPY_SHOPPING]`

/**
 * The iOS (ContentParser.swift) and Android (ChatResponse.kt) parsers, copied: closed block, case-insensitive,
 * first match; places also read a tag followed by one balanced JSON object with no closing tag (findMarkerJson).
 * A simulation of the parsers — not a device measurement.
 */
function findMarkerJson(content: string, marker: string): string | null {
  const at = content.toLowerCase().indexOf(marker.toLowerCase())
  if (at === -1) return null
  let i = at + marker.length
  while (i < content.length && /\s/.test(content[i])) i++
  if (content[i] !== '{') return null
  let depth = 0, inString = false, escaped = false
  for (let j = i; j < content.length; j++) {
    const c = content[j]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return content.slice(i, j + 1) }
  }
  return null
}
function firstBlockMobile(text: string): { shopping: { entities: Array<{ key: string }> } | null; places: { items: unknown[] } | null } {
  const tryJson = <T,>(s: string | null | undefined): T | null => { if (!s) return null; try { return JSON.parse(s.trim()) as T } catch { return null } }
  const shopRaw = text.match(/\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/i)?.[1]
  const shop = tryJson<{ entities?: Array<{ key: string }> }>(shopRaw)
  const placesRaw = text.match(/\[TAPPY_PLACES\]([\s\S]*?)\[\/TAPPY_PLACES\]/i)?.[1] ?? findMarkerJson(text, '[TAPPY_PLACES]')
  const places = tryJson<{ items?: unknown[] }>(placesRaw)
  return {
    shopping: shop && Array.isArray(shop.entities) && shop.entities.length > 0 ? (shop as { entities: Array<{ key: string }> }) : null,
    places: places && Array.isArray(places.items) && places.items.length > 0 ? (places as { items: unknown[] }) : null,
  }
}

const textFrames = (raw: string) => raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string)

type Run = { frames: string[]; joined: string; evidence: TurnEvidence | null; collector?: ReturnType<typeof createEnrichmentCollector> }

/** Settle path: a product-tool turn (search_products buffers the reply), no server marker unless the collector carries one. */
async function runSettle(prose: string, collector = createEnrichmentCollector()): Promise<Run> {
  let evidence: TurnEvidence | null = null
  const lines = [
    '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"MacBook Pro 14 M1"}}',
    'a:{"toolCallId":"t1","result":{"search_results":[{"title":"MacBook Pro 14 M1 32GB 512GB","price":"25.800.000đ","link":"https://shop.example/mbp"}]}}',
    line0(prose),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, async e => { evidence = e })
  const frames = textFrames(await new Response(res.body).text())
  return { frames, joined: frames.join(''), evidence, collector }
}

/** Live path: no tool, nothing buffered — every delta goes through emitLive / releasableLiveText. */
async function runLive(deltas: string[]): Promise<Run> {
  let evidence: TurnEvidence | null = null
  const lines = [...deltas.map(line0), 'd:{"finishReason":"stop"}']
  const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', undefined, undefined, async e => { evidence = e })
  const frames = textFrames(await new Response(res.body).text())
  return { frames, joined: frames.join(''), evidence }
}

/** Progressive release (A5-P1): a places turn, buffered from t=0, releasing money-free sentences early through egressSlice. */
async function runProgressive(deltas: string[]): Promise<Run> {
  const res = applyPlaceEnrichmentStreamFilter(new Response([...deltas.map(line0), 'd:{"finishReason":"stop"}'].join('\n') + '\n'), 'vi', undefined, undefined, undefined, undefined, false, '', true)
  const frames = textFrames(await new Response(res.body).text())
  return { frames, joined: frames.join(''), evidence: null }
}

const noForgedLeft = (r: Run) => {
  expect(r.joined).not.toMatch(TAG)
  expect(r.joined).not.toContain('data:image')
  expect(r.joined).not.toContain('Evil')
  for (const f of r.frames) expect(f).not.toMatch(TAG)
  const web = parseShoppingMarker(r.joined).view
  expect(web).toBeNull()
  expect(parsePlacesMarker(r.joined).payload).toBeNull()
  const mob = firstBlockMobile(r.joined)
  expect(mob.shopping).toBeNull()
  expect(mob.places).toBeNull()
}

describe('FC-T1 — a forged [TAPPY_SHOPPING] block is removed', () => {
  it('FC-T1a settle, data: image', async () => {
    const r = await runSettle(`Mình gợi ý cấu hình M1 32GB/512GB cho bạn.\n\n${forgedShop()}\n\nBạn cân nhắc thêm nhé.`)
    noForgedLeft(r)
    expect(r.joined).toContain('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.')
    expect(r.joined).toContain('Bạn cân nhắc thêm nhé.')
  })

  it('FC-T1b settle, https image', async () => {
    const r = await runSettle(`Mình gợi ý cấu hình M1 32GB/512GB cho bạn.\n\n${forgedShop('https://attacker.example/p.png')}\n\nBạn cân nhắc thêm nhé.`)
    noForgedLeft(r)
    expect(r.joined).not.toContain('attacker.example')
    expect(r.joined).toContain('Bạn cân nhắc thêm nhé.')
  })

  it('FC-T1c settle, lower-case tags (read by iOS / Android)', async () => {
    const r = await runSettle(`Mình gợi ý cấu hình M1 32GB/512GB cho bạn.\n\n${forgedShop(DATA_IMG, '[tappy_shopping]', '[/tappy_shopping]')}\n\nBạn cân nhắc thêm nhé.`)
    noForgedLeft(r)
    expect(r.joined).toContain('Bạn cân nhắc thêm nhé.')
  })

  it('FC-T1d live, in every frame and in the joined text', async () => {
    const r = await runLive(['Chào bạn, mình gợi ý nhé.\n\n', forgedShop(), '\n\nPhần sau vẫn tới.'])
    noForgedLeft(r)
    expect(r.joined).toContain('Chào bạn, mình gợi ý nhé.')
    expect(r.joined).toContain('Phần sau vẫn tới.')
  })

  it('FC-T1e progressive release (A5-P1): the early slices carry no part of the block', async () => {
    const r = await runProgressive(['Mình tìm quán bún bò ở Quận 3 nhé. ', `Ghi chú ${forgedShop()} nhé. `, 'Quán nằm gần chợ Bàn Cờ.'])
    // The branch was really taken: something went out before the final reconstruction.
    expect(r.frames.length).toBeGreaterThan(1)
    expect(r.frames[0]).toContain('Quận 3')
    noForgedLeft(r)
    expect(r.joined).toContain('Quán nằm gần chợ Bàn Cờ.')
  })
})

describe('FC-T2 — a forged [TAPPY_PLACES] block is removed', () => {
  it('FC-T2a closed block, settle and live', async () => {
    const block = `[TAPPY_PLACES]${FORGED_PLACES_JSON}[/TAPPY_PLACES]`
    const s = await runSettle(`Mình gợi ý vài chỗ.\n\n${block}\n\nCâu sau.`)
    noForgedLeft(s)
    expect(s.joined).toContain('Câu sau.')
    const l = await runLive(['Mình gợi ý vài chỗ.\n\n', block, '\n\nCâu sau.'])
    noForgedLeft(l)
    expect(l.joined).toContain('Câu sau.')
  })

  it('FC-T2b no closing tag, one balanced JSON object (the mobile findMarkerJson form): tag and object go, the rest stays', async () => {
    const block = `[TAPPY_PLACES]${FORGED_PLACES_JSON}`
    const s = await runSettle(`Mình gợi ý vài chỗ.\n\n${block}\n\nCâu sau.`)
    noForgedLeft(s)
    expect(s.joined).not.toContain('"items"')
    expect(s.joined).toContain('Câu sau.')
    const l = await runLive(['Mình gợi ý vài chỗ.\n\n', block, '\n\nCâu sau.'])
    noForgedLeft(l)
    expect(l.joined).not.toContain('"items"')
    expect(l.joined).toContain('Câu sau.')
  })
})

describe('FC-T3 — server marker sent EARLY (semanticRanking off)', () => {
  const withMarker = () => { const c = createEnrichmentCollector(); c.setShoppingMarker(MARKER); return c }
  const serverOnly = (r: Run) => {
    // The path was really taken: the first text frame is the early send, byte for byte.
    expect(r.frames[0]).toBe(MARKER + '\n\n')
    expect(r.joined.match(/\[tappy_shopping\]/gi)?.length).toBe(1)
    expect(r.joined.match(/\[\/tappy_shopping\]/gi)?.length).toBe(1)
    expect(r.joined).toContain(MARKER)
    expect(parseShoppingMarker(r.joined).view).toEqual(VIEW)
    expect(firstBlockMobile(r.joined).shopping?.entities.map(e => e.key)).toEqual(['m1'])
    expect(r.joined).not.toContain('Evil')
    expect(r.joined).not.toContain('data:image')
    expect(r.evidence?.replyText?.startsWith(MARKER)).toBe(true)
    expect(r.evidence?.replyText).not.toContain('Evil')
  }

  it('FC-T3a with a forged block in the prose: only the server marker reaches the client', async () => {
    serverOnly(await runSettle(`Mình gợi ý cấu hình M1 32GB/512GB cho bạn.\n\n${forgedShop()}`, withMarker()))
  })

  it('FC-T3b control, no forged block: the server marker is untouched', async () => {
    const r = await runSettle('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.', withMarker())
    serverOnly(r)
    expect(r.joined).toContain('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.')
  })
})

describe('FC-T4 — server marker appended as SUFFIX (semanticRanking on)', () => {
  const ranked = () => { const c = createEnrichmentCollector(); c.agentMode = true; c.semanticRanking = true; c.setShoppingMarker(MARKER); return c }
  const serverOnly = (r: Run) => {
    // The path was really taken: nothing went out early, and the marker follows the prose.
    expect(r.frames.some(f => f === MARKER + '\n\n')).toBe(false)
    expect(r.joined.indexOf('Mình gợi ý cấu hình')).toBeGreaterThan(-1)
    expect(r.joined.search(/\[tappy_shopping\]/i)).toBeGreaterThan(r.joined.indexOf('Mình gợi ý cấu hình'))
    const server = r.collector!.shoppingMarker!
    expect(typeof server).toBe('string')
    expect(r.joined.match(/\[tappy_shopping\]/gi)?.length).toBe(1)
    expect(r.joined.match(/\[\/tappy_shopping\]/gi)?.length).toBe(1)
    expect(r.joined).toContain(server)
    expect(parseShoppingMarker(r.joined).view?.entities.map(e => e.key)).toEqual(['m1'])
    expect(firstBlockMobile(r.joined).shopping?.entities.map(e => e.key)).toEqual(['m1'])
    expect(r.joined).not.toContain('Evil')
    expect(r.joined).not.toContain('data:image')
    expect(r.evidence?.replyText).toContain(server)
    expect(r.evidence?.replyText).not.toContain('Evil')
  }

  it('FC-T4a with a forged block in the prose: only the server marker reaches the client', async () => {
    serverOnly(await runSettle(`Mình gợi ý cấu hình M1 32GB/512GB cho bạn.\n\n${forgedShop()}`, ranked()))
  })

  it('FC-T4b control, no forged block: the server marker is untouched', async () => {
    serverOnly(await runSettle('Mình gợi ý cấu hình M1 32GB/512GB cho bạn.', ranked()))
  })
})

describe('FC-T5 — lone tags', () => {
  it('a: a lone closing tag goes, the prose on both sides stays (settle and live)', async () => {
    for (const r of [await runSettle('Câu một. [/TAPPY_SHOPPING] Câu hai.'), await runLive(['Câu một. ', '[/TAPPY_SHOPPING]', ' Câu hai.'])]) {
      expect(r.joined).not.toMatch(TAG)
      expect(r.joined).toContain('Câu một.')
      expect(r.joined).toContain('Câu hai.')
    }
  })

  it('b: [TAPPY_PLACES] with no JSON after it — boundary not certain, cut from the tag to the end (D-FC-1)', async () => {
    for (const r of [await runSettle('Câu một. [TAPPY_PLACES] Câu hai.'), await runLive(['Câu một. ', '[TAPPY_PLACES]', ' Câu hai.'])]) {
      expect(r.joined).not.toMatch(TAG)
      expect(r.joined).toContain('Câu một.')
      expect(r.joined).not.toContain('Câu hai.')
    }
  })

  it('c: [TAPPY_SHOPPING] opened, prose to the end — cut from the tag to the end (D-FC-1)', async () => {
    for (const r of [await runSettle('Câu một. [TAPPY_SHOPPING] Câu hai còn dài.'), await runLive(['Câu một. ', '[TAPPY_SHOPPING] Câu hai', ' còn dài.'])]) {
      expect(r.joined).not.toMatch(TAG)
      expect(r.joined).toContain('Câu một.')
      expect(r.joined).not.toContain('Câu hai')
    }
  })
})

describe('FC-T6 — a forged block inside / after a structured block: only the tags go, the JSON still parses (D-FC-2)', () => {
  const plan = (description: string) => '[TAPPY_PLAN]' + JSON.stringify({
    type: 'trip', title: 'Mua laptop', days: [{ label: 'Ngày 1', items: [{ time: '09:00', category: 'transport', name: 'Đi tới cửa hàng', description, price: '' }] }],
  }) + '[/TAPPY_PLAN]'
  const planOf = (text: string): { items: Array<{ description?: string }> } | null => {
    const m = text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
    if (!m) return null
    try { const p = JSON.parse(m[1]) as { days: Array<{ items: Array<{ description?: string }> }> }; return { items: p.days.flatMap(d => d.items) } } catch { return null }
  }

  it('FC-T6 inside an item description, with the server marker sent early', async () => {
    const c = createEnrichmentCollector(); c.setShoppingMarker(MARKER)
    const r = await runSettle(`Lịch nè.\n\n${plan(`Xem ${forgedShop()} nhé`)}`, c)
    const c2 = createEnrichmentCollector(); c2.setShoppingMarker(MARKER)
    const control = await runSettle(`Lịch nè.\n\n${plan('Xem hàng nhé')}`, c2)
    const p = planOf(r.joined)
    expect(p).not.toBeNull()
    expect(p!.items.length).toBe(planOf(control.joined)!.items.length)
    expect(p!.items.length).toBeGreaterThan(0)
    for (const it of p!.items) expect(it.description ?? '').not.toMatch(TAG)
    expect(r.joined.match(/\[tappy_shopping\]/gi)?.length).toBe(1)
    expect(firstBlockMobile(r.joined).shopping?.entities.map(e => e.key)).toEqual(['m1'])
    expect(parseShoppingMarker(r.joined).view).toEqual(VIEW)
  })

  it('FC-T6b a closed forged block written AFTER a model plan block (the tail)', async () => {
    const r = await runSettle(`Lịch nè.\n\n${plan('Xem hàng nhé')}\n\nThêm: ${forgedShop()}`)
    const control = await runSettle(`Lịch nè.\n\n${plan('Xem hàng nhé')}`)
    const p = planOf(r.joined)
    expect(p).not.toBeNull()
    expect(p!.items.length).toBe(planOf(control.joined)!.items.length)
    expect(r.joined).not.toMatch(TAG)
    expect(parseShoppingMarker(r.joined).view).toBeNull()
    expect(parsePlacesMarker(r.joined).payload).toBeNull()
    expect(firstBlockMobile(r.joined)).toEqual({ shopping: null, places: null })
  })
})

describe('FC-T7 / FC-T9 — the live path never releases any part of a forged block', () => {
  const tagPrefixAtEnd = (f: string) => {
    const lb = f.lastIndexOf('[')
    if (lb === -1 || f.length - lb < 2) return false
    const tail = f.slice(lb).toLowerCase()
    return ['[tappy_shopping]', '[/tappy_shopping]', '[tappy_places]', '[/tappy_places]'].some(t => t.startsWith(tail))
  }

  it('FC-T7 a block split across deltas, its JSON containing ")"', async () => {
    const r = await runLive([
      'Đây là gợi ý. ',
      '[TAPPY_',
      'SHOPPING]{"v":1,"entities":[{"key":"evil","name":"Evil Deal (x)",',
      `"image":"${DATA_IMG}","offers":[]}],"recommendation":null}`,
      '[/TAPPY_SHO',
      'PPING]',
      ' Phần sau vẫn tới.',
    ])
    let released = ''
    for (const f of r.frames) {
      expect(f).not.toMatch(TAG)
      expect(tagPrefixAtEnd(f)).toBe(false)
      for (const bit of ['"key"', 'Evil', '(x)', 'data:', 'recommendation', 'TAPPY']) expect(f).not.toContain(bit)
      released += f
    }
    expect(released).toBe(r.joined)
    expect(r.joined).toContain('Đây là gợi ý.')
    expect(r.joined).toContain('Phần sau vẫn tới.')
  })

  it('FC-T9 an opening tag, then more than 2048 characters, never closed: nothing after the tag is released (D-FC-1, D-FC-3)', async () => {
    const chunk = 'Nội dung giả mạo kéo dài không có dấu ngoặc nào cả '.repeat(12)
    const r = await runLive(['Mở đầu. ', '[TAPPY_SHOPPING]', chunk, chunk, chunk, chunk, chunk])
    expect(chunk.length * 5).toBeGreaterThan(2048)
    for (const f of r.frames) {
      expect(f).not.toMatch(TAG)
      expect(f).not.toContain('Nội dung giả mạo')
    }
    expect(r.joined.trim()).toBe('Mở đầu.')
  })
})

describe('FC-T10 — a forged block whose JSON balances BEFORE its closing tag arrives (gate2/fc/FC-DECISIONS-3.json, -4.json)', () => {
  // The JSON is complete one delta before the closing tag. Nothing between the JSON and the closing tag may leave, the prose
  // after the closing tag must still arrive, and nothing already released may be sent again.
  const DELTAS = (open: string) => [open, `[TAPPY_PLACES]${FORGED_PLACES_JSON}`, ' Giữa khối. ', '[/TAPPY_PLACES]', ' Câu cuối vẫn phải tới.']
  const NODIGIT = JSON.stringify({ v: 'x', items: [{ id: 'evil', name: 'Evil Cafe', image: 'data:image/png;base64,AAAA' }] })
  const OPENING = 'Mình tìm quán bún bò ở Quận 3 nhé.'
  const occurrences = (hay: string, needle: string) => hay.split(needle).length - 1
  const check = (r: Run, opening: string) => {
    let released = ''
    for (const f of r.frames) {
      expect(f).not.toMatch(TAG)
      for (const bit of ['data:', 'Evil', 'Giữa khối']) expect(f).not.toContain(bit)
      released += f
    }
    expect(released).toBe(r.joined)
    expect(occurrences(r.joined, opening)).toBe(1)
    expect(r.joined).toContain('Câu cuối vẫn phải tới.')
  }
  const progressiveTaken = (r: Run) => {
    expect(r.frames.length).toBeGreaterThan(1)
    expect(r.frames[0]).toContain('Quận 3')
  }

  it('FC-T10 live', async () => {
    check(await runLive(DELTAS('Mở đầu. ')), 'Mở đầu.')
  })

  it('FC-T10p progressive release (A5-P1): digit-free JSON with a sentence end right after it', async () => {
    const r = await runProgressive([`${OPENING} `, `[TAPPY_PLACES]${NODIGIT}.`, ' Giữa khối. ', '[/TAPPY_PLACES]', ' Câu cuối vẫn phải tới. ', 'Hết.'])
    progressiveTaken(r)
    check(r, OPENING)
    expect(r.joined).toContain('Hết.')
  })

  it('FC-T10p-ctrl progressive release, JSON with digits (control: the early release stops before the block)', async () => {
    const r = await runProgressive(DELTAS(`${OPENING} `))
    progressiveTaken(r)
    check(r, OPENING)
  })
})

// CONSULT_LUNA_ONE changes where the live path splits frames (not the joined text), so each flag state has its own snapshot,
// both taken from the pk13 code (gate2/fc/FC-DECISIONS-2.json).
const FLAG_STATE = process.env.CONSULT_LUNA_ONE === '1' ? 'flag-on' : 'flag-off'

describe(`FC-T8 — control: text with no marker tag is byte-identical to pk13 (${FLAG_STATE})`, () => {
  it('settle and live', async () => {
    const prose = 'Mình gợi ý TAPPY_SHOPPING là tên nội bộ, xem [trang shop](https://shop.example/mbp) và ghi chú [S1]. Một ngoặc [vuông] thường.'
    const plan = '[TAPPY_PLAN]' + JSON.stringify({ type: 'trip', title: 'Mua laptop', days: [{ label: 'Ngày 1', items: [{ time: '09:00', category: 'transport', name: 'Đi tới cửa hàng', description: 'Xem hàng nhé', price: '' }] }] }) + '[/TAPPY_PLAN]'
    const settle = await runSettle(`${prose}\n\n${plan}`)
    const live = await runLive([prose.slice(0, 40), prose.slice(40)])
    expect({ settle: settle.frames, live: live.frames }).toMatchSnapshot()
  })
})

describe('offline', () => {
  it('no network call was made by any case above', () => {
    expect(fetchCalls).toBe(0)
  })
})
