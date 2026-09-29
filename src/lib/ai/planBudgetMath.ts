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

// ── Consult V2 plan: the cost section's arithmetic, written by code (owner §5 "show the arithmetic") ─────
//
// Replay 2026-09-29: the model's "Chi phí" section came out EMPTY on most place plans — every price it wrote
// was unsupported and the guards removed it. The line below uses only (a) the chosen venue's price band from
// the search rows, or (b) the user's OWN per-person budget, labelled as their budget (F-086: a user number is
// never presented as the venue's cost). No band and no per-person budget → nothing is added.

const COST_HEADINGS = ['chi phí', 'tổng chi phí', 'ngân sách']
const headingText = (l: string) => l.trim().replace(/^#{1,4}\s*/, '').replace(/\*+/g, '').replace(/[:：]\s*$/, '').trim().toLowerCase()
const isHeadingLine = (l: string) => /^\s*(?:#{1,4}\s+\S|\*\*[^*\n]{2,60}\*\*\s*:?\s*$)/.test(l)

/** "2 người", "6" → 2 / 6; anything else → null. */
export function partyCount(s: string | null | undefined): number | null {
  const n = Number((s ?? '').match(/\d{1,2}/)?.[0])
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null
}

/** The user's per-person amount ("300k/người", "200k một người"), or null. */
export function perPersonBudget(userTexts: readonly string[]): number | null {
  for (const t of [...userTexts].reverse()) {
    const m = t.toLowerCase().match(/(\d[\d.,]*)\s*(k|nghìn|ngàn|tr|triệu)?\s*(?:\/|một|mỗi|1)\s*(?:người|ng)\b/)
    if (!m) continue
    const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
    const unit = m[2] ?? (n < 10_000 ? 'k' : '')
    const v = unit === 'k' || unit === 'nghìn' || unit === 'ngàn' ? n * 1000 : unit === 'tr' || unit === 'triệu' ? n * 1_000_000 : n
    if (v >= 10_000) return v
  }
  return null
}

/** The head count the reply itself assumed ("Mình giả định: 2 người, …") — used when the user gave none. */
export function assumedPeople(text: string): number | null {
  const line = /Mình giả định[^\n]*/.exec(text)?.[0] ?? ''
  return partyCount(/(\d{1,2})\s*người/.exec(line)?.[1] ?? null)
}

export function appendConsultPlanCost(text: string, o: {
  people: number | null; band: { lo: number; hi: number } | null; perHead: number | null; lang?: string
  /** Shopping: the chosen product's listed price (from the pick's evidence) — "1 × giá = tổng". */
  unitPrice?: { amount: number; seller?: string | null } | null
  /** The chosen venue, named on its cost line. */
  pickName?: string | null
}): { text: string; added: boolean } {
  const none = { text, added: false }
  const lines = text.split('\n')
  if (o.unitPrice && o.unitPrice.amount > 0) {
    const at = lines.findIndex(l => isHeadingLine(l) && COST_HEADINGS.includes(headingText(l)))
    if (at < 0) return none
    let end = at + 1
    while (end < lines.length && !isHeadingLine(lines[end]) && !/^\s*\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_)/.test(lines[end])) end++
    if (/[×÷=]/.test(lines.slice(at + 1, end).join('\n'))) return none
    const line = `- 1 × ${vnd(o.unitPrice.amount)} = ${vnd(o.unitPrice.amount)}${o.unitPrice.seller ? ` (giá tại ${o.unitPrice.seller} lúc tìm)` : ' (giá lúc tìm)'}, chưa gồm phí giao — kiểm lại giá trên trang bán trước khi trả tiền.`
    return { text: [...lines.slice(0, at + 1), line, ...lines.slice(at + 1)].join('\n'), added: true }
  }
  if (!o.people) o = { ...o, people: assumedPeople(text) }
  const at = lines.findIndex(l => isHeadingLine(l) && COST_HEADINGS.includes(headingText(l)))
  if (at < 0) return none
  let end = at + 1
  while (end < lines.length && !isHeadingLine(lines[end]) && !/^\s*\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_)/.test(lines[end])) end++
  const section = lines.slice(at + 1, end).join('\n')
  if (/[×÷=]/.test(section) || /chưa có giá\s*[—-]\s*hỏi/i.test(section)) return none
  const p = o.people
  const bandOk = !!o.band && o.band.lo > 0 && Number.isFinite(o.band.hi)
  let block: string[] | null = null
  if (p && bandOk && o.band) {
    // Owner 29/09: real price bands only; the total adds only what has a price, and says so.
    block = [o.band.hi > o.band.lo
      ? `- ${o.pickName ? `${o.pickName}: ` : ''}${p} người × ${vnd(o.band.lo)}–${vnd(o.band.hi)}/người = ${vnd(p * o.band.lo)}–${vnd(p * o.band.hi)} (mức giá Google Maps)`
      : `- ${o.pickName ? `${o.pickName}: ` : ''}${p} người × ${vnd(o.band.lo)}/người = ${vnd(p * o.band.lo)} (mức giá Google Maps)`,
      '- Tổng: chỉ cộng phần có giá ở trên; các khoản khác (gửi xe, đồ uống thêm…) chưa có giá — hỏi quán.']
  } else if (p && o.perHead) {
    block = [`- ${o.pickName ? `${o.pickName}: ` : ''}chưa có giá — hỏi quán.`,
      `- Ngân sách bạn đưa: ${p} người × ${vnd(o.perHead)} = ${vnd(p * o.perHead)} (đây là ngân sách, không phải giá của quán).`]
  } else {
    block = [`- ${o.pickName ? `${o.pickName}: ` : ''}chưa có giá — hỏi quán.`, '- Tổng: chưa tính được vì chưa có giá có nguồn.']
  }
  return { text: [...lines.slice(0, at + 1), ...block, ...lines.slice(at + 1)].join('\n'), added: true }
}
