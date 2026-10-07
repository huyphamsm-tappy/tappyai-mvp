// ── CONSULTATIVE V1 — what a stated hard constraint means when nothing vouches for it ──
//
// Owner decision 2026-09-19 (after F8 "phòng riêng" was asserted with no evidence, and after the
// first fix made EVERY unread constraint a gap): a constraint belongs to exactly one group, in code,
// and the group decides what "no evidence" means. Nothing here is silent — a constraint the table
// does not know is treated as EVIDENCE_REQUIRED and logged with its value.
//
//   EVIDENCE_REQUIRED  no evidence ⇒ gap ("chưa xác nhận được, nên gọi hỏi"). Being wrong costs the
//                      user the evening: a private room that is not there, a car with nowhere to park.
//   ASSUME_PRESENT     no evidence ⇒ NO gap; gap only on CONTRARY evidence. Telling a Vietnamese user
//                      "chưa rõ quán có điều hòa không" is worse than saying nothing.
//   ROW_FLAG_BACKED    a result row vouches on its own (delivery ← has_delivery / has_order); gap
//                      only when no row does.
//
// One table feeds three consumers: the prompt line (BANG CHUNG THIEU), the server heads-up in the
// stream, and the atmosphere-claim guard — so a constraint can no longer be a gap in one place and
// invisible in the next (the stream's own word list used to know 7 of the 12).

import { normalizeVN } from '../intent'
import type { Hard } from './situationFrame'
import type { AttributeEvidence, VenueAttribute } from './reviewAttributes'

export type HardGroup = 'EVIDENCE_REQUIRED' | 'ASSUME_PRESENT' | 'ROW_FLAG_BACKED'

/** Exhaustive over `Hard` — adding a value to the union without a row here is a type error. */
export const HARD_GROUP: Record<Hard, HardGroup> = {
  quiet: 'EVIDENCE_REQUIRED', parking: 'EVIDENCE_REQUIRED', kids: 'EVIDENCE_REQUIRED', vegetarian: 'EVIDENCE_REQUIRED',
  outdoor: 'EVIDENCE_REQUIRED', private_room: 'EVIDENCE_REQUIRED', view: 'EVIDENCE_REQUIRED',
  live_music: 'EVIDENCE_REQUIRED', wheelchair: 'EVIDENCE_REQUIRED',
  // "sang chút" (T8, owner 2026-09-19): a class-of-place constraint — a guest house is wrong, and
  // "sang trọng" said of a row with no fancy evidence is the fabrication the gap sentence prevents.
  upscale: 'EVIDENCE_REQUIRED',
  air_con: 'ASSUME_PRESENT',
  delivery: 'ROW_FLAG_BACKED',
  // A.2 (owner 2026-09-19, P8): "mở khuya" is answered by the row's own `opening_hours`, not by a
  // review word — a row that closes at 23:00+ / after midnight / all day vouches; no row with
  // hours ⇒ gap, and the reply says the hours are unconfirmed. Never a substitute signal.
  late_open: 'ROW_FLAG_BACKED',
}

/** The review attribute that supports a constraint, when the lexicon has one. */
export const HARD_TO_ATTR: Partial<Record<Hard, VenueAttribute>> = {
  quiet: 'quiet', parking: 'parking', kids: 'kids', vegetarian: 'vegetarian', outdoor: 'outdoor', view: 'view',
  live_music: 'live_music', upscale: 'fancy',
  // late_open keeps its review attribute for the ATMOSPHERE GUARD (a "mở khuya" claim about a row
  // without hours evidence is stripped); its gap/vouch decision is the row's `opening_hours`.
  late_open: 'late_open',
}

/** How the gap is named to the user — vi / en. One list for prompt and stream. */
export const HARD_GAP_WORDS: Record<Hard, [string, string]> = {
  quiet: ['yên tĩnh', 'quiet'], parking: ['chỗ đậu xe', 'parking'], kids: ['phù hợp trẻ em', 'kid-friendliness'],
  vegetarian: ['món chay', 'vegetarian options'], outdoor: ['chỗ ngồi ngoài trời', 'outdoor seating'],
  private_room: ['phòng riêng', 'a private room'], late_open: ['giờ mở khuya', 'late opening'],
  delivery: ['giao hàng / mang về', 'delivery or takeaway'], air_con: ['máy lạnh', 'air conditioning'], view: ['view', 'a view'],
  live_music: ['nhạc sống', 'live music'], wheelchair: ['tiếp cận xe lăn', 'wheelchair access'],
  upscale: ['mức sang trọng', 'how upscale it is'],
}

