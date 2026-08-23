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
 *
 * ============================================================================
 * WHY MATCHING IS BY WORD, WITHIN ONE CLAUSE — AND NOT BY SUBSTRING
 * ============================================================================
 * The first version of this file asked `haystack.includes(token)`. That is substring containment,
 * and on folded Vietnamese it attributes videos to restaurants that have nothing to do with them.
 * Both of these were reproduced against the real batch:
 *
 *   "Quán bún bò cacao độc lạ Sài Gòn"          -> "Quán Bún Bò Cao"        because cao ⊂ ca·CAO
 *   "Bún bò ngon ở Nha Trang, tiện đường đi     -> "Bún Bò O Ty Tràng Tiền" because ty ⊂ ci·TY,
 *    city tour"                                                             trang ⊂ "Nha Trang",
 *                                                                           tien ⊂ "tiện"
 *
 * Several independent things are wrong there, so the fix is several rules, each measured:
 *
 * 1. MATCH WHOLE WORDS. The haystack is tokenised exactly like a place name instead of being
 *    searched as a string, which kills "cacao"⊃"cao" and "city"⊃"ty" outright.
 *
 * 2. A TOKEN MUST BE LONG ENOUGH TO IDENTIFY. Word matching alone does NOT save the second case:
 *    fold("tiện") IS "tien" and fold("Nha Trang") DOES contain the whole word "trang" — measured,
 *    not assumed. See MIN_DISTINCTIVE_LENGTH for how the floor was derived from the batch.
 *
 * 3. DIACRITICS COUNT WHEN THE TITLE HAS THEM. Folded, "tiện" and "tiền" are the SAME STRING, so
 *    no amount of word matching can separate them — but the titles spell them differently, and a
 *    title that bothered to write "tiện" is not writing "Tiền". A folded match is therefore accepted
 *    only if the video's spelling is either undecorated (many Serper titles are ASCII, and
 *    "NGOC HAN" must still match "Ngọc Hân") or is exactly the place's own spelling.
 *
 * 4. THE EVIDENCE MUST SIT IN ONE CLAUSE. A restaurant's name does not straddle a comma. In the
 *    second case "trang" and "tien" fall either side of one, so requiring them in the same clause
 *    rejects it independently of rule 3.
 *
 * What is deliberately NOT required is that the tokens be adjacent or in name order. That would
 * also reject "Bún bò Thảo ở Hoàng Diệu" — a genuine match for "BÚN BÒ HUẾ THẢO - HOÀNG DIỆU" —
 * and no measured false positive needs it. Wrong attribution is the failure being fixed; silence is
 * the safe outcome, because an unmatched URL still reaches the user as a batch-level related video.
 */

/** Words that never identify anything, whatever the batch looks like. */
const STOPWORDS = new Set([
  'quan', 'quan an', 'nha hang', 'tiem', 'cua hang', 'chi nhanh', 'cn', 'co so',
  'the', 'and', 'restaurant', 'cafe', 'coffee', 'shop', 'store', 'review',
])

/**
 * Strip diacritics, so "Ngọc" and "NGOC" become the same token.
 *
 * 🚨 `normalizeVN` strips diacritics but does NOT lowercase — measured, not assumed. Case folding
 * lives in `wordsOf` instead, because that is where spellings are produced and spellings have to be
 * comparable to each other, not only to their folded form. Every caller of `fold` here passes a
 * word that already came out of `wordsOf`, so lowercasing twice would be dead code.
 */
const fold = (s: string): string => normalizeVN(s)

/** True when a word is spelled with Vietnamese marks (or đ) rather than plain ASCII. */
const isDecorated = (word: string): boolean => normalizeVN(word) !== word

/**
 * Every word of a string, keeping its diacritics. Case is folded here and nowhere else.
 *
 * Unicode-aware on purpose: splitting on `[^a-z0-9]` would cut "đường" into pieces, because the
 * text has not been stripped of diacritics at this point — that is the whole reason it is kept.
 */
const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * A place name as `folded token -> the spellings the name itself uses`.
 *
 * The raw spellings are kept because they are the only thing separating "Tiền" from "tiện" once
 * diacritics are folded away.
 */
const namePartsOf = (name: string): Map<string, Set<string>> => {
  const parts = new Map<string, Set<string>>()
  for (const raw of wordsOf(name)) {
    const token = fold(raw)
    if (token.length < 2 || STOPWORDS.has(token)) continue
    const spellings = parts.get(token) ?? new Set<string>()
    spellings.add(raw)
    parts.set(token, spellings)
  }
  return parts
}

