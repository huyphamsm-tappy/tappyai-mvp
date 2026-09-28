// ── "Chi tiêu thì trưng phép tính" (owner-approved principle 7, 2026-09-29) ─────────────────────
//
// A plan the user gave a total budget for shows the split as ARITHMETIC, written by code — the
// model's own maths was measured wrong (c40 S5b "100 ml gấp đôi 7,5 ml"; T1/F8/E6 gave no split at
// all). Only numbers the user stated and the plan's own people / day count are used; nothing is
// estimated. The line goes right after the [TAPPY_PLAN] block, before any marker block.

import { extractPlanTotalBudget } from './budget'

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`

/** Rounds a per-head share to the nearest 1.000đ so the line reads like money, not a division. */
const share = (n: number) => Math.round(n / 1000) * 1000

export function appendPlanBudgetMath(fullText: string, userTexts: readonly string[], lang = 'vi'): { text: string; added: boolean } {
  const none = { text: fullText, added: false }
  const start = fullText.indexOf(OPEN)
  const end = fullText.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return none
  let plan: { type?: unknown; people?: unknown; days?: unknown }
  try { plan = JSON.parse(fullText.slice(start + OPEN.length, end).trim()) } catch { return none }
  // The user's own total — the nearest statement wins, as in the planning context.
  const total = userTexts.slice().reverse().map(t => extractPlanTotalBudget(t)).find(v => v !== null && v > 0) ?? null
  if (!total) return none
  const people = typeof plan.people === 'number' && plan.people >= 1 && plan.people <= 60 ? Math.floor(plan.people) : null
  const days = plan.type === 'trip' && Array.isArray(plan.days) && plan.days.length >= 1 ? plan.days.length : null
  if (!people && !days) return none
  const parts: string[] = []
  if (lang === 'en') {
    if (people) parts.push(`${vnd(total)} ÷ ${people} ${people === 1 ? 'person' : 'people'} = ${vnd(share(total / people))}/person`)
    if (people && days) parts.push(`÷ ${days} days = ${vnd(share(total / people / days))}/person/day`)
    else if (days) parts.push(`${vnd(total)} ÷ ${days} days = ${vnd(share(total / days))}/day`)
  } else {
    if (people) parts.push(`${vnd(total)} ÷ ${people} người = ${vnd(share(total / people))}/người`)
    if (people && days) parts.push(`÷ ${days} ngày = ${vnd(share(total / people / days))}/người/ngày`)
    else if (days) parts.push(`${vnd(total)} ÷ ${days} ngày = ${vnd(share(total / days))}/ngày`)
  }
  const line = `💰 ${lang === 'en' ? 'Budget' : 'Ngân sách'}: ${parts.join(' · ')}`
  if (fullText.includes(line)) return none
  const after = end + CLOSE.length
  return { text: `${fullText.slice(0, after)}\n\n${line}${fullText.slice(after)}`, added: true }
}
