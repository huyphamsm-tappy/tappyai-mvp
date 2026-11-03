// ── 03/11: cost experiments of Deep Research, one flag each (measured, then kept or dropped) ─────────────────────────────────────────────
//
// Each flag is OFF unless its variable is EXACTLY "1", and is locked OFF in a production runtime (the same rule as every consult flag: lockedInProduction).
// OFF is the limit the code has today. Each flag lowers ONE thing, so a run can be priced and graded change by change:
//   DEEP_RESEARCH_LEAN_PLAN_ROLE  the plan and the gap check run on the cheap 'intent' role again (no reasoning), not on 'plan'
//   DEEP_RESEARCH_LEAN_PLAN_STEPS the plan keeps at most 8 steps (not 10)
//   DEEP_RESEARCH_LEAN_QUERIES    a step runs at most 2 queries (not 3)
//   DEEP_RESEARCH_LEAN_GAPS       the follow-up round adds at most 2 steps (not 4)
//   DEEP_RESEARCH_LEAN_PAGE       a page is cut at 6000 characters (not 9000)

import { lockedInProduction } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>

export const DEEP_RESEARCH_LEAN_FLAGS = {
  planRole: 'DEEP_RESEARCH_LEAN_PLAN_ROLE',
  planSteps: 'DEEP_RESEARCH_LEAN_PLAN_STEPS',
  queries: 'DEEP_RESEARCH_LEAN_QUERIES',
  gaps: 'DEEP_RESEARCH_LEAN_GAPS',
  page: 'DEEP_RESEARCH_LEAN_PAGE',
} as const

export type DeepResearchLeanKey = keyof typeof DEEP_RESEARCH_LEAN_FLAGS

/** Pure. Is this cost experiment on? Exactly "1", and never in a production runtime. */
export function deepResearchLeanOn(key: DeepResearchLeanKey, env: Env = process.env): boolean {
  const name = DEEP_RESEARCH_LEAN_FLAGS[key]
  return env[name] === '1' && !lockedInProduction(env, name)
}

/** Pure. `normal` unless the experiment `key` is on, then `lean`. */
export function leanValue<T>(key: DeepResearchLeanKey, normal: T, lean: T, env: Env = process.env): T {
  return deepResearchLeanOn(key, env) ? lean : normal
}
