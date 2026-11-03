// 01/11 (owner: "bảng thống kê chi phí - làm ngay"): the usage ledger writes one row per turn of a signed-in account, reporting only.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { usageRow, recordAiUsage, aiUsageLedgerOn, ledgerMode, usageSplit, type AiUsageEvent } from './usageLedger'
import { turnCostStream, type TurnCostInfo } from '@/lib/ai/turnCost'

const USER = '0b9a5c1e-2f3d-4a6b-8c7d-1e2f3a4b5c6d'
const EV: AiUsageEvent = { userId: USER, plan: 'promax', mode: 'chat', searchDepth: 'thorough', costUsd: 0.0123456789, tokensIn: 1200, tokensOut: 300, serperCalls: 3, parallelCalls: 0 }
const ON = { AI_USAGE_LEDGER: '1' }
afterEach(() => vi.restoreAllMocks())

describe('usageRow', () => {
  it('the row the table takes: counts and the price, rounded and bounded; never a word of the conversation', () => {
    expect(usageRow(EV)).toEqual({ user_id: USER, plan: 'promax', mode: 'chat', search_depth: 'thorough', cost_usd: 0.012346, tokens_in: 1200, tokens_out: 300, serper_calls: 3, parallel_calls: 0, ok: true, llm_usd: 0, serper_usd: 0, cached_tokens_in: 0, reasoning_tokens: 0, serper_cache_hits: 0, turn_type: '' })
    expect(Object.keys(usageRow(EV)!)).not.toContain('question')
  })
  // 02/11 (owner: "bật bảng đo để coi chi phí câu thường, web search, nghiên cứu sâu"): the split the cost decisions need - model price vs
  // search price, the tokens served from the provider's cache, the thinking tokens, the Serper cache hits, and the kind of turn.
  it('the cost split: model price, search price, cached input, thinking tokens, Serper cache hits and the turn type', () => {
    const r = usageRow({ ...EV, llmUsd: 0.0045678, serperUsd: 0.008, cachedTokensIn: 52000, reasoningTokens: 734, serperCacheHits: 2, turnType: 'one_brain' })!
    expect(r).toMatchObject({ llm_usd: 0.004568, serper_usd: 0.008, cached_tokens_in: 52000, reasoning_tokens: 734, serper_cache_hits: 2, turn_type: 'one_brain' })
  })
  it('the split is clamped like the rest: negatives and junk become 0, the turn type is a short word', () => {
    const r = usageRow({ ...EV, llmUsd: -1, serperUsd: NaN, cachedTokensIn: -5, reasoningTokens: 1.9, serperCacheHits: Infinity, turnType: 'Deep Research!! with a very long name indeed' })!
    expect(r).toMatchObject({ llm_usd: 0, serper_usd: 0, cached_tokens_in: 0, reasoning_tokens: 1, serper_cache_hits: 0 })
    expect(r.turn_type).toMatch(/^[a-z0-9_-]{0,24}$/)
  })
  it('no signed-in account (a guest, an anonymous id that is not a uuid) → no row', () => {
    expect(usageRow({ ...EV, userId: null })).toBeNull()
    expect(usageRow({ ...EV, userId: '1.2.3.4' })).toBeNull()
  })
  it('bad values are clamped to what the table accepts', () => {
    const r = usageRow({ ...EV, plan: 'Pro<script>', mode: 'x' as never, searchDepth: 'deep' as never, costUsd: -1, tokensIn: NaN, tokensOut: -5, serperCalls: 2.7, ok: false })!
    expect(r).toMatchObject({ plan: 'proscript', mode: 'chat', search_depth: 'none', cost_usd: 0, tokens_in: 0, tokens_out: 0, serper_calls: 2, ok: false })
    expect(usageRow({ ...EV, costUsd: 1e9 })!.cost_usd).toBe(99.999999)
  })
})

