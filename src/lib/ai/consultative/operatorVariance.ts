// ── CONSULTATIVE_IN_AGENT — a coach reply only says what the rows show about operators, vehicle types and times (Round 33, defect B) ─────────────────────────────
//
// Live 2026-10-12 (round 2): with ONE operator in the rows the model wrote "giá thực tế thay đổi theo hãng và loại xe" — the same claim as "tùy nhà xe" in other words, so the
// Round 32 phrase rule missed it. The rule is therefore about MEANING, decided on the data of the turn (nothing here names an operator):
//   · a clause that says the price varies / depends / differs BY operator ("theo hãng", "tùy nhà xe", "khác nhau giữa các hãng", "varies by operator", "mỗi hãng một giá") stays only
//     when the rows name at least two distinct operators;
//   · a clause that says it varies by vehicle type, or by time / date / season, stays only when the rows themselves speak of vehicle types / of time-dependent fares;
//   · a clause that compares with "other / several operators" ("rẻ hơn các hãng khác", "nhiều nhà xe cùng chạy") goes when the rows name fewer than two.
// What goes is the clause that makes the claim (or just the phrase, when the clause carries a figure); what the rows support is kept. Nothing is written in its place. Pure.

import type { TextRow } from './priceProvenance'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export interface VarianceSupport { operators: boolean; vehicle: boolean; time: boolean }

const VEHICLE_TERMS = [/giuong nam/, /limousine/, /ghe ngoi/, /ghe nam/, /cabin/, /\bvip\b/, /\b\d{1,2} cho\b/, /sleeper/, /\bseater\b/, /\bsleeping\b/]
const TIME_FARE = /(?:gio chay|khung gio|cao diem|dip le|ngay le|\btet\b|cuoi tuan|theo ngay|theo mua|ngay thuong|peak|off-?peak|weekend|holiday|seasonal)/

/** What the coach rows support. `operatorCount` is the number of distinct operators they name (coachFares.operatorsIn). */
export function varianceSupport(rows: readonly TextRow[], operatorCount: number): VarianceSupport {
  const folded = rows.map(r => fold(r.text))
  const f = folded.join(' \n ')
  const vehicleKinds = VEHICLE_TERMS.filter(re => re.test(f)).length
  // vehicle types count as supported when the rows name at least two kinds AND a row that states a fare also names a kind (the fare is stated next to the type)
  const priced = folded.some(t => /\d[\d.,]*\s?(?:d|vnd|k|nghin|trieu|tr)\b/.test(t) && VEHICLE_TERMS.some(re => re.test(t)))
  return { operators: operatorCount >= 2, vehicle: vehicleKinds >= 2 && priced, time: TIME_FARE.test(f) }
}

