import type { CheckResult, RiskLevel } from './types'
import type { ScenarioMatch } from './knowledge/match'
import { datasetOf } from './knowledge'
import { scamVerdictText } from '@/lib/i18n/scamVerdict'

// Scam Shield · the public verdict vocabulary (owner 02/10 — legal risk).
//
// The engine scores internally (kept for ranking, tests and old app builds) but NEVER tells a person
// "safe". Three states only, for a message, a link or a QR link:
//
//   familiar     — a known scam shape / link traits common in fake links
//   suspicious   — some specific suspicious signs
//   unrecognized — "no familiar signs recognised — this does NOT mean it is safe"
//
// 🔑 SERVER CONTRACT. `risk.level` is read by the Android and iOS apps, which print their own
// "An toàn" for `SAFE` (and "Nguy cơ thấp" for `LOW`). They are not rebuilt for this release, so the
// server never sends them either: `SAFE` and `LOW` are reported as `INCONCLUSIVE`, which both apps
// already draw as a neutral "could not conclude" and never as a green shield. `risk.score` stays in
// the JSON (the old apps decode it as a non-null Int) but no web screen shows it. New clients should
// read `verdict` and `scenario` (added fields — nothing was renamed or removed).

export type Verdict = 'familiar' | 'suspicious' | 'unrecognized'

/** SAFE / LOW are not shown to anyone: they become INCONCLUSIVE. MEDIUM and above pass through. */
export function publicLevel(level: RiskLevel): RiskLevel {
  return level === 'SAFE' || level === 'LOW' ? 'INCONCLUSIVE' : level
}

/** A LINK (or a link read from a QR): HIGH/CRITICAL = "traits common in fake links". */
export function linkVerdict(level: RiskLevel): Verdict {
  if (level === 'HIGH' || level === 'CRITICAL') return 'familiar'
  if (level === 'MEDIUM') return 'suspicious'
  return 'unrecognized'
}

/** A MESSAGE: a strong scenario match or a HIGH/CRITICAL fused level = familiar; MEDIUM or a weak match = suspicious. */
export function messageVerdict(level: RiskLevel, match: ScenarioMatch | null): Verdict {
  if (match?.strength === 'strong' || level === 'HIGH' || level === 'CRITICAL') return 'familiar'
  if (match?.strength === 'weak' || level === 'MEDIUM') return 'suspicious'
  return 'unrecognized'
}

/** The scenario block a client renders under a familiar/suspicious message verdict. Static, sourced. */
export interface ScenarioBlock {
  id: string
  officialNumber: number
  title: string
  summary: string
  warningSigns: string[]
  whatToDo: string[]
  whatNotToDo: string[]
  source: { organization: string; title: string; url: string; publishedAt?: string }
  hotline: string
  strength: 'strong' | 'weak'
}

export function scenarioBlock(match: ScenarioMatch): ScenarioBlock {
  const s = match.scenario
  return {
    id: s.id,
    officialNumber: s.officialNumber,
    title: s.official.title,
    summary: s.official.summary,
    warningSigns: s.guidance.warningSigns,
    whatToDo: s.guidance.whatToDo,
    whatNotToDo: s.guidance.whatNotToDo,
    source: { organization: s.source.organization, title: s.source.title, url: s.source.url, publishedAt: s.source.publishedAt },
    hotline: datasetOf(s).official.hotline,
    strength: match.strength,
  }
}

/** The sentence printed as the verdict title, in the caller's locale. */
export function verdictTitle(kind: 'message' | 'link', verdict: Verdict, locale: 'vi' | 'en'): string {
  return scamVerdictText(locale, kind === 'link' ? `scamVerdict.link.${verdict}.title` : `scamVerdict.${verdict}.title`)
}

export function verdictBody(kind: 'message' | 'link', verdict: Verdict, locale: 'vi' | 'en'): string {
  return scamVerdictText(locale, kind === 'link' ? `scamVerdict.link.${verdict}.body` : `scamVerdict.${verdict}.body`)
}

/** Apply the public vocabulary to a link/QR check result (idempotent). */
export function toPublicCheckResult<T extends CheckResult>(r: T): T & { verdict: Verdict } {
  const verdict = linkVerdict(r.risk.level)
  return { ...r, risk: { ...r.risk, level: publicLevel(r.risk.level) }, verdict }
}
