// ── TRIP BUDGET — an ESTIMATED RANGE by category, labelled as such (owner 02/10, A4) ─────────────────────────────
//
// "Where is the budget?" A trip plan came back with "chưa có giá" on every line. When nothing in the tool data prices a
// category, code writes a generic mid-range ESTIMATE for it (stay, food, local transport, tickets) from the plan's own
// people / nights / days — never from the model — and labels it "ước tính tham khảo": a rule of thumb, not a quote.
// The model's sourced amounts survive (planPriceGuard keeps only retrieved ones); only placeholder lines are replaced.
// Intercity fares are NOT estimated: they depend on the date and are one tap away on the fare buttons.

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

/** Generic domestic mid-range (3-star room, local eateries, ride-hail / scooter rental, paid sights), VND. */
export const TRIP_RATES = {
  stayPerRoomNight: [500_000, 1_200_000],
  foodPerPersonDay: [200_000, 450_000],
  transportPerPersonDay: [100_000, 250_000],
  ticketsPerPersonDay: [100_000, 300_000],
} as const

export interface TripBudgetRow { key: 'stay' | 'food' | 'transport' | 'tickets'; lo: number; hi: number; formula: string }

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`
const range = (lo: number, hi: number) => `${vnd(lo)}–${vnd(hi)}`

export function tripBudgetRows(people: number, days: number, lang = 'vi'): { rows: TripBudgetRow[]; total: [number, number] } {
  const p = Math.min(Math.max(Math.floor(people) || 1, 1), 20)
  const d = Math.min(Math.max(Math.floor(days) || 1, 1), 30)
  const nights = Math.max(d - 1, 1)
  const rooms = Math.ceil(p / 2)
  const en = lang === 'en'
  const [sl, sh] = TRIP_RATES.stayPerRoomNight, [fl, fh] = TRIP_RATES.foodPerPersonDay, [tl, th] = TRIP_RATES.transportPerPersonDay, [kl, kh] = TRIP_RATES.ticketsPerPersonDay
  const rows: TripBudgetRow[] = [
    { key: 'stay', lo: rooms * nights * sl, hi: rooms * nights * sh, formula: en ? `${rooms} room × ${nights} night × ${range(sl, sh)}` : `${rooms} phòng × ${nights} đêm × ${range(sl, sh)}` },
    { key: 'food', lo: p * d * fl, hi: p * d * fh, formula: en ? `${p} × ${d} days × ${range(fl, fh)}` : `${p} người × ${d} ngày × ${range(fl, fh)}` },
    { key: 'transport', lo: p * d * tl, hi: p * d * th, formula: en ? `${p} × ${d} days × ${range(tl, th)}` : `${p} người × ${d} ngày × ${range(tl, th)}` },
    { key: 'tickets', lo: p * d * kl, hi: p * d * kh, formula: en ? `${p} × ${d} days × ${range(kl, kh)}` : `${p} người × ${d} ngày × ${range(kl, kh)}` },
  ]
  return { rows, total: [rows.reduce((s, r) => s + r.lo, 0), rows.reduce((s, r) => s + r.hi, 0)] }
}

const LABEL_VI = { stay: 'Lưu trú', food: 'Ăn uống', transport: 'Đi lại tại chỗ', tickets: 'Vé tham quan' }
const LABEL_EN = { stay: 'Stay', food: 'Food', transport: 'Getting around', tickets: 'Sight tickets' }
const TAG_VI = 'ước tính tham khảo'
const TAG_EN = 'rough estimate'

/** A line that only says a price is missing. */
const PLACEHOLDER = /(?:chưa (?:có|thể|tính)|không (?:có|tính)|price not available|cannot be (?:estimated|calculated))/i

function planBlock(text: string): { start: number; end: number; plan: Record<string, unknown> } | null {
  const start = text.indexOf(OPEN), end = text.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return null
  try {
    const plan = JSON.parse(text.slice(start + OPEN.length, end).trim()) as Record<string, unknown>
    return plan && typeof plan === 'object' ? { start, end, plan } : null
  } catch { return null }
}

const peopleOf = (v: unknown): number | null => {
  const n = Array.isArray(v) ? Number(v[0]) : typeof v === 'string' ? Number(v.match(/\d+/)?.[0]) : Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : null
}

/**
 * Adds the estimate to a TRIP plan: `cost_breakdown` rows (a placeholder or missing value is replaced; a sourced amount
 * is kept), `budget_total` when it is a placeholder, and the lines under the "Ngân sách" heading (placeholder lines
 * replaced). Returns the text unchanged for anything that is not a trip plan with a day list.
 */
export function applyTripBudgetEstimate(text: string, o: { lang?: string; fallbackPeople?: number | null } = {}): { text: string; added: boolean } {
  const none = { text, added: false }
  const blk = planBlock(text)
  if (!blk || blk.plan.type !== 'trip' || !Array.isArray(blk.plan.days) || blk.plan.days.length === 0) return none
  const lang = o.lang === 'en' ? 'en' : 'vi'
  const people = peopleOf(blk.plan.people) ?? o.fallbackPeople ?? 2
  const days = blk.plan.days.length
  const { rows, total } = tripBudgetRows(people, days, lang)
  const label = lang === 'en' ? LABEL_EN : LABEL_VI
  const tag = lang === 'en' ? TAG_EN : TAG_VI
  const noFare = lang === 'en' ? 'excl. travel to/from the destination' : 'chưa gồm vé đi/về'

  // 1. the plan card's numbers
  const cb = (blk.plan.cost_breakdown && typeof blk.plan.cost_breakdown === 'object' && !Array.isArray(blk.plan.cost_breakdown) ? blk.plan.cost_breakdown : {}) as Record<string, unknown>
  const costBreakdown: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(cb)) if (typeof v === 'string' && /\d/.test(v) && !PLACEHOLDER.test(v)) costBreakdown[k] = v
  for (const r of rows) costBreakdown[label[r.key]] = `${range(r.lo, r.hi)} (${tag})`
  blk.plan.cost_breakdown = costBreakdown
  const bt = blk.plan.budget_total
  if (typeof bt !== 'string' || !/\d/.test(bt) || PLACEHOLDER.test(bt)) blk.plan.budget_total = `${range(total[0], total[1])} (${tag}, ${noFare})`
  const withPlan = text.slice(0, blk.start) + OPEN + '\n' + JSON.stringify(blk.plan) + '\n' + text.slice(blk.end)

  // 2. the text: APPEND-ONLY. The model's lines were already streamed to the client (progressive release), so nothing
  // before the closing marker blocks is rewritten — rewriting a released "Ngân sách" section desynchronised the
  // client's copy (measured in the web UI 02/10: characters of the budget rows went missing). The model is told to
  // leave the budget section to the system; whatever it wrote stays as it is.
  const lines = withPlan.split('\n')
  const block = [
    lang === 'en' ? '**Estimated budget (rough estimate)**' : '**Ước tính ngân sách (ước tính tham khảo)**',
    ...rows.map(r => `- ${label[r.key]}: ${range(r.lo, r.hi)}`),
    lang === 'en' ? '- How: people × days × a per-person-per-day range; stay = rooms × nights × a room range.' : '- Cách tính: số người × số ngày × mức/người/ngày; lưu trú = số phòng × số đêm × giá phòng.',
    `- ${lang === 'en' ? 'Total' : 'Tổng'}: ${range(total[0], total[1])} (${tag}, ${noFare}). ${lang === 'en' ? 'Mid-range rule of thumb for Vietnam, not a quoted price — check real prices before booking.' : 'Mức phổ biến tầm trung, không phải giá tra cứu — kiểm tra giá thật trước khi đặt.'}`,
    '',
  ]
  const m = lines.findIndex(l => /^\s*\[(?:FOLLOWUPS|CTA_BUTTONS)\]/.test(l))
  const cut = m < 0 ? lines.length : m
  return { text: [...lines.slice(0, cut), ...(cut > 0 && lines[cut - 1].trim() ? [''] : []), ...block, ...lines.slice(cut)].join('\n').replace(/\n{3,}/g, '\n\n'), added: true }
}

/**
 * A trip plan's own "Ngân sách" section (heading to the next heading / marker) is dropped when it carries no sourced
 * amount — it only says "chưa có giá"; the estimate appended by `applyTripBudgetEstimate` replaces it. A section with a
 * sourced figure (a digit outside a placeholder line) is kept.
 */
export function dropEmptyModelBudget(text: string): string {
  if (!/"type"\s*:\s*"trip"/.test(text)) return text
  const lines = text.split('\n')
  const hd = (l: string) => /^\s*(?:#{1,4}\s+\S|\*\*[^*\n]{2,60}\*\*\s*:?\s*$)/.test(l)
  const at = lines.findIndex(l => hd(l) && /^(?:ngân sách|budget)$/i.test(l.trim().replace(/^#{1,4}\s*/, '').replace(/\*+/g, '').replace(/[:：]\s*$/, '').trim()))
  if (at < 0) return text
  let end = at + 1
  while (end < lines.length && !hd(lines[end]) && !/^\s*\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_)/.test(lines[end])) end++
  const body = lines.slice(at + 1, end).filter(l => l.trim())
  if (body.some(l => /\d/.test(l) && !PLACEHOLDER.test(l))) return text
  return [...lines.slice(0, at), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n')
}
