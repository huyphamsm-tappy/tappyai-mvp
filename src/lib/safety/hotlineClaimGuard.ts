// Hotline claim guard (12/11/2026, found by the lead's self-UAT): a normal chat answer said that hotline 115 is "free", citing a phone-store web page.
// The owner's verified list (emergencyPayload.ts, VERIFIED_HOTLINES, built from his report) establishes hours and cost for 111 and 112 ONLY; for 113, 114 and 115 they are UNKNOWN, and R13 forbids
// publishing an unverified hours or cost claim about a hotline.
//
// Pure and deterministic, over the FINAL answer text (Vietnamese, English, Chinese): a sentence that names 113, 114 or 115 AS A NUMBER (not inside a price, a longer number or a phone number)
// together with a cost claim (free, toll-free, miễn phí, 免费 ...) or an hours claim (24/7, 24/24, 24 giờ, 24 hours, 全天, 24小时 ...) loses that claim. The least destructive rewrite that stays
// grammatical: when the claim sits in its own clause (split at ";" or at a contrast connector) only that clause goes, together with a contrast clause that depended on it ("tuy nhiên ...");
// otherwise the whole sentence goes. No replacement fact is ever written. A sentence that names only 111 or 112 is never touched (they ARE verified), nor is a sentence about any other number.
// A sentence that names both an unverified and a verified number with one claim cannot be attributed, so it takes the same rewrite (the claim is not published for the unverified one).
//
// The registry stays the single source of truth: UNVERIFIED_HOTLINE_NUMBERS is derived from VERIFIED_HOTLINES, so verifying a number there lifts this guard for it with no edit here.

import { VERIFIED_HOTLINES } from '@/lib/safety/emergencyPayload'

/** The emergency short codes this guard knows about, and which of them the registry establishes hours AND cost for. */
const ALL_CODES = ['111', '112', '113', '114', '115'] as const
const established = (n: string) => VERIFIED_HOTLINES.some(h => h.phoneNumber === n && !!h.operatingHours && h.freeOfCharge === true && h.verificationStatus === 'VERIFIED')
/** Numbers whose hours/cost claim must not be published. Derived from the registry. */
export const UNVERIFIED_HOTLINE_NUMBERS: readonly string[] = ALL_CODES.filter(n => !established(n))

// A number "as the number": not inside a longer number, a price, a phone number (1900 115, +84 115, 0115), a decimal (115.5, 115,000) or glued to letters/units (115k, 115km, 115đ, 115%).
// A quantity ("114 cửa hàng", "113 stores", "115 km") is a count, not a hotline.
const QUANTITY_WORDS = '\\s*(?:(?:cửa\\s*hàng|quán|người|sản\\s*phẩm|món|phòng\\s*khám|nhà\\s*thuốc|nhà\\s*hàng|khách\\s*sạn|bệnh\\s*viện|trung\\s*tâm|cơ\\s*sở|trạm|ngày|đêm|tỉnh|thành\\s*phố|trường|điểm|chi\\s*nhánh|đồng|vnđ|usd|đô|nghìn|ngàn|triệu|tỷ|stores?|shops?|people|persons?|items?|rooms?|days?|nights?|hotels?|clinics?|hospitals?|pharmacies|branches|centers?|centres?|restaurants?|users?|customers?|cases?|km|kg|dollars?|euros?|vnd)(?![\\p{L}])|[个家人天元块位辆])'
// What the number labels is a room, a bus or a gate, not a hotline ("Phòng 115", "Room 114", "房间115").
const LABEL_BEFORE = '(?:phòng|room|rooms|suite|unit|tầng|floor|gate|cổng|bus|tuyến|route|flight|chuyến|đường|street|lô|bàn|table|seat|ghế|房间|房|号|室)\\s*(?:số\\s*|no\\.?\\s*|#\\s*)?'
// Inside a longer number or a price or a phone number: a digit run, a separator and our number; but "113/114/115" is a list of codes, so a separator after a 111-115 code does not count.
const NUMBER_RE = (codes: readonly string[]) => new RegExp(
  `(?<![\\d$€£₫¥#+]|(?<!\\d)(?!11[1-5][ .,\\-/])\\d+[ .,\\-/]|[A-Za-z]|${LABEL_BEFORE})(?:${codes.join('|')})(?![\\dA-Za-z%đ₫]|[.,\\-/](?!11[1-5](?!\\d))\\d|${QUANTITY_WORDS})`, 'iu')

