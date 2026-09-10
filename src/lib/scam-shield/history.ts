import type { CheckResult, RiskLevel } from './types'

// ── Scam Shield · recent checks, on this device ──────────────────────────────
//
// 🚨 THIS IS NOT A SECURITY RECORD, AND NOTHING MAY EVER TREAT IT AS ONE.
//
// The authoritative answer about a URL is the one `/api/scam-shield/check` returns, every time it
// is asked. What lives here is a convenience list — "links you looked at recently on this
// browser" — so a visitor can see what they already checked without retyping it. It is written
// only AFTER a real check returned a real result: there is no path in this module that invents an
// entry, and no caller may add one that was not produced by the engine.
//
// Consequences that follow from that, and are the reason the module is this small:
//
//   • A history row must never be presented as a current verdict. Re-checking is a fresh call.
//   • It is per-browser, not per-account. It does NOT sync, and the UI says so.
//   • It stores the three fields the list needs to render and nothing else. Not the score, not
//     the evidence, not the recommended actions, not the official-brand match — a phishing
//     report sitting in `localStorage` on a shared machine is a liability with no upside, and
//     every one of those fields is re-derivable by checking the link again.
//
// Migrating to a server-side history later means reimplementing `readHistory` / `recordCheck` /
// `clearHistory` against an API and leaving every call site alone. That is why the view touches
// storage through these three functions only, and never through `localStorage` directly.

/** Namespaced like every other key this app owns (`tappy_lang`, `tappy_location`, …). */
export const HISTORY_STORAGE_KEY = 'tappy_scam_history'

/** Recent, not permanent. Old rows are dropped rather than accumulated. */
export const HISTORY_LIMIT = 15

export interface ScamCheckHistoryEntry {
  /** The URL as the engine normalised it — the same string the result carried. */
  url: string
  /** The level the engine assigned AT THE TIME. Never re-derived, never inferred. */
  level: RiskLevel
  /** Epoch ms. `CheckResult.checkedAt` is stamped per call, so this is a real check time. */
  checkedAt: number
}

/**
 * 🔑 `Record<RiskLevel, true>` rather than a `Set` of strings, and that is load-bearing: adding a
 * seventh level to the union fails the BUILD here until it is listed, instead of silently
 * becoming a level that `isEntry` quietly discards from everyone's stored history.
 */
const KNOWN_LEVELS: Record<RiskLevel, true> = {
  SAFE: true,
  LOW: true,
  MEDIUM: true,
  HIGH: true,
  CRITICAL: true,
  INCONCLUSIVE: true,
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(KNOWN_LEVELS, value)
}

/**
 * Every stored row is re-validated on the way out.
 *
 * The store is a string in a browser the app does not control: it survives across deploys, it can
 * be edited by hand, it can be left behind by an older shape of this feature, and it can be
 * corrupted by a half-finished write. So a row is trusted only if it still looks like one, and
 * anything else is dropped silently — a malformed history is a cosmetic problem and must never
 * become a thrown exception in the middle of a security tool.
 */
function isEntry(value: unknown): value is ScamCheckHistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.url === 'string' &&
    row.url.length > 0 &&
    row.url.length <= 2048 &&
    isRiskLevel(row.level) &&
    typeof row.checkedAt === 'number' &&
    Number.isFinite(row.checkedAt) &&
    row.checkedAt > 0
  )
}

/**
 * 🚨 Reading `window.localStorage` can THROW, not merely return null — a browser set to block
 * site data, and some private-browsing modes, raise on property access itself. Server rendering
 * has no `window` at all. Both are normal conditions for this page, so every entry point goes
 * through here and the feature degrades to "no history" instead of breaking the check form that
 * happens to sit above it.
 */
function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    return null
  }
}

/** Most recent first. Returns `[]` for missing, unavailable, corrupt or foreign data. */
export function readHistory(): ScamCheckHistoryEntry[] {
  const store = storage()
  if (!store) return []

  let raw: string | null
  try {
    raw = store.getItem(HISTORY_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter(isEntry)
    .sort((a, b) => b.checkedAt - a.checkedAt)
    .slice(0, HISTORY_LIMIT)
}

/**
 * Record one REAL result and return the new list.
 *
 * The parameter is a whole `CheckResult` on purpose: the only way to get one is to have called
 * the engine, so a caller cannot assemble a history row out of nothing without going out of its
 * way. Re-checking a URL moves it to the top rather than adding a duplicate, because a second row
 * for the same link carrying an older verdict is exactly the confusion this list must not create.
 *
 * The new list is returned even when the write fails (a full quota, a locked store). The visitor
 * still sees the check they just ran; it simply will not survive a reload, which is a better
 * outcome than dropping it from the screen as well.
 */
export function recordCheck(result: CheckResult): ScamCheckHistoryEntry[] {
  const checkedAt = Number.isFinite(result.checkedAt) && result.checkedAt > 0
    ? result.checkedAt
    : Date.now()

  const entry: ScamCheckHistoryEntry = {
    url: result.url,
    level: result.risk.level,
    checkedAt,
  }
  if (!isEntry(entry)) return readHistory()

  const next = [entry, ...readHistory().filter(e => e.url !== entry.url)].slice(0, HISTORY_LIMIT)

  const store = storage()
  if (store) {
    try {
      store.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* quota, or a store that reads but refuses writes — the list above still renders */
    }
  }
  return next
}

/** Forget everything on this device. */
export function clearHistory(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(HISTORY_STORAGE_KEY)
  } catch {
    /* nothing to do: the caller clears its own state either way */
  }
}
