// ── Per-turn cost (owner 2026-09-29, Phần 6) ────────────────────────────────────────────────────
// USD for one chat turn: model tokens at list price + Serper credits. Written to the server log as
// `tappyai_turn_cost` for every turn (ask / pick / follow-up / plan …) so the average can be held at
// ≤ $0.01/turn and a 300-turn/month heavy user at ≤ $3.

import { claudeCallCost, HAIKU55_MODEL_ID, SONNET55_MODEL_ID } from '@/lib/ai/llm/providers/claude'

// H3 (owner 20/11/2026): Haiku and Sonnet are priced from the ONE table in providers/claude.ts (list prices, with the cache and the 100k-token card of Haiku 5.5). This file used to keep its own
// generic rows (haiku 1/5, sonnet 3/15), 10x the real Haiku 5.5, so a turn logged without a model was overstated. Opus has no row there (no Opus is used), so it keeps this legacy one.
const OPUS_LEGACY = { inPerM: 15, outPerM: 75 }

export interface TurnUsage {
  promptTokens: number
  completionTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  serperCredits?: number
  model?: string
}

/** Serper list price per credit (USD). Override with SERPER_USD_PER_CREDIT. */
export function serperUsdPerCredit(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.SERPER_USD_PER_CREDIT)
  return Number.isFinite(v) && v >= 0 && env.SERPER_USD_PER_CREDIT !== undefined && env.SERPER_USD_PER_CREDIT !== '' ? v : 0.001
}

export function turnUsd(u: TurnUsage, env: Record<string, string | undefined> = process.env): number {
  const hint = u.model ?? 'haiku'
  let model: number
  if (/opus/i.test(hint)) {
    model = (u.promptTokens * OPUS_LEGACY.inPerM + (u.cacheReadTokens ?? 0) * OPUS_LEGACY.inPerM * 0.1 + (u.cacheCreationTokens ?? 0) * OPUS_LEGACY.inPerM * 1.25 + u.completionTokens * OPUS_LEGACY.outPerM) / 1e6
  } else {
    const id = /sonnet/i.test(hint) ? SONNET55_MODEL_ID : HAIKU55_MODEL_ID
    model = claudeCallCost(id, { input: u.promptTokens, cacheRead: u.cacheReadTokens ?? 0, cacheWrite: u.cacheCreationTokens ?? 0, output: u.completionTokens })?.usd ?? 0
  }
  const serper = (u.serperCredits ?? 0) * serperUsdPerCredit(env)
  return Math.round((model + serper) * 1e6) / 1e6
}

/** Sum of a per-endpoint record ({maps, search, …}) — the meter reports calls and hits per endpoint. */
export const sumCounts = (r: Record<string, number> | undefined): number => Object.values(r ?? {}).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0)

export interface TurnCostInfo {
  domain: string | null
  turnType: string
  model: string
  tokensIn: number
  tokensOut: number
  serperCalls: number
  cacheHits: number
  /** Anthropic prompt cache: input tokens read from / written to the cache this turn (cost §6 hit rate). */
  promptCacheRead?: number
  promptCacheWrite?: number
  usd: number
  /** PHIÊN LUNA (CONSULT_LUNA only): the turn split by part and vendor. `reasoningTokens` are inside tokensOut. */
  intent?: string | null
  intentUsd?: number
  answerUsd?: number
  serperUsd?: number
  reasoningTokens?: number
  lunaCachedIn?: number
  lunaCacheWrite?: number
  fellBack?: boolean
}

/**
 * Adds the turn's cost as a final `8:` annotation `{kind:'tappy.turn.v1', …}` (before the `d:` finish
 * frame) and logs it as `tappyai_turn_cost`. Clients ignore unknown annotation kinds; the UAT
 * measurement reads it. `info()` is called at the end of the stream, when usage is known.
 */
/** `sink` (01/11): also handed the turn's cost once it is known (the usage ledger); it must not throw, and is never awaited. */
export function turnCostStream(body: ReadableStream<Uint8Array>, info: () => TurnCostInfo | null, sink?: (i: TurnCostInfo) => void): ReadableStream<Uint8Array> {
  const dec = new TextDecoder(), enc = new TextEncoder()
  let rest = ''
  const held: string[] = []
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      rest += dec.decode(chunk, { stream: true })
      const lines = rest.split('\n'); rest = lines.pop() ?? ''
      for (const l of lines) { if (l.startsWith('d:')) held.push(l); else c.enqueue(enc.encode(l + '\n')) }
    },
    flush(c) {
      if (rest) { if (rest.startsWith('d:')) held.push(rest); else c.enqueue(enc.encode(rest + '\n')) }
      let i: TurnCostInfo | null = null
      try { i = info() } catch { i = null }
      if (i) {
        console.log(JSON.stringify({ type: 'tappyai_turn_cost', ...i }))
        try { sink?.(i) } catch { /* the ledger never breaks a turn */ }
        c.enqueue(enc.encode(`8:${JSON.stringify([{ kind: 'tappy.turn.v1', ...i }])}\n`))
      }
      for (const l of held) c.enqueue(enc.encode(l + '\n'))
    },
  }))
}