const COST_RE = new RegExp([
  // Vietnamese
  'miễn\\s*phí', 'miễn\\s*cước', 'mien\\s*phi', 'không\\s+(?:mất|tốn|thu|tính)\\s+(?:tiền|phí|cước|chi\\s*phí)', 'khong\\s+(?:mat|ton|thu|tinh)\\s+(?:tien|phi|cuoc)', 'không\\s+bị\\s+tính\\s+(?:phí|cước)',
  // English
  '(?<![\\w-])toll[- ]?free(?![\\w-])', '(?<![\\w-])free(?![\\w-])', 'at\\s+no\\s+(?:cost|charge)', '(?<![\\w-])no\\s+(?:charge|cost|fee)(?![\\w-])', '(?<![\\w-])without\\s+(?:charge|cost)(?![\\w-])', '(?<![\\w-])gratis(?![\\w-])', '(?<![\\w-])costs?\\s+nothing(?![\\w-])',
  // Chinese
  '免费', '免費', '不收费', '不收費', '无需付费', '無需付費', '免话费', '免話費',
].join('|'), 'iu')

const HOURS_RE = new RegExp([
  '24\\s*/\\s*(?:24|7)(?![\\d])', '24\\s*(?:giờ|tiếng)(?![\\p{L}])', '(?<![\\d.,])24\\s*h(?![\\p{L}\\d])', '24[\\s-]*(?:hours?|hrs?)(?![\\p{L}])', '(?:round|around)[\\s-]+the[\\s-]+clock', 'day\\s+and\\s+night', 'all\\s+day\\s+and\\s+night',
  'suốt\\s+ngày\\s+đêm', 'cả\\s+ngày\\s+lẫn\\s+đêm', 'ngày\\s+đêm', 'twenty[\\s-]*four\\s+hours?',
  '24\\s*小时', '24\\s*小時', '二十四小[时時]', '全天候?', '昼夜', '不间断', '不間斷',
].join('|'), 'iu')

/** "feel free to call" and "free to ask" are invitations, not a statement about cost. */
const INVITATION_RE = /\bfeel\s+free\b|\bfree\s+to\s+(?!call\b)/giu

const hasClaim = (s: string) => {
  const t = s.replace(INVITATION_RE, ' ')
  return COST_RE.test(t) || HOURS_RE.test(t)
}

// Sentence ends; an abbreviation's full stop ("TP. HCM", "Q. 1", "Dr.") does not end one.
const ABBREVIATIONS = new Set(['tp', 'tx', 'q', 'p', 'st', 'mr', 'mrs', 'ms', 'dr', 'no', 'vs', 'ths', 'ts', 'gs', 'pgs', 'đ', 'tt', 'tel', 'ext', 'approx', 'etc'])
const CLOSERS = new Set([...'*_"\'”’)]»}'])
const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r' || c === ' '

interface Segment { body: string; trail: string }

/** Splits into sentences; `trail` is the spaces (and the one line break) after the sentence. concat(body + trail) === text. */
export function splitSentences(text: string): Segment[] {
  const out: Segment[] = []
  let start = 0
  let i = 0
  const n = text.length
  const pushAt = (bodyEnd: number) => {
    let j = bodyEnd
    while (j < n && isSpace(text[j])) j++
    if (text[j] === '\n') j++
    out.push({ body: text.slice(start, bodyEnd), trail: text.slice(bodyEnd, j) })
    start = j
    i = j
  }
  while (i < n) {
    const c = text[i]
    if (c === '\n') { pushAt(i); continue }
    if (c === '。' || c === '！' || c === '？') {
      let j = i + 1
      while (j < n && (text[j] === '。' || text[j] === '！' || text[j] === '？' || CLOSERS.has(text[j]))) j++
      pushAt(j); continue
    }
    if (c === '.' || c === '!' || c === '?') {
      let j = i + 1
      while (j < n && (text[j] === '.' || text[j] === '!' || text[j] === '?')) j++
      while (j < n && CLOSERS.has(text[j])) j++
      const ends = j >= n || isSpace(text[j]) || text[j] === '\n'
      if (ends && c === '.' && j === i + 1) {
        const w = /([\p{L}]+)$/u.exec(text.slice(Math.max(start, i - 8), i))
        if (w && ABBREVIATIONS.has(w[1].toLowerCase()) && (w[1].length <= 3 || /^[A-Z]/.test(w[1]))) { i = j; continue }
      }
      if (ends) { pushAt(j); continue }
      i = j; continue
    }
    i++
  }
  if (start < n) out.push({ body: text.slice(start), trail: '' })
  return out
}

