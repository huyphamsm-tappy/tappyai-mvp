import type { ConversationState } from './conversationState'
import type { ConsultationDelta } from './consultationDelta'

/**
 * Server-side product search, run BEFORE generation (Task 3F-2.5).
 *
 * WHY. Until now the first product turn was unprotected: the LLM started, called
 * search_products itself, the search came back empty, and only then did the
 * server learn there was nothing — far too late, the model was already writing.
 * Measured on T1 of the Mac flow: a recommended machine that did not exist, an
 * invented price, and the user's 32GB requirement quietly answered with 16GB.
 * The post-search guard (3F-2.2) covers T2 onward but structurally cannot reach
 * T1.
 *
 * Moving the search ahead of generation closes it: the server knows the outcome
 * before a single token is produced, so an empty result never reaches free-form
 * generation at all.
 *
 * PRODUCTS ONLY. Place and hotel search stay on the existing LLM tool path.
 */

/**
 * Fires only when the server is certain a product search is both needed and
 * not already done. Every other turn — decisions, explanations, place/hotel
 * searches, chit-chat — keeps today's behaviour untouched.
 */
export function shouldPreSearchProducts(opts: {
  delta: ConsultationDelta | null
  forcedTool: string | null
  state: ConversationState | null
  /** True when this turn is asking about somewhere to GO — never pre-searched. */
  locationIntent?: boolean
}): boolean {
  const { delta, forcedTool, state, locationIntent } = opts
  if (!state || !delta) return false

  // Condition 1, unchanged: this turn genuinely needs new evidence. decideSearch
  // is the single authority — initial discovery, a changed hard constraint, a
  // preference that invalidates the held set, and a rejection all set it.
  if (delta.searchImpact.required !== true) return false

  // Condition 2: the consultation must be about PRODUCTS. This replaces
  // `forcedTool === 'search_products'`, which was not a statement about the
  // consultation at all — it required that the client or model had already
  // picked the tool, so refinement and rejection turns (which carry no such
  // signal) never pre-searched and fell through to the free-form path that
  // invented a MacBook Air M2 32GB/512GB. forcedTool remains SUFFICIENT, it is
  // simply no longer necessary.
  if (locationIntent) return false                                   // a place turn is not a product turn
  if (state.candidates.some(c => c.type !== 'product')) return false // places/hotels held -> not this path
  // An explicit signal for a DIFFERENT tool still blocks: the user asking for
  // weather or a place mid-consultation is not a product turn, whatever the
  // accumulated state says. Only the absence of a signal is now permissive.
  if (forcedTool && forcedTool !== 'search_products') return false
  return forcedTool === 'search_products' || isProductConsultation(state)
}

/** Product-shaped keys: things only a purchasable object has. */
const PRODUCT_CONSTRAINT_KEYS = new Set(['ram_gb', 'storage_gb', 'condition'])

/**
 * Is the user shopping for a thing?
 *
 * Read from what the consultation has ACCUMULATED, not from this turn's
 * wording — "Nếu là bạn thì bạn chọn máy nào?" and "I don't like these" say
 * nothing about products on their own, and those are exactly the turns that
 * used to miss. Budget alone is not a signal: a cafe has a budget too.
 */
export function isProductConsultation(state: ConversationState): boolean {
  if (state.candidates.some(c => c.type === 'product')) return true
  return state.hardConstraints.some(c => PRODUCT_CONSTRAINT_KEYS.has(c.key))
}

/** Words that identify a listing as a computing device, in either language. */
const COMPUTING_RE = /\b(macbook|imac|mac ?mini|mac ?studio|mac ?pro|laptop|notebook|máy tính|may tinh|pc|ultrabook|chromebook)\b/i

