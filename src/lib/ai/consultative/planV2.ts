// CONSULT_PLAN_V2 (14/11/2026, default OFF): what a plan owes the person, as TYPED required fields of present_plan instead of advice the model may skip.
//
// Owner UAT: "a plan with no cost and no way to book is a challenge to the person", and "an AI agent that helps a person decide asks the last question when it does not know the budget; a plan alone is
// faster to get from a search engine". Measured: the plan tool's own text said to give a budget "only when the person gave one or the tools gave prices", so every present_plan call carried title + days +
// tips only. Now the plan states WHO it is for (traveler), every cost line a traveller needs, each marked found or estimate (costs), the total for the whole party (budget_total) and what it took for granted
// (assumptions). The server folds them into the fields the product already reads (cost_breakdown, budget_total), so the money guards, the budget tab and the shared brochure see them. This is STRUCTURE
// (a typed contract the model must fill); no persuasion text is added to any prompt (14/11 evidence: the model writes well when it has the inputs).
import { z } from 'zod'

/** The fields added to present_plan, all required: a plan cannot be sent without them. */
export const planV2Shape = {
  traveler: z.object({
    party: z.string().describe('who is going, e.g. "2 adults and a 5-year-old"'),
    pace: z.string().describe('the pace and mood this plan is built for, in a few words'),
    interests: z.array(z.string()).optional().describe('2-5 things this person enjoys, as far as you can tell'),
  }),
  costs: z.array(z.object({
    item: z.string().describe('what the line is for, with its key detail, e.g. "2 nights, double room near the beach"'),
    amount: z.string().describe('the amount or range with its currency'),
    basis: z.enum(['found', 'estimate']).describe('found = from this turn\'s tool results; estimate = a typical figure you reliably know'),
  })).min(1).max(12),
  budget_total: z.string().describe('the total for the whole party, and what it leaves out (e.g. flights)'),
  // 18/11 (UAT case 20): a call that left this list out was refused by the schema and the WHOLE turn died with no text. The list is what the model may leave empty, so a missing or long one is
  // accepted (the fold keeps four): a refused argument costs the person the whole answer, an empty list costs nothing.
  assumptions: z.array(z.string()).default([]).describe('what you took for granted because the person did not say, at most 4 (empty when nothing)'),
}

const MARKER = /\[\/?(?:TAPPY_|CTA_|FOLLOWUPS)/i
const clean = (x: unknown, max: number): string => {
  if (typeof x !== 'string') return ''
  const t = x.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return MARKER.test(t) ? '' : t.slice(0, max)
}

/**
 * The present_plan arguments of a V2 plan as the plan the rest of the product reads: `costs` become `cost_breakdown` (an estimate says so in its value; the money guards judge it like any model figure),
 * the traveler and the assumptions ride on the plan, nothing else changes. Pure; the arguments are not changed.
 */
export function foldPlanV2<T extends { costs?: unknown; traveler?: unknown; assumptions?: unknown }>(args: T): Omit<T, 'costs' | 'assumptions'> & { cost_breakdown?: Record<string, string>; assumptions?: string[] } {
  const { costs, assumptions, ...rest } = args as Record<string, unknown>
  const cost_breakdown: Record<string, string> = {}
  for (const c of Array.isArray(costs) ? costs : []) {
    const r = c as { item?: unknown; amount?: unknown; basis?: unknown }
    const item = clean(r?.item, 120)
    const amount = clean(r?.amount, 80)
    if (!item || !amount) continue
    let key = item
    for (let n = 2; key in cost_breakdown; n++) key = `${item} (${n})`
    cost_breakdown[key] = r.basis === 'estimate' ? `${amount} (ước tính)` : amount
  }
  const t = (rest.traveler ?? {}) as { party?: unknown; pace?: unknown; interests?: unknown }
  const party = clean(t.party, 80)
  const pace = clean(t.pace, 80)
  const interests = (Array.isArray(t.interests) ? t.interests : []).map(i => clean(i, 40)).filter(Boolean).slice(0, 5)
  const out: Record<string, unknown> = { ...rest }
  delete out.traveler
  if (party || pace) out.traveler = { ...(party ? { party } : {}), ...(pace ? { pace } : {}), ...(interests.length ? { interests } : {}) }
  if (Object.keys(cost_breakdown).length) out.cost_breakdown = cost_breakdown
  const asm = (Array.isArray(assumptions) ? assumptions : []).map(a => clean(a, 100)).filter(Boolean).slice(0, 4)
  if (asm.length) out.assumptions = asm
  return out as ReturnType<typeof foldPlanV2<T>>
}
