// ── Plan tiers: what each plan may use (owner 01/11/2026) ─────────────────────────────────────────────────────────────────────────────────
//
// Display names (owner): Pip = Free · MoMo = Trial (7 days, once) · Coco = Pro · Tappy = Promax. The plan ids stored in subscriptions stay as
// they are (free / pip / momo / coco / milo / sunny / pro); this maps them to a TIER, and the tier decides the composer modes the server
// runs and the Deep Research allowance per VN calendar month:
//   free   (guest, anonymous, free)                       - Chat only, answered by the model's own ability (14/11/2026: NO tools — no search, no realtime, no partner links); no Web / Thinking / Deep Research
//   pro    (pip = MoMo trial, momo / coco = Coco, and the older milo / sunny / pro while they last) - every mode, Deep Research 10 a month
//   promax (promax1m / promax3m = Tappy)                   - every mode, Deep Research 30 a month
// The SERVER enforces it (a mode the tier does not have runs as Chat); the client only hides what it cannot use. Pure.
import type { ChatMode } from '@/lib/ai/security/clientInput'

export type Tier = 'free' | 'pro' | 'promax'

/** Plan ids of the Promax tier (the Tappy plans). */
const PROMAX_PLANS: ReadonlySet<string> = new Set(['promax1m', 'promax3m'])

export function tierOf(plan: string | null | undefined): Tier {
  if (!plan || plan === 'free' || plan === 'guest') return 'free'
  return PROMAX_PLANS.has(plan) ? 'promax' : 'pro'
}

const MODES: Record<Tier, ReadonlySet<ChatMode>> = {
  free: new Set<ChatMode>(['chat']),
  pro: new Set<ChatMode>(['chat', 'web', 'think', 'deep', 'auto']),
  promax: new Set<ChatMode>(['chat', 'web', 'think', 'deep', 'auto']),
}

/**
 * Owner 14/11/2026: Free answers with the model's own ability only (no web search, no realtime lookup, no partner links); Pro / Trial / Promax answer
 * with Luna plus Serper, Parallel and the affiliate partners. With the plans on sale the route gives a Free turn no tools at all.
 */
export const TIER_HAS_TOOLS: Readonly<Record<Tier, boolean>> = { free: false, pro: true, promax: true }

/** The mode the server runs: the one asked for when the tier has it, else Chat. */
export function modeForTier(mode: ChatMode, tier: Tier): ChatMode {
  return MODES[tier].has(mode) ? mode : 'chat'
}

/**
 * Owner 11/11/2026: two separate monthly allowances of reports, each metered on its own counter. Pro (Coco and the trial): 5 Standard + 5 Advanced; Promax (Tappy): 10 Standard + 15 Advanced; Free none.
 * (Before: one total of 10 / 30 with Advanced a sub-allowance of 3 / 10, so an account that never asked for Advanced could run 10 Standard.) An Advanced request past its allowance runs as the existing
 * engine and spends from the Standard one; a Standard request past its allowance is refused, never silently turned into a thinner report.
 */
export const STANDARD_RESEARCH_MONTHLY: Readonly<Record<Tier, number>> = { free: 0, pro: 5, promax: 10 }
export const ADVANCED_RESEARCH_MONTHLY: Readonly<Record<Tier, number>> = { free: 0, pro: 5, promax: 15 }
/** Reports of both kinds per VN month: the sum, for display and for "has any allowance at all". */
export const DEEP_RESEARCH_MONTHLY: Readonly<Record<Tier, number>> = { free: 0, pro: STANDARD_RESEARCH_MONTHLY.pro + ADVANCED_RESEARCH_MONTHLY.pro, promax: STANDARD_RESEARCH_MONTHLY.promax + ADVANCED_RESEARCH_MONTHLY.promax }

/** Standard reports an account may start per VN month, by the same plans-on / plans-off rule as the other limits. Pure. */
export function standardResearchMonthlyLimit(tier: Tier, opts: { subscriptionsOn: boolean; signedIn: boolean }): number {
  if (opts.subscriptionsOn) return STANDARD_RESEARCH_MONTHLY[tier]
  return opts.signedIn ? STANDARD_RESEARCH_MONTHLY[tier === 'free' ? 'pro' : tier] : 0
}

/** Advanced reports an account may start per VN month, by the same plans-on / plans-off rule as deepResearchMonthlyLimit. Pure. */
export function advancedResearchMonthlyLimit(tier: Tier, opts: { subscriptionsOn: boolean; signedIn: boolean }): number {
  if (opts.subscriptionsOn) return ADVANCED_RESEARCH_MONTHLY[tier]
  return opts.signedIn ? ADVANCED_RESEARCH_MONTHLY[tier === 'free' ? 'pro' : tier] : 0
}

/**
 * The Deep Research runs an account may start per VN month. Security audit 04/11 (W-01): this used to be metered only with the plans on sale
 * (SUBSCRIPTIONS_ENABLED); with the flag off any account could start unlimited runs at ~0.06 USD each. Now the meter does not depend on the flag:
 *   plans on sale  - the tier's own allowance (Free 0 - those turns already run as Chat);
 *   plans off      - a signed-in account gets the Coco allowance (every mode stays open before launch), a visitor none (their turn runs as Chat).
 * Pure.
 */
export function deepResearchMonthlyLimit(tier: Tier, opts: { subscriptionsOn: boolean; signedIn: boolean }): number {
  if (opts.subscriptionsOn) return DEEP_RESEARCH_MONTHLY[tier]
  return opts.signedIn ? DEEP_RESEARCH_MONTHLY[tier === 'free' ? 'pro' : tier] : 0
}
