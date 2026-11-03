// @vitest-environment node
// C2 P2 layer 4 — the agent SafeFlush (progressiveFlush.ts agentSafeFlushPoint + the route stream filter): what may be released early, shadow /
// live / unsupported modes, turns it is off for, the fail-closed settle on a mismatch, and the stored reply = the text the client received.
// The real filter runs; one settle step is made to touch released text (a mock) to prove the violation path. No network.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const H = vi.hoisted(() => ({ touchFirstParagraph: false }))
vi.mock('./citationIntegrity', async orig => {
  const m = await orig<typeof import('./citationIntegrity')>()
  // a settle step that (wrongly) rewrites the FIRST paragraph — the case the replay says never happens; here it is forced
  return { ...m, dropOrphanLeadIns: (t: string) => (H.touchFirstParagraph ? { ...m.dropOrphanLeadIns(t.replace(/^[^\n]+/, 'Đoạn đầu ĐÃ BỊ SỬA.')), removed: 1 } : m.dropOrphanLeadIns(t)) }
})

import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { agentHoldReason, agentSafeFlushPoint } from './progressiveFlush'
import { noFabricationGate } from './noFabricationGate'
import { dropUnbackedOrderingPossession } from './placeClaimGuard'
import { dropUnbackedOfferClaims } from './consultative/offerClaims'
import { dedupeCaveats } from './caveatDedupe'
import { stripClosingInvite } from './closingInvite'

const enc = new TextEncoder(), dec = new TextDecoder()
const tick = () => new Promise(r => setTimeout(r, 0))
const ENV = ['C2_SAFEFLUSH', 'C2_AGENT_STREAM', 'TAPPY_AGENT', 'CONSULT_V3']
let logs: string[]
beforeEach(() => {
  for (const k of ENV) delete process.env[k]
  process.env.TAPPY_AGENT = '2'; process.env.CONSULT_V3 = '1'
  H.touchFirstParagraph = false
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
})
afterEach(() => { vi.restoreAllMocks(); for (const k of ENV) delete process.env[k] })

// paragraphs with nothing any hold rule reads (no digit, no price word, no proper name, no list) — the release case
const PLAIN = 'Lạm phát là khi hàng hóa nói chung tăng dần theo thời gian.\n\nKhi đó cùng một khoản tiền mua được ít thứ hơn trước.\n\nNgân hàng trung ương thường dùng lãi suất để kiểm soát nó.\n\nBạn muốn mình giải thích thêm phần nào không?'
/** what the user gets with every flag off (the settle path may format the text: the reference is its output, not the input) */
async function reference(text: string, o: Parameters<typeof run>[1] = {}) {
  const saved = { s: process.env.C2_SAFEFLUSH, a: process.env.C2_AGENT_STREAM, t: H.touchFirstParagraph }
  delete process.env.C2_SAFEFLUSH; delete process.env.C2_AGENT_STREAM; H.touchFirstParagraph = false
  const r = await run(text, o)
  if (saved.s !== undefined) process.env.C2_SAFEFLUSH = saved.s
  if (saved.a !== undefined) process.env.C2_AGENT_STREAM = saved.a
  H.touchFirstParagraph = saved.t
  return r.text
}

