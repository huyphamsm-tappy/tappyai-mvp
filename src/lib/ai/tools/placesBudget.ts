import { normalizeVN } from '@/lib/ai/intent'

/**
 * How many Google Places SearchText calls one chat turn may spend.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `route.ts` runs the model with `maxSteps: planningIntent ? 8 : 5`, and every step may call
 * `search_places` again with a differently-worded query. Different words mean a different cache
 * key, so the existing cache cannot collapse them — each one is a fresh billable call. Measured on
 * 2026-09-08: one Food consultation spent SEVEN SearchText calls against a project quota of 100 a
 * day, i.e. roughly fourteen consultations before Places stopped answering for everybody.
 *
 * ── What it counts ──────────────────────────────────────────────────────────
 * Not calls — INTENTS. A trip plan legitimately needs to look up restaurants, then attractions,
 * then hotels: three different questions, three answers, none of which substitutes for another.
 * Capping that at one call would not save quota, it would break planning. What is worth stopping
 * is the same question asked again in different words.
 *
 * So an intent is (type, location) — the two inputs that decide WHICH set of places is being
 * asked for. "quán bún bò ngon" and "quán ăn ngon quận 1" with the same type and location are one
 * intent: the second adds no information the first did not already fetch, and Google would be paid
 * twice for one answer.
 *
 * ── What happens at the limit ───────────────────────────────────────────────
 * Nothing is invented and nothing is substituted. The caller is told no search was performed and
 * the turn continues on prose and on whatever it already retrieved. A thinner answer is the
 * correct outcome; a fabricated one never is.
 */

/** The decision, and why — the reason is what the log line reports. */
export type BudgetVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'intent_already_retrieved' | 'budget_exhausted' }

export interface PlacesBudget {
  /** Records the intent and says whether a Google-backed search may proceed. */
  claim(type: string | undefined, location: string | undefined, query?: string): BudgetVerdict
  /** Distinct intents retrieved so far. */
  readonly used: number
  readonly limit: number
  /** One brain (review 30/10): a place name the city list does not know may cost one extra /maps lookup for its coordinates (food.ts). */
  readonly namedCentre?: boolean
}

/**
 * Default limits, by turn shape.
 *
 * A planning turn is the only one that genuinely asks several different questions, and three is
 * what a day plan actually needs (somewhere to eat, something to see, somewhere to stay). Every
 * other turn is answering ONE question, so it gets one retrieval — the "one strong retrieval"
 * rule. These are deliberately small: the cost of being one short is a thinner answer, while the
 * cost of being too generous is that Places stops working for everyone.
 */
export const PLACES_BUDGET_PLANNING = 3
export const PLACES_BUDGET_DEFAULT = 1
/**
 * Agent turns (TAPPY_AGENT=1 and =2): distinct Places intents one agent turn may retrieve. A PROVIDER SAFETY QUOTA owned here, with the
 * other Places limits — not an orchestration budget. It used to be read from the Phase 7 loop's `AGENT_LIMITS.maxToolCalls` (also 3), so
 * changing how many tool calls an agent turn may make would have silently changed the Google quota (Phase 8 WS2 audit). Same value: the
 * agent may ask several different questions in one turn (food, then attractions, then a hotel), never the same one twice.
 */
export const PLACES_BUDGET_AGENT = 3

/**
 * Normalizes an intent to what actually decides the result set.
 *
 * Diacritics ARE folded here, and that is the opposite of the rule for cache keys — deliberately.
 * A cache key must never fold them, because the query is handed verbatim to Google and folding
 * merges distinct words. This key is not a query: it answers "has this turn already looked up
 * restaurants in this city?", where "Đà Lạt" and "da lat" are plainly the same city. Reuses the
 * repo's own `normalizeVN`, the same folding `cityInText` already applies to locations.
 *
 * The asymmetry is safe because the two failure modes are not equal: folding too eagerly costs a
 * slightly thinner answer, while folding a cache key would serve the wrong answer entirely.
 */
function intentKey(type: string | undefined, location: string | undefined): string {
  const norm = (s: string | undefined) =>
    normalizeVN((s ?? '').normalize('NFC').toLowerCase()).replace(/\s+/g, ' ').trim()
  return `${norm(type)}|${norm(location)}`
}

/**
 * `byQuery` (one brain, review 30/10): the query is part of the intent. The model that plans a day asks "lẩu gà lá é" and then "bánh căn" -
 * both restaurant + Đà Lạt - and the second came back as zero rows ('intent_already_retrieved'), read by the model as "nothing found".
 * The limit still caps the distinct lookups of the turn.
 */
export function createPlacesBudget(limit: number, opts: { byQuery?: boolean; namedCentre?: boolean } = {}): PlacesBudget {
  const retrieved = new Set<string>()
  const norm = (s: string | undefined) => normalizeVN((s ?? '').normalize('NFC').toLowerCase()).replace(/\s+/g, ' ').trim()
  return {
    get used() { return retrieved.size },
    limit,
    namedCentre: opts.namedCentre === true,
    claim(type, location, query) {
      const key = opts.byQuery ? `${intentKey(type, location)}|${norm(query)}` : intentKey(type, location)
      // Asked again in different words. The first answer already covers it, and the cache will
      // serve it when the key matches; when it does not, a second call buys nothing.
      if (retrieved.has(key)) return { allowed: false, reason: 'intent_already_retrieved' }
      if (retrieved.size >= limit) return { allowed: false, reason: 'budget_exhausted' }
      retrieved.add(key)
      return { allowed: true }
    },
  }
}
