// The route's one question about a Deep Research turn (R13): which tier takes it? Pure given its inputs; the route passes the environment and whether the Anthropic key is present.
//
// Standard runs only when ALL hold: RESEARCH_ADMISSION is on (off by default, locked in production), Claude is available (neither tier has a Luna path of its own), and the server's
// admission of THIS message is STANDARD_REPORT with the request not ambiguous. Advanced additionally needs RESEARCH_ADVANCED on (dearer: Sonnet leads), and the route
// checks the account's Advanced sub-allowance before using it. Anything else returns null and the route runs the existing engine exactly as before.
// The returned audit has names and numbers only, never the user's words.

import { admitResearch, researchAdmissionOn, STANDARD_RUN_BOUNDS, type AdmissionDecision, type ResearchTier } from './researchAdmission'
import { ADVANCED_RUN_BOUNDS } from './researchController'
import { signalsFromRequest } from './researchSignals'
import { lockedInProduction } from '@/lib/config/consultFlags'
import type { RunBounds } from './deepResearch'

type Env = Record<string, string | undefined>

export const RESEARCH_ADVANCED_FLAG = 'RESEARCH_ADVANCED'
/** Pure. Advanced needs its own flag AND RESEARCH_ADMISSION; OFF unless exactly "1", locked in a production runtime. */
export const researchAdvancedOn = (env: Env = process.env): boolean => researchAdmissionOn(env) && env[RESEARCH_ADVANCED_FLAG] === '1' && !lockedInProduction(env, RESEARCH_ADVANCED_FLAG)

export interface TierTurnPlan { tier: ResearchTier; bounds: RunBounds; decision: AdmissionDecision; cues: string[] }
export type StandardTurnPlan = TierTurnPlan

/** The tier plan of this message, or null (flag off, no Claude, ambiguous, or Advanced while its own flag is off). */
export function tierTurnFor(message: string, o: { env?: Env; claudeAvailable: boolean }): TierTurnPlan | null {
  const env = o.env ?? process.env
  if (!researchAdmissionOn(env) || !o.claudeAvailable) return null
  const { signals, ambiguous, cues } = signalsFromRequest(message)
  if (ambiguous) return null
  const decision = admitResearch(signals)
  if (decision.tier === 'STANDARD_REPORT') return { tier: decision.tier, bounds: { ...STANDARD_RUN_BOUNDS }, decision, cues }
  if (!researchAdvancedOn(env)) return null
  return { tier: decision.tier, bounds: { ...ADVANCED_RUN_BOUNDS }, decision, cues }
}

/** Kept for the Standard-only callers: the plan only when the tier is Standard. */
export function standardTurnFor(message: string, o: { env?: Env; claudeAvailable: boolean }): StandardTurnPlan | null {
  const p = tierTurnFor(message, o)
  return p && p.tier === 'STANDARD_REPORT' ? p : null
}
