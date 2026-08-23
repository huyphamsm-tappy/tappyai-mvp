import { normalizeVN } from '@/lib/ai/intent'
import { isValidTikTokContentUrl } from './tiktokReview'

/**
 * Decide WHICH place a TikTok search result is about — or admit that it is about none of them.
 *
 * ============================================================================
 * THE CLAIM THIS EXISTS TO STOP
 * ============================================================================
 * The TikTok search is ONE query for the whole batch ("<what the user asked> review
 * site:tiktok.com"), so its results belong to the search, not to any row. The previous code
 * attached the first valid URL to `results[0]` and the UI rendered it inside that restaurant's card
 * under the label "Review TikTok" — telling the user a video reviews a restaurant when nothing
 * established that.
 *
 * Measured on production for "tìm quán bún bò huế ngon ở phú nhuận": 8 places, 6 TikTok results,
 * and NOT ONE of the six titles named any of the eight places. The link shown on a card was about
 * a different restaurant entirely.
 *
 * ============================================================================
 * WHY MATCHING USES DISTINCTIVE TOKENS ONLY
 * ============================================================================
 * Naive substring matching is worse than no matching here. Every place in that batch is called
 * some variation of "Bún Bò Huế …", and every TikTok title contains "bún bò huế" too — so a
 * shared-token match would attribute every video to every restaurant.
 *
 * A token earns the right to attribute only when it distinguishes ONE place from the others in the
 * same batch: "thảo", "hoàng diệu", "ngọc hân" do; "bún", "bò", "huế", "quán" do not. Tokens shared
 * by two or more places in the batch are discarded before matching, which makes the rule
 * self-calibrating — the same word can be distinctive in one search and useless in the next.
 *
 * A place with no distinctive token left is unmatchable and simply never attributed.
 */

/** Words that never identify anything, whatever the batch looks like. */
const STOPWORDS = new Set([
  'quan', 'quan an', 'nha hang', 'tiem', 'cua hang', 'chi nhanh', 'cn', 'co so',
  'the', 'and', 'restaurant', 'cafe', 'coffee', 'shop', 'store', 'review',
])

/**
 * 🚨 `normalizeVN` strips diacritics but does NOT lowercase — measured, not assumed. Without the
 * explicit `.toLowerCase()` the tokens come out capitalised ("Ngoc", "Han"), so an ALL-CAPS video
 * title never matched and the lowercase STOPWORDS never fired either.
 */
const fold = (s: string): string => normalizeVN(s).toLowerCase()

const tokensOf = (name: string): string[] =>
  fold(name)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))

export interface TikTokSearchResult {
  title?: string | null
  link?: string | null
  snippet?: string | null
}

export interface TikTokAttribution {
  /** placeName → the URL whose title/snippet actually names it. */
  perPlace: Map<string, string>
  /**
   * A valid TikTok URL that could not be tied to any place.
   *
   * Presented as a batch-level discovery link — "related videos" — never as a given place's review.
   * Null when there is no usable result at all, in which case nothing is rendered.
   */
  batch: string | null
}

/**
 * @param results    rows from the batch TikTok search, in provider order
 * @param placeNames every place name in the same batch — needed to know which tokens discriminate
 */
export function attributeTikTok(
  results: ReadonlyArray<TikTokSearchResult> | null | undefined,
  placeNames: readonly string[],
): TikTokAttribution {
  const valid = (results ?? []).filter((r) => isValidTikTokContentUrl(r?.link))
  if (valid.length === 0) return { perPlace: new Map(), batch: null }

  // How many places in this batch use each token? Only the ones used by exactly one can identify.
  const frequency = new Map<string, number>()
  const perPlaceTokens = placeNames.map((name) => {
    const seen = new Set(tokensOf(name))
    for (const t of seen) frequency.set(t, (frequency.get(t) ?? 0) + 1)
    return { name, tokens: seen }
  })

  const perPlace = new Map<string, string>()
  const claimed = new Set<string>()

  for (const { name, tokens } of perPlaceTokens) {
    const distinctive = [...tokens].filter((t) => frequency.get(t) === 1)
    if (distinctive.length === 0) continue

    for (const r of valid) {
      const url = r.link as string
      if (claimed.has(url)) continue
      const haystack = fold(`${r.title ?? ''} ${r.snippet ?? ''}`)
      // EVERY distinctive token must appear. One shared word is a coincidence; the full
      // distinctive set appearing together is the evidence.
      if (distinctive.every((t) => haystack.includes(t))) {
        perPlace.set(name, url)
        claimed.add(url)
        break
      }
    }
  }

  // The first valid URL nobody claimed becomes the batch link. If every URL was attributed there is
  // no leftover, and no batch link is shown.
  const batch = valid.map((r) => r.link as string).find((u) => !claimed.has(u)) ?? null
  return { perPlace, batch }
}
