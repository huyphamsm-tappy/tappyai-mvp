// @vitest-environment node
// Round 3O · mock runs of the 30-turn extension set through the REAL runLiveTrial path (dev-multi), with a fake network and a scripted model.
// MOCK-ONLY: no network, no key, no paid call, no Luna. The question file is read ONLY for its ids and texts (never printed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { runLiveTrial, type TrialOutcome } from './liveTrial'
import { memFs } from './liveRunner.testkit'
import { parseDevQuestions } from './devQuestions'
import type { UatTurn } from './questions'

const EXT = 'D:/TappyAI-review-artifacts/consultative-round3n/ext25-questions.txt'
const OPENAI = 'https://api.openai.com/v1/chat/completions'
const SECRET_KEY = 'sk-test-SECRET-3O-777'
const SECRET_SERPER = 'serper-SECRET-3O-888'
const ext30 = (): UatTurn[] => {
  const r = parseDevQuestions(fs.readFileSync(EXT, 'utf8'))
  if (!r.ok) throw new Error('the extension set was refused by the parser')
  return r.turns
}

beforeEach(() => {
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI']) vi.stubEnv(k, undefined)
  vi.stubEnv('BENCH_SPEND_GATE', '1')
  vi.stubEnv('BENCH_SPEND_TURN_CAP_USD', '0.05')
  vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '0.65')
  vi.stubEnv('BENCH_CONFIRM_SPEND', '0.65')
  vi.stubEnv('BENCH_TRIAL_QUESTION_FILE', EXT)
  vi.stubEnv('BENCH_TRIAL_OUT_DIR', 'D:/TappyAI-review-artifacts/consultative-round3o/mock-out')
  vi.stubEnv('OPENAI_API_KEY', SECRET_KEY)
  vi.stubEnv('SERPER_API_KEY', SECRET_SERPER)
  vi.stubEnv('CONSULTATIVE_V1', '0'); vi.stubEnv('CONSULT_V2', '0')
  vi.stubEnv('BENCH_EXPECT_CONSULTATIVE_V1', '0'); vi.stubEnv('BENCH_EXPECT_CONSULT_V2', '0')
  __resetBenchProcessGuardForTests()
  vi.stubGlobal('fetch', (async () => { throw new Error('TRIPWIRE: a real request must never be made') }) as typeof fetch)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); __resetBenchProcessGuardForTests() })

/** A scripted model: records the messages it was sent, spends `cost` per call, and can fail one call (a non-answer). */
function scripted(cost: number, failOnCall?: number) {
  let n = 0
  const seen: Array<{ session: string; messages: Array<{ role: string; content: string }> }> = []
  const post = async (req: unknown) => {
    n++
    const body = await (req as { json(): Promise<{ messages: Array<{ role: string; content: string }>; chatSessionId: string }> }).json()
    seen.push({ session: body.chatSessionId, messages: body.messages })
    await fetch(OPENAI, { method: 'POST' }).catch(() => undefined)
    if (failOnCall === n) return new Response('upstream failure', { status: 500 })
    const h = reserveSpend('llm:consult', 0.03)!
    h.settle(cost, { tokensIn: 1, tokensOut: 1, cachedIn: 0 })
    return new Response(`0:"answer ${n}"\nd:{"finishReason":"stop"}\n`)
  }
  return { post, seen, calls: () => n }
}

const seen2sessions = (s: Array<{ session: string }>) => s.map(x => x.session)

const run = (post: unknown, turns: UatTurn[], fsObj = memFs()): Promise<TrialOutcome> =>
  runLiveTrial({ env: process.env, post, fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch, fs: fsObj, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns, afterTrial: 'deny' } as never)

