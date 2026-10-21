// ── CONSULTATIVE_IN_AGENT — the trip budget table for the whole party, computed by code (Round 20) ─────────────────────────────────
//
// The model supplies LINES in the plan JSON (`budget_lines`), not sums: each line is a unit price with the unit it applies to. Code
//   · keeps a unit price only when it traces to an amount some retrieved page / row stated (same rule as every other price guard);
//     a line whose amount is not in the evidence is shown as "chưa có dữ liệu" with no figure;
//   · multiplies by the right count for ITS unit (people, rooms × nights, legs, days) — so a per-person fare is never added to a
//     per-room price, and a one-way fare is never added as if it were the round trip;
//   · labels every line with exactly one of: "đã tra" (stated by a source this turn, with the date) · "ước tính có nguồn" (a retrieved
//     reference amount, not a confirmed booking price) · "chưa có dữ liệu";
//   · totals ONLY the first two labels, for the whole party and the whole trip, and says what the total leaves out.
// Nothing here fetches anything or loosens a price guard: an amount absent from the evidence never appears.

import { extractMoneyClaims } from './moneyGuard'

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

export type BudgetUnit = 'person' | 'person_leg' | 'person_day' | 'room_night' | 'group'
export type BudgetLabel = 'checked' | 'estimate' | 'none'

export interface BudgetLine {
  item?: unknown
  /** One unit's price in VND — a number, or a [low, high] pair. */
  unit_amount?: unknown
  /** What one unit is: per person · per person per leg (a fare) · per person per day · per room per night · for the whole party. */
  per?: unknown
  /** `person_leg` only: how many legs the trip pays for (1 = one way, 2 = return). */
  legs?: unknown
  /** `group` only: how many of that unit (default 1). */
  qty?: unknown
  /** "checked" (a source states it) or "estimate" (a retrieved reference amount). Anything else, or no evidence = none. */
  label?: unknown
  /** The source / reason, as the model names it ("Booking.com", "Vexere"). */
  basis?: unknown
}

export interface BudgetContext { people: number; days: number; rooms?: number; today: { day: number; month: number }; lang?: string }

export interface BudgetRow { item: string; label: BudgetLabel; how: string; lo: number | null; hi: number | null }
export interface BudgetResult { rows: BudgetRow[]; lo: number; hi: number; counted: number; left: string[] }

const near = (v: number, pool: readonly number[]) => pool.some(p => Math.abs(v - p) <= Math.max(p * 0.05, 1000))
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const range = (v: unknown): [number, number] | null => {
  const one = num(v)
  if (one !== null) return [one, one]
  if (Array.isArray(v) && v.length === 2) { const a = num(v[0]), b = num(v[1]); if (a !== null && b !== null) return [Math.min(a, b), Math.max(a, b)] }
  return null
}
const money = (lo: number, hi: number) => (lo === hi ? vnd(lo) : `${vnd(lo)}–${vnd(hi)}`)

/** One line → its total for the whole party and trip, with the arithmetic written out; null when the unit is unusable. */
export function lineTotal(l: BudgetLine, c: BudgetContext): { lo: number; hi: number; how: string } | null {
  const r = range(l.unit_amount)
  if (!r) return null
  const nights = Math.max(1, c.days - 1)
  const rooms = c.rooms ?? Math.max(1, Math.ceil(c.people / 2))
  const [a, b] = r
  switch (l.per) {
    case 'person': return { lo: a * c.people, hi: b * c.people, how: `${money(a, b)}/người × ${c.people} người` }
    case 'person_leg': {
      const legs = num(l.legs)
      if (legs === null || legs > 4) return null // a fare without its leg count cannot be summed
      return { lo: a * c.people * legs, hi: b * c.people * legs, how: `${money(a, b)}/người/${legs === 1 ? 'một chiều' : 'chiều'} × ${c.people} người × ${legs} chiều` }
    }
    case 'person_day': return { lo: a * c.people * c.days, hi: b * c.people * c.days, how: `${money(a, b)}/người/ngày × ${c.people} người × ${c.days} ngày` }
    case 'room_night': return { lo: a * rooms * nights, hi: b * rooms * nights, how: `${money(a, b)}/phòng/đêm × ${rooms} phòng × ${nights} đêm` }
    case 'group': { const q = num(l.qty) ?? 1; return { lo: a * q, hi: b * q, how: `${money(a, b)}${q > 1 ? ` × ${q}` : ''} cho cả nhóm` } }
    default: return null
  }
}

