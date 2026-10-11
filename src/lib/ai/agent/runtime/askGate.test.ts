// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { askRefusal } from './askGate'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { ASK_USER } from './controlTools'

const PLAN = 'Mình muốn đi Lý Sơn 3 ngày 2 đêm vào cuối tháng 12, đi 2 người (mình và bạn gái), ngân sách khoảng 6 triệu cả hai người, thích biển. Lập kế hoạch giúp mình nhé.'

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
