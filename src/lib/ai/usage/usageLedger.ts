// ── AI usage ledger (owner 01/11/2026: "bảng thống kê chi phí - làm ngay") ─────────────────────────────────────────────────────────────
//
// One row per AI turn of a signed-in account in public.ai_usage_events (supabase/migrations/20261101_ai_usage_events.sql): the plan, the
// mode, the deepest web lookup, the price and the counts. COST REPORTING ONLY: no limit reads it (limits live in lib/ai/quota). Nothing the
// person wrote or read is stored. Written by the server with the service role, after the turn, never awaited by the answer: a failed
// write costs one log line (counts only) and nothing else. Behind AI_USAGE_LEDGER=1 (off until the migration is applied).
import { createAdminClient } from '@/lib/supabase/admin'
import type { TurnCostInfo } from '@/lib/ai/turnCost'

/** 01/11: 'auto' = a Tự động turn that stayed Chat; 'auto_think' = one where the model turned thinking on. */
export type UsageMode = 'chat' | 'web' | 'think' | 'deep' | 'auto' | 'auto_think'
export type UsageDepth = 'none' | 'quick' | 'thorough'
export interface AiUsageEvent {
  userId: string | null
  plan: string
  mode: UsageMode
  searchDepth: UsageDepth
  costUsd: number
  tokensIn?: number
  tokensOut?: number
  serperCalls?: number
  parallelCalls?: number
  ok?: boolean
  // 02/11 (cost split): what the cost decisions need beyond the total. All counts or prices, never a word of the conversation.
  /** the model's part of `costUsd` (tokens at list price) */
  llmUsd?: number
  /** the search part of `costUsd` (Serper credits, plus Parallel for Deep Research) */
  serperUsd?: number
  /** input tokens the provider served from its prompt cache */
  cachedTokensIn?: number
  /** thinking tokens (already inside `tokensOut`) */
  reasoningTokens?: number
  /** Serper lookups answered from our own cache (no credit spent) */
  serperCacheHits?: number
  /** the kind of turn the server logged: one_brain | ask | plan | deep_research | … */
  turnType?: string
}

/**
 * The cost split of a turn, read from the cost info the server already logs as `tappyai_turn_cost`. A turn that did not report the split
 * (an older path) gets the model price as what is left after the search price, never negative. Pure.
 */
export function usageSplit(i: TurnCostInfo): Pick<AiUsageEvent, 'llmUsd' | 'serperUsd' | 'cachedTokensIn' | 'reasoningTokens' | 'serperCacheHits' | 'turnType'> {
  const serperUsd = typeof i.serperUsd === 'number' && i.serperUsd > 0 ? i.serperUsd : 0
  const llmUsd = typeof i.answerUsd === 'number' ? i.answerUsd : Math.max(0, i.usd - serperUsd)
  return { llmUsd, serperUsd, cachedTokensIn: i.lunaCachedIn ?? i.promptCacheRead ?? 0, reasoningTokens: i.reasoningTokens ?? 0, serperCacheHits: i.cacheHits, turnType: i.turnType }
}

/**
 * Review 02/11: the mode that really served the turn. Thinking asked without the Responses spend cap configured ran on the chat model, so it
 * is recorded as chat ('think' → 'chat', a Tự động turn that turned thinking on → 'auto'). Pure.
 */
export function ledgerMode(asked: 'chat' | 'web' | 'think' | 'deep' | 'auto', thinkOn: boolean, responsesOn: boolean): UsageMode {
  if (asked === 'think') return responsesOn ? 'think' : 'chat'
  if (asked === 'auto') return thinkOn && responsesOn ? 'auto_think' : 'auto'
  return asked
}

export const aiUsageLedgerOn = (env: Record<string, string | undefined> = process.env) => env.AI_USAGE_LEDGER === '1'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 2_000_000_000) : 0)
const usd = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 1e6) / 1e6, 99.999999) : 0)

/** The row as the table takes it (the table's own checks, applied here first); no signed-in account → null. Pure. */
export function usageRow(e: AiUsageEvent): Record<string, unknown> | null {
  if (!e.userId || !UUID.test(e.userId)) return null
  const cost = typeof e.costUsd === 'number' && Number.isFinite(e.costUsd) && e.costUsd > 0 ? Math.min(Math.round(e.costUsd * 1e6) / 1e6, 99.999999) : 0
  return {
    user_id: e.userId,
    plan: (String(e.plan || 'free').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'free').toLowerCase(),
    mode: (['chat', 'web', 'think', 'deep', 'auto', 'auto_think'] as const).includes(e.mode) ? e.mode : 'chat',
    search_depth: (['none', 'quick', 'thorough'] as const).includes(e.searchDepth) ? e.searchDepth : 'none',
    cost_usd: cost,
    tokens_in: count(e.tokensIn),
    tokens_out: count(e.tokensOut),
    serper_calls: count(e.serperCalls),
    parallel_calls: count(e.parallelCalls),
    ok: e.ok !== false,
    llm_usd: usd(e.llmUsd),
    serper_usd: usd(e.serperUsd),
    cached_tokens_in: count(e.cachedTokensIn),
    reasoning_tokens: count(e.reasoningTokens),
    serper_cache_hits: count(e.serperCacheHits),
    turn_type: String(e.turnType ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24),
  }
}

type Insert = (row: Record<string, unknown>) => Promise<{ error: unknown }>
const defaultInsert: Insert = async row => {
  const r = await createAdminClient().from('ai_usage_events').insert(row)
  return { error: r.error }
}

/** Records one turn (fire and forget: never throws, never awaited by the answer). Off, or no signed-in account: nothing. */
export function recordAiUsage(e: AiUsageEvent, o: { insert?: Insert; env?: Record<string, string | undefined> } = {}): Promise<void> {
  if (!aiUsageLedgerOn(o.env)) return Promise.resolve()
  const row = usageRow(e)
  if (!row) return Promise.resolve()
  return (o.insert ?? defaultInsert)(row)
    .then(r => { if (r.error) console.log(JSON.stringify({ type: 'tappyai_usage_ledger', ok: false })) })
    .catch(() => { console.log(JSON.stringify({ type: 'tappyai_usage_ledger', ok: false })) })
}
