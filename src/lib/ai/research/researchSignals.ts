// Research signals (R13 §4.2.3): what the SERVER can read from the user's own request before any billable retrieval. Pure, deterministic, no model call.
//
// These are conservative text cues for Vietnamese and English, feeding admitResearch(). They are heuristics, so they are built to under-claim: a cue that is not clearly there
// counts as absent, because promoting a report to Advanced costs a Sonnet planning and synthesis pass. A request that is genuinely ambiguous is reported as `ambiguous`
// so the caller can ask one clarifying question instead of silently guessing (R13: ambiguity that changes scope is clarified, not silently routed).
// Only the CURRENT message is read: nothing from earlier turns is inherited.

import type { AnalysisKind, ResearchSignals } from './researchAdmission'

export const SIGNALS_MAX_CHARS = 4000

/** lower-case, no diacritics, đ → d, single spaces. Cues are matched on this form. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Markets and jurisdictions the cues know about (folded). A comparison across two or more is "multi-market".
const MARKETS: ReadonlyArray<readonly [string, RegExp]> = [
  ['vn', /\b(viet ?nam|vietnam)\b/],
  ['th', /\b(thai ?lan|thailand)\b/],
  ['sg', /\b(singapore|sin-?ga-?po)\b/],
  ['jp', /\b(nhat ban|japan)\b/],
  ['kr', /\b(han quoc|korea)\b/],
  ['cn', /\b(trung quoc|china)\b/],
  ['us', /\b(nuoc my|hoa ky|usa|united states)\b/],
  ['id', /\b(indonesia)\b/],
  ['my', /\b(malaysia)\b/],
  ['ph', /\b(philippines|phi-?lip-?pin)\b/],
  ['in', /\b(an do|india)\b/],
  ['eu', /\b(chau au|eu|europe|european union)\b/],
  ['uk', /\b(anh quoc|uk|united kingdom)\b/],
  ['au', /\b(nuoc uc|australia)\b/],
]

const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/g

/** distinct markets named, or distinct years named (a multi-period comparison), whichever is larger */
export function marketsOrPeriodsOf(folded: string): number {
  const markets = MARKETS.filter(([, re]) => re.test(folded)).length
  const years = new Set(folded.match(YEAR) ?? []).size
  return Math.max(1, markets, years)
}

const LIST_ITEM = /^\s*(?:\d{1,2}[.)]|[-*•])\s+\S/gm
const AFTER_CUE = /(?:gom|bao gom|ve cac|ve|including|covering|cover|include)\s*[:\-]?\s*([^.\n?]{6,400})/

/** Distinct analysis dimensions the user asks for: list items, else the items after "gồm / bao gồm / about / including". */
export function dimensionsOf(original: string, folded: string): number {
  const items = (original.match(LIST_ITEM) ?? []).length
  if (items >= 2) return items
  const m = AFTER_CUE.exec(folded)
  if (m) {
    const parts = m[1].split(/\s*(?:,|;|\bva\b|\band\b)\s*/).filter(p => p.trim().length >= 3)
    if (parts.length >= 2) return parts.length
  }
  return 1
}

const DEPENDENT = /(dua tren ket qua|tuy (?:vao )?ket qua|sau do (?:tiep tuc|dua vao|dua tren)|buoc (?:tiep theo|sau) (?:dua|tuy|phu thuoc)|based on (?:what|the results|your findings)|depending on (?:what|the results|your findings)|then, based on|once you (?:find|have found))/
const SCENARIO = /(du bao|kich ban|phan tich do nhay|mo hinh hoa|forecast|scenario|sensitivity|what-?if|nguyen nhan (?:va|-) ?(?:tac dong|he qua)|causal|nhieu bien)/
const COMPARISON = /(so sanh|doi chieu|uu (?:va )?nhuoc|danh gia|compare|comparison|versus|trade-?offs?|\bvs\.?\b)/
const LINKED = /(nhieu bao cao|bao cao (?:con|thanh phan)|kem (?:theo )?(?:phu luc|bang so lieu|slide)|phu luc (?:va|kem)|sub-?reports?|linked reports?|appendix and)/
const REPORT = /(bao cao|report|tong hop|nghien cuu|phan tich|dossier|chuong|cac phan|section)/

export function analysisOf(folded: string): AnalysisKind {
  if (SCENARIO.test(folded)) return 'SCENARIO'
  if (COMPARISON.test(folded)) return 'COMPARISON'
  return 'SUMMARY'
}

export interface ExtractedSignals {
  signals: ResearchSignals
  /** the cues pull in two directions on scope (for example a multi-market request that also asks for something short): ask one question instead of guessing */
  ambiguous: boolean
  /** the cues that fired, for the audit trail (names only, never the user's words) */
  cues: string[]
}

/** Read the signals of ONE user message. The text is cut to SIGNALS_MAX_CHARS first. Pure. */
export function signalsFromRequest(message: string): ExtractedSignals {
  const original = String(message ?? '').slice(0, SIGNALS_MAX_CHARS)
  const folded = fold(original)
  const cues: string[] = []
  const dimensions = dimensionsOf(original, folded)
  if (dimensions > 1) cues.push(`dimensions:${dimensions}`)
  const dependentStages = DEPENDENT.test(folded)
  if (dependentStages) cues.push('dependent_stages')
  const marketsOrPeriods = marketsOrPeriodsOf(folded)
  if (marketsOrPeriods > 1) cues.push(`markets_or_periods:${marketsOrPeriods}`)
  const analysis = analysisOf(folded)
  if (analysis !== 'SUMMARY') cues.push(`analysis:${analysis.toLowerCase()}`)
  const output: ResearchSignals['output'] = LINKED.test(folded) ? 'LINKED_DELIVERABLES' : REPORT.test(folded) || dimensions >= 2 ? 'MULTI_SECTION' : 'CONCISE'
  if (output !== 'CONCISE') cues.push(`output:${output.toLowerCase()}`)
  // A request that names several markets or periods but also asks for something brief ("tóm tắt ngắn") pulls scope two ways.
  const asksBrief = /(tom tat ngan|ngan gon|1 doan|mot doan|in one paragraph|briefly|in a sentence)/.test(folded)
  const ambiguous = asksBrief && (marketsOrPeriods > 1 || dimensions >= 4)
  if (ambiguous) cues.push('ambiguous_scope')
  return { signals: { dimensions, dependentStages, marketsOrPeriods, analysis, output }, ambiguous, cues }
}
