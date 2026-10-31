// ── Plan tiers: what each plan may use (owner 01/11/2026) ─────────────────────────────────────────────────────────────────────────────────
//
// Display names (owner): Pip = Free · MoMo = Trial (7 days, once) · Coco = Pro · Tappy = Promax. The plan ids stored in subscriptions stay as
// they are (free / pip / momo / coco / milo / sunny / pro); this maps them to a TIER, and the tier decides the composer modes the server
// runs and the Deep Research allowance per VN calendar month:
//   free   (guest, anonymous, free)                       - Chat only (Luna 6.0, the model's own quick lookup); no Web / Thinking / Deep Research
//   pro    (pip = MoMo trial, momo / coco = Coco, and the older milo / sunny / pro while they last) - every mode, Deep Research 10 a month
//   promax (promax1m / promax3m = Tappy)                   - every mode, Deep Research 69 a month
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
  pro: new Set<ChatMode>(['chat', 'web', 'think', 'deep']),
  promax: new Set<ChatMode>(['chat', 'web', 'think', 'deep']),
}

/** The mode the server runs: the one asked for when the tier has it, else Chat. */
export function modeForTier(mode: ChatMode, tier: Tier): ChatMode {
  return MODES[tier].has(mode) ? mode : 'chat'
}

/** Deep Research runs per VN calendar month (owner: Coco/Pro 10, Tappy/Promax 69; Free none). */
export const DEEP_RESEARCH_MONTHLY: Readonly<Record<Tier, number>> = { free: 0, pro: 10, promax: 69 }
