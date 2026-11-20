// The plan's total is added up by CODE (owner 19/11: totals in the plan did not match its own lines: "5.35 million per person" over lines that add to 3.1).
// The model gives the cost lines as numbers (VND, low and high, one person or the whole group); this module sums them, writes the cost_breakdown rows and the total. The model's own
// text for the total is replaced, so the lines and the total can never disagree. Pure.
// The words come from the plain dictionary map, NOT from useTranslation: that module is a client one ('use client'), and the server build gives a server file a placeholder for its functions
// (final UAT 20/11: "translate is not a function" ended every plan answer with an error, while the unit tests, which do not have that boundary, passed).
import { vi as VI, en as EN } from '@/lib/i18n/presentation'
const translate = (loc: 'vi' | 'en', key: string, vars: Record<string, string>): string => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), (loc === 'en' ? EN : VI)[key] ?? VI[key] ?? key)

export interface CostLine { item: string; low: number; high?: number; per_person?: boolean; note?: string }
export interface PlanCostResult { cost_breakdown: Record<string, string>; budget_total: string; totalLow: number; totalHigh: number }

const MAX_VND = 100_000_000_000
const okNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < MAX_VND
const DONG = String.fromCharCode(0x111)

const money = (n: number, lang: string): string => (lang === 'en' ? `${Math.round(n).toLocaleString('en-US')} VND` : `${Math.round(n).toLocaleString('vi-VN')}${DONG}`)
const range = (lo: number, hi: number, lang: string): string => {
  if (Math.round(lo) === Math.round(hi)) return money(lo, lang)
  // the unit once, after the range ("1.200.000-1.500.000d")
  const m = (n: number) => Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')
  return lang === 'en' ? `${m(lo)}-${m(hi)} VND` : `${m(lo)}–${m(hi)}${DONG}`
}

/** Sums the lines. `people` is the number of travellers the per-person lines are multiplied by (1 when not stated). Null when no line has a usable amount. */
export function sumCosts(costs: readonly CostLine[] | undefined, people: number | undefined, lang = 'vi'): PlanCostResult | null {
  const n = people && people > 1 ? Math.floor(people) : 1
  const rows: Record<string, string> = {}
  let totalLow = 0, totalHigh = 0, used = 0
  for (const c of costs ?? []) {
    if (!c || typeof c.item !== 'string' || !c.item.trim() || !okNum(c.low)) continue
    const high = okNum(c.high) && c.high >= c.low ? c.high : c.low
    const k = c.per_person && n > 1 ? n : 1
    const lo = c.low * k, hi = high * k
    totalLow += lo; totalHigh += hi; used++
    const per = c.per_person && n > 1 ? ` (${range(c.low, high, lang)} × ${n})` : ''
    const note = typeof c.note === 'string' && c.note.trim() ? ` - ${c.note.trim().slice(0, 120)}` : ''
    let key = c.item.trim().slice(0, 80)
    while (key in rows) key += ' '
    rows[key] = `${range(lo, hi, lang)}${per}${note}`
  }
  if (used === 0) return null
  const loc = lang === 'en' ? 'en' : 'vi'
  const total = range(totalLow, totalHigh, lang)
  const perPerson = n > 1 ? ` (${translate(loc, 'plan.cost.perPerson', { amount: range(totalLow / n, totalHigh / n, lang) })})` : ''
  return { cost_breakdown: rows, budget_total: `${total}${perPerson}`, totalLow, totalHigh }
}
