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
  outdoor: 'EVIDENCE_REQUIRED', private_room: 'EVIDENCE_REQUIRED', late_open: 'EVIDENCE_REQUIRED', view: 'EVIDENCE_REQUIRED',
  live_music: 'EVIDENCE_REQUIRED', wheelchair: 'EVIDENCE_REQUIRED',
  air_con: 'ASSUME_PRESENT',
  delivery: 'ROW_FLAG_BACKED',
}

/** The review attribute that supports a constraint, when the lexicon has one. */
export const HARD_TO_ATTR: Partial<Record<Hard, VenueAttribute>> = {
  quiet: 'quiet', parking: 'parking', kids: 'kids', vegetarian: 'vegetarian', outdoor: 'outdoor', late_open: 'late_open', view: 'view',
  live_music: 'live_music',
}

/** How the gap is named to the user — vi / en. One list for prompt and stream. */
export const HARD_GAP_WORDS: Record<Hard, [string, string]> = {
  quiet: ['yên tĩnh', 'quiet'], parking: ['chỗ đậu xe', 'parking'], kids: ['phù hợp trẻ em', 'kid-friendliness'],
  vegetarian: ['món chay', 'vegetarian options'], outdoor: ['chỗ ngồi ngoài trời', 'outdoor seating'],
  private_room: ['phòng riêng', 'a private room'], late_open: ['giờ mở khuya', 'late opening'],
  delivery: ['giao hàng / mang về', 'delivery or takeaway'], air_con: ['máy lạnh', 'air conditioning'], view: ['view', 'a view'],
  live_music: ['nhạc sống', 'live music'], wheelchair: ['tiếp cận xe lăn', 'wheelchair access'],
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

/** Hard constraints a result row can vouch for on its own (no review text needed). */
export function rowSupportedHards(rows: readonly unknown[]): Hard[] {
  const out = new Set<Hard>()
  for (const row of rows) {
    const x = (row ?? {}) as Record<string, unknown>
    if (x.has_delivery === true || x.has_order === true) out.add('delivery')
  }
  return [...out]
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
  const rep: HardGapReport = { gaps: [], contrary: [], assumed: [], rowBacked: [], unclassified: [] }
  const fromRows = new Set(rowSupportedHards(opts.rows ?? []))
  for (const h of hard) {
    const group = hardGroupOf(h)
    if (!(h in HARD_GROUP)) rep.unclassified.push(h)
    if (group === 'ROW_FLAG_BACKED') {
      if (fromRows.has(h)) rep.rowBacked.push(h); else rep.gaps.push(h)
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
  return parts.length > 0 ? parts.join(' ') : null
}

/** Back-compat shape used by the prompt and the stream: the gaps only. */
export function hardConstraintGaps(hard: readonly Hard[], attrs: ReadonlyMap<string, AttributeEvidence[]>, rowSupported: Iterable<Hard> = []): Hard[] {
  const rows = [...rowSupported].map(h => (h === 'delivery' ? { has_delivery: true } : {}))
  return classifyHardGaps(hard, attrs, { rows }).gaps
}