export function computeBudget(lines: readonly BudgetLine[], pool: readonly number[], c: BudgetContext): BudgetResult {
  const rows: BudgetRow[] = []
  const stamp = `${c.today.day}/${c.today.month}`
  for (const l of lines) {
    const item = typeof l.item === 'string' ? l.item.trim().slice(0, 80) : ''
    if (!item) continue
    const basis = typeof l.basis === 'string' ? l.basis.trim().slice(0, 60) : ''
    const claimed: BudgetLabel = l.label === 'checked' ? 'checked' : l.label === 'estimate' ? 'estimate' : 'none'
    const r = range(l.unit_amount)
    const t = lineTotal(l, c)
    // the amount must be one a source stated; otherwise the figure is dropped and the line says there is no data
    const sourced = !!r && !!t && claimed !== 'none' && near(r[0], pool) && near(r[1], pool)
    if (!sourced || !t) { rows.push({ item, label: 'none', how: 'chưa có dữ liệu', lo: null, hi: null }); continue }
    const how = `${t.how}${basis ? ` — ${basis}` : ''}${claimed === 'checked' ? `, tra ${stamp}` : ' (mức tham khảo, không phải giá đặt chỗ)'}`
    rows.push({ item, label: claimed, how, lo: t.lo, hi: t.hi })
  }
  const counted = rows.filter(x => x.lo !== null)
  return {
    rows,
    lo: counted.reduce((s, x) => s + (x.lo as number), 0),
    hi: counted.reduce((s, x) => s + (x.hi as number), 0),
    counted: counted.length,
    left: rows.filter(x => x.lo === null).map(x => x.item),
  }
}

const LABEL_VI: Record<BudgetLabel, string> = { checked: 'đã tra', estimate: 'ước tính có nguồn', none: 'chưa có dữ liệu' }

/** The budget block as plain lines (the chat renders bullets everywhere). */
export function renderBudget(res: BudgetResult, c: BudgetContext): string {
  const head = `💰 Ngân sách cho ${c.people} người, cả chuyến ${c.days} ngày:`
  const lines = res.rows.map(x => (x.lo === null
    ? `- ${x.item}: ${LABEL_VI.none}`
    : `- ${x.item}: ${money(x.lo, x.hi as number)} = ${x.how} [${LABEL_VI[x.label]}]`))
  const total = res.counted === 0
    ? '- Tổng: chưa tính được vì chưa khoản nào có nguồn.'
    : `- Tổng (chỉ cộng khoản đã tra và ước tính có nguồn): ${money(res.lo, res.hi)}${res.left.length ? `; chưa gồm các khoản chưa có dữ liệu: ${res.left.join(', ')}` : ''}.`
  return [head, ...lines, total].join('\n')
}

/**
 * Reads `budget_lines` from the [TAPPY_PLAN] block, removes it from the JSON, and puts the computed budget right after the block.
 * No block / unparseable / no lines → unchanged.
 */
export function appendPlanBudget(fullText: string, pool: readonly number[], today: { day: number; month: number }, lang = 'vi'): { text: string; added: boolean } {
  const none = { text: fullText, added: false }
  const start = fullText.indexOf(OPEN)
  const end = fullText.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return none
  let plan: { people?: unknown; days?: unknown; budget_lines?: unknown } & Record<string, unknown>
  try { plan = JSON.parse(fullText.slice(start + OPEN.length, end).trim()) } catch { return none }
  if (!plan || !Array.isArray(plan.budget_lines) || plan.budget_lines.length === 0) {
    if (plan && 'budget_lines' in plan) { delete plan.budget_lines; return { text: fullText.slice(0, start) + OPEN + '\n' + JSON.stringify(plan) + '\n' + fullText.slice(end), added: false } }
    return none
  }
  const people = typeof plan.people === 'number' && plan.people >= 1 && plan.people <= 60 ? Math.floor(plan.people) : 2
  const days = Array.isArray(plan.days) && plan.days.length >= 1 ? plan.days.length : 1
  const ctx: BudgetContext = { people, days, today, lang }
  const res = computeBudget(plan.budget_lines as BudgetLine[], pool, ctx)
  delete plan.budget_lines
  const head = fullText.slice(0, start) + OPEN + '\n' + JSON.stringify(plan) + '\n' + CLOSE
  return { text: `${head}\n\n${renderBudget(res, ctx)}${fullText.slice(end + CLOSE.length)}`, added: true }
}

/** Every VND amount a text states (for building the evidence pool from retrieved pages and snippets). */
export function vndAmountsIn(text: string): number[] {
  return extractMoneyClaims(text).filter(c => c.currency === 'VND').flatMap(c => [c.lo, c.hi])
}