// Contrary evidence for ASSUME_PRESENT constraints, on folded fetched text.
const CONTRARY: Partial<Record<Hard, RegExp>> = {
  air_con: /\b(?:khong (?:co )?(?:may lanh|dieu hoa)|(?:may lanh|dieu hoa) (?:hong|yeu|khong mat)|nong (?:qua|buc|ham|kinh)|no (?:ac|air ?con(?:ditioning)?)|(?:too )?hot inside|stuffy)\b/,
}

const warned = new Set<string>()
/** The group of a constraint. An unknown value is EVIDENCE_REQUIRED and is logged — once per value. */
export function hardGroupOf(h: string): HardGroup {
  const g = (HARD_GROUP as Record<string, HardGroup | undefined>)[h]
  if (g) return g
  if (!warned.has(h)) {
    warned.add(h)
    console.warn(JSON.stringify({ type: 'tappyai_consultative_v1', step: 'hard_unclassified', hard: h, treated_as: 'EVIDENCE_REQUIRED' }))
  }
  return 'EVIDENCE_REQUIRED'
}

/**
 * Does this `opening_hours` string say the place is open late? Provider spellings seen on the
 * rows: "09:00–22:00", "10:00–05:00" (past midnight), "08:00–23:30", "Mở cửa cả ngày", "Mo-Su
 * 08:00-22:00" (OSM), "Open 24 hours". Late = closes at 23:00 or later, or after midnight, or all
 * day. Unparseable ⇒ null (no evidence either way — never a substitute signal).
 */
export function closesLate(openingHours: unknown): boolean | null {
  if (typeof openingHours !== 'string' || !openingHours.trim()) return null
  const s = normalizeVN(openingHours.toLowerCase())
  if (/ca ngay|24 ?h|24\/7|24 (?:gio|hours)|open 24/.test(s)) return true
  const m = /(\d{1,2})[:h](\d{2})\s*[–\-—]\s*(\d{1,2})[:h](\d{2})/.exec(s)
  if (!m) return null
  const open = Number(m[1]) * 60 + Number(m[2])
  const close = Number(m[3]) * 60 + Number(m[4])
  if (close <= open) return true            // past midnight ("10:00–05:00")
  return close >= 23 * 60
}

/** Which rows vouch for which ROW_FLAG_BACKED constraint — names, so the reply can say WHICH. */
export function rowsVouching(rows: readonly unknown[]): Partial<Record<Hard, string[]>> {
  const out: Partial<Record<Hard, string[]>> = {}
  const add = (h: Hard, name: string) => { (out[h] ??= []).push(name) }
  for (const row of rows) {
    const x = (row ?? {}) as Record<string, unknown>
    const name = typeof x.name === 'string' ? x.name : typeof x.title === 'string' ? x.title : ''
    if (x.has_delivery === true || x.has_order === true) add('delivery', name)
    if (closesLate(x.opening_hours) === true) add('late_open', name)
  }
  return out
}

/** Hard constraints a result row can vouch for on its own (no review text needed). */
export function rowSupportedHards(rows: readonly unknown[]): Hard[] {
  return Object.keys(rowsVouching(rows)) as Hard[]
}

/** Do the rows carry the field a ROW_FLAG_BACKED constraint reads at all? (late_open ← opening_hours) */
export function rowsCarryFieldFor(h: Hard, rows: readonly unknown[]): boolean {
  if (h === 'late_open') return rows.some(r => typeof (r as Record<string, unknown>)?.opening_hours === 'string')
  if (h === 'delivery') return rows.some(r => { const x = (r as Record<string, unknown>) ?? {}; return 'has_delivery' in x || 'has_order' in x })
  return false
}

export interface HardGapReport {
  /** Constraints the reply must name as unconfirmed. */
  gaps: Hard[]
  /** ASSUME_PRESENT constraints with contrary evidence — named as "có đánh giá nói không có". */
  contrary: Hard[]
  /** ASSUME_PRESENT constraints left alone (no evidence either way). */
  assumed: Hard[]
  /** ROW_FLAG_BACKED constraints a row vouched for. */
  rowBacked: Hard[]
  /** …and WHICH rows (names) — so the reply may say it only about those. */
  rowBackedBy: Partial<Record<Hard, string[]>>
  /** ROW_FLAG_BACKED gaps where NO row even carries the field (e.g. no `opening_hours` at all). */
  fieldMissing: Hard[]
  /** Values outside the table (already logged). */
  unclassified: string[]
}

