// Research Admission (R13 §4.2.1-4.2.3). Pure, deterministic, server-side: NO model call (Luna is never asked which tier a report is).
//
// Two decisions live here:
//   admitResearch()      → before any billable retrieval: is this report STANDARD (Haiku, one focused dossier) or ADVANCED (Sonnet-led)?
//   promoteAfterEvidence() → after retrieval: did the evidence create a hard trigger? Promotion happens once per request, is recorded, and never goes down.
// Rules taken from R13: any hard trigger overrides the score; score 0-3 is Standard, 4-10 Advanced; there is no silent downgrade to fit a budget;
// every new user turn is admitted on its own (a previous turn's tier is never inherited).
// The thresholds below are INITIAL DEFAULTS (R13 asks for them to be benchmarked before design freeze); they are data in this one file and carry a policy version.
// Behind RESEARCH_ADMISSION: OFF unless exactly "1", locked in a production runtime. Not wired into the chat route yet.

import { lockedInProduction } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>

export const RESEARCH_ADMISSION_FLAG = 'RESEARCH_ADMISSION'
export const researchAdmissionOn = (env: Env = process.env): boolean => env[RESEARCH_ADMISSION_FLAG] === '1' && !lockedInProduction(env, RESEARCH_ADMISSION_FLAG)

export const ADMISSION_POLICY_VERSION = 'research-admission.v1'

export type ResearchTier = 'STANDARD_REPORT' | 'ADVANCED_RESEARCH_REPORT'

export type HardTrigger =
  | 'DEPENDENT_STAGES'
  | 'FOUR_PLUS_DIMENSIONS'
  | 'TWO_PLUS_SUPPLEMENTAL_ROUNDS'
  | 'NINE_PLUS_SOURCES_THREE_FAMILIES'
  | 'MULTI_MARKET_OR_PERIOD'
  | 'QUANTITATIVE_ANALYSIS'
  | 'MATERIAL_EVIDENCE_CONFLICT'

export type AnalysisKind = 'SUMMARY' | 'COMPARISON' | 'SCENARIO'

/** What the server knows about the request. Counts are of DISTINCT things (dimensions, markets), not words. */
export interface ResearchSignals {
  /** distinct analysis dimensions the user requires (0 is treated as 1) */
  dimensions: number
  /** do later research questions depend on earlier findings? */
  dependentStages: boolean
  /** distinct markets/jurisdictions OR distinct time periods that must be compared */
  marketsOrPeriods: number
  analysis: AnalysisKind
  /** one concise report, a multi-section report, or linked deliverables that need cross-section integration */
  output: 'CONCISE' | 'MULTI_SECTION' | 'LINKED_DELIVERABLES'
  /** known only after retrieval; absent before it */
  evidence?: EvidenceStats
}

export interface EvidenceStats {
  /** independent sources after deduplication and syndication detection (several pages of one publisher count once) */
  independentSources: number
  /** distinct source families/domains among them */
  sourceFamilies: number
  /** supplemental retrieval rounds already needed after the primary pass */
  supplementalRounds: number
  /** conflicts that must be traced and reconciled, not merely noted */
  materialConflicts: number
}

export interface ScoreBreakdown { scope: number; taskGraph: number; evidence: number; analysis: number; output: number; total: number }

export interface AdmissionDecision {
  tier: ResearchTier
  score: ScoreBreakdown
  triggers: HardTrigger[]
  /** why this tier: a hard trigger beats the score */
  reason: 'HARD_TRIGGER' | 'SCORE_ADVANCED' | 'SCORE_STANDARD'
  policyVersion: string
}

const clamp02 = (n: number): number => Math.max(0, Math.min(2, n))

/** The five R13 §4.2.3 dimensions, each 0-2. Evidence burden is 0 until evidence is known. */
export function scoreSignals(s: ResearchSignals): ScoreBreakdown {
  const dims = Math.max(1, Math.floor(s.dimensions || 1))
  const scope = s.marketsOrPeriods >= 2 || dims >= 4 ? 2 : dims >= 2 ? 1 : 0
  const taskGraph = s.dependentStages ? 2 : dims >= 2 ? 1 : 0
  const e = s.evidence
  const evidence = !e ? 0 : e.materialConflicts > 0 || e.supplementalRounds > 0 || e.sourceFamilies >= 3 ? 2 : e.independentSources >= 4 ? 1 : 0
  const analysis = s.analysis === 'SCENARIO' ? 2 : s.analysis === 'COMPARISON' ? 1 : 0
  const output = s.output === 'LINKED_DELIVERABLES' ? 2 : s.output === 'MULTI_SECTION' ? 1 : 0
  const parts = { scope: clamp02(scope), taskGraph: clamp02(taskGraph), evidence: clamp02(evidence), analysis: clamp02(analysis), output: clamp02(output) }
  return { ...parts, total: parts.scope + parts.taskGraph + parts.evidence + parts.analysis + parts.output }
}

