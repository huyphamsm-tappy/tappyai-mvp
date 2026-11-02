// Replay harness — the owner's automated criteria (§9), per turn, from the reply text + turn annotation.
import { parseAsk } from '../../../../src/lib/structuredContent/parseAsk'
import { PLAN_HEADINGS } from '../../../../src/lib/ai/consultative/domainFrames'
import type { TurnAnnotation } from './stream'

export interface Check { id: string; pass: boolean; detail?: string; info?: boolean }

export type PlanArea = keyof typeof PLAN_HEADINGS

const PICK_COUNT = /Mình chọn\s*(?::|\*\*)/g
const NEVER = ['không có chức năng', 'chưa hỗ trợ tìm']
/** Bullet labels that are not alternatives. */
// 🚨 No `\b` after the label: JS `\b` never matches after a Vietnamese vowel with a diacritic ("giá", "địa chỉ",
// "giờ"), so this list excluded nothing it was written for (replay r25: FOOD-3 "Giá · Địa chỉ" counted as alternatives).
const NOT_ALT = /^(lưu ý|mẹo|giá|địa chỉ|giờ|giờ mở cửa|mở|khoảng cách|đánh giá|chi phí|tổng|ghi chú|note|điện thoại|sđt|link|nguồn|ưu điểm|nhược điểm|lý do|khu vực|không khí|món|phù hợp|vì sao)(?=$|[\s:,.(])/i
/** A line that opens the alternatives block ("Hai lựa chọn khác:", "Phương án khác", "Gợi ý thêm:"). */
const ALT_HEADER = /(lựa chọn khác|phương án khác|gợi ý khác|gợi ý thêm|quán khác|chỗ khác|mẫu khác)\s*:?\s*\**\s*$/i

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

/**
 * Alternatives as the consult frame writes them: a bullet whose name is BOLD ("- **Name**: …"), or any
 * "- Name: …" bullet after an alternatives header ("Hai lựa chọn khác:"). Plain "- Label: …" bullets under
 * "Mình chọn … vì:" are the pick's REASONS, not alternatives (replay r25 FOOD-3: "- Địa chỉ: …", "- Giá: …").
 */
export function alternativeNames(text: string): string[] {
  const out: string[] = []
  let inAltBlock = false
  for (const line of text.split('\n')) {
    if (line.includes('Mình chọn')) { inAltBlock = false; continue }
    if (ALT_HEADER.test(line.replace(/^[\s#>*-]+/, '').trim())) { inAltBlock = true; continue }
    const m = line.match(/^\s*(?:[-•]|\*(?!\*))\s+(\*\*)?([^*:\n]{2,80}?)\*{0,2}\s*:/)
    if (!m) continue
    const bold = !!m[1]
    if (!bold && !inAltBlock) continue
    const name = cleanName(m[2])
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
  // The tips section of the area's approved headings: "Mẹo …" (food, travel, entertainment), "Cạm bẫy thường gặp" (shopping), "Lưu ý" (spa).
  const tipsWord = !area ? 'Mẹo' : headings.some(h => h.includes('Mẹo')) ? 'Mẹo' : headings.some(h => h.includes('Cạm bẫy')) ? 'Cạm bẫy' : 'Lưu ý'
  let tips = 0
  const at = lines.findIndex(l => l.includes(tipsWord) && isHeadingLine(l, area))
  if (at >= 0) {
    for (let i = at + 1; i < lines.length; i++) {
      if (isHeadingLine(lines[i], area)) break
      if (lines[i].trim() && !lines[i].startsWith('[')) tips++
    }
  }
  // Owner 29/09: the price section passes with REAL arithmetic, or with items marked "chưa có giá — hỏi quán" and a total that says what it
  // covers. Invented prices are the guards' job (they fail elsewhere); an estimate like "~900.000đ" or "giả sử giá" fails here too.
  const estimated = /giả sử giá|giá trung bình|~\s*\d[\d.]*\s*(?:đ|k|nghìn)/i.test(text)
  return { missing, tipsWord, tipsHeadingFound: at >= 0, tips, arithmetic: /[×÷=]/.test(text), priceHonest: !estimated && (/[×÷=]/.test(text) || /chưa có giá\s*[—-]\s*hỏi/i.test(text)), estimated }
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
  /** The conversation has run get_flight_prices (this turn or earlier): judged as a flight thread (Q10). */
  flight?: boolean
}

/**
 * A flight reply: money amounts it states (none may be invented — there is no fare source) and its Traveloka
 * search link. Q10 + Phương án C (owner 29/09): the link MUST go through ACCESSTRADE — a direct traveloka.com
 * link fails. Two accepted forms:
 *   · Tappy's click link `/go/at?u=<go.isclix.com …?url=<traveloka>…>&…` — a signed-in or guest user; the
 *     random sub1 is added by /go/at at click (verified on UAT), so the link itself never carries one;
 *   · the bare wrapper `go.isclix.com …?url=<traveloka>` — only when the turn has no identity (the replay
 *     runs without one); a sub1 baked into the link is the old scheme and fails.
 * The Traveloka target must name the route (`ap=XXX.YYY`) and a date (`dt=DD-MM-YYYY`).
 */
export function flightShape(text: string): { money: string[]; traveloka: { ok: boolean; detail: string } } {
  // Only a FARE counts: an amount on a line about the ticket / flight ("giá từ 800k–2M+ tùy hãng"). A sourced
  // venue band in the plan ("200.000đ–600.000đ (mức giá Google Maps)") is not a flight price; "6.075 đánh giá"
  // is a review count ("đ" must not start a word); amounts never span a line break.
  const FARE_LINE = /(vé|bay|chuyến|hãng|hành lý|khứ hồi|một chiều|1 chiều|flight|fare)/iu
  // URLs are not prose: a signed /go/at token once read as "4K".
  const money = text.replace(/https?:\/\/[^\s)\]]+/g, ' ').split('\n').filter(l => FARE_LINE.test(l) && !/Google Maps/i.test(l)).flatMap(l =>
    [...l.matchAll(/\d{1,3}(?:[.,]\d{3})+[ \t]*(?:đ|₫|vnd|VNĐ)(?![\p{L}])|\d+(?:[.,]\d+)?[ \t]*(?:k|nghìn|ngàn|triệu|tr|m)(?![\p{L}])(?![ \t]*(?:người|khách|km))/giu)].map(m => m[0]))
  const links = [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)\]]+)/g)].map(m => m[1] ?? m[2])
  for (const u of links) {
    let form: 'click' | 'accesstrade' | 'direct' = 'direct', wrapper = u, target = u
    try {
      let url = new URL(u)
      if (url.pathname === '/go/at' && url.searchParams.get('u')) { form = 'click'; wrapper = url.searchParams.get('u') ?? ''; url = new URL(wrapper) }
      if (/(^|\.)isclix\.com$|accesstrade/.test(url.host)) { if (form === 'direct') form = 'accesstrade'; target = url.searchParams.get('url') ?? '' }
      else if (form === 'click') target = ''
    } catch { continue }
    if (!/traveloka\.com/.test(target)) continue
    const route = /[?&]ap=[A-Z]{3}\.[A-Z]{3}/.test(target), date = /[?&]dt=\d{2}-\d{2}-\d{4}/.test(target)
    const noBakedSub1 = !/[?&]sub1=/.test(wrapper)
    const ok = form !== 'direct' && noBakedSub1 && route && date
    return { money, traveloka: { ok, detail: `${form} route=${route} date=${date}${noBakedSub1 ? '' : ' sub1-in-link(old scheme)'}${form === 'click' ? ' sub1=at click' : form === 'accesstrade' ? ' sub1=n/a (no identity)' : ''}` } }
  }
  return { money, traveloka: { ok: false, detail: 'no Traveloka link' } }
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
  if (c.flight && type !== 'ask') {
    // Owner 29/09 (Q10): a FLIGHT turn needs no fare source in this release. It passes when it invents no
    // price, carries a Traveloka search link pre-filled with route + date (through ACCESSTRADE, then with
    // sub1), says "xem giá trên Traveloka", and the rest is sound. There is no flight to "pick", so the
    // pick / alternatives / compare-chooses checks do not apply to a flight thread.
    const f = flightShape(c.text)
    checks.push({ id: 'flight_no_invented_price', pass: f.money.length === 0, detail: f.money.length ? f.money.join(' · ') : undefined })
    if (type === 'pick' || type === 'more' || type === 'reject' || type === 'plan') {
      checks.push({ id: 'flight_traveloka_link', pass: f.traveloka.ok, detail: f.traveloka.detail })
      checks.push({ id: 'flight_see_price_on_traveloka', pass: /xem giá (?:trên|tại|ở) \**traveloka/i.test(c.text) })
    }
    return { type, checks, pass: checks.every(k => k.pass || k.info) }
  }
  if (type === 'ask') {
    const a = askShape(c.text)
    checks.push({ id: 'ask_block', pass: a.raw >= 2 && a.raw <= 3 && a.valid === a.raw && a.minOptions >= 2, detail: `questions=${a.raw} valid=${a.valid} minOptions=${a.minOptions}` })
    checks.push({ id: 'ask_no_serper', pass: serper === 0, detail: `serperCalls=${serper}` })
  } else if (type === 'pick' || type === 'more' || type === 'reject') {
    const n = pickCount(c.text)
    checks.push({ id: 'one_main_pick', pass: n === 1, detail: `picks=${n} name=${pick ?? '-'}` })
    checks.push({ id: 'alts_max_2', pass: alts.length <= 2, detail: `alts=${alts.length}${alts.length ? ` (${alts.join(' · ')})` : ''}` })
    const shown = (pick ? 1 : 0) + alts.length
    if (c.toolRows > shown) checks.push({ id: 'remaining_line', pass: /(?:Mình\s+)?[Cc]òn\s+\d+\s+lựa chọn/.test(c.text), detail: `toolRows=${c.toolRows} shown=${shown}` })
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
    checks.push({ id: 'plan_price', pass: p.priceHonest, detail: p.estimated ? 'estimated price (giả sử / ~)' : p.arithmetic ? 'arithmetic' : 'no arithmetic and no "chưa có giá — hỏi quán"' })
  }
  return { type, checks, pass: checks.every(k => k.pass || k.info) }
}

/** Names this reply showed (main pick + alternatives), for the next turns' reject/more checks. */
export const shownNames = (text: string) => [mainPickName(text), ...alternativeNames(text)].filter((s): s is string => !!s)
