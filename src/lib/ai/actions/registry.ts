// ── P0-2: the AI action registry ─────────────────────────────────────────────
//
// WHAT THIS IS FOR
//
// The V3 Security boundary is:
//
//   User → AI → policy/guardrails → permission/scope validation → Controller → deterministic backend
//
// Production had no such boundary for AI-initiated actions. `save_price_watch` decided AND
// executed a database write from inside the model's stream, with `createAdminClient()` — the
// service-role client, which bypasses RLS. It was correct in practice (it pinned `user_id` to an
// already-verified identity and capped the row count), but nothing in the architecture MADE it
// correct: the next write tool would have been written by copying it, and the safety would have
// been a property of one function rather than of the layer.
//
// WHAT THIS IS NOT
//
// Not a plugin framework, not a rewrite of `src/lib/controller/` (which is the back-office
// Controller — navigation, RBAC, org membership, outbox — and stays exactly as it is). Adding a
// second write action is one descriptor here plus one policy object; nothing else.
//
// WHY THE WHOLE TOOL SET IS LISTED, not just the write
//
// The audit that produced this work had to reconstruct "which AI tools can change state" by
// reading ten `tool({…})` blocks. That answer must be DATA, checkable by a test, or the next
// audit re-derives it by hand and the one that matters gets missed. `actionRegistry.test.ts`
// asserts this table and the route's tool list describe the same set.

/** What a tool does to the world. */
export type ActionEffect =
  /** Pure computation over data already in the request. No I/O. */
  | 'deterministic'
  /** Reads a third party. Changes no state, but is a cost and rate-limit surface. */
  | 'external_read'
  /** Changes state this application owns. */
  | 'write'

/** How hard the effect is to take back — what makes an action "consequential". */
export type Consequence =
  | 'none'
  /** The user can undo it themselves through normal product surfaces. */
  | 'reversible'
  /** Cannot be undone, or is visible to someone else the moment it happens. */
  | 'irreversible'

/**
 * Whether the user should confirm before the action runs.
 *
 * Phase 0 declares the CONTRACT and enforces everything server-side; the UI that presents a
 * confirmation is V3 UX/UI work (owner decision D4). Recording the requirement here rather than in
 * a design document is what lets that UI be built later without re-deciding which actions need it
 * — and what makes "we never asked the user" a visible property of the table instead of an
 * omission nobody can see.
 */
export type ConfirmationRequirement =
  | 'not_required'
  /** Consequential enough that the UI should confirm once it exists. Not yet enforced. */
  | 'recommended'

export interface AiToolDescriptor {
  /** The tool name as the model sees it, exactly as declared in /api/chat. */
  tool: string
  effect: ActionEffect
  consequence: Consequence
  /** May the model invoke this without an authenticated account? */
  allowsAnonymous: boolean
  confirmation: ConfirmationRequirement
  /** For a write: the audit action name. Absent for everything else. */
  auditAction?: string
}

/**
 * Every tool /api/chat exposes to the model.
 *
 * Nine reads and one write, as of Phase 0. Kept in tool-declaration order so a reviewer can put
 * this list side by side with the route.
 */
export const AI_TOOLS: readonly AiToolDescriptor[] = [
  { tool: 'search_places', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'get_news', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'search_products', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'web_search', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'get_weather', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'get_gold_price', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'get_flight_prices', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'get_hotel_prices', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  { tool: 'get_transport_options', effect: 'external_read', consequence: 'none', allowsAnonymous: true, confirmation: 'not_required' },
  {
    tool: 'save_price_watch',
    effect: 'write',
    consequence: 'reversible',
    // The tool is not even DECLARED to the model on an unauthenticated turn (route.ts gates the
    // whole entry on `authedUserId`). The guard re-checks anyway: a capability that exists only
    // because a prompt-time branch happened to run is not a permission check.
    allowsAnonymous: false,
    // Reversible from /profile/price-watches, and it commits the user to nothing but a
    // notification — so 'recommended', not a hard gate. The point of recording it is that the
    // NEXT write tool has to make this call deliberately.
    confirmation: 'recommended',
    auditAction: 'ai.save_price_watch',
  },
]

const BY_TOOL = new Map(AI_TOOLS.map(d => [d.tool, d]))

export function describeTool(tool: string): AiToolDescriptor | null {
  return BY_TOOL.get(tool) ?? null
}

/** Tools that change state. The set the boundary exists for. */
export function writeTools(): AiToolDescriptor[] {
  return AI_TOOLS.filter(d => d.effect === 'write')
}
