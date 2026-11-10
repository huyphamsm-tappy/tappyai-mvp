// The route's one question about a Deep Research turn (R13): does the Standard tier take it? Pure given its inputs; the route passes the environment and whether the Anthropic key is present.
//
// Standard runs only when ALL hold: RESEARCH_ADMISSION is on (off by default, locked in production), Claude Haiku is available (the tier has no Luna path of its own), and the server's
// admission of THIS message is STANDARD_REPORT with the request not ambiguous. Anything else returns null and the route runs the existing engine exactly as before.
// The returned audit has names and numbers only, never the user's words.

import { admitResearch, researchAdmissionOn, STANDARD_RUN_BOUNDS, type AdmissionDecision } from './researchAdmission'
import { signalsFromRequest } from './researchSignals'
import type { RunBounds } from './deepResearch'

export interface StandardTurnPlan { bounds: RunBounds; decision: AdmissionDecision; cues: string[] }

export function standardTurnFor(message: string, o: { env?: Record<string, string | undefined>; claudeAvailable: boolean }): StandardTurnPlan | null {
  if (!researchAdmissionOn(o.env ?? process.env) || !o.claudeAvailable) return null
  const { signals, ambiguous, cues } = signalsFromRequest(message)
  if (ambiguous) return null
  const decision = admitResearch(signals)
  if (decision.tier !== 'STANDARD_REPORT') return null
  return { bounds: { ...STANDARD_RUN_BOUNDS }, decision, cues }
}
