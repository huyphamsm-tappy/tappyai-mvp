// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { askRefusal, askVerdict, askGateEnabled, askGateMode } from './askGate'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { ASK_USER } from './controlTools'

const PLAN = 'Mình muốn đi Lý Sơn 3 ngày 2 đêm vào cuối tháng 12, đi 2 người (mình và bạn gái), ngân sách khoảng 6 triệu cả hai người, thích biển. Lập kế hoạch giúp mình nhé.'

describe('askGate — every case where a real question must NOT be gated', () => {
  const FULL = '3 ngày 2 đêm, 2 người, ngân sách 6 triệu. Lập kế hoạch giúp mình.'
  it('two destinations to choose between (A hay B / chọn giúp / so sánh)', () => {
    expect(askVerdict(`Mình muốn đi biển, Phú Quốc hay Nha Trang, giúp mình chọn. ${FULL}`, 'Bạn thích nơi yên tĩnh hay sôi động?', 'vi')).toBeNull()
    expect(askVerdict(`Phú Quốc hay Nha Trang? ${FULL}`, 'Bạn ưu tiên điều gì?', 'vi')).toBeNull()
    expect(askVerdict(`So sánh Đà Lạt và Sa Pa giúp mình. ${FULL}`, 'Bạn thích lạnh đến mức nào?', 'vi')).toBeNull()
  })
  it('destination undecided ("chưa biết đi đâu", "đi đâu cũng được")', () => {
    expect(askVerdict(`Mình chưa biết đi đâu. ${FULL}`, 'Bạn thích biển hay núi?', 'vi')).toBeNull()
    expect(askVerdict(`Đi đâu cũng được. ${FULL}`, 'Bạn thích khí hậu nào?', 'vi')).toBeNull()
    expect(askVerdict(`Gợi ý cho mình điểm đến. ${FULL}`, 'Bạn muốn đi đâu?', 'vi')).toBeNull()
  })
  it('a question asking where to go is never gated, even on a full-info request', () => {
    expect(askVerdict(PLAN, 'Bạn muốn đi đâu?', 'vi')).toBeNull()
  })
  it('no plan request / not enough stated → not gated (date unclear, no length, no party)', () => {
    expect(askVerdict('Mình muốn đi du lịch nhưng chưa biết đi đâu', 'Bạn thích biển hay núi?', 'vi')).toBeNull()
    expect(askVerdict('Lập kế hoạch đi Đà Lạt', 'Bạn đi mấy ngày?', 'vi')).toBeNull()
    expect(askVerdict('Giá vé máy bay đi Đà Nẵng ngày nào rẻ nhất?', 'Bạn đi ngày nào?', 'vi')).toBeNull()
    expect(askVerdict('Mình có hai offer, nên chọn cái nào?', 'Bạn xuất phát từ đâu?', 'vi')).toBeNull()
  })
  it('the user asks back / a directions request that asks nothing about origin is not gated', () => {
    expect(askVerdict('Chỉ đường tới Chợ Bến Thành', 'Bạn muốn đến cổng nào của chợ?', 'vi')).toBeNull()
  })
  it('verdict carries only a condition kind', () => {
    expect(askVerdict(PLAN, 'Bạn xuất phát từ đâu?', 'vi')?.kind).toBe('plan_full_info')
    expect(askVerdict('Chỉ đường tới Chợ Bến Thành', 'Bạn xuất phát từ đâu?', 'vi')?.kind).toBe('directions_origin')
  })
  it('emergency switch: CONSULT_ASK_GATE=off|0|false disables, unset/other enables', () => {
    expect(askGateEnabled({})).toBe(true)
    expect(askGateEnabled({ CONSULT_ASK_GATE: 'on' })).toBe(true)
    for (const v of ['off', '0', 'false', ' OFF ']) expect(askGateEnabled({ CONSULT_ASK_GATE: v })).toBe(false)
  })
})

