/**
 * Phase 8 M2: persistent task state at route level (TAPPY_AGENT=2). Three end-to-end conversations (restaurant, shopping, travel)
 * through the real POST with the real chat-session store (in-process map), plus scope, integrity and flag isolation. Model scripted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    streamCalls: 0,
    extractCalls: 0,
    placeCalls: [] as string[],
    writes: [] as unknown[],
    deltas: [] as unknown[],
  }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-agent-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/actions/runAction', () => ({ runAiWriteAction: vi.fn(async (o: unknown) => { h.state.writes.push(o); return { ok: true, result: { ok: true, id: 'w1' } } }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    // M2: the task tracker's structured Luna call returns the next scripted delta (none queued → it fails, the task is kept).
    extract: () => { h.state.extractCalls++; const d = h.state.deltas.shift(); return d ? Promise.resolve({ object: d, providerMetadata: {} }) : Promise.reject(new Error('no delta scripted')) },
    stream: () => { h.state.streamCalls++; return { toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) } },
    step: (opts: Record<string, unknown>) => {
      h.state.stepCalls.push(opts)
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    searchPlaces: async (query: string, location?: string) => {
      h.state.placeCalls.push(query)
      const results = [
        { name: 'Cơm Tấm Ba Ghiền', rating_value: 4.6, rating_count: 2400, google_rating: '4.6⭐ (2.400 đánh giá)', price_range_text: '1-70.000 ₫', distance_km: 1.2, open_now: true, address: '84 Đặng Văn Ngữ' },
        { name: 'Phở Lệ Nguyễn Trãi', rating_value: 4.4, rating_count: 1850, google_rating: '4.4⭐ (1.850 đánh giá)', price_range_text: '1-90.000 ₫', distance_km: 1.8, open_now: true, address: '413 Nguyễn Trãi' },
      ]
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
  }
})

import { POST } from '@/app/api/chat/route'
import { loadChatSessionState, saveChatSessionState, __resetChatSessionStore } from '@/lib/ai/consultative/chatSessionState'

const OWNER = 'u-agent-test'
const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })
/** A tracker delta in the strict shape (taskTracker.ts TaskDeltaSchema): unspecified fields = unchanged. */
const delta = (d: Record<string, unknown>) => ({ new_task: false, task_type: null, goal: null, set_constraints: [], remove_constraints: [], set_preferences: [], add_entities: [], selected_items: null, status: null, ...d })
const sid = () => randomUUID()

/** One user turn of a conversation: posts the history + the new message, records the reply as the next assistant message. */
async function say(convo: { id: string; messages: Array<{ role: string; content: string }> }, text: string, extraBody: Record<string, unknown> = {}) {
  convo.messages.push({ role: 'user', content: text })
  const log = vi.spyOn(console, 'log')
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [...convo.messages], userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }, chatSessionId: convo.id, ...extraBody }),
    signal: undefined,
  }
  const body = await (await POST(req as never)).text()
  const traces = log.mock.calls.map(c => String(c[0])).filter(s => s.startsWith('{"type":"tappyai_agent_run_trace"')).map(s => JSON.parse(s) as { task_id: string | null; events: Array<Record<string, unknown>> })
  log.mockRestore()
  const reply = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  convo.messages.push({ role: 'assistant', content: reply })
  return { body, reply, trace: traces[0] }
}
const stored = async (id: string) => (await loadChatSessionState(OWNER, id))?.task as Record<string, any> | undefined
/** The DATA block (fenced app state) the model received on the n-th step call of this turn. */
const dataBlockOf = (o: Record<string, unknown>) => ((o.messages as Array<{ role: string; content: unknown }>) ?? []).filter(m => m.role === 'user' && typeof m.content === 'string' && (m.content as string).includes('Trạng thái ứng dụng')).map(m => m.content as string).join('\n')

beforeEach(() => {
  h.state.steps = []; h.state.deltas = []; h.state.stepCalls = []; h.state.streamCalls = 0; h.state.extractCalls = 0; h.state.placeCalls = []; h.state.writes = []
  __resetAiQuestionQuotaLocal()
  __resetChatSessionStore()
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  process.env.TAPPY_AGENT = '2'
})
afterEach(() => { delete process.env.TAPPY_AGENT })

