import type { TappyPlan } from '@/components/TripPlanCard'
import { projectPlanPrices } from '@/lib/plans/planPrice'

// ── The [TAPPY_PLAN] reader ─────────────────────────────────────────────────
//
// 🔑 MOVED HERE FROM `ChatInterface.tsx`, UNCHANGED, FOR ONE REASON: the Planner
// (`/planner`) derives My Plans from the SAME persisted marker, and it does that on the
// SERVER. Importing this out of `ChatInterface` would have dragged a 'use client' module
// — posthog, the streaming hooks, the whole chat surface — into a server component, and
// the obvious alternative (a second copy of the regex in `src/lib/planner`) is worse: two
// readers of one wire format drift the day either side is touched, and the one that
// drifts silently is the one nobody is looking at.
//
// So there is still exactly ONE parser. `ChatInterface` re-exports it, which is why the
// four existing test files that import `parsePlan` from '@/components/ChatInterface'
// still do, and still pass, without an edit.
//
// 🚨 THE TYPE IMPORT IS `import type` ON PURPOSE. `TappyPlan` lives in `TripPlanCard`,
// which is 'use client'. A type-only import is erased at compile time, so this module
// stays server-safe. Do not turn it into a value import.
//
// 🚨 THIS FILE DOES NOT OWN THE JSON CONTRACT. `TappyPlan` is emitted by the model under
// the spec in `src/lib/ai/promptBuilder.ts` and is mirrored, field for field, by Android
// (`ChatResponse.kt`) and iOS (`ChatModels.swift`). Widening or renaming anything here
// breaks two shipped apps. Read the shape; never redefine it.

/**
 * Extracts the trip/evening plan block and removes every trace of it from the visible text.
 *
 * P0-1. This used to handle only the CLOSED form, and returned the ORIGINAL content whenever the
 * payload failed to parse — so four shapes leaked the raw block to the user:
 *
 *   • unterminated — a planning turn runs at maxTokens 4096 and the rulebook explicitly tells the
 *     model not to shorten a plan, so a reply that stops at finishReason "length" ends mid-JSON.
 *     That is a normal outcome, not a corrupt stream.
 *   • orphan open / orphan close — a tag whose partner never arrived.
 *   • malformed — `JSON.parse` threw and the early return handed back the untouched content.
 *
 * The strip is now unconditional and independent of whether a plan was successfully decoded, which
 * is the same shape parseCTA already uses after its own leak incident. Stripping is deliberately
 * separated from decoding: a block we cannot understand is still a block the user must not read.
 */
export function parsePlan(content: string): { text: string; plan: TappyPlan | null } {
  const planMatch = content.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/i)

  // Closed block, then a still-arriving one at the tail, then any orphan tag. The unterminated
  // pattern is END-ANCHORED so a mid-text open tag falls through to the orphan strip instead of
  // swallowing the rest of the reply.
  const text = content
    .replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/gi, '')
    .replace(/\[TAPPY_PLAN\][\s\S]*$/i, '')
    .replace(/\[\/?TAPPY_PLAN\]/gi, '')
    .trimEnd()

  if (!planMatch) return { text, plan: null }
  try {
    const plan = JSON.parse(planMatch[1].trim()) as TappyPlan
    if (!plan.days || !Array.isArray(plan.days)) return { text, plan: null }
    // A "no price" sentinel is not a price: every plan surface reads through here, so it is
    // dropped once, here, and never reaches a price chip or a budget row (planPrice.ts).
    return { text, plan: projectPlanPrices(plan) }
  } catch {
    return { text, plan: null }
  }
}