async function run(text: string, o: { tools?: Array<{ tool: string; result: unknown }>; agentMode?: boolean; leak?: (s: string) => boolean } = {}) {
  const collector = createEnrichmentCollector() as unknown as Record<string, any>
  Object.assign(collector, { agentMode: o.agentMode !== false, consultV3: true, consultative: true, semanticRanking: true, userTexts: ['giải thích'] })
  if (o.leak) collector.setLeakCheck((s: string) => ({ leak: o.leak!(s), reason: o.leak!(s) ? 'echo' : null }))
  let ctl!: ReadableStreamDefaultController<Uint8Array>
  let reply: string | null = null
  const res = applyPlaceEnrichmentStreamFilter(new Response(new ReadableStream<Uint8Array>({ start(x) { ctl = x } })), 'vi', collector as never, undefined, async ev => { reply = ev.replyText ?? null })
  const reader = res.body!.getReader()
  const out: Array<{ line: string; early: boolean }> = []
  let ended = false
  const pump = (async () => { let buf = ''; for (;;) { const n = await reader.read(); if (n.done) break; buf += dec.decode(n.value, { stream: true }); const p = buf.split('\n'); buf = p.pop() ?? ''; for (const l of p) if (l) out.push({ line: l, early: !ended }) } })()
  ;(o.tools ?? []).forEach((t, k) => { ctl.enqueue(enc.encode('9:' + JSON.stringify({ toolCallId: `t${k}`, toolName: t.tool, args: {} }) + '\n')); ctl.enqueue(enc.encode('a:' + JSON.stringify({ toolCallId: `t${k}`, result: t.result }) + '\n')) })
  for (const d of text.match(/[\s\S]{1,17}/g) ?? []) { ctl.enqueue(enc.encode('0:' + JSON.stringify(d) + '\n')); await tick() }
  await tick(); await tick(); ended = true
  ctl.enqueue(enc.encode('d:{"finishReason":"stop"}\n')); ctl.close(); await pump
  const t0 = out.filter(x => x.line.startsWith('0:'))
  return {
    text: t0.map(x => JSON.parse(x.line.slice(2)) as string).join(''),
    early: t0.filter(x => x.early).map(x => JSON.parse(x.line.slice(2)) as string).join(''),
    statuses: out.filter(x => x.line.includes('tappy.turn_status.v1')).map(x => JSON.parse(x.line.slice(2))[0]),
    reply,
  }
}

describe('F1 · what a paragraph may carry to be released early', () => {
  it.each([
    ['Lạm phát là khi hàng hóa tăng dần.', null],
    ['Lạm phát là khi giá chung tăng lên.', 'claim_wording'], // conservative: any price word waits, even "giá chung"
    ['Giá vàng là 140 triệu.', 'digit_link_or_marker'],
    ['Xem thêm [S1].', 'digit_link_or_marker'],
    ['Đọc ở https://example.com nhé.', 'digit_link_or_marker'],
    ['- một ý\n- ý khác', 'list_table_or_heading'],
    ['## Tiêu đề', 'digit_link_or_marker'], // "#" is a held character before the heading rule is reached
    ['* một ý', 'list_table_or_heading'],
    ['Dưới đây là vài cách:', 'lead_in'],
    ['Bạn nên đến Bảo tàng Mỹ thuật.', 'proper_name'],
    ['Mình đã kiểm tra kỹ rồi.', 'claim_wording'],
    ['Quán này giá rẻ.', 'claim_wording'],
    ['Câu có  hai dấu cách.', 'irregular_whitespace'],
    ['Đồng hồ này đẹp.', 'claim_wording'], // conservative: "đồng" is read as the currency word
    ['Dòng sông này đẹp.', null],
    ['Giàu có không phải tất cả.', null], // letter-aware boundary: "giàu" is not "giá"
    ['Tại sao trời xanh? Vì tán xạ ánh sáng.', null],
  ])('%s → %s', (p, why) => { expect(agentHoldReason(p)).toBe(why) })
  it('only COMPLETE paragraphs (a blank line after), stops at the first held one, never decreases', () => {
    const t = 'Một đoạn ổn.\n\nĐoạn hai ổn.\n\nGiá 5 triệu.\n\nĐoạn bốn ổn.\n\n'
    expect(agentSafeFlushPoint('Một đoạn ổn.')).toBe(0)
    expect(agentSafeFlushPoint(t)).toBe('Một đoạn ổn.\n\nĐoạn hai ổn.'.length)
    let last = 0
    for (let i = 1; i <= t.length; i++) { const p = agentSafeFlushPoint(t.slice(0, i)); expect(p).toBeGreaterThanOrEqual(last); last = p }
  })
  it('the extra check (the leak rule) stops the release', () => {
    expect(agentSafeFlushPoint('A ổn.\n\nB ổn.\n\n', s => !s.includes('B'))).toBe('A ổn.'.length)
  })
})