// ── vocabulary (folded, Vietnamese; English is matched on lower-case text) ──────────────────────────────────────────────────────────────────────────────────────────
const VEH = '(?:loai xe|loai ghe|loai ve|hang ghe|xe giuong nam|giuong nam|limousine|ghe ngoi)'
const OP = '(?:nha van tai|nha cung cap|hang xe|nha xe|hang)'
const TIME = '(?:thoi diem|gio chay|khung gio|mua cao diem|cao diem|dip le|ngay le|cuoi tuan|thoi gian|ngay di|ngay)'
const OBJ = `(?:${VEH}|${OP}|${TIME})`
const CUE = '(?:thay doi|khac nhau|chenh lech|dao dong|phu thuoc|tuy(?: theo| vao| thuoc)?)'
const GLUE = '(?:theo|giua|vao|tung|moi|cac)'
const VARY_VI = new RegExp(`(?<![a-z])${CUE}(?:\\s+${GLUE})*\\s+${OBJ}(?:\\s*(?:,|/|va|hoac)\\s*(?:${GLUE}\\s+)*${OBJ})*(?![a-z])`, 'g')
const EACH_VI = /(?<![a-z])moi\s+(?:hang xe|nha xe|hang)\s+(?:mot|co)\s+(?:muc\s+)?gia(?![a-z])/g
const OP_EN = '(?:bus\\s+)?(?:operators?|compan(?:y|ies)|carriers?|bus\\s+lines?)'
const VEH_EN = '(?:(?:seat|bus|vehicle|ticket)\\s+types?|class(?:es)?)'
const TIME_EN = '(?:time of (?:day|travel)|departure times?|dates?|seasons?|time)'
const OBJ_EN = `(?:${OP_EN}|${VEH_EN}|${TIME_EN})`
const VARY_EN = new RegExp(`\\b(?:varies|vary|varying|differs|differ|depends|depending|dependent)\\s+(?:on|by|with|between|across|upon)\\s+(?:the\\s+|each\\s+)?${OBJ_EN}(?:\\s*(?:,|/|and|or)\\s*(?:the\\s+)?${OBJ_EN})*`, 'gi')
const KIND = new RegExp(`(${VEH})|(${OP})|(${TIME})`, 'g')
const KIND_EN = new RegExp(`(${VEH_EN})|(${OP_EN})|(${TIME_EN})`, 'gi')
const PLURAL_OPS_VI = /(?:(?:cac|nhieu|mot so|nhung|vai)\s+(?:hang xe|hang|nha xe|nha van tai|nha cung cap)|(?:hang xe|hang|nha xe)\s+khac|so voi\s+(?:cac\s+)?(?:hang|nha xe)|giua\s+cac\s+(?:hang|nha xe))/
const PLURAL_OPS_EN = /\b(?:(?:other|several|multiple|many|different|various)\s+(?:bus\s+)?(?:operators|carriers|companies|bus lines)|compared (?:with|to) (?:other )?(?:operators|carriers|companies))\b/i
const COMPARES = /(?:re hon|dat hon|thap hon|cao hon|khac nhau|chenh lech|thay doi|tuy|so voi|nhieu lua chon|cheaper|more expensive|higher|lower|differ|vary|varies|compared)/

const LABEL: Record<'vi' | 'en', Record<'operator' | 'vehicle' | 'time', string>> = {
  vi: { operator: 'nhà xe', vehicle: 'loại xe', time: 'thời điểm' },
  en: { operator: 'operator', vehicle: 'seat type', time: 'time of travel' },
}

interface Hit { start: number; end: number; kinds: Array<'operator' | 'vehicle' | 'time'>; firstObjectAt: number }

function kindsOf(folded: string, en: boolean): { kinds: Hit['kinds']; firstAt: number } {
  const re = en ? KIND_EN : KIND
  re.lastIndex = 0
  const kinds: Hit['kinds'] = []
  let firstAt = -1
  for (const m of folded.matchAll(re)) {
    if (firstAt < 0) firstAt = m.index!
    const k = m[1] ? 'vehicle' : m[2] ? 'operator' : 'time'
    if (!kinds.includes(k)) kinds.push(k)
  }
  return { kinds, firstAt }
}

function hitsIn(clause: string): Hit[] {
  const out: Hit[] = []
  const f = fold(clause)
  if (f.length === clause.length) {
    for (const re of [VARY_VI, EACH_VI]) {
      re.lastIndex = 0
      for (const m of f.matchAll(re)) {
        const { kinds, firstAt } = kindsOf(m[0], false)
        out.push({ start: m.index!, end: m.index! + m[0].length, kinds: re === EACH_VI ? ['operator'] : kinds, firstObjectAt: m.index! + Math.max(0, firstAt) })
      }
    }
  }
  const low = clause.toLowerCase()
  VARY_EN.lastIndex = 0
  for (const m of low.matchAll(VARY_EN)) {
    const { kinds, firstAt } = kindsOf(m[0], true)
    out.push({ start: m.index!, end: m.index! + m[0].length, kinds, firstObjectAt: m.index! + Math.max(0, firstAt) })
  }
  return out.filter(h => h.kinds.length).sort((a, b) => b.start - a.start)
}