/** The seven hard triggers of R13 §4.2.2 that the signals show. Pure. */
export function hardTriggersOf(s: ResearchSignals): HardTrigger[] {
  const t: HardTrigger[] = []
  if (s.dependentStages) t.push('DEPENDENT_STAGES')
  if (s.dimensions >= 4) t.push('FOUR_PLUS_DIMENSIONS')
  if (s.marketsOrPeriods >= 2) t.push('MULTI_MARKET_OR_PERIOD')
  if (s.analysis === 'SCENARIO') t.push('QUANTITATIVE_ANALYSIS')
  const e = s.evidence
  if (e) {
    if (e.supplementalRounds >= 2) t.push('TWO_PLUS_SUPPLEMENTAL_ROUNDS')
    if (e.independentSources >= 9 && e.sourceFamilies >= 3) t.push('NINE_PLUS_SOURCES_THREE_FAMILIES')
    if (e.materialConflicts >= 1) t.push('MATERIAL_EVIDENCE_CONFLICT')
  }
  return t
}

/**
 * Admit one NEW user turn. Before retrieval, so evidence-based triggers cannot fire yet. Hard trigger → Advanced; else score 4-10 → Advanced; else Standard.
 * Takes no previous tier on purpose: a follow-up never inherits the tier of an earlier turn.
 */
export function admitResearch(signals: ResearchSignals): AdmissionDecision {
  const { evidence: _ignored, ...beforeRetrieval } = signals
  void _ignored
  const score = scoreSignals(beforeRetrieval)
  const triggers = hardTriggersOf(beforeRetrieval)
  if (triggers.length > 0) return { tier: 'ADVANCED_RESEARCH_REPORT', score, triggers, reason: 'HARD_TRIGGER', policyVersion: ADMISSION_POLICY_VERSION }
  if (score.total >= 4) return { tier: 'ADVANCED_RESEARCH_REPORT', score, triggers, reason: 'SCORE_ADVANCED', policyVersion: ADMISSION_POLICY_VERSION }
  return { tier: 'STANDARD_REPORT', score, triggers, reason: 'SCORE_STANDARD', policyVersion: ADMISSION_POLICY_VERSION }
}

export interface PromotionRecord { from: ResearchTier; to: ResearchTier; triggers: HardTrigger[]; policyVersion: string; reason: 'EVIDENCE_HARD_TRIGGER' }

export type PromotionResult =
  | { promoted: false; tier: ResearchTier; why: 'ALREADY_ADVANCED' | 'ALREADY_PROMOTED_ONCE' | 'NO_NEW_TRIGGER' }
  | { promoted: true; tier: 'ADVANCED_RESEARCH_REPORT'; record: PromotionRecord }

/**
 * After retrieval: evidence may create a hard trigger for a Standard report. Promotion is allowed ONCE per request (R13 default), is recorded, and only goes up.
 * The caller must reserve the Sonnet + verifier budget before dispatching the Advanced pipeline; if it cannot, it stops with a limitation, it does NOT fall back to a cheaper tier.
 */
export function promoteAfterEvidence(current: ResearchTier, signals: ResearchSignals, alreadyPromoted: boolean): PromotionResult {
  if (current === 'ADVANCED_RESEARCH_REPORT') return { promoted: false, tier: current, why: 'ALREADY_ADVANCED' }
  if (alreadyPromoted) return { promoted: false, tier: current, why: 'ALREADY_PROMOTED_ONCE' }
  const evidenceTriggers = hardTriggersOf(signals).filter(t => t === 'TWO_PLUS_SUPPLEMENTAL_ROUNDS' || t === 'NINE_PLUS_SOURCES_THREE_FAMILIES' || t === 'MATERIAL_EVIDENCE_CONFLICT')
  if (evidenceTriggers.length === 0) return { promoted: false, tier: current, why: 'NO_NEW_TRIGGER' }
  return { promoted: true, tier: 'ADVANCED_RESEARCH_REPORT', record: { from: current, to: 'ADVANCED_RESEARCH_REPORT', triggers: evidenceTriggers, policyVersion: ADMISSION_POLICY_VERSION, reason: 'EVIDENCE_HARD_TRIGGER' } }
}

/**
 * Standard report bounds (R13 §4.2.1). Advanced bounds are set by the Controller after it validates Sonnet's task graph, not here.
 */
export const STANDARD_BOUNDS = { maxWorkPackages: 3, targetSources: 8, supplementalPasses: 1 } as const

/**
 * What one Standard run is held to by the engine (runDeepResearch's `bounds`): up to 8 plan steps, 2 queries a step, one gap round of at most 2 follow-up steps.
 * A plan STEP is a section of the report that gets its own searches (market size, brands, prices, channels...): an ordinary report has five to eight of them. It is NOT R13's "independent
 * work package" (a separately analysed dimension); counting the two as one sent every report to Advanced (owner 11/11: "tất cả báo cáo đều là Advanced"). What makes a report Advanced is the
 * admission's own triggers (forecast or scenario analysis, dependent stages, several markets or periods, four or more dimensions the PERSON listed) and, later, evidence triggers. A plan
 * larger than this is still refused, because that really is a very wide request.
 * 11/11 LIVE MEASURE: the ceiling was 8 and the first real Standard run on "Xu hướng thị trường trà sữa tại Hà Nội" planned 9 steps (the planner's own sections plus the press step plus a step for a
 * part no section covered) and was refused; the same question had planned 7 the time before. The step count of a model-written plan VARIES from run to run, so no small ceiling can separate the
 * tiers. The ceiling is therefore the plan's own cap (planSteps 10 + PART_STEPS 3 = 13): a safety limit that an ordinary plan never reaches, not a trigger.
 */
export const STANDARD_RUN_BOUNDS = { maxSteps: 13, queriesPerStep: 2, gapRounds: STANDARD_BOUNDS.supplementalPasses, followUpSteps: 2 } as const
