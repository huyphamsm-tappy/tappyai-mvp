// Replay harness — the owner's automated criteria (§9), per turn, from the reply text + turn annotation.
import { parseAsk } from '../../../../src/lib/structuredContent/parseAsk'
import { PLAN_HEADINGS } from '../../../../src/lib/ai/consultative/domainFrames'
import type { TurnAnnotation } from './stream'

export interface Check { id: string; pass: boolean; detail?: string; info?: boolean }

export type PlanArea = keyof typeof PLAN_HEADINGS

const PICK_COUNT = /Mình chọn\s*(?::|\*\*)/g
const NEVER = ['không có chức năng', 'chưa hỗ trợ tìm']
/** Bullet labels that are not alternatives. */
const NOT_ALT = /^(lưu ý|mẹo|giá|địa chỉ|giờ|giờ mở cửa|khoảng cách|đánh giá|chi phí|tổng|ghi chú|note|điện thoại|sđt|link|nguồn|ưu điểm|nhược điểm|lý do)\b/i

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
const cleanName = (s: string) => s.replace(/\*+/g, '').replace(/[\s—–\-:,.]+$/g, '').replace(/^[\s—–\-:]+/, '').trim()

/** The main pick's name, or null. Accepts `**Mình chọn: X**`, `**Mình chọn:** X —`, `Mình chọn **X**`. */
export function mainPickName(text: string): string | null {
  const a = text.match(/\*\*Mình chọn:\s*([^*\n]+?)\s*\*\*/)
  if (a && cleanName(a[1])) return cleanName(a[1])
  const b = text.match(/Mình chọn:?\s*\*\*([^*\n]+?)\*\*/)
  if (b && cleanName(b[1])) return cleanName(b[1])
  const c = text.match(/Mình chọn:?\*{0,2}\s*([^—–\n.,(]+)/)
  return c && cleanName(c[1]) ? cleanName(c[1]) : null
}

export const pickCount = (text: string) => (text.match(PICK_COUNT) ?? []).length

/** Alternative lines "- **Name**: …" / "- Name: …" (not the main pick, not "Lưu ý:"-style labels). */
export function alternativeNames(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (line.includes('Mình chọn')) continue
    const m = line.match(/^\s*(?:[-•]|\*(?!\*))\s+\*{0,2}([^*:\n]{2,80}?)\*{0,2}\s*:/)
    if (!m) continue
    const name = cleanName(m[1])
    if (!name || NOT_ALT.test(name)) continue
    out.push(name)
  }
  return out
}

export function askShape(text: string): { raw: number; valid: number; minOptions: number } {
  const m = text.match(/\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/)
  if (!m) return { raw: 0, valid: 0, minOptions: 0 }
  let raw = 0, minOptions = 0
  try {
    const qs = (JSON.parse(m[1]) as { questions?: Array<{ options?: unknown[] }> }).questions ?? []
    raw = qs.length
    minOptions = qs.length ? Math.min(...qs.map(q => (Array.isArray(q.options) ? q.options.length : 0))) : 0
  } catch { /* malformed → raw 0 */ }
  return { raw, valid: parseAsk(text).questions.length, minOptions }
}