describe('E2E A · restaurant: location → budget → air conditioning (one task, mutated)', () => {
  it('creates, asks, mutates, preserves, records research and selection across four turns', async () => {
    const c = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    // Turn 1: create + ask
    h.state.deltas = [delta({ task_type: 'local_discovery', goal: 'Tìm nhà hàng ăn trưa', set_constraints: [{ key: 'khu_vuc', value: 'Quận 1' }] })]
    h.state.steps = [{ text: '', toolCalls: [call('ask_user', { question: 'Bạn muốn tầm giá bao nhiêu một người', choices: ['Dưới 150k', '150–300k', 'Trên 300k'] })] }]
    const t1 = await say(c, 'Tìm nhà hàng ở Quận 1')
    expect(t1.reply).toContain('Bạn muốn tầm giá bao nhiêu một người?')
    const s1 = await stored(c.id)
    expect(s1).toMatchObject({ goal: 'Tìm nhà hàng ăn trưa', status: 'waiting_user', pending_question: { text: 'Bạn muốn tầm giá bao nhiêu một người?' } })
    expect(t1.trace.task_id).toBe(s1!.task_id)
    expect(t1.trace.events.find(e => e.kind === 'task')).toMatchObject({ decision: 'created' })

    // Turn 2: the answer → budget added, Quận 1 kept, pending cleared, a search recorded
    h.state.stepCalls = []
    h.state.deltas = [delta({ set_constraints: [{ key: 'ngan_sach', value: 'dưới 300k/người', hard: true }] })]
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'nhà hàng ngon dưới 300k', location: 'Quận 1' })] },
      { text: '**Cơm Tấm Ba Ghiền** hợp ngân sách; **Phở Lệ Nguyễn Trãi** cũng được.', toolCalls: [] },
    ]
    const t2 = await say(c, 'Dưới 300k một người nhé')
    const ctx2 = dataBlockOf(h.state.stepCalls[0])
    expect(ctx2).toContain('Nhiệm vụ đang làm (lượt 2): Tìm nhà hàng ăn trưa')
    expect(ctx2).toContain('khu_vuc: Quận 1')
    expect(ctx2).toContain('Bạn vừa hỏi người dùng: "Bạn muốn tầm giá bao nhiêu một người?"')
    // The answer turn cannot ask again (guardrail: no two asks in a row); the next turn can.
    expect(Object.keys((h.state.stepCalls[0] as { tools: Record<string, unknown> }).tools)).not.toContain('ask_user')
    const s2 = await stored(c.id)
    expect(s2!.task_id).toBe(s1!.task_id)
    expect(s2!.constraints.map((x: { key: string }) => x.key)).toEqual(['khu_vuc', 'ngan_sach'])
    expect(s2).toMatchObject({ status: 'active', pending_question: null, turns: 2 })
    expect(s2!.research_state.searches).toEqual([expect.objectContaining({ tool: 'search_places', query: 'nhà hàng ngon dưới 300k', results: 2 })])
    expect(t2.trace.events.find(e => e.kind === 'task')).toMatchObject({ decision: 'loaded' })
    // The trace is emitted after the save: the persist decision (no concurrent writer → ours) is in it.
    expect(t2.trace.events.find(e => e.kind === 'task' && e.decision === 'persist')).toMatchObject({ merge: 'ours' })
    // Latency pass: `end` is recorded when the reply is ready; the tracker's delta lands after it (off the reply's path) — `tracked`.
    expect(t2.trace.events.find(e => e.kind === 'task' && e.decision === 'end')).toMatchObject({ status: 'active', pending: false, persisted: true })
    expect(t2.trace.events.find(e => e.kind === 'task' && e.decision === 'tracked')).toMatchObject({ constraints: 2 })

    // Turn 3: air conditioning added + the user's pick recorded
    h.state.stepCalls = []
    h.state.deltas = [delta({ set_constraints: [{ key: 'tien_nghi', value: 'có máy lạnh', hard: true }], selected_items: [{ name: 'Cơm Tấm Ba Ghiền', note: 'có máy lạnh' }] })]
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'nhà hàng máy lạnh dưới 300k', location: 'Quận 1' })] },
      { text: '**Cơm Tấm Ba Ghiền** có phòng máy lạnh.', toolCalls: [] },
    ]
    await say(c, 'Phải có máy lạnh, chốt quán đầu tiên')
    expect(Object.keys((h.state.stepCalls[0] as { tools: Record<string, unknown> }).tools)).toContain('ask_user')
    expect(dataBlockOf(h.state.stepCalls[0])).toContain('Đã tra: search_places "nhà hàng ngon dưới 300k"')
    const s3 = await stored(c.id)
    expect(s3!.constraints.map((x: { key: string }) => x.key)).toEqual(['khu_vuc', 'ngan_sach', 'tien_nghi'])
    expect(s3!.research_state.searches).toHaveLength(2)

    // Turn 4: a follow-up that changes nothing → constraints, research and the selection survive untouched
    h.state.stepCalls = []
    h.state.steps = [{ text: 'Quán mở tới 22h.', toolCalls: [] }]
    await say(c, 'Quán đó mở tới mấy giờ?')
    expect(dataBlockOf(h.state.stepCalls[0])).toContain('Người dùng đã chọn: Cơm Tấm Ba Ghiền (có máy lạnh)')
    const s4 = await stored(c.id)
    expect(s4!.task_id).toBe(s1!.task_id)
    expect(s4!.constraints).toHaveLength(3)
    expect(s4!.selected_items).toEqual([{ name: 'Cơm Tấm Ba Ghiền', note: 'có máy lạnh' }])
    expect(s4!.research_state.searches).toHaveLength(2)
    expect(s4!.turns).toBe(4)
    // No conversation text is stored in the task.
    const json = JSON.stringify(s4)
    for (const said of ['Dưới 300k một người nhé', 'Phải có máy lạnh, chốt quán đầu tiên', 'Quán đó mở tới mấy giờ?', 'Quán mở tới 22h.']) expect(json).not.toContain(said)
  })
})

