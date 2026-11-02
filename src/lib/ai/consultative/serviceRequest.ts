/**
 * Gate 2 Track A (B1, PROPOSAL, owner decision 15/10): is THIS turn a request for ONE service -- somewhere to stay OR somewhere / something to
 * eat -- rather than a request to plan a trip? Used only on the CONSULTATIVE_IN_AGENT plan-turn gate (route.ts): a single-service request is
 * not a plan turn, so its cards stay and the model answers it as a search, not as a planner.
 *
 * Decided by the KIND of request in the current text, never by a city, a number of nights or the word "du lịch":
 *  - one service family named (stay XOR food) and no plan request  -> true (service request);
 *  - both families ("khách sạn và quán ăn"), a plan request ("kế hoạch", "lịch trình", "plan"…) or no service at all -> false.
 * Pure and deterministic, no model call. LIMIT: a service named in words outside these lists is not recognised (the turn then stays a plan
 * turn, as today); the lists cover the common Vietnamese and English phrasings tested in serviceRequest.test.ts.
 */
import { normalizeVN } from '@/lib/ai/intent'

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

/** Somewhere to stay. Folded text (no diacritics). */
const STAY_RE = /\b(?:khach san|ks|hotels?|homestay|home stay|resorts?|villa|hostels?|nha nghi|motel|airbnb|can ho dich vu|dat phong|thue phong|phong nghi|cho o|noi o|cho nghi|cho ngu|ngu o dau|luu tru|place to stay|where to stay|accommodation)\b/
/** Somewhere / something to eat or drink. "quán" only with a food word after it: folded "quận" is also "quan". */
const FOOD_RE = /\b(?:quan an|quan (?:pho|bun|com|lau|nuong|oc|chay|nhau|ca phe|cafe|hai san|banh mi|banh xeo|che|kem|vit|ga|bo|de|ngon)|nha hang|an gi|an o dau|an uong|mon an|mon ngon|dac san|ca phe|cafe|coffee|buffet|hai san|an sang|an trua|an toi|an dem|an vat|restaurants?|where to eat|street food)\b/
/** An explicit request to plan / schedule. */
const PLAN_RE = /\b(?:ke hoach|lich trinh|len lich|xep lich|lo trinh|itinerary|plan|planning)\b/

/** The parts of the decision, for tests and logs. */
export function serviceRequestParts(text: string): { stay: boolean; food: boolean; plan: boolean } {
  const t = fold(typeof text === 'string' ? text : '')
  return { stay: STAY_RE.test(t), food: FOOD_RE.test(t), plan: PLAN_RE.test(t) }
}

/** True when the current turn asks for exactly ONE service family and does not ask for a plan. */
export function isSingleServiceRequest(text: string): boolean {
  const p = serviceRequestParts(text)
  return !p.plan && p.stay !== p.food
}
