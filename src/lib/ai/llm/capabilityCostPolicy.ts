import type { BudgetTier } from './budgetTiers'
import type { ModelRole } from './types'

// ── Capability Cost Policy ────────────────────────────────────────────────
// Metadata only — a preferred budget tier per semantic role, for a FUTURE
// cost-aware Provider Policy to consult. The CURRENT Provider Policy
// (policy.ts) and Router (router.ts) do not import this file at all
// (verified in golden.test.ts) — production routing is completely
// unaffected by anything in this table. See ADR-015.
//
// Mapped onto this codebase's real ModelRole taxonomy (fast/smart/planning/
// vision), not a separate parallel one. The sprint brief's illustrative
// FAST_CHAT/SMART_CHAT/OCR/VISION categories correspond to 'fast'/'smart'/(a
// subset of) 'vision' here — but this codebase does not yet distinguish
// "cheap OCR-style vision" (api/scan/route.ts) from "richer vision analysis"
// (lib/explore/contentProcessor.ts) as separate roles; both are 'vision'
// today. Splitting that out — so OCR could carry its own LOW-tier policy
// distinct from VISION's HIGH-tier — is a capability-taxonomy change, out of
// scope for this foundation-only sprint.
export const CAPABILITY_COST_POLICY: Record<ModelRole, BudgetTier> = {
  fast: 'LOW',
  smart: 'HIGH',
  planning: 'PREMIUM',
  vision: 'HIGH',
}
