// Replay harness — reads the AI-SDK data stream the route returns.
//   0: text · 8: annotations (incl. kind 'tappy.turn.v1') · 9: tool call · a: tool result
//   3: error · 2: data · d:/e: finish
export interface TurnAnnotation {
  kind: 'tappy.turn.v1'
  domain: string | null
  turnType: string
  model?: string
  tokensIn: number
  tokensOut: number
  serperCalls: number
  cacheHits: number
  promptCacheRead?: number
  promptCacheWrite?: number
  usd: number
}

export interface ToolFrame { toolCallId: string; toolName?: string; args?: unknown; result?: unknown }

export interface ParsedStream {
  text: string
  annotations: Array<Record<string, unknown>>
  turn: TurnAnnotation | null
  tools: ToolFrame[]
  errors: string[]
  finish: unknown[]
  unknownLines: number
}

export function parseDataStream(raw: string): ParsedStream {
  const out: ParsedStream = { text: '', annotations: [], turn: null, tools: [], errors: [], finish: [], unknownLines: 0 }
  const byId = new Map<string, ToolFrame>()
  const tool = (id: string) => { let t = byId.get(id); if (!t) { t = { toolCallId: id }; byId.set(id, t); out.tools.push(t) } return t }
  for (const line of raw.split('\n')) {
    if (!line) continue
    const i = line.indexOf(':')
    if (i <= 0) { out.unknownLines++; continue }
    const code = line.slice(0, i)
    let v: unknown
    try { v = JSON.parse(line.slice(i + 1)) } catch { out.unknownLines++; continue }
    switch (code) {
      case '0': out.text += String(v); break
      case '8': for (const a of (Array.isArray(v) ? v : [v]) as Array<Record<string, unknown>>) {
        out.annotations.push(a)
        if (a?.kind === 'tappy.turn.v1') out.turn = a as unknown as TurnAnnotation
      } break
      case '9': { const c = v as { toolCallId: string; toolName?: string; args?: unknown }; Object.assign(tool(c.toolCallId), { toolName: c.toolName, args: c.args }); break }
      case 'a': { const r = v as { toolCallId: string; result?: unknown }; tool(r.toolCallId).result = r.result; break }
      case '3': out.errors.push(typeof v === 'string' ? v : JSON.stringify(v)); break
      case 'd': case 'e': out.finish.push(v); break
      default: break
    }
  }
  return out
}

/** The largest row list any tool result of this turn returned (places / products / search rows). */
const ROW_KEYS = ['results', 'shopping_results', 'search_results', 'products', 'places', 'hotels', 'events']

export function toolRowCount(tools: ToolFrame[]): number {
  let n = 0
  for (const t of tools) {
    const r = t.result as Record<string, unknown> | undefined
    if (!r || typeof r !== 'object') continue
    for (const k of ROW_KEYS) {
      const a = r[k]
      if (Array.isArray(a)) n = Math.max(n, a.length)
    }
  }
  return n
}

/** Row names in tool order (card order) — the replay fills {alt} from them when the text names none. */
export function toolRowNames(tools: ToolFrame[]): string[] {
  const out: string[] = []
  for (const t of tools) {
    const r = t.result as Record<string, unknown> | undefined
    if (!r || typeof r !== 'object') continue
    for (const k of ROW_KEYS) {
      const a = r[k]
      if (!Array.isArray(a)) continue
      for (const row of a) {
        const n = String((row as { name?: unknown; title?: unknown })?.name ?? (row as { title?: unknown })?.title ?? '').trim()
        if (n && !out.includes(n)) out.push(n)
      }
    }
  }
  return out
}
