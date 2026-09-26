import { attributeTikTok } from './tiktokAttribution'
import { cityInText } from '@/lib/ai/tools/vietnamCities'

// ── TIKTOK REVIEW DISCOVERY, TARGETED AT THE ENTITIES ON THE CARD ────────────
//
// 🚨 THE REGRESSION THIS RECOVERS, AND WHAT ACTUALLY CAUSED IT.
//
// V1/V2 shipped TikTok review links (commit d42ece4, 2026-08-16). V3 still has
// every piece of that machinery — `isValidTikTokContentUrl` validates the URL
// shape, `attributeTikTok` proves a video is about a specific venue — and still
// produced ZERO links, because a `wantsReviewContent` gate stopped the search
// running at all unless the user said the word "review".
//
// That gate was added after measuring 17 live turns that yielded 0 attributed
// links. The measurement was real; the diagnosis was wrong. Re-measured
// 2026-09-10 against the live provider:
//
//   AREA query (what V1/V2 AND V3 both sent):
//     "Quán bún bò ngon ở TP.HCM TP.HCM review site:tiktok.com"
//     → 8 organic results, 8 of them VALID TikTok posts.
//       "13 Quán Bún Bò Ngon Nhất Sài Gòn", "Top 5 Quán Bún Bò…",
//       "Review quán bún bò Bà Ba" — listicles, and videos about OTHER venues.
//       `attributeTikTok` correctly refused all eight.
//
// So retrieval never failed and TikTok coverage was never missing. An AREA query
// cannot produce ENTITY evidence, and the honest attribution layer was doing
// exactly its job by rejecting it. Gating the SEARCH was treating the symptom.
//
//   ENTITY queries (this module):
//     '"Bánh Mì Huỳnh Hoa" TP.HCM site:tiktok.com' → 8/8 attributed
//     '"Cơm Tấm Ba Ghiền" …' → 6/6 · '"Phở Hòa Pasteur" …' → 5/5
//     '"Bà Nà Hills" Đà Nẵng …' → 8/8
//     Six well-known venues probed, six with attributed content.
//
// 🔑 AND IT COSTS WHAT V1/V2 COST: ONE SEARCH PER TURN. Serper honours an OR of
// quoted names, so the whole card is asked for in a single request. Measured:
//   '"Bún Bò Huế Đông Ba" OR "Phở Hòa Pasteur" OR "Bánh Mì Huỳnh Hoa"
//    OR "Cơm Tấm Ba Ghiền" TP.HCM site:tiktok.com'
//   → 1 credit, 9 valid posts, 3 of the 4 entities attributed.
//
// Same spend as the old area query, which yielded nothing. That is the whole
// optimisation: not fewer TikTok calls, a better TikTok call.
//
// ⚠️ QUOTES ARE A HINT, NOT A FILTER. `"GÓC HUẾ" Kỳ Đồng site:tiktok.com`
// returned seven valid posts, about a chè shop, a bánh bèo place and a temple —
// none of them GÓC HUẾ. Entity-targeted retrieval does NOT relax attribution;
// `attributeTikTok` still has to prove every distinctive token of the name
// appears together in one clause. This module changes WHAT WE ASK FOR, never
// what counts as proof.

/** The card's ceiling. Asking about more entities than can render wastes query budget. */
export const MAX_TIKTOK_ENTITIES = 8

/**
 * 🚨 FOUR, AND THE CLIFF IS NOT GRADUAL — IT IS A CLIFF.
 *
 * Measured 2026-09-10 against the live provider on one real card of eight
 * bánh mì venues:
 *
 *   8 names in one OR query  →  0 VALID TikTok posts returned at all
 *   4 names in one OR query  →  10 valid posts, 4 of 4 attributed
 *   the other 4              →   9 valid posts, 2 of 4 attributed
 *
 * An eight-way OR does not return fewer useful results, it returns NOTHING —
 * Google stops matching the chain entirely. The first implementation batched the
 * whole card and measured 1 attributed link across 40 rendered entities; split
 * into two chunks of four, the same card yields six.
 */
const TIKTOK_BATCH_SIZE = 4

/**
 * How many chunks a turn may buy. Two covers the card's eight items for two
 * credits — still less than the four hotel discovery searches this pass deleted,
 * and the difference between "no TikTok" and "TikTok on most of the card".
 */