describe('ledgerMode (review 02/11: the mode that really served the turn)', () => {
  it('thinking asked and the Responses API configured: think / auto_think', () => {
    expect(ledgerMode('think', false, true)).toBe('think')
    expect(ledgerMode('auto', true, true)).toBe('auto_think')
    expect(ledgerMode('auto', false, true)).toBe('auto')
  })
  it('no Responses spend cap configured: the turn ran on the chat model and is recorded as such', () => {
    expect(ledgerMode('think', false, false)).toBe('chat')
    expect(ledgerMode('auto', true, false)).toBe('auto')
  })
  it('the other modes are what was asked', () => {
    for (const m of ['chat', 'web', 'deep'] as const) for (const r of [true, false]) expect(ledgerMode(m, false, r)).toBe(m)
  })
})

describe('usageSplit (the turn\'s cost info → the ledger fields)', () => {
  it('a chat turn: the model price, the search price, cached input, thinking tokens, Serper cache hits, the turn type', () => {
    const i: TurnCostInfo = { domain: null, turnType: 'one_brain', model: 'luna', tokensIn: 73000, tokensOut: 1700, serperCalls: 6, cacheHits: 2, usd: 0.0125, answerUsd: 0.0045, serperUsd: 0.008, reasoningTokens: 734, lunaCachedIn: 52000 }
    expect(usageSplit(i)).toEqual({ llmUsd: 0.0045, serperUsd: 0.008, cachedTokensIn: 52000, reasoningTokens: 734, serperCacheHits: 2, turnType: 'one_brain' })
  })
  it('a turn that did not report the split (an older path): the model price is what is left after the search price, never negative', () => {
    const i: TurnCostInfo = { domain: null, turnType: 'ask', model: 'haiku-4.5', tokensIn: 100, tokensOut: 20, serperCalls: 0, cacheHits: 0, usd: 0.003 }
    expect(usageSplit(i)).toMatchObject({ llmUsd: 0.003, serperUsd: 0, cachedTokensIn: 0, reasoningTokens: 0, serperCacheHits: 0, turnType: 'ask' })
    expect(usageSplit({ ...i, usd: 0.001, serperUsd: 0.002 }).llmUsd).toBe(0)
  })
  it('a Deep Research run: the split is passed through as given', () => {
    const i: TurnCostInfo = { domain: null, turnType: 'deep_research', model: 'luna', tokensIn: 0, tokensOut: 0, serperCalls: 14, cacheHits: 0, usd: 0.02, answerUsd: 0.009, serperUsd: 0.011 }
    expect(usageSplit(i)).toMatchObject({ llmUsd: 0.009, serperUsd: 0.011, turnType: 'deep_research' })
  })
})

describe('recordAiUsage', () => {
  it('off (the default until the migration is applied): nothing is written', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    await recordAiUsage(EV, { insert, env: {} })
    expect(insert).not.toHaveBeenCalled()
    expect(aiUsageLedgerOn({})).toBe(false)
  })
  it('on: one row for a signed-in account, none for a guest', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    await recordAiUsage(EV, { insert, env: ON })
    await recordAiUsage({ ...EV, userId: null }, { insert, env: ON })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0]).toEqual([usageRow(EV)])
  })
  it('a failed write never throws and logs counts only', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
    await expect(recordAiUsage(EV, { insert: async () => { throw new Error(`db down ${USER}`) }, env: ON })).resolves.toBeUndefined()
    await recordAiUsage(EV, { insert: async () => ({ error: { message: 'denied' } }), env: ON })
    expect(lines).toEqual(['{"type":"tappyai_usage_ledger","ok":false}', '{"type":"tappyai_usage_ledger","ok":false}'])
  })
})

describe('turnCostStream sink', () => {
  const read = async (s: ReadableStream<Uint8Array>) => new TextDecoder().decode(new Uint8Array(await new Response(s).arrayBuffer()))
  const body = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('0:"hi"\nd:{"finishReason":"stop"}\n')); c.close() } })
  const info: TurnCostInfo = { domain: null, turnType: 'chat', model: 'luna', tokensIn: 10, tokensOut: 5, serperCalls: 1, cacheHits: 0, usd: 0.002 }
  it('the sink gets the turn\'s cost once; a throwing sink never breaks the answer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sink = vi.fn()
    const out = await read(turnCostStream(body(), () => info, sink))
    expect(sink).toHaveBeenCalledWith(info)
    expect(out).toContain('0:"hi"')
    const broken = await read(turnCostStream(body(), () => info, () => { throw new Error('x') }))
    expect(broken).toContain('d:{"finishReason":"stop"}')
  })
})