/**
 * Drop rows that are not the thing being shopped for.
 *
 * Measured: searching "Mac cũ" returned "Son MAC 835 Modesty Màu Hồng Khô" and
 * "Son Mac Lunar Luck Powder Kiss" — lipstick, because MAC is also a cosmetics
 * brand. Those rows carry a real price, so the decision-grade test admits them,
 * and they then sit in the ranking as candidate laptops.
 *
 * The rule is evidence-based rather than a blocklist of banned words: once the
 * user has stated a computer requirement (RAM or storage), a candidate must
 * either say it is a computer or carry the specs of one. A lipstick listing
 * does neither. Consultations with no computer requirement are untouched — this
 * must not start filtering headphones out of a headphone search.
 */
export function filterIrrelevantProducts<T extends { name: string; type: string; facts: Record<string, string | number> }>(
  candidates: T[],
  state: ConversationState,
): T[] {
  const wantsComputer = state.hardConstraints.some(c => c.key === 'ram_gb' || c.key === 'storage_gb')
  if (!wantsComputer) return candidates
  return candidates.filter(c => {
    if (c.type !== 'product') return true
    if (c.facts.ram_gb !== undefined || c.facts.storage_gb !== undefined) return true
    return COMPUTING_RE.test(c.name)
  })
}

/** Longest query we will send; Serper degrades on very long strings. */
const MAX_QUERY_LEN = 160

/**
 * Build the search query from state — never from the model.
 *
 * The base is what the user actually asked for (`goal`, which is their own first
 * substantive message, falling back to this turn's text). Any stated requirement
 * not already present in that text is appended verbatim from `statedAs`, so a
 * constraint added on a later turn ("tầm 25 triệu") still reaches the provider.
 *
 * Nothing is invented and nothing is dropped silently: every fragment is text
 * the user typed.
 */
export function buildProductQuery(state: ConversationState, lastText: string): string {
  const base = (state.goal || lastText || '').trim()
  const lower = base.toLowerCase()

  const missing: string[] = []
  for (const c of state.hardConstraints) {
    const frag = (c.statedAs || '').trim()
    if (!frag) continue
    // Already implied by the base text — appending would only add noise.
    if (lower.includes(frag.toLowerCase())) continue
    missing.push(frag)
  }

  const query = [base, ...missing, categoryAnchor(lower)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return query.length > MAX_QUERY_LEN ? query.slice(0, MAX_QUERY_LEN).trim() : query
}

/**
 * A word to keep an ambiguous brand in the right aisle.
 *
 * Measured: "Tôi muốn mua một chiếc Mac cũ để code." searched "Mac cũ" and came
 * back with MAC lipstick — "Son MAC 835 Modesty", "Son Mac Lunar Luck" — because
 * MAC is also a cosmetics brand in Vietnam. The anchor is a CATEGORY, never a
 * model: "Mac" does not become "MacBook Pro", because the user has not said
 * which Mac they want and guessing would search for a machine they never asked
 * for. Once they name one, the term is unambiguous and no anchor is added.
 */
function categoryAnchor(lower: string): string {
  const namesAModel = /\b(macbook|imac|mac ?mini|mac ?studio|mac ?pro)\b/.test(lower)
  const saysMac = /\bmac\b/.test(lower)
  if (saysMac && !namesAModel) return 'Apple laptop'
  return ''
}

/**
 * Classify what the provider actually told us.
 *
 * `searchProducts` returns an object carrying `search_results` on success and an
 * `error` field when the call itself failed. "Answered, with nothing" and "did
 * not answer" are kept apart here for the same reason as everywhere else in this
 * pipeline: only the first justifies "I couldn't find anything matching".
 */
export function classifyProductResult(result: unknown): 'ok' | 'empty' | 'failed' {
  if (!result || typeof result !== 'object') return 'failed'
  const r = result as { error?: unknown; search_results?: unknown[] }
  if (r.error) return 'failed'
  return Array.isArray(r.search_results) && r.search_results.length > 0 ? 'ok' : 'empty'
}

/** The money guard's records live on `search_results`; pull them out verbatim. */
export function productRecordsFrom(result: unknown): Array<Record<string, unknown>> {
  if (!result || typeof result !== 'object') return []
  const sr = (result as { search_results?: unknown[] }).search_results
  return Array.isArray(sr) ? (sr as Array<Record<string, unknown>>) : []
}
