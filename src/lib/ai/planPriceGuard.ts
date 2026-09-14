// ── Plan price provenance ────────────────────────────────────────────────────
//
// The prose money guards read `proseOnly(text)`, so a [TAPPY_PLAN] block is
// invisible to them by design — and the plan is exactly where the model writes
// a price per step. Measured 2026-09-14 on the planning probe with OSM rows
// (no price field of any kind): 4 of 5 delivered plans carried
// "800,000 – 1,200,000 VND (estimated for 2)" per item and a cost_breakdown
// summed from those numbers. The prompt says "chưa có giá" when the tool has
// no price; a prompt rule does not stop a model.
//
// Same contract as every other guard here, applied to the one structured
// payload the client renders as money:
//
//   USER-STATED amount        → allowed (the budget is the user's own number)
//   TOOL-SUPPLIED amount      → allowed, for the item it was retrieved FOR
//   anything else numeric     → replaced by the truthful sentinel
//
// Evidence is per ENTITY. A price the retrieval published for the restaurant
// is not evidence for the bar, and an area-level snippet is not evidence for
// any item — the same scoping `snippetPriceGuard` already enforces on prose.
// Derived numbers (an "estimated total", a "remaining budget") are only as real
// as the numbers under them: they survive only when they trace to a user or
// tool amount themselves. Nothing is computed here — fail-closed, like the rest.
//
// Deterministic, no model call, no network. Edits the PARSED object and
// re-serializes, exactly as `injectPlanPhotos` does — never string-splices JSON.

import { extractMoneyClaims } from './moneyGuard'
import { normalizeVN } from './intent'

/** What the guard may read. Amounts are VND. */
export interface PlanPriceEvidence {
  /** Place name → VND amounts the retrieval stated FOR that place. */
  byEntity: Map<string, number[]>
  /** Amounts in the user's own message — never redacted. */
  userAmounts: number[]
}

/** The truthful no-price value, per response language — the prompt's own wording. */
export function planNoPriceSentinel(lang: string): string {
  return lang === 'vi' ? 'chưa có giá' : 'price not available'
}

// Snippets and provider bands round loosely; same width as snippetPriceGuard.
const ROUNDING = 0.05
const near = (v: number, pool: number[]): boolean =>
  pool.some(p => Math.abs(v - p) <= Math.max(p * ROUNDING, 1000))

const normName = (n: string) => normalizeVN(n.trim().toLowerCase())

/** Evidence for one plan item: exact name, else the containment `injectPlanPhotos` uses. */
function amountsFor(name: string, byEntity: Map<string, number[]>): number[] {
  const key = normName(name)
  if (!key) return []
  const exact = byEntity.get(key)
  if (exact) return exact
  for (const [n, amounts] of byEntity) {
    if (n.length >= 4 && (key.includes(n) || n.includes(key))) return amounts
  }
  return []
}

/**
 * Does every amount in `value` trace to the pool? A value with no money claim
 * ("chưa có giá", "miễn phí", "$$") is not a numeric price and is left alone.
 */
function supported(value: string, pool: number[]): boolean {
  const claims = extractMoneyClaims(value)
  if (claims.length === 0) return true
  return claims.every(c => c.currency === 'VND' && near(c.lo, pool) && near(c.hi, pool))
}

/**
 * Build the entity pool from the rows the turn retrieved. Reads only fields
 * the tools already emit: Google `price_range` {low, high, currency}, the
 * Serper band `price_range_text` verbatim, and money stated in a row's own
 * snippet/title (Booking/Agoda hotel rows). `price_level` (0–4) is a band with
 * no amount and yields nothing — a "$$" is never turned into VND here.
 */