describe('askRefusal — never ask first what the owner rule says is assumed', () => {
  it('full-info plan: origin, vehicle, year and exact-day questions are refused', () => {
    for (const q of ['Bạn sẽ xuất phát từ đâu?', 'Bạn đi bằng phương tiện gì?', 'Bạn định đi cuối tháng 12/2026 hay một năm khác?', 'Bạn đi ngày nào cụ thể?', 'Năm nào bạn đi?']) {
      expect(askRefusal(PLAN, q, 'vi'), q).toMatch(/Không hỏi câu này/)
    }
  })
  it('directions without an origin: where-from / vehicle questions are refused', () => {
    expect(askRefusal('Chỉ đường giúp mình tới Nhà thờ Đức Bà', 'Bạn xuất phát từ đâu và đi bằng gì?', 'vi')).toMatch(/vị trí hiện tại/)
  })
  it('full-info plan: ANY question is refused (live: after origin and year, "cuối tháng 12 hay mùa biển êm hơn?" was asked)', () => {
    expect(askRefusal(PLAN, 'Cuối tháng 12 biển động, bạn muốn giữ đúng thời điểm hay chuyển mùa biển êm hơn?', 'vi')).toMatch(/nói rõ ngay trong kế hoạch/)
    expect(askRefusal(PLAN, 'Bạn thích nghỉ dưỡng hay khám phá?', 'vi')).toMatch(/Không hỏi câu này/)
    // the exact question asked live (it contains "điểm đến" but asks about the weather risk, not about where to go)
    expect(askRefusal(PLAN, 'Cuối tháng 12 biển Lý Sơn có thể động, ảnh hưởng chuyến tàu và lịch đi biển; bạn muốn mình lập theo hướng ưu tiên ngắm cảnh trong điều kiện thời tiết bất định, hay có thể đổi điểm đến nếu biển xấu?', 'vi')).toMatch(/Không hỏi câu này/)
  })
  it('other questions pass: a missing destination, or a plan request that lacks length / party / budget', () => {
    expect(askRefusal('Lập kế hoạch 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu', 'Bạn muốn đi đâu?', 'vi')).toBeNull() // the destination is what is missing
    expect(askRefusal('Lập kế hoạch đi chơi giúp mình', 'Bạn muốn đi đâu?', 'vi')).toBeNull()
    expect(askRefusal('Lập kế hoạch đi Đà Lạt giúp mình', 'Bạn xuất phát từ đâu?', 'vi')).toBeNull() // no length / party / budget stated: not a full-info request
    expect(askRefusal('Mình đang phân vân quá', 'Bạn xuất phát từ đâu?', 'vi')).toBeNull()
  })
})

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}${Math.random().toString(36).slice(2)}`, toolName, args })),
})

function run(script: RuntimeStep[], refuse: boolean) {
  const seen: unknown[] = []
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: PLAN }], tools: {}, schemas: { [ASK_USER]: {} },
    callModel: async o => { seen.push(o.messages.at(-1)); return script.shift() ?? step('Kế hoạch.') },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    ...(refuse ? { refuseAsk: (a: { question: string }) => askRefusal(PLAN, a.question, 'vi') } : {}),
  }
  return runAgentRuntime(input).then(r => ({ r, seen }))
}

describe('CONSULT_ASK_GATE modes', () => {
  it('block (default / anything else), shadow, off', () => {
    expect(askGateMode({})).toBe('block')
    expect(askGateMode({ CONSULT_ASK_GATE: 'block' })).toBe('block')
    expect(askGateMode({ CONSULT_ASK_GATE: ' Shadow ' })).toBe('shadow')
    for (const v of ['off', '0', 'false', 'NO']) expect(askGateMode({ CONSULT_ASK_GATE: v })).toBe('off')
    expect(askGateEnabled({ CONSULT_ASK_GATE: 'shadow' })).toBe(true)
  })
  it('shadow: the question the gate would refuse is SHOWN, and only the kind is logged', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => { logs.push(String(m)) })
    const input: RuntimeInput = {
      system: 'SYS', messages: [{ role: 'user', content: PLAN }], tools: {}, schemas: { [ASK_USER]: {} },
      callModel: async () => step('', [[ASK_USER, { question: 'Bạn xuất phát từ đâu?' }]]),
      deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
      refuseAsk: a => askVerdict(PLAN, a.question, 'vi'), askGateShadow: true,
    }
    const r = await runAgentRuntime(input)
    spy.mockRestore()
    expect(r.status).toBe('asked')
    expect(r.ask?.question).toMatch(/xuất phát/)
    const line = logs.find(l => l.includes('tappyai_ask_gate'))!
    expect(JSON.parse(line)).toEqual({ type: 'tappyai_ask_gate', decision: 'would_refuse', kind: 'plan_full_info' })
    expect(line).not.toMatch(/xuất phát|Lý Sơn/) // no user words, no question
  })
})

describe('loop — a refused ask continues the turn', () => {
  it('flag on: the refused question is not shown; the model gets the note and answers', async () => {
    const { r, seen } = await run([step('', [[ASK_USER, { question: 'Bạn xuất phát từ đâu?' }]]), step('Đây là kế hoạch 3 ngày 2 đêm ở Lý Sơn.')], true)
    expect(r.status).toBe('answered')
    expect(r.ask).toBeNull()
    expect(r.text).toContain('kế hoạch 3 ngày')
    expect(JSON.stringify(seen[1])).toContain('Không hỏi câu này')
  })
  it('flag off (no gate): the same question ends the turn as before', async () => {
    const { r } = await run([step('', [[ASK_USER, { question: 'Bạn xuất phát từ đâu?' }]])], false)
    expect(r.status).toBe('asked')
    expect(r.ask?.question).toMatch(/xuất phát/)
  })
  it('a third attempt is shown (the user is never left with silence)', async () => {
    const q = step('', [[ASK_USER, { question: 'Bạn xuất phát từ đâu?' }]])
    const { r } = await run([q, step('', [[ASK_USER, { question: 'Bạn đi bằng phương tiện gì?' }]]), step('', [[ASK_USER, { question: 'Bạn đi ngày nào?' }]])], true)
    expect(r.status).toBe('asked')
  })
  it('a question that is not gated is shown at once', async () => {
    const { r } = await run([step('', [[ASK_USER, { question: 'Bạn muốn đi đâu?' }]])], true)
    expect(r.status).toBe('asked')
  })
})
