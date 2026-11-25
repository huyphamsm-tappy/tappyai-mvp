// Every human-readable string inside a structured payload (a shared plan), so the whole of it can be checked as text. URLs are skipped: they are not prose, and the plan's photo hosts are already
// whitelisted. Pure; depth and count are bounded so a hostile payload cannot make this expensive.
const MAX_DEPTH = 8
const MAX_STRINGS = 400

export function allStrings(value: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown, depth: number) => {
    if (out.length >= MAX_STRINGS || depth > MAX_DEPTH) return
    if (typeof v === 'string') { if (v.trim() && !/^https?:\/\//i.test(v.trim())) out.push(v.trim()) }
    else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1)
  }
  walk(value, 0)
  return out
}