/**
 * Every stated hard constraint, sorted into what the reply must do about it. Never drops a value:
 * a constraint is in exactly one of gaps / contrary / assumed / rowBacked, or is supported.
 */
export function classifyHardGaps(
  hard: readonly Hard[],
  attrs: ReadonlyMap<string, AttributeEvidence[]>,
  opts: { rows?: readonly unknown[]; texts?: ReadonlyMap<string, string[]> } = {},
): HardGapReport {
  const rep: HardGapReport = { gaps: [], contrary: [], assumed: [], rowBacked: [], rowBackedBy: {}, fieldMissing: [], unclassified: [] }
  const rows = opts.rows ?? []
  const vouching = rowsVouching(rows)
  for (const h of hard) {
    const group = hardGroupOf(h)
    if (!(h in HARD_GROUP)) rep.unclassified.push(h)
    if (group === 'ROW_FLAG_BACKED') {
      const by = vouching[h]
      if (by && by.length > 0) { rep.rowBacked.push(h); rep.rowBackedBy[h] = by }
      else { rep.gaps.push(h); if (!rowsCarryFieldFor(h, rows)) rep.fieldMissing.push(h) }
      continue
    }
    if (group === 'ASSUME_PRESENT') {
      const re = CONTRARY[h]
      let against = false
      if (re && opts.texts) for (const list of opts.texts.values()) if (list.some(t => re.test(normalizeVN(t.toLowerCase())))) { against = true; break }
      if (against) rep.contrary.push(h); else rep.assumed.push(h)
      continue
    }
    const want = HARD_TO_ATTR[h]
    let supported = false
    if (want) for (const list of attrs.values()) if (list.some(a => a.attribute === want)) { supported = true; break }
    if (!supported) rep.gaps.push(h)
  }
  return rep
}

/**
 * The instruction that rides the tool result to the model. The system block is built BEFORE the
 * tool runs (its gap line is always empty), so this string is the only deterministic channel that
 * reaches the model with the gap known. One sentence for all gaps, one for contrary evidence.
 */
export function evidenceNote(rep: HardGapReport, lang: string): string | null {
  const w = (h: Hard) => HARD_GAP_WORDS[h]?.[lang === 'en' ? 1 : 0] ?? h
  const parts: string[] = []
  if (rep.gaps.length > 0) {
    parts.push(lang === 'en'
      ? `No result carries evidence about: ${rep.gaps.map(w).join(', ')}. Say in ONE sentence that you could not confirm it and suggest calling ahead; never assert it.`
      : `KHONG quan nao trong ket qua co bang chung ve: ${rep.gaps.map(w).join(', ')}. Noi ro trong MOT cau "minh chua xac nhan duoc X, nen goi hoi truoc"; KHONG khang dinh co.`)
  }
  if (rep.contrary.length > 0) {
    parts.push(lang === 'en'
      ? `Some fetched text says a result LACKS: ${rep.contrary.map(w).join(', ')}. If you pick that place, say so; never claim the opposite.`
      : `Co danh gia noi quan KHONG co / kem: ${rep.contrary.map(w).join(', ')}. Neu chon quan do, noi ro; KHONG khang dinh nguoc lai.`)
  }
  // A row-backed constraint names WHICH rows vouch: the pick must be one of them, and the reply
  // may not say it about the others (measured P8: a 22:00 spa was called "mở khuya").
  for (const h of rep.rowBacked) {
    const names = (rep.rowBackedBy[h] ?? []).slice(0, 6).join(', ')
    parts.push(lang === 'en'
      ? `Only these results carry evidence of ${w(h)}: ${names}. Pick from them for that need; never say it of any other result.`
      : `CHI cac quan nay co bang chung ve ${w(h)}: ${names}. Chon trong so do cho nhu cau nay; KHONG noi dieu do ve quan khac.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** Back-compat shape used by the prompt and the stream: the gaps only. */
export function hardConstraintGaps(hard: readonly Hard[], attrs: ReadonlyMap<string, AttributeEvidence[]>, rowSupported: Iterable<Hard> = []): Hard[] {
  const rows = [...rowSupported].map(h => (h === 'delivery' ? { has_delivery: true } : h === 'late_open' ? { opening_hours: '10:00–02:00' } : {}))
  return classifyHardGaps(hard, attrs, { rows }).gaps
}
