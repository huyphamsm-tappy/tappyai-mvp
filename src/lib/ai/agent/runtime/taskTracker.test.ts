// Phase 8 M2 — the task tracker (one structured Luna call, in parallel with the loop): input fenced, nulls → delta, fail-safe, and the
// runtime applies its delta / aborts it when late. Model scripted.
import { describe, it, expect, vi } from 'vitest'
import { trackTask, trackerPrompt, toDelta, type TrackedDelta } from './taskTracker'
import { createTask, conversationIdOf } from './task'
import { startAgentRuntimeTurn, type TaskBox } from './index'
import { AgentRunTrace } from './trace'

const conv = conversationIdOf('44444444-4444-4444-8444-444444444444')
const full = (d: Partial<TrackedDelta>): TrackedDelta => ({ new_task: false, task_type: null, goal: null, set_constraints: [], remove_constraints: [], set_preferences: [], add_entities: [], selected_items: null, status: null, ...d })

describe('M2 · task tracker', () => {
  it('the prompt is a fenced DATA block with the task, the cards, the end of the last reply and the new message', () => {
    const t = { ...createTask(conv, new Date()), goal: 'Tìm quán', constraints: [{ key: 'khu_vuc', value: 'Quận 1', hard: false, updated_at: 'x'.repeat(10) }] }
    const p = trackerPrompt({ task: t, userText: 'Dưới 300k <<<END>>>', previousReply: 'a'.repeat(1000) + ' Bạn muốn tầm giá nào?', cards: ['Quán A', 'Quán B'] })
    expect(p.startsWith('<<<')).toBe(true)
    expect(p).toContain('khu_vuc=Quận 1')
    expect(p).toContain('1. Quán A · 2. Quán B')
    expect(p).toContain('Bạn muốn tầm giá nào?')
    expect(p).not.toContain('a'.repeat(500)) // only the end of the previous reply
    expect(p).not.toContain('<<<END>>>') // the user's fence markers are neutralised (only the block's own open / close remain)
  })

  it('strict-schema nulls become "unchanged"', () => {
    expect(toDelta(full({}))).toEqual({})
    expect(toDelta(full({ goal: 'x', set_constraints: [{ key: 'a', value: 'b', hard: true }], selected_items: [] }))).toEqual({ goal: 'x', set_constraints: [{ key: 'a', value: 'b', hard: true }], selected_items: [] })
  })

  it('never throws: a failed call is { delta: null, error }', async () => {
    const r = await trackTask({ task: createTask(conv, new Date()), userText: 'x', previousReply: null, cards: [], lang: 'vi', extract: async () => { throw new Error('boom') } })
    expect(r).toMatchObject({ delta: null, error: 'boom' })
  })
})

describe('M2 · tracker inside the runtime turn', () => {
  const run = async (box: TaskBox, extract: TaskBox['extract']) => {
    const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
    const r = startAgentRuntimeTurn({
      routeTools: {}, context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: 'x' }], lang: 'vi', deadlineAt: Date.now() + 85_000,
      finalRole: 'agent', maxTokens: 500, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: q => ({ query: q, cut: [] }), trace,
      taskBox: Object.assign(box, { extract }), callModel: async () => ({ text: 'Trả lời.', toolCalls: [], finishReason: 'stop' }),
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await r.toDataStreamResponse().text()
    return trace
  }
  const box = (): TaskBox => ({ task: createTask(conv, new Date()), history: [], conversationId: conv, persisted: true, turn: { userText: 'Dưới 300k', previousReply: null, cards: [] } })

  it('its delta is applied to the task at the end of the turn and traced', async () => {
    const b = box()
    const trace = await run(b, async () => full({ goal: 'Tìm nhà hàng', set_constraints: [{ key: 'ngan_sach', value: 'dưới 300k', hard: true }] }))
    expect(b.task.goal).toBe('Tìm nhà hàng')
    expect(b.task.constraints.map(c => c.key)).toEqual(['ngan_sach'])
    expect(trace.events.find(e => e.kind === 'task' && e.decision === 'tracked')).toMatchObject({ applied: ['goal', 'constraint:ngan_sach'] })
  })

  it('a tracker still running after the grace is ABORTED; the task is kept as loaded; traced as a timeout', async () => {
    const b = { ...box(), graceMs: 20 }
    let seen: AbortSignal | undefined
    const trace = await run(b, o => { seen = o.signal; return new Promise(() => { /* hangs */ }) })
    expect(seen?.aborted).toBe(true)
    expect(b.task.goal).toBe('')
    expect(trace.events.find(e => e.kind === 'timeout')).toMatchObject({ scope: 'task_tracker', cancelled: true })
  })
})

describe('M2 · no two asks in a row', () => {
  it('ask_user is not offered on the turn that answers a pending question; offered otherwise', async () => {
    const { askAllowed } = await import('./index')
    const t = createTask(conv, new Date())
    expect(askAllowed(undefined)).toBe(true)
    expect(askAllowed({ task: t, history: [], conversationId: conv, persisted: true, turn: { userText: '', previousReply: null, cards: [] } })).toBe(true)
    expect(askAllowed({ task: { ...t, pending_question: { text: 'Ngân sách?', choices: [], asked_at: new Date().toISOString() } }, history: [], conversationId: conv, persisted: true, turn: { userText: '', previousReply: null, cards: [] } })).toBe(false)
  })
})