describe('E2E B · shopping: product → budget → intended use', () => {
  it('the MacBook task accumulates budget and use, and the research continues with them', async () => {
    const c = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    h.state.deltas = [delta({ task_type: 'shopping', goal: 'Chọn mua MacBook', add_entities: [{ name: 'MacBook', kind: 'product' }] })]
    h.state.steps = [{ text: '', toolCalls: [call('ask_user', { question: 'Ngân sách và nhu cầu chính của bạn là gì' })] }]
    await say(c, 'Mình muốn mua MacBook')
    h.state.deltas = [delta({ set_constraints: [{ key: 'ngan_sach', value: 'khoảng 25 triệu' }] })]
    h.state.steps = [{ text: '', toolCalls: [call('ask_user', { question: 'Bạn dùng chủ yếu để làm gì' })] }]
    await say(c, 'Tầm 25 triệu')
    h.state.stepCalls = []
    h.state.deltas = [delta({ set_preferences: [{ key: 'muc_dich', value: 'lập trình' }] })]
    h.state.steps = [
      { text: '', toolCalls: [call('web_search', { query: 'MacBook lập trình 25 triệu nên mua' })] },
      { text: 'Với 25 triệu cho lập trình, **MacBook Air M2 16GB** là lựa chọn hợp lý.', toolCalls: [] },
    ]
    await say(c, 'Chủ yếu để code')
    expect(dataBlockOf(h.state.stepCalls[0])).toContain('ngan_sach: khoảng 25 triệu')
    const s = await stored(c.id)
    expect(s).toMatchObject({ task_type: 'shopping', goal: 'Chọn mua MacBook', status: 'active', pending_question: null })
    expect(s!.constraints.map((x: { value: string }) => x.value)).toEqual(['khoảng 25 triệu'])
    expect(s!.preferences.map((x: { value: string }) => x.value)).toEqual(['lập trình'])
    expect(s!.research_state.searches[0]).toMatchObject({ tool: 'web_search', query: 'MacBook lập trình 25 triệu nên mua' })
  })
})

describe('E2E C · travel: destination → dates → travellers → budget', () => {
  it('four mutations of one travel task', async () => {
    const c = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    const turns: Array<[string, Record<string, unknown>]> = [
      ['Mình muốn đi Đà Nẵng', { task_type: 'travel_planning', goal: 'Lên kế hoạch đi Đà Nẵng', set_constraints: [{ key: 'diem_den', value: 'Đà Nẵng' }] }],
      ['Đi từ 20 đến 23/11', { set_constraints: [{ key: 'ngay', value: '20–23/11' }] }],
      ['2 người lớn 1 trẻ em', { set_constraints: [{ key: 'so_nguoi', value: '2 người lớn, 1 trẻ em' }] }],
      ['Ngân sách khoảng 15 triệu', { set_constraints: [{ key: 'ngan_sach', value: 'khoảng 15 triệu' }] }],
    ]
    let id: string | null = null
    for (const [text, d] of turns) {
      h.state.deltas = [delta(d)]
      h.state.steps = [{ text: 'Ghi nhận, mình lên kế hoạch tiếp nhé.', toolCalls: [] }]
      await say(c, text)
      const s = await stored(c.id)
      id ??= s!.task_id
      expect(s!.task_id).toBe(id)
    }
    const s = await stored(c.id)
    expect(s!.constraints.map((x: { key: string; value: string }) => `${x.key}=${x.value}`)).toEqual(['diem_den=Đà Nẵng', 'ngay=20–23/11', 'so_nguoi=2 người lớn, 1 trẻ em', 'ngan_sach=khoảng 15 triệu'])
    expect(s).toMatchObject({ task_type: 'travel_planning', turns: 4 })
  })
})