describe('mock 30-turn run through runLiveTrial (dev-multi path, fake network, scripted model)', () => {
  it('a) all 30 turns run in one process, in file order, with the right ids and no gaps or repeats', async () => {
    const turns = ext30()
    const m = scripted(0.01)
    const out = await run(m.post, turns)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(m.calls()).toBe(30)
    const ids = out.summary.turnRows.map(t => t.id)
    expect(ids).toEqual(turns.map(t => t.id))
    expect(new Set(ids).size).toBe(30)
    expect(out.summary.stopped).toBeNull()
    expect(out.summary.turnsRun).toBe(30)
    process.stdout.write('A_NUMBERS ' + JSON.stringify({ calls: m.calls(), rows: ids.length, usd: out.summary.usd, stopped: out.summary.stopped, serperReq: out.summary.hostRequests['google.serper.dev'] ?? null }) + '\n')
  })

  it('b) the history of an earlier turn of the SAME conversation reaches the later turn; another conversation gets no history', async () => {
    const turns = ext30()
    const m = scripted(0.01)
    await run(m.post, turns)
    const byId = (id: string) => m.seen[turns.findIndex(t => t.id === id)]
    const x12 = byId('X1-2')
    // X1-2 must carry X1-1's user text and the scripted answer to it (answer 1 is the first call, i.e. X1-1's reply)
    expect(x12.messages.some(msg => msg.role === 'user' && msg.content === turns.find(t => t.id === 'X1-1')!.text)).toBe(true)
    expect(x12.messages.some(msg => msg.role === 'assistant' && msg.content.includes('answer'))).toBe(true)
    // E1 is a different conversation: its messages hold only its own question
    const e1 = byId('E1')
    expect(e1.messages.length).toBe(1)
    expect(e1.messages[0].role).toBe('user')
    // X1-4 has the whole history of X1 (its four user turns)
    const x14 = byId('X1-4')
    const userTurns = x14.messages.filter(msg => msg.role === 'user').map(msg => msg.content)
    expect(userTurns).toEqual(turns.filter(t => t.conversation === 'X1').map(t => t.text))
    process.stdout.write('B_NUMBERS ' + JSON.stringify({ x12Messages: x12.messages.length, x14Messages: x14.messages.length, e1Messages: e1.messages.length, distinctSessions: new Set(seen2sessions(m.seen)).size }) + '\n')
  })

  it('c) every turn writes its answer and numbers to the output folder; the file reads back whole', async () => {
    const turns = ext30()
    const m = scripted(0.01)
    const fsObj = memFs()
    const out = await run(m.post, turns, fsObj)
    expect(out.kind).toBe('ran')
    const files = [...fsObj.files.entries()]
    expect(files.length).toBeGreaterThan(0)
    const resultFile = files.find(([p]) => p.endsWith('.json'))
    expect(resultFile, 'a result file is written').toBeDefined()
    const parsed = JSON.parse(resultFile![1])
    const rows = (parsed.records ?? parsed.turns ?? []) as Array<{ id: string; answer?: string }>
    expect(rows.length).toBe(30)
    expect(rows.every(r => typeof r.answer === 'string' && r.answer.length > 0)).toBe(true)
  })

  it('d) with a run cap that stops mid-way: turns after the stop do not run, finished turns are kept, no request is sent past the stop', async () => {
    vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '0.10')
    vi.stubEnv('BENCH_CONFIRM_SPEND', '0.10')
    const turns = ext30()
    const m = scripted(0.03)
    const out = await run(m.post, turns)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(out.summary.stopped).toMatch(/budget-refused/)
    expect(m.calls()).toBeLessThan(30)
    expect(out.summary.turnRows.length).toBe(m.calls())
    expect(out.summary.trialClean).toBe(false)
    // measured, not inferred: the requests the wrapper let through to the model host equal the model calls the script made (no request past the stop)
    expect(out.summary.hostRequests['api.openai.com']).toBe(m.calls())
  })

  it('e) a turn that is not an answer halts the run; the later turns are not sent again or retried', async () => {
    const turns = ext30()
    const m = scripted(0.01, 5)
    const out = await run(m.post, turns)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(out.summary.stopped).toMatch(/not an answer|halted/)
    expect(m.calls()).toBe(5)
    expect(out.summary.turnRows.length).toBe(5)
  })

  it('f) secret-shaped values in the environment never reach the summary or the written result', async () => {
    const turns = ext30()
    const m = scripted(0.01, 3)
    const fsObj = memFs()
    const out = await run(m.post, turns, fsObj)
    const everything = [JSON.stringify(out), ...[...fsObj.files.values()]].join('\n')
    expect(everything).not.toContain(SECRET_KEY)
    expect(everything).not.toContain(SECRET_SERPER)
  })

  it('g) a second run in the same process does not run again (observed); after a reset the same set runs and gives the same count', async () => {
    const turns = ext30()
    const m1 = scripted(0.01)
    const first = await run(m1.post, turns)
    expect(first.kind).toBe('ran')
    const again = await run(scripted(0.01).post, turns).catch(e => e as Error)
    // observed: the process guard returns a 'refused' outcome; a thrown error would fail this line (no broad catch hides an unrelated crash)
    expect(again instanceof Error ? 'thrown' : (again as TrialOutcome).kind).toBe('refused')
    process.stdout.write('G_SECOND_IN_PROCESS ' + (again instanceof Error ? 'thrown' : 'outcome-' + (again as TrialOutcome).kind) + '\n')
    __resetBenchProcessGuardForTests()
    const m2 = scripted(0.01)
    const fresh = await run(m2.post, turns)
    expect(fresh.kind).toBe('ran')
    if (fresh.kind === 'ran' && first.kind === 'ran') expect(fresh.summary.turnRows.length).toBe(first.summary.turnRows.length)
  })
})