// Clause boundaries inside one sentence: a semicolon, or a contrast connector that opens a new statement.
const CLAUSE_SPLIT = /(?=[;；]\s*)|(?=,\s*(?:còn|nhưng|tuy nhiên|trong khi|while|whereas|but|however|though)\b)|(?<!,)(?=\s+(?:nhưng|tuy nhiên|however|but)\b)|(?=，?(?:但是|不过|不過|然而))/giu
const CONTRAST_LEAD = /^[;；,，\s]*(?:(?:tuy\s+nhiên|nhưng|trái\s+lại|however|but|though|yet)(?![\p{L}])|但是|不过|不過|然而)/iu
const TERMINATOR = /[.!?。！？]+[*_"'”’)\]»}]*$/u

/** The clause list of a sentence body (terminator included in the last clause). */
function clausesOf(body: string): string[] {
  const parts = body.split(CLAUSE_SPLIT).filter(p => p.length > 0)
  return parts.length ? parts : [body]
}

function rewriteSentence(body: string, unverified: RegExp, verified: RegExp | null): string | null {
  const clauses = clausesOf(body)
  // A clause is flagged when it makes a claim and names an unverified number; a claim clause that names no number ("it is free") belongs to the number the sentence spoke of last.
  let ctx: 'U' | 'V' | null = null
  const flags = clauses.map(c => {
    const u = unverified.test(c)
    const v = !!verified && verified.test(c)
    if (u) ctx = 'U'; else if (v) ctx = 'V'
    return hasClaim(c) && (u || (!v && ctx === 'U'))
  })
  if (!flags.some(Boolean)) return body
  if (clauses.length < 2) return null
  const keep: string[] = []
  let droppedBefore = false
  for (let k = 0; k < clauses.length; k++) {
    const c = clauses[k]
    if (flags[k]) { droppedBefore = true; continue }
    if (droppedBefore && CONTRAST_LEAD.test(c)) continue
    keep.push(c)
  }
  if (!keep.length || keep.every(c => !/\p{L}|\p{N}/u.test(c))) return null
  let s = keep.join('')
  // the new opening clause carried a delimiter; it opens the sentence now
  s = s.replace(/^[;；,，]\s*/u, '')
  const original = TERMINATOR.exec(body)
  if (original && !TERMINATOR.test(s)) s += original[0]
  // the sentence started with a capital letter before; it still does
  if (/^\p{Ll}/u.test(s) && /^\p{Lu}/u.test(body.replace(/^[\s*_>#-]+/u, ''))) s = s.replace(/^(\p{Ll})/u, ch => ch.toLocaleUpperCase('vi'))
  return s
}

export interface HotlineClaimResult { text: string; changed: boolean; removedSentences: number; editedSentences: number }

/** Applies the guard to a final answer text. Pure; returns the text unchanged (same string) when nothing is claimed. */
export function guardHotlineClaims(text: string): HotlineClaimResult {
  const none: HotlineClaimResult = { text, changed: false, removedSentences: 0, editedSentences: 0 }
  if (!text || UNVERIFIED_HOTLINE_NUMBERS.length === 0) return none
  const unverified = NUMBER_RE(UNVERIFIED_HOTLINE_NUMBERS)
  const verifiedCodes = ALL_CODES.filter(n => !UNVERIFIED_HOTLINE_NUMBERS.includes(n))
  const verified = verifiedCodes.length ? NUMBER_RE(verifiedCodes) : null
  // cheap exit: no code in the text at all
  if (!unverified.test(text)) return none
  const segs = splitSentences(text)
  let removed = 0
  let edited = 0
  let out = ''
  let afterRemoved = false
  for (const seg of segs) {
    const next = rewriteSentence(seg.body, unverified, verified)
    if (next === null) {
      removed++
      afterRemoved = true
      // a removed line leaves no empty line behind; a removed sentence at the end of a line keeps the line break
      if (seg.trail.includes('\n') && !(out === '' || out.endsWith('\n'))) out += '\n'
      continue
    }
    // the sentence right after a removed one that opens with "however"/"tuy nhiên"/"但是" argued against what is gone: the connector goes, the statement stays
    let body = next
    if (afterRemoved && next === seg.body && CONTRAST_LEAD.test(next)) {
      const stripped = next.replace(new RegExp(CONTRAST_LEAD.source + '[\\s,，:]*', 'iu'), '')
      if (/\p{L}|\p{N}/u.test(stripped)) { body = stripped.replace(/^(\p{Ll})/u, ch => ch.toLocaleUpperCase('vi')); edited++ }
    }
    afterRemoved = false
    if (body !== seg.body && next !== seg.body) edited++
    out += body + seg.trail
  }
  if (removed + edited === 0) return none
  out = out.replace(/[ \t]+(?=\n)/g, '').replace(/\n{3,}/g, '\n\n')
  if (!/^\s/.test(text)) out = out.replace(/^\s+/, '')
  if (!/\s$/.test(text)) out = out.replace(/\s+$/, '')
  return { text: out, changed: out !== text, removedSentences: removed, editedSentences: edited }
}
