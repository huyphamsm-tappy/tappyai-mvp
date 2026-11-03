// Phase 8 — UAT-10 ask-first root cause. WHAT THIS FILE CAN AND CANNOT SHOW (read before trusting it):
//   · The loop tests below script the model, so they prove what the RUNTIME does with each decision (tool executed or not, turn ends or
//     continues, state carried to the next turn) — NOT that Luna now chooses that decision. Luna's choice is only measured live.
//   · The consistency tests lock the INSTRUCTION SET (system prompt + ask_user description) against the contradiction that produced the
//     failure; they are not evidence that the model behaves differently.
// No network, no model.
import { describe, it, expect } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { ASK_USER, askUserTool } from './controlTools'
import { AGENT_SYSTEM_V2 } from './prompt'
import { createTask, conversationIdOf, applyTaskDelta, finishTurn, recordResearch, taskContextLines } from './task'

const NOW = new Date('2026-10-09T05:00:00Z')
const conv = conversationIdOf('33333333-3333-4333-8333-333333333333')!
const UAT10 = 'So sánh hai mẫu điện thoại phù hợp với người ưu tiên pin, camera và dùng lâu dài. Hãy giải thích tiêu chí chọn.'

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}${toolName}`, toolName, args })),
})

function turn(script: RuntimeStep[], userText: string) {
  const toolRuns: Array<{ name: string; args: Record<string, unknown> }> = []
  const seenOptions: Array<{ keys: string[]; toolNames: string[]; final: boolean }> = []
  const fake = (name: string) => ({ execute: async (a: Record<string, unknown>) => { toolRuns.push({ name, args: a }); return { results: [{ title: 'r', link: 'https://x.example/a', snippet: 's' }] } } })
  const input: RuntimeInput = {
    system: AGENT_SYSTEM_V2, messages: [{ role: 'user', content: userText }],
    tools: { web_search: fake('web_search'), search_products: fake('search_products') } as never,
    schemas: { web_search: {}, search_products: {}, [ASK_USER]: {} },
    callModel: async o => {
      seenOptions.push({ keys: Object.keys(o), toolNames: Object.keys(o.tools ?? {}), final: o.final })
      return script.shift() ?? step(o.final ? 'Câu trả lời cuối.' : 'Mặc định.')
    },
    deadlineAt: Date.now() + 85_000, lang: 'vi',
    trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
  }
  return { input, toolRuns, seenOptions }
}

describe('instruction set: ONE rule for ask-vs-answer (the contradiction behind the UAT-10 ask)', () => {
  const desc = String((askUserTool() as unknown as { description: string }).description)

  it('measured cause: the same prompt family gave 5/5 asks (budget-example only), 5/5 answers (unconditional lookup bullet), 1/1 ask (conditional bullet that re-allowed ask_user for a missing purpose) — so the wording of THIS rule decides, not luck', () => {
    // evidence is in artifacts/phase8/uat/post-credit-final-2026-10-09/evidence/UAT-10-attempt{1,2}* and uat10-live-after-prompt-fix-2026-10-09/
    // What must NOT come back: any rule that tells the model to call ask_user for a missing purpose / budget / OS before explaining.
    expect(AGENT_SYSTEM_V2).not.toMatch(/\(dùng để làm gì\) thì ask_user/)
    expect(AGENT_SYSTEM_V2).not.toMatch(/mua đồ đắt tiền mà chưa biết dùng để làm gì/)
    expect(desc).not.toMatch(/mua đồ đắt tiền chưa rõ dùng để làm gì/)
  })

  it('the prompt and the tool description state the same trigger: ask only when NO useful part of the answer is possible without it', () => {
    expect(AGENT_SYSTEM_V2).toMatch(/CHỈ khi thiếu một thông tin mà KHÔNG có nó thì không thể đưa ra phần trả lời nào có ích/)
    expect(desc).toMatch(/CHỈ khi thiếu một thông tin mà không có nó thì không thể đưa ra phần trả lời nào có ích/)
  })

  it('refinement-only details (OS, brand, budget, models under consideration) go to ONE question at the END, in both places', () => {
    expect(AGENT_SYSTEM_V2).toMatch(/hệ điều hành, hãng, ngân sách, mẫu đang cân nhắc\) thì nói rõ nó đổi lựa chọn thế nào và hỏi tối đa MỘT câu Ở CUỐI/)
    expect(desc).toMatch(/hệ điều hành, hãng, ngân sách, mẫu đang cân nhắc, tên các lựa chọn\) thì đặt MỘT câu hỏi ở cuối câu trả lời, không dùng công cụ này/)
  })

  it('the compare/choose-N bullet orders: answer first → look up only to name concrete models → at most one closing question; no ask_user', () => {
    const bullet = AGENT_SYSTEM_V2.split('\n').find(l => l.includes('so sánh / chọn N lựa chọn'))!
    expect(bullet).toBeTruthy()
    expect(bullet).toMatch(/KHÔNG hỏi tên và KHÔNG dùng ask_user/)
    expect(bullet.indexOf('(1) Viết ngay phần họ nhờ')).toBeLessThan(bullet.indexOf('(2) Chỉ khi cần nêu mẫu cụ thể mới TRA CỨU'))
    expect(bullet.indexOf('(2)')).toBeLessThan(bullet.indexOf('(3) Kết bằng tối đa MỘT câu hỏi'))
    expect(bullet).toMatch(/không lấy từ trí nhớ/)
    expect(bullet).toMatch(/không tra lại chỉ để diễn đạt lại câu vừa trả lời/)
  })

  it('clarification cases that MUST remain are still named (booking without place/time, trip without destination, nothing stated about what to buy)', () => {
    for (const text of [AGENT_SYSTEM_V2, desc]) {
      expect(text).toMatch(/đặt chỗ chưa (?:biết|rõ) nơi\/giờ/)
      expect(text).toMatch(/kế hoạch du lịch chưa có điểm đến/)
      expect(text).toMatch(/cần mua nhưng chưa nói gì về loại hay nhu cầu/)
    }
  })
})

describe('scenarios A–E on the runtime (scripted model: what the CODE does with each decision)', () => {
  it('A · priorities stated + "explain the criteria": an answer in one round is accepted as is — 0 tools, no forced tool or ask in the model call', async () => {
    const t = turn([step('Tiêu chí: pin (thời lượng thực tế), camera (ảnh thiếu sáng, zoom), cập nhật phần mềm. Đánh đổi: …')], UAT10)
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.modelCalls, run.toolCalls, t.toolRuns.length]).toEqual(['answered', 1, 0, 0])
    expect(run.text).toContain('Tiêu chí')
    // the call offers ask_user as an option only: nothing in the options forces a tool (no toolChoice)
    expect(t.seenOptions[0].keys.sort()).toEqual(['final', 'messages', 'signal', 'system', 'tools'])
    expect(t.seenOptions[0].toolNames).toContain(ASK_USER)
  })

  it('A2 · Luna may still answer FIRST and look up AFTER: one lookup to name concrete models, then the answer, no ask', async () => {
    const t = turn([step('', [['search_products', { query: 'điện thoại pin trâu camera tốt' }]]), step('Tiêu chí … ; hai ứng viên đã tra: …')], UAT10)
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.toolCalls, t.toolRuns.map(r => r.name)]).toEqual(['answered', 1, ['search_products']])
    expect(run.toolEvents.some(e => e.name === ASK_USER)).toBe(false)
  })

  it('B · a truly decisive gap (book a table: no place/time) → ask_user ends the turn; a search in the same step is NOT run', async () => {
    const t = turn([step('', [[ASK_USER, { question: 'Bạn muốn đặt bàn ở đâu và lúc mấy giờ', choices: ['Quận 1', 'Quận 3'] }], ['web_search', { queries: ['đặt bàn nhà hàng'] }]])], 'Đặt giúp mình một bàn tối nay')
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.toolCalls, t.toolRuns.length]).toEqual(['asked', 0, 0])
  })

  it('C · complete information + compare existing products: the lookup runs once, no ask; the stated constraints are carried so nothing is asked again', async () => {
    const t = turn([step('', [['search_products', { query: 'iPhone 16 vs Galaxy S25 giá' }]]), step('So sánh: …')], 'So sánh iPhone 16 và Galaxy S25, ngân sách 20 triệu, ưu tiên pin')
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.toolCalls, t.toolRuns.length]).toEqual(['answered', 1, 1])
    let task = createTask(conv, NOW)
    task = applyTaskDelta(task, [], { goal: 'So sánh iPhone 16 và Galaxy S25', set_constraints: [{ key: 'ngan_sach', value: '20 triệu', hard: true }], set_preferences: [{ key: 'uu_tien', value: 'pin' }] }, { now: NOW, conversationId: conv }).task
    const ctx = taskContextLines(task, [], new Date(NOW.getTime() + 60_000)).join('\n')
    expect(ctx).toContain('ngan_sach: 20 triệu')
    expect(ctx).toContain('uu_tien: pin')
  })

  it('D · a knowledge question: answered in one round, no tool, no ask', async () => {
    const t = turn([step('Pin lithium-ion xuống cấp vì …')], 'Vì sao pin điện thoại chai theo thời gian?')
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.modelCalls, run.toolCalls, t.toolRuns.length]).toEqual(['answered', 1, 0, 0])
  })

  it('E · a follow-up that adds nothing: the previous lookup is shown to the model, an identical repeat is refused, and a pending question is surfaced', async () => {
    const first = turn([step('', [['web_search', { queries: ['pin camera điện thoại 2026 đánh giá'] }]]), step('Xong.')], UAT10)
    const run1 = await runAgentRuntime(first.input)
    let task = recordResearch(createTask(conv, NOW), run1.toolEvents.map(e => ({ name: e.name, args: e.args, outcome: e.outcome, results: 4 })), NOW)
    const ctx = taskContextLines(task, [], new Date(NOW.getTime() + 60_000)).join('\n')
    expect(ctx).toContain('web_search "pin camera điện thoại 2026 đánh giá"')
    // within the turn, repeating the identical call executes once
    const again = turn([step('', [['web_search', { queries: ['pin camera điện thoại 2026 đánh giá'] }]]), step('', [['web_search', { queries: ['pin camera điện thoại 2026 đánh giá'] }]]), step('Xong.')], 'Nói lại giúp mình')
    const run2 = await runAgentRuntime(again.input)
    expect(again.toolRuns.filter(r => r.name === 'web_search')).toHaveLength(1)
    expect(run2.toolEvents.map(e => e.outcome)).toEqual(['ok', 'duplicate'])
    // after an ask, the next turn is told the question is pending (so it answers instead of asking again)
    task = finishTurn(task, { asked: { question: 'Bạn dùng iPhone hay Android', choices: ['iPhone', 'Android'] }, now: NOW })
    expect(taskContextLines(task, [], NOW).join('\n')).toContain('Bạn vừa hỏi người dùng: "Bạn dùng iPhone hay Android"')
  })
})