export function planPriceEvidenceFromRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  snippetPricesByEntity?: ReadonlyMap<string, number[]>,
): Map<string, number[]> {
  const byEntity = new Map<string, number[]>()
  const add = (name: string, amounts: number[]) => {
    if (!name || amounts.length === 0) return
    const key = normName(name)
    byEntity.set(key, [...(byEntity.get(key) ?? []), ...amounts])
  }
  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name : ''
    if (!name) continue
    const amounts: number[] = []
    const range = row.price_range as { low?: number; high?: number; currency?: string } | undefined
    if (range && range.currency === 'VND') {
      if (typeof range.low === 'number') amounts.push(range.low)
      if (typeof range.high === 'number') amounts.push(range.high)
    }
    for (const k of ['price_range_text', 'snippet', 'title']) {
      if (typeof row[k] === 'string') {
        for (const c of extractMoneyClaims(row[k] as string)) {
          if (c.currency === 'VND') amounts.push(c.lo, c.hi)
        }
      }
    }
    add(name, amounts)
  }
  if (snippetPricesByEntity) {
    for (const [name, amounts] of snippetPricesByEntity) add(name, amounts)
  }
  return byEntity
}

type PlanItem = { name?: string; price?: string }
type Plan = {
  budget_total?: unknown
  days?: Array<{ items?: PlanItem[] }>
  cost_breakdown?: Record<string, unknown>
}

/**
 * Replace every model-invented numeric price inside the [TAPPY_PLAN] block.
 * Returns the text unchanged when there is no block, the JSON does not parse,
 * or nothing was unsupported. `redacted` counts replaced values.
 */
export function guardPlanPrices(
  fullText: string,
  evidence: PlanPriceEvidence,
  lang = 'vi',
): { text: string; redacted: number } {
  const open = '[TAPPY_PLAN]'
  const close = '[/TAPPY_PLAN]'
  const start = fullText.indexOf(open)
  const end = fullText.indexOf(close)
  if (start === -1 || end === -1 || end < start) return { text: fullText, redacted: 0 }

  let plan: Plan
  try {
    plan = JSON.parse(fullText.slice(start + open.length, end).trim()) as Plan
  } catch {
    return { text: fullText, redacted: 0 } // malformed — the client handles it, never corrupt it
  }
  if (!plan || typeof plan !== 'object') return { text: fullText, redacted: 0 }

  const sentinel = planNoPriceSentinel(lang)
  let redacted = 0
  /** Every amount some item in THIS plan may legitimately carry, plus the user's. */
  const planPool: number[] = [...evidence.userAmounts]

  for (const day of plan.days ?? []) {
    for (const item of day?.items ?? []) {
      if (!item || typeof item !== 'object') continue
      const own = amountsFor(item.name ?? '', evidence.byEntity)
      planPool.push(...own)
      if (typeof item.price !== 'string') continue
      if (!supported(item.price, [...own, ...evidence.userAmounts])) {
        item.price = sentinel
        redacted++
      }
    }
  }

  // The total is the user's number when they gave one; otherwise it is only
  // real when it is one of the retrieved amounts. A total the model summed from
  // invented item prices is invented too.
  if (typeof plan.budget_total === 'string' && !supported(plan.budget_total, planPool)) {
    plan.budget_total = sentinel
    redacted++
  }

  // Each line of the breakdown must trace to a user or retrieved amount. That
  // includes a "còn dư"/"remaining" line: nothing is recomputed here, so a
  // remainder survives only when it is itself a stated amount.
  if (plan.cost_breakdown && typeof plan.cost_breakdown === 'object' && !Array.isArray(plan.cost_breakdown)) {
    for (const key of Object.keys(plan.cost_breakdown)) {
      const value = plan.cost_breakdown[key]
      if (typeof value !== 'string') continue
      if (!supported(value, planPool)) {
        plan.cost_breakdown[key] = sentinel
        redacted++
      }
    }
  }

  if (redacted === 0) return { text: fullText, redacted: 0 }
  return {
    text: fullText.slice(0, start) + open + '\n' + JSON.stringify(plan) + '\n' + fullText.slice(end),
    redacted,
  }
}
