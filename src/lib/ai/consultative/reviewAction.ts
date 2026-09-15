// ── Phase A A11 — Structural review/social actionability ─────────────────────
//
// Round 1 shipped a prompt-only rule that said "when review data is missing,
// pivot to google_rating + a YouTube search URL." Model preferred Facebook in
// one test. The fix is structural: compute the actionable review URLs at the
// pipeline level and hand them to the synthesizer as DATA, not as a hint. The
// LLM references the URLs; it never invents them.
//
// Priority order (frozen product principle P11 rule 1):
//   1. verified direct review / social URL   (tiktok_review_url when attributed,
//      TripAdvisor / Foody / etc. when the tool carries them)
//   2. verified platform URL                 (Google Maps place page, official website)
//   3. generic YouTube search URL            (fallback when nothing else exists)
//
// The generic YouTube search URL is a PUBLIC search — not a specific video, not
// a fabricated URL. It is never attributed to a review; the label says
// "search video review on YouTube", never "the review is here".

export type ReviewSourceKind =
  | 'tiktok_verified'
  | 'youtube_verified'
  | 'facebook_verified'
  | 'google_maps'
  | 'official_website'
  | 'youtube_search_fallback'

export interface ReviewAction {
  kind: ReviewSourceKind
  /** Human-facing label the synthesizer may render as-is. */
  label: string
  /** The URL. For `youtube_search_fallback` this is a public search URL. */
  url: string
  /**
   * True when the URL is a specific attributed piece of content
   * (verified review video, official page). False for search fallbacks — the
   * synthesizer must NEVER claim a fallback link is "the review".
   */
  attributed: boolean
}

const YT_RESULTS = 'https://www.youtube.com/results?search_query='

/**
 * Compute the ordered review actions for a place-like candidate. Accepts a
 * loose shape so it can be called from either the Candidate world or straight
 * off a tool result row.
 */
export function reviewActionsForPlace(place: {
  name?: string
  place_id?: string
  maps_link?: string
  website_uri?: string
  tiktok_review_url?: string
  has_tiktok_review?: boolean
  youtube_review_url?: string
  facebook_page?: string
}): readonly ReviewAction[] {
  const out: ReviewAction[] = []
  const name = (place.name || '').trim()

  // 1) Verified attributed content — highest priority. A URL only qualifies as
  // attributed when the pipeline previously validated the domain-to-place match.
  if (place.has_tiktok_review && typeof place.tiktok_review_url === 'string' && place.tiktok_review_url.startsWith('http')) {
    out.push({
      kind: 'tiktok_verified',
      label: `📱 Review TikTok — ${name || 'quán'}`,
      url: place.tiktok_review_url,
      attributed: true,
    })
  }
  if (typeof place.youtube_review_url === 'string' && place.youtube_review_url.startsWith('http')) {
    out.push({
      kind: 'youtube_verified',
      label: `▶️ Review YouTube — ${name || 'quán'}`,
      url: place.youtube_review_url,
      attributed: true,
    })
  }
  if (typeof place.facebook_page === 'string' && place.facebook_page.startsWith('http')) {
    out.push({
      kind: 'facebook_verified',
      label: `👥 Facebook — ${name || 'quán'}`,
      url: place.facebook_page,
      attributed: true,
    })
  }

  // 2) Verified platform — a Google Maps place page is always ok to expose as a
  // "see reviews" action; the platform aggregates review evidence. Same for the
  // official website, when the tool provided one.
  if (typeof place.maps_link === 'string' && place.maps_link.startsWith('http')) {
    out.push({
      kind: 'google_maps',
      label: `📍 Google Maps — ${name || 'quán'}`,
      url: place.maps_link,
      attributed: true,
    })
  }
  if (typeof place.website_uri === 'string' && place.website_uri.startsWith('http')) {
    out.push({
      kind: 'official_website',
      label: `🌐 Website — ${name || 'quán'}`,
      url: place.website_uri,
      attributed: true,
    })
  }

  /**
   * 3) Generic YouTube search fallback — only when no REVIEW CONTENT exists.
   *
   * 🚨 THIS RUNG WAS UNREACHABLE FOR EVERY PLACE, and the measurement is blunt:
   * across four live domains, 100% of `review_actions` were `google_maps` or
   * `official_website` and 0 review buttons reached a card. Two rules combined to
   * do it. Here, the fallback was gated on `out.length === 0` — but every OSM row
   * carries a `maps_link`, so rung 2 had always pushed something. In actions.ts,
   * those same two kinds are then skipped, because their URLs duplicate the Maps
   * and Website buttons. So the ladder filled itself with entries that were
   * guaranteed to be discarded, and the one rung that would have survived never
   * fired.
   *
   * The gate now asks the question it always meant: is there any REVIEW CONTENT?
   * A Maps place page and an official website are platform destinations already
   * offered under their own labels — they are not somebody's review. When none of
   * the attributed content rungs matched, offering a clearly-labelled public
   * search is the honest remaining option, and it is what the product decided.
   *
   * Still never evidence: `attributed: false`, and the label says "find video
   * reviews", never "the review is here".
   */
  const hasReviewContent = out.some(a => a.kind !== 'google_maps' && a.kind !== 'official_website')
  if (!hasReviewContent && name) {
    const q = encodeURIComponent(`${name} review`)
    out.push({
      kind: 'youtube_search_fallback',
      label: `🔎 Tìm video review trên YouTube`,
      url: `${YT_RESULTS}${q}`,
      attributed: false,
    })
  }

  return out
}

/**
 * Actions for a product candidate — narrower than places because shopping
 * platforms carry the review link on the row already.
 */
export function reviewActionsForProduct(product: {
  title?: string
  link?: string
  youtube_review_url?: string
}): readonly ReviewAction[] {
  const out: ReviewAction[] = []
  const name = (product.title || '').trim()
  if (typeof product.youtube_review_url === 'string' && product.youtube_review_url.startsWith('http')) {
    out.push({
      kind: 'youtube_verified',
      label: `▶️ Review YouTube — ${name || 'sản phẩm'}`,
      url: product.youtube_review_url,
      attributed: true,
    })
  }
  if (typeof product.link === 'string' && product.link.startsWith('http')) {
    out.push({
      kind: 'official_website',
      label: `🛒 Xem trên sàn — ${name || 'sản phẩm'}`,
      url: product.link,
      attributed: true,
    })
  }
  if (out.length === 0 && name) {
    const q = encodeURIComponent(`${name} review`)
    out.push({
      kind: 'youtube_search_fallback',
      label: `🔎 Tìm review YouTube`,
      url: `${YT_RESULTS}${q}`,
      attributed: false,
    })
  }
  return out
}