/**
 * Shortest token allowed to carry identity, derived from the measured batch rather than tuned.
 *
 * Every 2-character distinctive token the real search produced is a Vietnamese function-length
 * syllable — "ty" (O Ty), "tu" (Nhiêu Tứ), "on" (Nhà Ôn) — and each is a whole common word or a
 * syllable of a very common compound ("công TY", "TỦ", "ÔN"). None of them identifies a business,
 * so a video title containing one tells us nothing.
 *
 * The floor is 3 because 3 is the highest floor that costs nothing on that data:
 *
 *   min 2 -> 6/8 places matchable      (keeps ty / tu / on, which is the bug)
 *   min 3 -> 6/8 places matchable      LOSES NOTHING — every place that had evidence still has it
 *   min 4 -> 5/8 places matchable      loses "Quán Bún Bò Cao", whose only evidence is "cao"
 *
 * So this is not a threshold raised until the tests passed: at 3 no place in the measured batch
 * loses a single piece of identifying evidence, and at 4 a real one does.
 */
const MIN_DISTINCTIVE_LENGTH = 3

/**
 * Punctuation that ends a clause, and therefore ends a name.
 *
 * Hyphen, pipe and slash are NOT here on purpose: real place names in this very batch contain them
 * — "BÚN BÒ HUẾ THẢO - HOÀNG DIỆU" and "Nhà Ôn | Bún Bò Huế Phú Nhuận | Cơm Trưa Văn Phòng" —
 * so splitting on them would tear a genuine match in half.
 */
const CLAUSE_BREAK = /[,;:.!?…"'“”‘’«»()[\]{}\n\r]+/

/**
 * The video's text cut into clauses, each clause a map of `folded token -> spellings seen`.
 *
 * Title and snippet are joined by a newline, which CLAUSE_BREAK treats as a break, so a name can
 * never be assembled out of one word in the title and another in the snippet.
 */
const clausesOf = (title: string, snippet: string): Array<Map<string, Set<string>>> =>
  `${title}\n${snippet}`
    .split(CLAUSE_BREAK)
    .map((clause) => {
      const words = new Map<string, Set<string>>()
      for (const raw of wordsOf(clause)) {
        const token = fold(raw)
        if (!token) continue
        const spellings = words.get(token) ?? new Set<string>()
        spellings.add(raw)
        words.set(token, spellings)
      }
      return words
    })
    .filter((words) => words.size > 0)

/**
 * Does this clause contain `token` spelled in a way that can be the place's own word?
 *
 * Plain ASCII always can — Serper titles are frequently undecorated, and "NGOC HAN" is a real match
 * for "Ngọc Hân". A decorated spelling can only be the place's if it IS the place's: "tiện" is not
 * a way of writing "Tiền".
 */
function tokenPresent(clause: Map<string, Set<string>>, token: string, spellings: Set<string>): boolean {
  const seen = clause.get(token)
  if (!seen) return false
  for (const raw of seen) {
    if (!isDecorated(raw) || spellings.has(raw)) return true
  }
  return false
}

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
    const parts = namePartsOf(name)
    for (const t of parts.keys()) frequency.set(t, (frequency.get(t) ?? 0) + 1)
    return { name, parts }
  })

  const perPlace = new Map<string, string>()
  const claimed = new Set<string>()

  for (const { name, parts } of perPlaceTokens) {
    const distinctive = [...parts.keys()]
      .filter((t) => frequency.get(t) === 1 && t.length >= MIN_DISTINCTIVE_LENGTH)
    // Nothing long enough to identify this place. Not attributed — the URL stays unclaimed and is
    // still offered to the user as a batch-level related video.
    if (distinctive.length === 0) continue

    for (const r of valid) {
      const url = r.link as string
      if (claimed.has(url)) continue

      // EVERY distinctive token must appear, as a whole word, inside ONE clause. One shared word is
      // a coincidence; the full distinctive set together in a single clause is the evidence.
      //
      // The loop is a loop, not `.some()`, so the only quantifier over tokens is the `every` below:
      // this must never weaken into "any distinctive token matched".
      let matched = false
      for (const clause of clausesOf(r.title ?? '', r.snippet ?? '')) {
        if (distinctive.every((t) => tokenPresent(clause, t, parts.get(t) as Set<string>))) {
          matched = true
          break
        }
      }
      if (matched) {
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
