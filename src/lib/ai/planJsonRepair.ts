// R15 (UAT 933a985, 1 of 10 real trip plans): the block was present but its JSON did not parse — the model
// wrote `{time":"10:00"` (a key missing its opening quote), so every client showed no plan. The server
// repairs the common key-quoting slips of a [TAPPY_PLAN] body BEFORE the plan guards (which parse it too) and
// re-serializes; a body it cannot repair is left unchanged.

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

function tryParse(s: string): unknown | undefined {
  try { return JSON.parse(s) } catch { return undefined }
}

/**
 * CONSULTATIVE_IN_AGENT (`balance`): bracket slips. Measured live 2026-10-11 (Nha Trang plan, 8 KB): `"cost_breakdown":{…}},"local_tips":…` — one `}` too many
 * closed the root object early and the rest was unparseable, so the client showed no plan at all. A closer that empties the stack while more content
 * follows is dropped (the root stays open); a stray closer of the wrong kind is dropped; missing closers are appended at the end. String-aware.
 */
export function balanceBrackets(s: string): string {
  const out: string[] = []
  const stack: string[] = []
  let inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) { out.push(ch); if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
    if (ch === '"') { inStr = true; out.push(ch); continue }
    if (ch === '{' || ch === '[') { stack.push(ch === '{' ? '}' : ']'); out.push(ch); continue }
    if (ch === '}' || ch === ']') {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) continue // stray / wrong-kind closer
      if (stack.length === 1 && /\S/.test(s.slice(i + 1))) continue // would close the root while content follows
      stack.pop(); out.push(ch); continue
    }
    out.push(ch)
  }
  return out.join('') + stack.reverse().join('')
}

/** Repairs the key quoting of one JSON text; returns the parsed value or undefined. */
export function repairJson(body: string, o: { balance?: boolean } = {}): unknown | undefined {
  const direct = tryParse(body)
  if (direct !== undefined) return direct
  const fixes: Array<(s: string) => string> = [
    ...(o.balance ? [balanceBrackets] : []),
    // {time":"…"  ,name":"…"  → a key missing its OPENING quote
    s => s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)"(\s*:)/g, '$1"$2"$3'),
    // {"time:"…"  → a key missing its CLOSING quote
    s => s.replace(/([{,]\s*)"([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'),
    // {time: "…"  → an unquoted key
    s => s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'),
    // trailing commas before } or ]
    s => s.replace(/,(\s*[}\]])/g, '$1'),
  ]
  let s = body
  for (const f of fixes) {
    s = f(s)
    const v = tryParse(s)
    if (v !== undefined) return v
  }
  return undefined
}

/** The text with its [TAPPY_PLAN] body repaired when it did not parse; `repaired` says whether it changed. */
export function repairPlanBlock(text: string, o: { balance?: boolean } = {}): { text: string; repaired: boolean } {
  const a = text.indexOf(OPEN), b = text.indexOf(CLOSE)
  if (a === -1 || b === -1 || b < a) return { text, repaired: false }
  const body = text.slice(a + OPEN.length, b).trim()
  if (tryParse(body) !== undefined) return { text, repaired: false }
  const v = repairJson(body, o)
  if (v === undefined || typeof v !== 'object' || v === null) return { text, repaired: false }
  return { text: `${text.slice(0, a + OPEN.length)}\n${JSON.stringify(v)}\n${text.slice(b)}`, repaired: true }
}