export const MAX_TIKTOK_BATCHES = 2

/** Serper's `q` has a practical length limit; four quoted Vietnamese names fit comfortably. */
const MAX_QUERY_CHARS = 380

/**
 * The name as a person would search it.
 *
 * 🚨 REAL CARD NAMES CARRY THEIR OWN ADDRESS. Measured on a live food turn:
 * "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM" and
 * "Bánh Mì Huynh Hoa - Lê Thị Riêng". `attributeTikTok` requires EVERY
 * distinctive token to appear together in one clause, so a name containing a
 * street number can never be attributed — no TikTok title spells the address.
 *
 * Only the tail is trimmed, never the identity: everything before the first
 * " - " / comma / street number. If trimming leaves too little to identify a
 * venue, the original is kept — a weak name is better refused by
 * `worthQuerying` than silently widened into someone else's.
 */
export function tiktokQueryName(name: string): string {
  const raw = (name || '').trim()
  let out = raw.split(/\s+[-–—]\s+/)[0]
  out = out.split(',')[0]
  out = out.replace(/\b(số|so)\s*[\d].*$/i, '')
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out.split(/\s+/).filter(w => w.length >= 2).length >= 2 ? out : raw
}

/**
 * A name distinctive enough to be worth asking about.
 *
 * A one-word or category-only name ("Nơi ở", "Spa") cannot be attributed by
 * `attributeTikTok` even if the search returns something, so asking about it
 * spends query budget on a result that is guaranteed to be rejected.
 */
/**
 * The part of the name `tiktokQueryName` threw away — the branch or address.
 *
 * 🚨 THIS IS THE STRONGEST CORROBORATION AVAILABLE, and city was not enough.
 * Measured: for "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM", Serper's
 * own snippets mix cities inside one fragment — "… TP.HCM … Mô hình kinh doanh
 * của Vua Chả Cá Hà Nội …" — so a city test can be satisfied by a Hanoi video.
 * The CORRECT result's snippet instead reads "Vua Chả Cá Vietnamese Restaurant -
 * Số 42-44-46 Trần Hưng Đạo, Q.1, TP.", naming the branch outright.
 *
 * So when trimming weakened the identity, what we ask back for is the piece we
 * removed, not merely the city it sits in.
 */
export function droppedTailTokens(fullName: string): string[] {
  const kept = tiktokQueryName(fullName)
  if (kept === fullName) return []
  const tail = fullName.slice(kept.length)
  const ADMIN = /^(so|tp|hcm|quan|phuong|duong|q\d*|vietnam|viet|nam)$/
  return normalizeForMatch(tail)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !ADMIN.test(t) && !/^\d+$/.test(t))
}

/** Diacritic-folded lowercase, the same normalisation the attributor uses. */
function normalizeForMatch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
}

export function worthQuerying(name: string): boolean {
  const trimmed = (name || '').trim()
  if (trimmed.length < 4) return false
  return trimmed.split(/\s+/).filter(w => w.length >= 2).length >= 2
}

/**
 * The batched query for a set of entities.
 *
 * Returns null when nothing is worth asking about — the caller must then make
 * NO request at all, which is the difference between a cost gate and a cost bug.
 */
export function buildTikTokQuery(names: readonly string[], location?: string): string | null {
  const usable = names.filter(worthQuerying).slice(0, TIKTOK_BATCH_SIZE)
  if (usable.length === 0) return null

  const tail = `${location ? ' ' + location : ''} site:tiktok.com`
  const chosen: string[] = []
  for (const n of usable) {
    const next = [...chosen, `"${n}"`].join(' OR ') + tail
    if (next.length > MAX_QUERY_CHARS && chosen.length > 0) break
    chosen.push(`"${n}"`)
  }
  return chosen.join(' OR ') + tail
}