describe('F2 · modes', () => {
  it('flags off → nothing early', async () => {
    const r = await run(PLAIN)
    expect(r.early).toBe('')
    expect(r.text.length).toBeGreaterThan(0)
  })
  it('SHADOW (C2_SAFEFLUSH only) → nothing early, the same text as off; the would-be release is measured against the settled text', async () => {
    process.env.C2_SAFEFLUSH = '1'
    const ref = await reference(PLAIN)
    const r = await run(PLAIN)
    expect(r.early).toBe('')
    expect(r.text).toBe(ref)
    expect(logs.filter(l => l.includes('tappyai_safeflush_shadow')).at(-1)).toMatch(/"survives":true/)
  })
  it('C2_AGENT_STREAM without C2_SAFEFLUSH → unsupported: ignored (logged), nothing early', async () => {
    process.env.C2_AGENT_STREAM = '1'
    const r = await run(PLAIN)
    expect(r.early).toBe('')
    expect(logs.some(l => l.includes('unsupported_combo'))).toBe(true)
  })
  it('LIVE → whole provable paragraphs leave before the end; the text the user ends with is the settled text; the stored reply = what was received', async () => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const ref = await reference(PLAIN)
    const r = await run(PLAIN)
    expect(r.early.length).toBeGreaterThan(0)
    expect(ref.startsWith(r.early)).toBe(true)
    expect(r.text).toBe(ref)
    expect(r.reply).toBe(r.text)
    expect(r.statuses).toEqual([])
  })
  it('LIVE but not an agent turn → SafeFlush does not touch it (that turn keeps its own existing live path, byte for byte)', async () => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const ref = await reference(PLAIN, { agentMode: false })
    logs.length = 0
    const r = await run(PLAIN, { agentMode: false })
    expect(r.text).toBe(ref)
    expect(logs.some(l => /tappyai_safeflush/.test(l))).toBe(false)
  })
})

describe('F2b · the leak rule is checked on what would be released', () => {
  it('a paragraph the leak check flags is never released early (and nothing after it)', async () => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    // the flagged paragraph passes every OTHER hold rule (lowercase, no digit, no price word) — only the leak rule can stop it
    const t = 'Mình là trợ lý của bạn.\n\nĐây là đoạn lặp lại chỉ dẫn nội bộ echo của hệ thống.\n\nCòn gì nữa không?\n\nHết.'
    expect(agentHoldReason('Đây là đoạn lặp lại chỉ dẫn nội bộ echo của hệ thống.')).toBeNull()
    const r = await run(t, { leak: s => /echo/.test(s) })
    expect(r.early).toContain('Mình là trợ lý')
    expect(r.early).not.toContain('echo')
    expect(r.early).not.toContain('Còn gì nữa')
  })
})

describe('F3 · turns it is off for', () => {
  it.each([['search_places', { results: [{ name: 'Phở' }] }], ['get_flight_prices', { flights: [] }], ['search_products', { products: [] }]])('a %s turn never releases early', async (tool, result) => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const r = await run(PLAIN, { tools: [{ tool, result }] })
    expect(r.early).toBe('')
    expect(logs.some(l => l.includes('off_for_turn'))).toBe(true)
  })
  it('a weather / web-search turn may', async () => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const r = await run(PLAIN, { tools: [{ tool: 'get_weather', result: { location: 'x' } }] })
    expect(r.early.length).toBeGreaterThan(0)
  })
})

