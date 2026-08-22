// ── P3-S3: the memory write boundary ─────────────────────────────────────────
//
// Persistent memory is a future prompt input. The invariant this file exists to
// enforce is therefore:
//
//   untrusted content must not become durable, trusted memory merely because an
//   LLM extracted it.
//
// The boundary sits between MEMORY CANDIDATE (whatever a model emitted, or a
// client sent) and PERSISTED MEMORY (what reaches the table).
//
// MECHANISM — canonical re-materialisation, the same discipline as P3-S1: this
// builds a FRESH object from an allowlist. Nothing the contract does not name
// can survive, including fields a future change to the extraction prompt might
// start emitting. Deleting known-bad keys would be a blocklist, and a blocklist
// is wrong the first time somebody invents a new key.
//
// WHAT THIS IS NOT — a keyword filter. "Ignore all previous instructions" may be
// stored as a remembered fact if the product's policy allows it. What it must
// never do is acquire AUTHORITY, and authority is denied by three things that
// have nothing to do with the words: the schema (no trust/role/owner field can
// exist), server-derived ownership (updateMemory pins user_id), and the P3-S2
// fence applied when memory re-enters a prompt. Guessing dangerous words would
// be security theatre.
//
// SCOPE: this bounds and canonicalises. It does not decide product policy about
// what is worth remembering, and it does not touch retrieval or tool results.

/**
 * Bounds. Derived from limits the code already applied at the PATCH route
 * (120-char facts, 60-char history items, 50 items) rather than invented, so a
 * value that was acceptable before this phase is still acceptable after it.
 */
export const MEMORY_LIMITS = {
  maxTextChars: 120,
  /** behaviour_summary is server-generated prose from the rollup cron, not a
   *  user-supplied fact, so it gets a larger bound of its own. */
  maxSummaryChars: 2_000,
  maxHistoryItems: 50,
  maxHistoryItemChars: 60,
  maxPreferenceKeys: 32,
  maxPreferenceKeyChars: 40,
  maxPreferenceValues: 50,
  maxPreferenceValueChars: 60,
  maxBudgetKeys: 20,
  maxBudgetKeyChars: 40,
} as const

/** Every column a memory write may touch. Ownership, identity and timestamps
 *  are deliberately absent — those are the server's to set, never the data's. */
export const MEMORY_FIELDS = [
  'location_base', 'companions', 'timing', 'personality', 'behavior_summary',
  'preferences', 'budget', 'history',
] as const

export type MemoryField = (typeof MEMORY_FIELDS)[number]

export interface ValidatedMemoryPatch {
  location_base?: string | null
  companions?: string | null
  timing?: string | null
  personality?: string | null
  behavior_summary?: string | null
  preferences?: Record<string, string[]>
  budget?: Record<string, { min: number; max: number }>
  history?: string[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** C0/C1, DEL and the Unicode line/paragraph separators, by code point — never
 *  typed as literals (raw control bytes in source produce a binary file). */
const CONTROL: ReadonlySet<number> = (() => {
  const s = new Set<number>()
  for (let c = 0x00; c <= 0x1f; c++) s.add(c)
  for (let c = 0x7f; c <= 0x9f; c++) s.add(c)
  for (const c of [0x2028, 0x2029, 0x200b, 0x200c, 0x200d, 0xfeff]) s.add(c)
  return s
})()

/** A remembered fact is ONE line. It cannot forge block structure even before
 *  the S2 fence is applied on re-entry. */
function singleLine(value: string, max: number): string {
  let out = ''
  for (const ch of value) out += CONTROL.has(ch.codePointAt(0) ?? 0) ? ' ' : ch
  return out.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Multi-line is legitimate here (rollup prose); only control characters go. */
function multiLine(value: string, max: number): string {
  let out = ''
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0
    out += CONTROL.has(cp) && cp !== 0x0a ? ' ' : ch
  }
  return out.trim().slice(0, max)
}

function textField(value: unknown, max: number, multi = false): string | null {
  if (typeof value !== 'string') return null
  const clean = multi ? multiLine(value, max) : singleLine(value, max)
  return clean.length > 0 ? clean : null
}

function stringArray(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const clean = singleLine(item, maxChars)
    if (clean.length === 0) continue
    out.push(clean)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * Rebuild a memory candidate as exactly what may be persisted.
 *
 * A field absent from the candidate stays absent from the result: the write is
 * an upsert, so inventing a key here would silently wipe that column — which is
 * what the behaviour-rollup cron (it sends only `behavior_summary`) depends on.
 * An explicit `null` is preserved, because that is how the user clears a fact.
 *
 * Bounding is by truncation for values and by dropping the excess for
 * collections — matching what the PATCH route already did, so no previously
 * valid write becomes invalid. A candidate that is not an object at all yields
 * `{}`, and updateMemory refuses to write an empty patch.
 */
export function sanitizeMemoryPatch(candidate: unknown): ValidatedMemoryPatch {
  if (!isRecord(candidate)) return {}
  const L = MEMORY_LIMITS
  const out: ValidatedMemoryPatch = {}

  if ('location_base' in candidate) out.location_base = textField(candidate.location_base, L.maxTextChars)
  if ('companions' in candidate) out.companions = textField(candidate.companions, L.maxTextChars)
  if ('timing' in candidate) out.timing = textField(candidate.timing, L.maxTextChars)
  if ('personality' in candidate) out.personality = textField(candidate.personality, L.maxTextChars)
  if ('behavior_summary' in candidate) {
    out.behavior_summary = textField(candidate.behavior_summary, L.maxSummaryChars, true)
  }

  if ('history' in candidate) {
    if (!Array.isArray(candidate.history)) return dropped(out, 'history')
    out.history = stringArray(candidate.history, L.maxHistoryItems, L.maxHistoryItemChars)
  }

  if ('preferences' in candidate) {
    if (!isRecord(candidate.preferences)) return dropped(out, 'preferences')
    const prefs: Record<string, string[]> = {}
    for (const [rawKey, rawVal] of Object.entries(candidate.preferences)) {
      if (Object.keys(prefs).length >= L.maxPreferenceKeys) break
      if (!Array.isArray(rawVal)) continue
      const key = singleLine(rawKey, L.maxPreferenceKeyChars)
      if (key.length === 0) continue
      prefs[key] = stringArray(rawVal, L.maxPreferenceValues, L.maxPreferenceValueChars)
    }
    out.preferences = prefs
  }

  if ('budget' in candidate) {
    if (!isRecord(candidate.budget)) return dropped(out, 'budget')
    const budget: Record<string, { min: number; max: number }> = {}
    for (const [rawKey, rawVal] of Object.entries(candidate.budget)) {
      if (Object.keys(budget).length >= L.maxBudgetKeys) break
      if (!isRecord(rawVal)) continue
      const max = Number(rawVal.max)
      const min = Number(rawVal.min)
      if (!Number.isFinite(max) || max < 0) continue
      const key = singleLine(rawKey, L.maxBudgetKeyChars)
      if (key.length === 0) continue
      budget[key] = { min: Number.isFinite(min) && min >= 0 ? min : 0, max }
    }
    out.budget = budget
  }

  return out
}

/** A container of the wrong type is not coerced into an empty one — the field is
 *  simply not part of this write, so the stored value is left alone. */
function dropped(out: ValidatedMemoryPatch, field: MemoryField): ValidatedMemoryPatch {
  delete (out as Record<string, unknown>)[field]
  return out
}