/**
 * Does this result name a DIFFERENT city than the one we searched?
 *
 * 🚨 FOUND IN UAT, AND CAUSED BY THIS MODULE'S OWN NAME TRIMMING. The card
 * entity was "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM";
 * `tiktokQueryName` trims it to the brand "Vua Chả Cá" so it can be attributed
 * at all, and a video titled "Vua Chả Cá Lã Vọng: Ăn Nhóm Không Đi Một Mình"
 * then satisfied every distinctive token. It is a real video about that brand —
 * at a HANOI branch (`#canbomydinh`, Mỹ Đình), while the card's venue is in
 * District 1, Hồ Chí Minh.
 *
 * Trimming a branch suffix is what makes attribution possible; it also makes a
 * chain's other branches matchable. This is the compensating guard, and it is
 * deliberately the SAME asymmetry `belongsToDestination` uses for places:
 *
 *   · names a DIFFERENT known city → reject
 *   · names no known city          → KEEP
 *
 * "I cannot tell which city" must never become "wrong city", or the guard would
 * throw away the majority of genuine reviews, which name no city at all.
 */
/** The text with the venue's own name removed, so its name cannot supply a city. */
function stripName(text: string, entityName: string): string {
  if (!entityName) return text
  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(escaped, 'gi'), ' ')
}

