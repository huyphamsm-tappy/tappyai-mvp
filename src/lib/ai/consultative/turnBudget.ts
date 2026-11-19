// ── The orchestration layer, kept thin (19/11/2026) ───────────────────────────────────────────────────────────────────────────────────────
//
// Owner: "build the layer that decides how much a turn may spend, so the model calls the right tool the right number of times". What the research of OpenAI's and
// Anthropic's own guidance gave: the default is ONE agent loop; the code holds the hard limits (calls per tool, number of lookups, time), the prompt tells the model the same
// limits in plain words so it plans inside them, and the tool descriptions say what each tool is for. The kind of turn comes from the reading of the message that already runs
// beside the answer (answerV4/understand.ts: intent, shape, fresh data) - no keyword, no word list. Pure: the route only counts and asks.

export type TurnTier = 'light' | 'lookup' | 'plan'

export interface TurnBudget {
  tier: TurnTier
  /** lookups of any kind in the whole turn */
  maxLookups: number
  /** calls allowed per tool (a tool not listed is bounded by maxLookups only) */
  perTool: Readonly<Record<string, number>>
  /** time after which no new lookup starts */
  timeMs: number
}

const BUDGETS: Readonly<Record<TurnTier, TurnBudget>> = {
  // a fact, an explanation, advice, writing: the model's own knowledge first, one or two checks
  light: { tier: 'light', maxLookups: 3, perTool: { web_search: 2, search_places: 2, search_products: 1, get_hotel_prices: 1, get_transport_options: 1, get_flight_prices: 1, get_news: 1, get_weather: 1 }, timeMs: 35_000 },
  // a place, a product, a price, news, a recommendation or comparison: each lookup a different need
  lookup: { tier: 'lookup', maxLookups: 6, perTool: { web_search: 3, search_places: 3, search_products: 2, get_hotel_prices: 2, get_transport_options: 1, get_flight_prices: 2, get_news: 1, get_weather: 1 }, timeMs: 45_000 },
  // a trip or an evening: the places, the stay, the fare and the weather together, in the first step
  plan: { tier: 'plan', maxLookups: 12, perTool: { web_search: 4, search_places: 6, search_products: 1, get_hotel_prices: 2, get_transport_options: 2, get_flight_prices: 2, get_news: 1, get_weather: 2 }, timeMs: 55_000 },
}

export interface TurnReading { intent?: string | null; answer_shape?: string | null; needs_fresh_data?: boolean | null }

const LIGHT_INTENTS = new Set(['chat', 'knowledge', 'advice', 'how_to', 'writing', 'math_code', 'other'])

/** The tier of a turn from the reading of the message; null when there is no reading (the turn then keeps only the limits it always had). */
export function tierOf(u: TurnReading | null | undefined): TurnTier | null {
  if (!u || !u.intent) return null
  if (u.intent === 'planning' || u.answer_shape === 'itinerary') return 'plan'
  if (LIGHT_INTENTS.has(u.intent) && !u.needs_fresh_data) return 'light'
  return 'lookup'
}

export function budgetOf(tier: TurnTier): TurnBudget { return BUDGETS[tier] }

export interface BudgetState { lookups: number; perTool: Record<string, number> }
export const newBudgetState = (): BudgetState => ({ lookups: 0, perTool: {} })

export type BudgetVerdict = { ok: true } | { ok: false; reason: 'tool_cap' | 'total_cap' | 'time'; note: string }

/** Asks for one more call of `tool`; when allowed, counts it. A refusal carries the sentence the model reads (it must write now, not search again with other words). */
export function spendLookup(budget: TurnBudget, state: BudgetState, tool: string, elapsedMs: number): BudgetVerdict {
  const used = state.perTool[tool] ?? 0
  const cap = budget.perTool[tool]
  if (cap !== undefined && used >= cap) return { ok: false, reason: 'tool_cap', note: `This answer has used its ${cap} ${tool} call${cap === 1 ? '' : 's'}. Use what you already have; if something is still missing, say plainly that it could not be confirmed.` }
  if (state.lookups >= budget.maxLookups) return { ok: false, reason: 'total_cap', note: 'The lookups of this answer are used. Write the answer now from what you have and what you reliably know, and say what could not be checked.' }
  if (elapsedMs >= budget.timeMs) return { ok: false, reason: 'time', note: 'The time for lookups in this answer is used. Write the answer now from the data you already have; say plainly what you could not confirm, and do not invent it.' }
  state.lookups++
  state.perTool[tool] = used + 1
  return { ok: true }
}

/** The same limits in words, for the system prompt: the model plans inside what the code will enforce. */
export const TURN_BUDGET_PROMPT = 'Lookup budget, held by the app: a fact, an explanation or advice - at most 3 lookups, usually none or one; a place, product, price, news or comparison - at most 6, each one a different need; a trip or evening plan - up to 12, and in the FIRST step: the places (up to 6 search_places), the stay (get_hotel_prices), the fare (get_transport_options or get_flight_prices) and the weather. A call over the budget is refused, so decide what you need first, make the calls together, then write.'
