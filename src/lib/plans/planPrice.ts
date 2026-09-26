import type { TappyPlan } from '@/components/TripPlanCard'

// ── A plan price is shown only when it IS a price ───────────────────────────
//
// The planning prompt tells the model to write the literal sentinel "chưa có giá" /
// "price not available" (`planNoPriceSentinel`, src/lib/ai/planPriceGuard.ts) for a step, a
// cost-breakdown line or the budget when the tools returned no price. That is the honest answer —
// but the plan card and the public brochure then painted the sentinel in the PRICE slot (a gold
// price chip, an "Estimated budget" row), so "no price" read as if it were one. Same class as
// F-052, where a price-SIGNAL marker was printed as a price on the place cards.
//
// This is the one projection every plan surface reads through (web: `parsePlan` for the chat
// card, the Planner and the share payload; `toPlanShareSnapshot` for the brochure, its mini
// preview and the OG card, including rows stored before this rule). Android applies the same
// rule in `PlanPrice.kt`.
//
// A value is kept when it states an amount — it has a digit ("150.000đ", "200k", "1,2 triệu")
// or says the thing is free ("Miễn phí", "Free", which is an amount: zero). Everything else is
// dropped, never rewritten: a missing price is shown as nothing, not as a word in a price chip.

const NO_PRICE = /chưa\s*có\s*giá|chưa\s*rõ\s*giá|không\s*rõ\s*giá|price\s*not\s*available|no\s*price|\bn\/a\b|\bunknown\b/i
// 🚨 No `\b` after "phí": JS word boundaries are ASCII-only, so `\b` after a Vietnamese vowel never
// matches. A Unicode letter lookahead does the same job for both languages.
const FREE = /^(?:miễn\s*phí|free)(?!\p{L})/iu

/** The value when it is an actual amount (or "free"); undefined otherwise. */
export function planAmount(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim()
  if (!v || NO_PRICE.test(v)) return undefined
  if (/\d/.test(v) || FREE.test(v)) return v
  return undefined
}

/** The same plan with every price-bearing field that is not an amount removed. Shape unchanged. */
export function projectPlanPrices(plan: TappyPlan): TappyPlan {
  const out: TappyPlan = { ...plan }
  const budget = planAmount(plan.budget_total)
  if (budget) out.budget_total = budget
  else delete out.budget_total
  if (plan.cost_breakdown && typeof plan.cost_breakdown === 'object') {
    const kept = Object.entries(plan.cost_breakdown).filter(([, v]) => planAmount(v) !== undefined)
    if (kept.length) out.cost_breakdown = Object.fromEntries(kept.map(([k, v]) => [k, (v as string).trim()]))
    else delete out.cost_breakdown
  }
  if (Array.isArray(plan.days)) {
    out.days = plan.days.map((d) => {
      if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return d
      return {
        ...d,
        items: d.items.map((it) => {
          if (!it || typeof it !== 'object') return it
          const price = planAmount(it.price)
          const copy = { ...it }
          if (price) copy.price = price
          else delete copy.price
          return copy
        }),
      }
    })
  }
  return out
}
