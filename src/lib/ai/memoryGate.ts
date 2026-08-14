import { normalizeVN } from './intent'

// ── Should this turn pay for a memory-extraction call? ───────────────────────
//
// extractMemoryFromConversation() is a THIRD LLM call, on top of the two the
// answer itself costs. It is worth making only when the turn could plausibly
// contain something worth remembering.
//
// The gate it replaces was `lastText.trim().length > 20`, and measurement on
// 2026-08-10 showed it wrong in both directions:
//
//   fired on   "Hôm nay thời tiết Hà Nội thế nào?"   -> extraction returned nothing
//   fired on   "Tin tức mới nhất là gì?"             -> nothing
//   DROPPED    "Tôi ăn chay."            (12 chars)  -> a hard dietary constraint
//   DROPPED    "Mình thích cay"          (14 chars)
//   DROPPED    "Nhà mình ở Quận 3."      (18 chars)
//
// Length was never the signal. What matters is whether the user said something
// about THEMSELVES.
//
// This is a cheap pre-filter, not a memory system: the semantic work still
// belongs to extractMemoryFromConversation. So it is deliberately biased towards
// extracting — the default for anything it cannot classify is YES. A skipped
// call saves a fraction of a cent; a dropped preference is gone for good.

/** First-person statements about the user: preferences, constraints, people,
 *  habits, budgets, and explicit "remember this". Matched against
 *  diacritic-stripped lowercase text, so it covers accented and unaccented
 *  Vietnamese alike. Kept in both languages so the gate is not VI-only. */
const DURABLE_SIGNAL = new RegExp([
  // explicit instruction to remember
  'nho giup|nho la|nho gium|ghi nho|remember',
  // likes / dislikes / preferences
  'toi thich|minh thich|tui thich|toi khong thich|minh khong thich|toi ghet|minh ghet',
  'uu tien|thich hon|i like|i love|i prefer|i enjoy|prefer |dont like|don\'t like|do not like|i hate',
  // dietary and medical constraints — the highest-stakes memory of all
  'an chay|do chay|khong an duoc|khong uong duoc|di ung|kieng |an kieng',
  'vegetarian|vegan|allergic|allergy|gluten|lactose|halal',
  // who the user is / who they go with
  'toi la |minh la |toi ten|minh ten|nha toi|nha minh|toi o |minh o |gia dinh',
  'vo toi|vo minh|chong toi|chong minh|con gai|con trai|ban gai|ban trai|nguoi yeu',
  'my wife|my husband|my daughter|my son|my kids|my family|my partner|i live|i am |i\'m ',
  // habits and recurring needs
  'thuong xuyen|thuong di|hay di|moi tuan|moi thang|cuoi tuan nao|tu gio|tu nay',
  'from now on|usually|always|every week|every month',
  // budget stated as a standing constraint
  'ngan sach cua|ngan sach minh|ngan sach toi|budget cua|my budget|budget is',
].join('|'))

/** Lookups whose answer is true for minutes and worth remembering for none of
 *  them. Bilingual on purpose: detectForcedTool's gold/weather patterns are
 *  Vietnamese-only, so relying on it alone would skip these for VI users and
 *  bill EN users for calls that store nothing. */
const EPHEMERAL_TOPIC = new RegExp([
  'thoi tiet|du bao|nhiet do|troi mua|troi nang',
  'gia vang|vang sjc|vang 9999|ty gia|hoi suat|gia xang|gia dau',
  'tin tuc|tin moi|thoi su|tin nong',
  'weather|forecast|temperature|gold price|exchange rate|fuel price|petrol price',
  'latest news|news headlines|headlines',
].join('|'))

/** Tools whose results are pure point-in-time lookups. */
const EPHEMERAL_TOOLS = new Set(['get_weather', 'get_gold_price', 'get_news'])

/** Below this, a message cannot carry a durable fact that DURABLE_SIGNAL missed. */
const MIN_MEANINGFUL_LENGTH = 12

export interface MemoryGateInput {
  /** The user's latest message. */
  text: string
  intent: 'chitchat' | 'tool'
  forcedTool: string | null
}

export function shouldExtractMemory({ text, intent, forcedTool }: MemoryGateInput): boolean {
  const t = normalizeVN((text ?? '').toLowerCase().trim())
  if (!t) return false

  // 1. Greetings and thanks carry nothing about the user.
  if (intent === 'chitchat') return false

  // 2. A stated preference or personal fact ALWAYS wins — including inside a
  //    turn that otherwise looks like a weather question.
  if (DURABLE_SIGNAL.test(t)) return true

  // 3. Point-in-time lookups. Checked after (2) so they can never mask a fact.
  if ((forcedTool && EPHEMERAL_TOOLS.has(forcedTool)) || EPHEMERAL_TOPIC.test(t)) return false

  // 4. Too short to hold anything the signal list missed.
  if (t.length < MIN_MEANINGFUL_LENGTH) return false

  // 5. Default YES. Ordinary requests routinely carry a district, a budget or a
  //    cuisine — measured, "Gợi ý quán ăn ngon ở Quận 1 giá dưới 200k" yields
  //    location_base + budget + history. Skipping those would cost real memory.
  return true
}