describe('scope, integrity and flag isolation', () => {
  it('two conversations never share a task; one conversation always maps to its own task', async () => {
    const a = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    const b = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    h.state.deltas = [delta({ goal: 'Việc A', set_constraints: [{ key: 'khu_vuc', value: 'Quận 1' }] })]
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(a, 'việc A')
    h.state.stepCalls = []
    h.state.deltas = [delta({ goal: 'Việc B' })]
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(b, 'việc B')
    expect(dataBlockOf(h.state.stepCalls[0])).not.toContain('Việc A')
    const [ta, tb] = [await stored(a.id), await stored(b.id)]
    expect(ta!.task_id).not.toBe(tb!.task_id)
    expect(tb!.constraints).toEqual([])
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(a, 'tiếp')
    expect((await stored(a.id))!.task_id).toBe(ta!.task_id)
  })

  it('the answer to a clarifying question: the SAME chatSessionId loads the task + history and ask_user is withheld; a CHANGED id (the old web remount defect) loads nothing and ask_user is offered again', async () => {
    const ask = () => {
      h.state.deltas = [delta({ task_type: 'travel_planning', goal: 'Lập kế hoạch đi Huế' })]
      h.state.steps = [{ text: '', toolCalls: [call('ask_user', { question: 'Bạn đi Huế mấy ngày', choices: ['2 ngày', '3 ngày'] })] }]
    }
    const answer = () => { h.state.stepCalls = []; h.state.deltas = [delta({})]; h.state.steps = [{ text: 'Mình lên lịch 3 ngày nhé.', toolCalls: [] }] }
    const toolsOf = () => Object.keys((h.state.stepCalls[0] as { tools: Record<string, unknown> }).tools)
    const dataOf = () => dataBlockOf(h.state.stepCalls[0])

    const same = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    ask(); await say(same, 'Lập kế hoạch đi Huế cho mình')
    answer(); const kept = await say(same, '3 ngày')
    expect(dataOf()).toContain('Bạn vừa hỏi người dùng: "Bạn đi Huế mấy ngày?"')
    expect(toolsOf()).not.toContain('ask_user')
    expect(kept.trace.events.find(e => e.kind === 'task')).toMatchObject({ decision: 'loaded' })

    const changed = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    ask(); await say(changed, 'Lập kế hoạch đi Huế cho mình')
    answer(); const lost = await say({ ...changed, id: sid(), messages: changed.messages }, '3 ngày')
    expect(dataOf()).not.toContain('Bạn vừa hỏi người dùng')
    expect(toolsOf()).toContain('ask_user')
    expect(lost.trace.events.find(e => e.kind === 'task')).toMatchObject({ decision: 'created' })
  })

  it('a client cannot substitute a task: task_id / task fields in the body are ignored', async () => {
    const c = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    h.state.deltas = [delta({ goal: 'Việc thật' })]
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(c, 'bắt đầu')
    const real = (await stored(c.id))!.task_id
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(c, 'tiếp', { task_id: '99999999-9999-4999-8999-999999999999', task: { goal: 'Việc giả', status: 'completed' } })
    const s = await stored(c.id)
    expect(s!.task_id).toBe(real)
    expect(s!.goal).toBe('Việc thật')
  })

  it('corrupt stored task → safe fresh task (traced invalid_discarded), the turn still answers', async () => {
    const id = sid()
    await saveChatSessionState(OWNER, id, { v: 1, task: { v: 1, task_id: 'not-a-uuid', goal: 42 } as never })
    h.state.steps = [{ text: 'Vẫn trả lời được.', toolCalls: [] }]
    const r = await say({ id, messages: [] }, 'phở bò khác phở gà thế nào?')
    expect(r.reply).toContain('Vẫn trả lời được')
    expect(r.trace.events.find(e => e.kind === 'task')).toMatchObject({ decision: 'invalid_discarded' })
    expect((await stored(id))!.task_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('without a valid chatSessionId the task lives for the turn only (nothing guessed, nothing stored)', async () => {
    h.state.deltas = [delta({ goal: 'x y' })]
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    const r = await say({ id: 'not-a-uuid', messages: [] }, 'phở bò khác phở gà thế nào?')
    expect(r.trace.events.find(e => e.kind === 'task')).toMatchObject({ persisted: false })
  })

  it('TAPPY_AGENT=1 never writes a task; neither does the legacy path', async () => {
    for (const flag of ['1', undefined]) {
      if (flag) process.env.TAPPY_AGENT = flag; else delete process.env.TAPPY_AGENT
      const c = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
      h.state.steps = [{ text: 'Phở là món nước.', toolCalls: [] }]
      await say(c, 'phở là gì?')
      expect((await loadChatSessionState(OWNER, c.id))?.task).toBeUndefined()
    }
  })

  it('a legacy / TAPPY_AGENT=1 turn keeps a stored task untouched (no data loss on rollback)', async () => {
    const c = { id: sid(), messages: [] as Array<{ role: string; content: string }> }
    h.state.deltas = [delta({ goal: 'Việc giữ lại' })]
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(c, 'bắt đầu')
    process.env.TAPPY_AGENT = '1'
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await say(c, 'tiếp')
    expect((await stored(c.id))!.goal).toBe('Việc giữ lại')
  })
})
