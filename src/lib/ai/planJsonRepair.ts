// R15 (UAT 933a985, 1 of 10 real trip plans): the block was present but its JSON did not parse — the model
// wrote `{time":"10:00"` (a key missing its opening quote), so every client showed no plan. The server
// repairs the common key-quoting slips of a [TAPPY_PLAN] body BEFORE the plan guards (which parse it too) and
// re-serializes; a body it cannot repair is left unchanged.

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

function tryParse(s: string): unknown | undefined {
  try { return JSON.parse(s) } catch { return undefined }
}

/** Repairs the key quoting of one JSON text; returns the parsed value or undefined. */
export function repairJson(body: string): unknown | undefined {
  const direct = tryParse(body)
  if (direct !== undefined) return direct
  const fixes: Array<(s: string) => string> = [
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
export function repairPlanBlock(text: string): { text: string; repaired: boolean } {
  const a = text.indexOf(OPEN), b = text.indexOf(CLOSE)
  if (a === -1 || b === -1 || b < a) return { text, repaired: false }
  const body = text.slice(a + OPEN.length, b).trim()
  if (tryParse(body) !== undefined) return { text, repaired: false }
  const v = repairJson(body)
  if (v === undefined || typeof v !== 'object' || v === null) return { text, repaired: false }
  return { text: `${text.slice(0, a + OPEN.length)}\n${JSON.stringify(v)}\n${text.slice(b)}`, repaired: true }
}