/** Clause-level rewrite. Returns the clause to keep ('' = the clause goes) and what was removed. */
function fixClause(clause: string, s: VarianceSupport, en: boolean, removed: string[]): string {
  const f = fold(clause)
  const plural = f.length === clause.length && PLURAL_OPS_VI.test(f) || PLURAL_OPS_EN.test(clause)
  if (!s.operators && plural && COMPARES.test(f)) { removed.push('other_operators'); return '' }
  let out = clause
  let removedPhrase = false
  for (const h of hitsIn(clause)) {
    const bad = h.kinds.filter(k => !s[k === 'operator' ? 'operators' : k])
    if (!bad.length) continue
    removed.push(...bad.map(k => `variance_by_${k}`))
    const keep = h.kinds.filter(k => !bad.includes(k))
    if (keep.length) {
      const labels = keep.map(k => LABEL[en ? 'en' : 'vi'][k]).join(en ? ' and ' : ' và ')
      out = `${out.slice(0, h.firstObjectAt)}${labels}${out.slice(h.end)}`
    } else {
      let a = h.start
      const before = out.slice(0, a)
      const comma = /\s*,\s*$/.exec(before)
      if (comma) a -= comma[0].length
      out = `${out.slice(0, a)}${out.slice(h.end)}`
      removedPhrase = true
    }
  }
  if (removedPhrase) {
    const rest = fold(out).replace(/[^a-z0-9\s]/g, ' ').trim()
    const words = rest ? rest.split(/\s+/).length : 0
    if (words <= 5 && !/\d/.test(rest)) return '' // nothing but a subject was left ("giá thực tế"): the clause was the claim
  }
  return out.replace(/ {2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1')
}

const MARKER_BLOCK = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g
const SOURCE_LINE = /^\s*(?:nguồn|sources?|giá theo kết quả tìm kiếm của|prices as listed in the search results of)\b/i
const MD_LINK = /\]\(https?:\/\/[^)\s]+\)/

export interface VarianceResult { text: string; removed: string[] }

/** Removes the clauses of a coach reply that claim variation (or other operators) the rows do not support. */
export function dropUnsupportedVariance(input: string, s: VarianceSupport, lang: string): VarianceResult {
  if (!input || (s.operators && s.vehicle && s.time)) return { text: input, removed: [] }
  const text = input.normalize('NFC')
  const en = lang === 'en'
  const blocks: string[] = []
  const masked = text.replace(MARKER_BLOCK, m => { blocks.push(m); return `⟦M${blocks.length - 1}⟧` })
  const removed: string[] = []
  const lines = masked.split('\n').map(line => {
    if (!line.trim() || SOURCE_LINE.test(line) || MD_LINK.test(line)) return line
    const parts = line.split(/(?<=[.!?…])(\s+)/)
    const out: string[] = []
    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i], sep = parts[i + 1] ?? ''
      const m = /^(\s*)([\s\S]*?)([.!?…]*)(\s*)$/.exec(sentence)
      const lead = m?.[1] ?? '', body = m?.[2] ?? sentence, tail = m?.[3] ?? ''
      const clauses = body.split(/(\s*;\s*|\s+[—–]\s+)/)
      const keep: string[] = []
      let droppedFirst = false
      for (let c = 0; c < clauses.length; c += 2) {
        const fixed = fixClause(clauses[c], s, en, removed)
        if (!fixed.trim()) { if (c === 0) droppedFirst = true; continue }
        keep.push(keep.length === 0 ? fixed : (clauses[c - 1] ?? '') + fixed)
      }
      if (keep.length === 0) { out.push(''); continue }
      let joined = keep.join('')
      if (droppedFirst) joined = joined.replace(/^\s+/, '').replace(/^\p{Ll}/u, ch => ch.toUpperCase())
      out.push(`${lead}${joined}${tail}${sep}`)
    }
    return out.join('').replace(/\s+$/, '')
  })
  if (!removed.length) return { text: input, removed: [] }
  let result = lines.join('\n').replace(/⟦M(\d+)⟧/g, (_m, n: string) => blocks[Number(n)] ?? '').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
  if (!/[\p{L}\p{N}]/u.test(result.replace(MARKER_BLOCK, ''))) result = input // never leave a reply empty: the Round 32 rules decide that case, not this one
  return { text: result, removed }
}
