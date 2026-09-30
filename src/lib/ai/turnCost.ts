// ── Per-turn cost (owner 2026-09-29, Phần 6) ────────────────────────────────────────────────────
// USD for one chat turn: model tokens at list price + Serper credits. Written to the server log as
// `tappyai_turn_cost` for every turn (ask / pick / follow-up / plan …) so the average can be held at
// ≤ $0.01/turn and a 300-turn/month heavy user at ≤ $3.

const PRICES: Array<[RegExp, { inPerM: number; outPerM: number }]> = [
  [/sonnet/i, { inPerM: 3, outPerM: 15 }],
  [/opus/i, { inPerM: 15, outPerM: 75 }],
  [/haiku/i, { inPerM: 1, outPerM: 5 }],
]

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
  const p = PRICES.find(([re]) => re.test(u.model ?? 'haiku'))?.[1] ?? PRICES[2][1]
  const model = (u.promptTokens * p.inPerM + (u.cacheReadTokens ?? 0) * p.inPerM * 0.1 + (u.cacheCreationTokens ?? 0) * p.inPerM * 1.25 + u.completionTokens * p.outPerM) / 1e6
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
export function turnCostStream(body: ReadableStream<Uint8Array>, info: () => TurnCostInfo | null): ReadableStream<Uint8Array> {
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
        c.enqueue(enc.encode(`8:${JSON.stringify([{ kind: 'tappy.turn.v1', ...i }])}\n`))
      }
      for (const l of held) c.enqueue(enc.encode(l + '\n'))
    },
  }))
}
