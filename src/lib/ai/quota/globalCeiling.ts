import { publicDailyRateLimit } from '@/lib/security/publicRateLimit'

/**
 * Security audit 04/11 (D-09): a daily ceiling across ALL callers for the most expensive turn (a Deep Research run, ~0.09 USD with its
 * searches). The per-account allowance bounds one account; this bounds the day when many accounts are used together. It is a circuit breaker,
 * not a plan limit: the default (300 runs, about 27 USD) is far above any day so far, and AI_GLOBAL_DEEP_DAILY changes it without a deploy
 * of code. Shared across instances through the same store as the other public limiters.
 */
export const GLOBAL_DEEP_DAILY_DEFAULT = 300

export function globalDeepDailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.AI_GLOBAL_DEEP_DAILY)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : GLOBAL_DEEP_DAILY_DEFAULT
}

/** Counts one run against today's global ceiling; false when the day's ceiling is already used. */
export async function withinGlobalDeepCeiling(): Promise<boolean> {
  return (await publicDailyRateLimit('ai-global:deep', globalDeepDailyLimit())).ok
}