describe('F4 · a settle step that touches released text → FAIL CLOSED', () => {
  it('nothing more is sent (no second copy, no different version), the turn is marked interrupted, the violation is logged; the stored reply = what was received', async () => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    H.touchFirstParagraph = true
    const r = await run(PLAIN)
    expect(r.early.length).toBeGreaterThan(0)
    expect(r.text).toBe(r.early)
    expect(r.text).not.toContain('ĐÃ BỊ SỬA')
    expect(r.statuses).toEqual([{ kind: 'tappy.turn_status.v1', v: 1, status: 'interrupted', reason: 'safeflush_violation' }])
    expect(logs.some(l => l.includes('tappyai_safeflush_violation'))).toBe(true)
    expect(r.reply).toBe(r.text)
  })
  it('the same step in SHADOW mode is only measured (survives:false), the user gets the settled text as today', async () => {
    process.env.C2_SAFEFLUSH = '1'
    H.touchFirstParagraph = true
    const r = await run(PLAIN)
    expect(r.early).toBe('')
    expect(r.text).toContain('ĐÃ BỊ SỬA')
    expect(logs.find(l => l.includes('tappyai_safeflush_shadow'))).toMatch(/"survives":false/)
  })
})

describe('F6 · the LEGACY progressive release of an agent turn is not the agent SafeFlush\'s to settle', () => {
  // the passport case of consultativeCitationFlush.test.ts (an agent turn whose legacy progressive path releases early): with every agent
  // SafeFlush flag on, the user must get exactly what they get with the flags off — the legacy path keeps its own settle, byte for byte
  const U1 = 'https://dichvucong.bocongan.gov.vn/bocongan/bothutuc/tthc?matt=29497'
  const U2 = 'https://vpcp.dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-nganh-doc.html?ma_thu_tuc=1.001456'
  const Q = 'Thủ tục làm hộ chiếu phổ thông lần đầu cho người lớn thế nào? Cần giấy tờ gì, nộp ở đâu, mất bao lâu?'
  // exactly consultativeCitationFlush.test.ts's P1 + P2: the case where the legacy path's released prefix MISMATCHES and its belt re-sends
  const P1 = 'Làm hộ chiếu phổ thông lần đầu khá gọn: chuẩn bị giấy tờ, nộp hồ sơ trực tiếp hoặc trực tuyến, rồi nhận hộ chiếu.\n\nThời gian: thường không quá 8 ngày làm việc kể từ khi hồ sơ hợp lệ.'
  const P2 = 'Theo hướng dẫn trên Cổng Dịch vụ công Bộ Công an, người làm hộ chiếu lần đầu nộp tại Cơ quan Quản lý xuất nhập cảnh Công an cấp tỉnh [S1].\n\nHồ sơ có tờ khai đề nghị cấp hộ chiếu mẫu TK01 dành cho người từ đủ 14 tuổi [S2].\n\nThời hạn giải quyết là 8 ngày làm việc; hồ sơ hợp lệ sẽ được cấp giấy hẹn [S2].'
  const P = `${P1}\n\n${P2}`
  async function legacy() {
    const collector = createEnrichmentCollector(Q)
    collector.agentMode = true
    collector.citationSources = [{ id: 'S1', host: 'dichvucong.bocongan.gov.vn', url: U1 }, { id: 'S2', host: 'vpcp.dichvucong.gov.vn', url: U2 }]
    const frames = ['9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["x"]}}', 'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [{ title: 'a', link: U1 }, { title: 'b', link: U2 }] } }), '0:' + JSON.stringify(P), 'd:{"finishReason":"stop"}']
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, Q, true, (async () => ({ perPlace: new Map(), batch: null })) as never)
    return (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:') || l.includes('turn_status')).join('\n')
  }
  it('flags off and agent SafeFlush LIVE give the identical output', async () => {
    const off = await legacy()
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const on = await legacy()
    // the legacy belt really fired here (the first sentence went out twice) — this is the case the agent settle must leave alone
    expect(off.match(/Làm hộ chiếu phổ thông lần đầu khá gọn/g)!.length).toBeGreaterThan(1)
    expect(on).toBe(off)
    expect(logs.some(l => l.includes('tappyai_safeflush_violation'))).toBe(false)
  })
})

describe('F5 · a paragraph break right after released text is kept', () => {
  it('released "…A." then the settled "\\n\\nB" → the client gets "\\n\\nB" (not "B" glued to A)', async () => {
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const t = 'Đoạn một ổn định.\n\nĐoạn hai có số 5.'
    const ref = await reference(t)
    const r = await run(t)
    expect(r.early).toBe('Đoạn một ổn định.')
    expect(r.text).toBe(ref)
    expect(r.text).toMatch(/ổn định\.\n\nĐoạn hai/)
    // the stored reply = released part + the remainder sent at settle (here the remainder is non-empty)
    expect(r.reply).toBe(r.text)
  })
})

describe('F7 · the runtime frame order (text, then `e:`, then `d:`) through the filter AND the downstream stepRepeatGuard', () => {
  // Found by the config-3 HTTP probe: paragraphs 1–6 were released before the runtime's `e:`, the settle remainder (paragraph 7) went out at
  // `d:` — after `e:` — so stepRepeatGuard held it as a NEW step and dropped its sentences that look like the released ones (silent loss).
  const P = (w: string) => `Đây là đoạn thứ ${w} của câu trả lời thử nghiệm, viết bằng những câu ngắn và rõ ràng để đọc dễ hơn.`
  const TEXT = ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy'].map(P).join('\n\n')
  async function runtimeOrder() {
    const { stepRepeatGuard } = await import('./stepRepeatGuard')
    const collector = createEnrichmentCollector() as unknown as Record<string, any>
    Object.assign(collector, { agentMode: true, consultV3: true, consultative: true, semanticRanking: true, userTexts: ['giải thích'] })
    let ctl!: ReadableStreamDefaultController<Uint8Array>
    let reply: string | null = null
    const res = applyPlaceEnrichmentStreamFilter(new Response(new ReadableStream<Uint8Array>({ start(x) { ctl = x } })), 'vi', collector as never, undefined, async ev => { reply = ev.replyText ?? null })
    const body = new Response(res.body!.pipeThrough(stepRepeatGuard())).text()
    // what dataStream sends: the final text line by line, then the step finish, then done
    for (const l of TEXT.split(/(?<=\n)/)) { ctl.enqueue(enc.encode('0:' + JSON.stringify(l) + '\n')); await tick() }
    await tick(); await tick()
    ctl.enqueue(enc.encode('e:{"finishReason":"stop","isContinued":false}\n')); await tick()
    ctl.enqueue(enc.encode('d:{"finishReason":"stop"}\n')); ctl.close()
    const lines = (await body).split('\n').filter(Boolean)
    return { lines, text: lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join(''), reply }
  }
  it('LIVE: nothing is lost — the client text = the flags-off text = the stored reply; `e:` goes out after the last text frame', async () => {
    const ref = await runtimeOrder()
    expect(ref.text).toContain('đoạn thứ bảy')
    process.env.C2_SAFEFLUSH = '1'; process.env.C2_AGENT_STREAM = '1'
    const r = await runtimeOrder()
    expect(logs.some(l => l.includes('tappyai_safeflush') && l.includes('off_for_turn'))).toBe(false)
    // paragraphs were released early (one frame each), the flags-off reply went out as one settled frame
    expect(ref.lines.filter(l => l.startsWith('0:')).length).toBe(1)
    expect(r.lines.filter(l => l.startsWith('0:')).length).toBeGreaterThan(1)
    expect(r.text).toBe(ref.text)
    expect(r.reply).toBe(r.text)
    const lastText = r.lines.map(l => l.startsWith('0:')).lastIndexOf(true)
    expect(lastText).toBeLessThan(r.lines.findIndex(l => l.startsWith('e:')))
    expect(r.lines.findIndex(l => l.startsWith('e:'))).toBeLessThan(r.lines.findIndex(l => l.startsWith('d:')))
    expect(logs.some(l => l.includes('dropped_repeated_sentences') || l.includes('dropped_step_text'))).toBe(false)
  })
})

describe('F8 · 6.0 F-2: hold ↔ guard consistency — every paragraph a settle guard WOULD change is held (the guard itself is the judge)', () => {
  // Each fixture is first proven to be changed by its OWN guard (worst-case context: no evidence, no card, no link, no price) — so a fixture
  // that stops triggering its guard fails here instead of silently testing nothing — and then must be held by agentHoldReason.
  const NO_EVIDENCE = { corpus: [], userTexts: [], tools: [] }
  const cases: Array<[string, string, (p: string) => boolean]> = [
    ['noFabricationGate · availability', 'Khách sạn này còn phòng cho cuối tuần này.', p => noFabricationGate(p, NO_EVIDENCE).text !== p],
    ['noFabricationGate · availability (stock)', 'Mẫu máy này vẫn còn hàng ở nhiều nơi.', p => noFabricationGate(p, NO_EVIDENCE).text !== p],
    ['noFabricationGate · policy (breakfast)', 'Phòng đã bao gồm bữa sáng cho hai người.', p => noFabricationGate(p, NO_EVIDENCE).text !== p],
    ['noFabricationGate · policy (refund)', 'Vé này được hoàn tiền nếu bạn đổi ý.', p => noFabricationGate(p, NO_EVIDENCE).text !== p],
    ['noFabricationGate · policy (cancellation)', 'Tour này cho hủy miễn phí trước ngày đi.', p => noFabricationGate(p, NO_EVIDENCE).text !== p],
    ['ordering / possession', 'Quán này có giao hàng tận nơi trong nội thành.', p => dropUnbackedOrderingPossession(p).removed > 0],
    ['ordering / possession (table)', 'Nhà hàng này có đặt bàn qua điện thoại.', p => dropUnbackedOrderingPossession(p).removed > 0],
    ['offer claim · action', 'Bạn bấm vào liên kết bên dưới để đặt phòng nhé.', p => dropUnbackedOfferClaims(p, { hasAction: false, hasPriceData: false, lang: 'vi' }).removed.length > 0],
    ['caveat (dedupe)', 'Hiện mình chưa có thông tin về lịch mở bán.', p => dedupeCaveats(`${p}\n\nĐoạn giữa.\n\n${p}`) !== `${p}\n\nĐoạn giữa.\n\n${p}`],
    ['closing invite', 'Nếu bạn muốn, mình có thể gợi ý thêm vài chỗ khác.', p => stripClosingInvite(`Câu một. Câu hai. ${p}`) !== `Câu một. Câu hai. ${p}`],
    ['closing invite (question)', 'Bạn có muốn mình tìm thêm không?', p => stripClosingInvite(`Câu một. Câu hai. ${p}`) !== `Câu một. Câu hai. ${p}`],
  ]
  it.each(cases)('%s — the guard changes it, so it is held', (_name, p, guardChanges) => {
    expect(guardChanges(p), 'fixture no longer triggers its guard').toBe(true)
    expect(agentHoldReason(p)).not.toBeNull()
  })
  it('entity-name guard: it reads bold MODEL names, which always carry a digit → already held by the digit rule', () => {
    expect(agentHoldReason('**Galaxy S26 Ultra** là lựa chọn đáng cân nhắc.')).toBe('digit_link_or_marker')
  })
  it('a plain paragraph none of the guards reads is still released (the fix is not "hold everything")', () => {
    const p = 'Lạm phát là khi hàng hóa nói chung tăng dần theo thời gian.'
    expect(noFabricationGate(p, NO_EVIDENCE).text).toBe(p)
    expect(agentHoldReason(p)).toBeNull()
  })
})