const isHeadingLine = (line: string, area: PlanArea | null) => {
  const t = line.trim()
  if (!t) return false
  if (/^#{1,4}\s/.test(t)) return true
  if (/^\*\*[^*]+\*\*\s*:?\s*$/.test(t)) return true
  if (area && t.length < 60 && PLAN_HEADINGS[area].some(h => norm(t).replace(/[*#:]/g, '').trim() === norm(h))) return true
  return false
}

export function planShape(text: string, area: PlanArea | null) {
  const headings = area ? PLAN_HEADINGS[area] : []
  const missing = headings.filter(h => !norm(text).includes(norm(h)))
  const lines = text.split('\n')
  const tipsWord = area && !headings.some(h => h.includes('Mẹo')) ? 'Lưu ý' : 'Mẹo'
  let tips = 0
  const at = lines.findIndex(l => l.includes(tipsWord) && isHeadingLine(l, area))
  if (at >= 0) {
    for (let i = at + 1; i < lines.length; i++) {
      if (isHeadingLine(lines[i], area)) break
      if (lines[i].trim() && !lines[i].startsWith('[')) tips++
    }
  }
  return { missing, tipsWord, tipsHeadingFound: at >= 0, tips, arithmetic: /[×÷=]/.test(text) }
}

export interface TurnContext {
  expect: string | null
  area: string | null
  text: string
  turn: TurnAnnotation | null
  toolRows: number
  /** Names already shown (main picks + alternatives) earlier in this conversation. */
  shownBefore: string[]
  errors: string[]
}

const sameName = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }

export function evaluateTurn(c: TurnContext): { type: string; checks: Check[]; pass: boolean } {
  const type = c.expect ?? c.turn?.turnType ?? 'unknown'
  const checks: Check[] = []
  const serper = c.turn?.serperCalls ?? null
  const area = (c.area && c.area in PLAN_HEADINGS ? c.area : null) as PlanArea | null

  checks.push({ id: 'no_crash', pass: c.errors.length === 0 && c.text.trim().length > 0, detail: c.errors.length ? c.errors.join(' | ').slice(0, 300) : c.text.trim() ? undefined : 'empty reply' })
  checks.push({ id: 'annotation', pass: !!c.turn, detail: c.turn ? undefined : 'no tappy.turn.v1 annotation' })
  if (c.expect && c.turn) checks.push({ id: 'turn_type_matches', pass: c.turn.turnType === c.expect, detail: `server=${c.turn.turnType} expected=${c.expect}`, info: true })
  const lower = norm(c.text)
  const never = NEVER.filter(p => lower.includes(p))
  checks.push({ id: 'never_phrases', pass: never.length === 0, detail: never.length ? never.join(', ') : undefined })

  const pick = mainPickName(c.text)
  const alts = alternativeNames(c.text)
  if (type === 'ask') {
    const a = askShape(c.text)
    checks.push({ id: 'ask_block', pass: a.raw >= 2 && a.raw <= 3 && a.valid === a.raw && a.minOptions >= 2, detail: `questions=${a.raw} valid=${a.valid} minOptions=${a.minOptions}` })
    checks.push({ id: 'ask_no_serper', pass: serper === 0, detail: `serperCalls=${serper}` })
  } else if (type === 'pick' || type === 'more' || type === 'reject') {
    const n = pickCount(c.text)
    checks.push({ id: 'one_main_pick', pass: n === 1, detail: `picks=${n} name=${pick ?? '-'}` })
    checks.push({ id: 'alts_max_2', pass: alts.length <= 2, detail: `alts=${alts.length}${alts.length ? ` (${alts.join(' · ')})` : ''}` })
    const shown = (pick ? 1 : 0) + alts.length
    if (c.toolRows > shown) checks.push({ id: 'remaining_line', pass: /Mình còn\s+\d+\s+lựa chọn/i.test(c.text), detail: `toolRows=${c.toolRows} shown=${shown}` })
    else checks.push({ id: 'remaining_line', pass: true, detail: `n/a (toolRows=${c.toolRows} shown=${shown})`, info: true })
    const fu = c.text.match(/\[FOLLOWUPS\]([^\n]*?)(?:\[\/FOLLOWUPS\]|\n|$)/)
    checks.push({ id: 'server_buttons', pass: !!fu && fu[1].includes('Xem thêm') && fu[1].includes('Lên kế hoạch chi tiết'), detail: fu ? fu[1] : 'no [FOLLOWUPS]' })
    if (type === 'more') {
      checks.push({ id: 'more_serper', pass: true, info: true, detail: `serperCalls=${serper}` })
      if (pick) checks.push({ id: 'more_new_pick', pass: !c.shownBefore.some(s => sameName(s, pick)), info: true, detail: `pick=${pick}` })
    }
    if (type === 'reject') checks.push({ id: 'reject_not_repeated', pass: !!pick && !c.shownBefore.some(s => sameName(s, pick)), detail: `pick=${pick ?? '-'} shownBefore=${c.shownBefore.length}` })
  } else if (type === 'followup') {
    checks.push({ id: 'followup_no_serper', pass: serper === 0, detail: `serperCalls=${serper}` })
  } else if (type === 'compare') {
    checks.push({ id: 'compare_no_serper', pass: serper === 0, detail: `serperCalls=${serper}` })
    checks.push({ id: 'compare_chooses', pass: c.text.includes('Mình chọn'), detail: `pick=${pick ?? '-'}` })
  } else if (type === 'plan') {
    const p = planShape(c.text, area)
    checks.push({ id: 'plan_headings', pass: !!area && p.missing.length === 0, detail: area ? (p.missing.length ? `missing: ${p.missing.join(' · ')}` : 'all present') : `no plan frame for area ${c.area}` })
    checks.push({ id: 'plan_tips', pass: p.tips >= 2, detail: `${p.tipsWord} heading=${p.tipsHeadingFound} lines=${p.tips}` })
    checks.push({ id: 'plan_arithmetic', pass: p.arithmetic })
  }
  return { type, checks, pass: checks.every(k => k.pass || k.info) }
}

/** Names this reply showed (main pick + alternatives), for the next turns' reject/more checks. */
export const shownNames = (text: string) => [mainPickName(text), ...alternativeNames(text)].filter((s): s is string => !!s)