export function namesAnotherCity(text: string, location: string | undefined, entityName = ''): boolean {
  if (!location) return false
  const here = cityInText(location)
  if (!here) return false
  /**
   * 🚨 THE VENUE'S OWN NAME OFTEN CONTAINS A CITY, and the first version of this
   * guard rejected every one of them. "Bún Bò Huế", "GÓC HUẾ", "Phở Hà Nội",
   * "Cơm Tấm Sài Gòn" — a Huế-style restaurant in District 3 is not evidence
   * about the city of Huế, and dropping it would have silently deleted a large
   * share of Vietnamese food venues from TikTok enrichment. Caught by this
   * module's own "similarly named other venue" test.
   *
   * So the entity's name is removed from the text BEFORE looking for a city:
   * only a city mentioned somewhere ELSE can contradict the search.
   */
  const withoutName = entityName
    ? text.replace(new RegExp(entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    : text
  const there = cityInText(withoutName)
  return !!there && there.query !== here.query
}

export interface TikTokSearchResult { title?: string; link?: string; snippet?: string }
export type TikTokSearch = (query: string) => Promise<TikTokSearchResult[] | null>

export interface TikTokEnrichmentResult {
  /** Entity name → the one validated, attributed TikTok post URL. */
  perPlace: Map<string, string>
  /** A valid post the search found but could tie to NO entity. Never captioned as a review. */
  batch: string | null
  /** Whether a billed request was actually made — for cost assertions in tests. */
  searched: boolean
}

const EMPTY: TikTokEnrichmentResult = { perPlace: new Map(), batch: null, searched: false }

/**
 * Find TikTok reviews for the entities that will actually reach the card.
 *
 * 🔑 CALLED AFTER ADMISSION AND DEDUPE, NEVER BEFORE. Spending a query on a row
 * that eligibility will reject, that `admitStays` will collapse into another, or
 * that falls outside `MAX_ITEMS`, is spending on something nobody will see.
 *
 * Degrades to "no links" on any failure: a TikTok lookup must never cost the
 * recommendation. The card renders without the action, which is the same shape
 * as a venue that genuinely has no coverage.
 */
export async function enrichWithTikTok(
  names: readonly string[],
  location: string | undefined,
  search: TikTokSearch,
): Promise<TikTokEnrichmentResult> {
  const usable = names.filter(worthQuerying).slice(0, MAX_TIKTOK_ENTITIES)
  if (usable.length === 0) return EMPTY

  const perPlace = new Map<string, string>()
  const claimed = new Set<string>()
  let batch: string | null = null
  let searched = false

  // Chunked, because an eight-way OR returns nothing at all — see TIKTOK_BATCH_SIZE.
  const chunks: string[][] = []
  for (let i = 0; i < usable.length && chunks.length < MAX_TIKTOK_BATCHES; i += TIKTOK_BATCH_SIZE) {
    chunks.push(usable.slice(i, i + TIKTOK_BATCH_SIZE))
  }

  for (const chunk of chunks) {
    /**
     * Query and attribute with the SAME cleaned names, then map back.
     *
     * 🚨 THEY MUST MATCH. Querying a trimmed name while attributing against the
     * full one would ask about "Vua Chả Cá" and then demand the video also name
     * the street number — a search that can only ever be rejected.
     *
     * A collision after trimming (two branches of one brand) falls back to the
     * ORIGINAL names for that chunk: `attributeTikTok` finds no distinctive
     * token for either and attributes neither, which is the correct refusal.
     * Trimming must never merge two venues into one identity.
     */
    const cleaned = chunk.map(tiktokQueryName)
    const collides = new Set(cleaned.map(c => c.toLowerCase())).size !== cleaned.length
    const asked = collides ? chunk : cleaned
    const backTo = new Map(asked.map((a, i) => [a, chunk[i]]))

    const query = buildTikTokQuery(asked, location)
    if (!query) continue
    try {
      searched = true
      const results = await search(query)
      if (!results || results.length === 0) continue
      // The SAME attributor V1/V2's fix landed: every distinctive token of a name
      // must appear as a whole word inside one clause. Nothing here relaxes it.
      // A result naming a different city is dropped BEFORE attribution, so it can
      // neither claim a venue nor be offered as this turn's batch video.
      /**
       * 🚨 A TRIMMED NAME MUST EARN THE MATCH; A FULL NAME NEED ONLY NOT
       * CONTRADICT IT. Two UAT findings forced this asymmetry.
       *
       * "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM" trims to the bare
       * brand "Vua Chả Cá" so it can be attributed at all — and Vua Chả Cá Lã
       * Vọng is a CHAIN whose home is Hanoi. Twice in a row the search returned a
       * genuine video about the brand at a Hanoi branch (`#canbomydinh`,
       * `#hanoi #chacahanoi`). The "reject a different city" rule did not catch
       * the second one, because the guard reads Serper's snippet and the city
       * only appeared in hashtags on the video page.
       *
       * So when WE weakened the identity by trimming, we demand the city back:
       * the result must positively name the searched city. When the full name is
       * used, the lenient rule stands — most genuine reviews name no city, and
       * requiring one would delete the majority of real evidence.
       */
      const found = attributeTikTok(results, asked)
      /**
       * 🚨 THE CITY RULE IS JUDGED PER (NAME, URL) PAIR — NOT PER RESULT.
       *
       * The first version filtered the result LIST with `asked.some(...)`, which
       * meant a single untrimmed name in the chunk waved every result through for
       * every other name. Measured: the Hanoi "Vua Chả Cá Lã Vọng" video came
       * back a third time, because another venue in the same chunk had an
       * untrimmed name. Attribution decides WHICH name a URL belongs to, so the
       * city test has to run after it, against that name.
       */
      const textOf = new Map(results.map(r => [r.link ?? '', `${r.title ?? ''} ${r.snippet ?? ''}`]))
      for (const [asName, url] of found.perPlace) {
        const text = textOf.get(url) ?? ''
        if (namesAnotherCity(text, location, asName)) continue
        const i = asked.indexOf(asName)
        const wasTrimmed = i !== -1 && asName !== chunk[i]
        if (wasTrimmed) {
          /**
           * Trimming weakened the identity, so the result must give it back.
           * Preferred proof is the BRANCH we removed (street, branch name);
           * a positive city match is accepted when the name had no such tail.
           */
          const tail = droppedTailTokens(chunk[i])
          const hay = normalizeForMatch(stripName(text, asName))
          if (tail.length > 0) {
            /**
             * 🚨 NO CITY FALLBACK WHEN A BRANCH EXISTS. Letting a city stand in
             * for the branch is exactly how the Hanoi "Vua Chả Cá Lã Vọng" video
             * kept reaching a District 1 card across three attempts: Serper
             * snippets splice fragments, so one can name TP.HCM while the video
             * is about Hanoi. If we removed a branch to make the name matchable,
             * only that branch can prove the match. Fewer links, none of them
             * another venue's.
             */
            if (!tail.some(t => hay.includes(t))) continue
          } else {
            // Nothing was dropped that could corroborate, so the city is the only
            // signal left — and it must be present, not merely uncontradicted.
            if (!location) continue
            const here = cityInText(location)
            const there = cityInText(stripName(text, asName))
            if (!here || !there || there.query !== here.query) continue
          }
        }
        const original = backTo.get(asName) ?? asName
        // One video cannot be two venues' review, across chunks as well as within one.
        if (perPlace.has(original) || claimed.has(url)) continue
        perPlace.set(original, url)
        claimed.add(url)
      }
      if (!batch && found.batch) batch = found.batch
    } catch {
      // A TikTok lookup must never cost the recommendation. Other chunks continue.
    }
  }

  return { perPlace, batch, searched }
}
