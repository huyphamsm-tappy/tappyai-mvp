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

/** A VND amount or range, as the plan states it. */
type Amount = { lo: number; hi: number }

/**
 * The model's own DERIVED lines — a total, a remainder, a reserve — recognised by
 * their key. They are never trusted: measured 2026-09-15 on the UAT probe, the
 * model wrote "Tổng ước tính: 3.000.000 VND" under two items with no price at
 * all, and the number was the user's budget. Whatever survives here is computed
 * below from the item amounts the evidence actually supports.
 */
const DERIVED_KEY_RE = /\btong\b|\btotal\b|\bcon lai\b|\bcon du\b|\bremaining\b|\bleft\b|\bdu phong\b|\breserve\b|\buoc tinh\b|\bestimate/

/** Server-derived line labels, per response language — the only lines this guard writes. */
function derivedLabels(lang: string): { total: string; remaining: string } {
  return lang === 'vi'
    ? { total: 'Tổng chi phí dự kiến', remaining: 'Còn lại' }
    : { total: 'Estimated total cost', remaining: 'Remaining' }
}

function formatAmount(a: Amount, lang: string): string {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US'
  const one = (n: number) => `${Math.round(n).toLocaleString(locale)} VND`
  return a.lo === a.hi ? one(a.lo) : `${Math.round(a.lo).toLocaleString(locale)} – ${one(a.hi)}`
}

/** The amount a supported price string states: every claim in it, summed, ranges kept as ranges. */
function amountOf(value: string): Amount | null {
  const claims = extractMoneyClaims(value).filter(c => c.currency === 'VND')
  if (claims.length === 0) return null
  return { lo: claims.reduce((s, c) => s + c.lo, 0), hi: claims.reduce((s, c) => s + c.hi, 0) }
}

/**
 * Replace every model-invented numeric price inside the [TAPPY_PLAN] block and
 * derive the total the evidence supports.
 *
 *   budget_total          the user's envelope — kept when it is the user's number
 *                         (or a retrieved amount); never a cost.
 *   items[].price         kept only when it traces to THAT place's retrieved
 *                         amounts; otherwise the sentinel.
 *   cost_breakdown        item lines kept only on retrieved amounts — the user's
 *                         budget legitimises nothing here; model-written derived
 *                         lines (total / remaining / reserve) are removed and,
 *                         when EVERY item carries a supported amount, replaced by
 *                         the server's own sum and `budget − sum`. One item without
 *                         a price ⇒ no total, no remainder: a partial sum is not a
 *                         total.
 *
 * Returns the text unchanged when there is no block, the JSON does not parse,
 * or nothing changed. `redacted` counts replaced and removed values.
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
  let changed = false
  /** Every retrieved amount some item in THIS plan may legitimately carry. */
  const entityPool: number[] = []
  /** Per item: the supported amount, or null when the item has no supported price. */
  const itemAmounts: Array<Amount | null> = []

  for (const day of plan.days ?? []) {
    for (const item of day?.items ?? []) {
      if (!item || typeof item !== 'object') continue
      const own = amountsFor(item.name ?? '', evidence.byEntity)
      entityPool.push(...own)
      if (typeof item.price !== 'string') { itemAmounts.push(null); continue }
      // The user's number is allowed on an item too (they may have priced a step
      // themselves), but it does not make the item's amount a retrieved cost.
      if (supported(item.price, [...own, ...evidence.userAmounts])) {
        itemAmounts.push(supported(item.price, own) ? amountOf(item.price) : null)
      } else {
        item.price = sentinel
        itemAmounts.push(null)
        redacted++
        changed = true
      }
    }
  }

  // The total is the user's number when they gave one; otherwise it is only
  // real when it is one of the retrieved amounts. A total the model summed from
  // invented item prices is invented too.
  if (typeof plan.budget_total === 'string' && !supported(plan.budget_total, [...entityPool, ...evidence.userAmounts])) {
    plan.budget_total = sentinel
    redacted++
    changed = true
  }

  // Breakdown lines: retrieved amounts only — the budget is not a cost. Derived
  // lines go regardless of their value; the server writes its own below.
  if (plan.cost_breakdown && typeof plan.cost_breakdown === 'object' && !Array.isArray(plan.cost_breakdown)) {
    for (const key of Object.keys(plan.cost_breakdown)) {
      if (DERIVED_KEY_RE.test(normalizeVN(key.toLowerCase()))) {
        delete plan.cost_breakdown[key]
        redacted++
        changed = true
        continue
      }
      const value = plan.cost_breakdown[key]
      if (typeof value !== 'string') continue
      if (!supported(value, entityPool)) {
        plan.cost_breakdown[key] = sentinel
        redacted++
        changed = true
      }
    }
  }

  // Server arithmetic — only when every item has a supported amount.
  if (itemAmounts.length > 0 && itemAmounts.every(a => a !== null)) {
    const total = (itemAmounts as Amount[]).reduce((s, a) => ({ lo: s.lo + a.lo, hi: s.hi + a.hi }), { lo: 0, hi: 0 })
    const labels = derivedLabels(lang)
    const breakdown: Record<string, unknown> =
      plan.cost_breakdown && typeof plan.cost_breakdown === 'object' && !Array.isArray(plan.cost_breakdown) ? plan.cost_breakdown : {}
    breakdown[labels.total] = formatAmount(total, lang)
    // The remainder is `budget − total`, and only when the whole range fits: an
    // over-budget plan gets no remainder line rather than a negative one.
    const budget = evidence.userAmounts.length > 0 ? Math.max(...evidence.userAmounts) : null
    if (budget !== null && total.hi <= budget) {
      breakdown[labels.remaining] = formatAmount({ lo: budget - total.hi, hi: budget - total.lo }, lang)
    }
    plan.cost_breakdown = breakdown
    changed = true
  }

  if (!changed) return { text: fullText, redacted: 0 }
  return {
    text: fullText.slice(0, start) + open + '\n' + JSON.stringify(plan) + '\n' + fullText.slice(end),
    redacted,
  }
}
