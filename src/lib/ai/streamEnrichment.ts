import { normalizeVN } from './intent'
import { findPlaceOffset, proseHeaders, type Header } from './placeMatch'
import type { EnrichmentCollector } from './toolResultSplit'
import { extractMoneyClaims, guardMoneyClaimsInText, sentenceSpans, protectedSpans, type EvidenceRecord } from './moneyGuard'
import { guardTravelClaimsInText } from './travelGuard'
import { guardSnippetPricesInText, pricesFromSnippets, type SnippetPriceScope } from './snippetPriceGuard'
import { guardPlaceClaimsInText, isDirectTicketUrl, mentionsTickets } from './placeClaimGuard'
import { guardPlanPrices, planPriceEvidenceFromRows } from './planPriceGuard'
import { safeFlushPoint } from './progressiveFlush'
import { isValidTikTokContentUrl } from '@/lib/links/tiktokReview'
import { guardSpecClaimsInText, type SpecEvidence } from './consultative/specGuard'
import { sanitizeUrlForMarkdown, escapeMarkdownLabel } from './tools/common'
import { EMIT_TAPPY_PLACES, EMIT_PLACES_ANNOTATION, SERVER_AUTHORED_CTA, placeGuardAttributionV2Enabled, snippetPriceGuardV2Enabled, mediaPlacementV2Enabled } from '@/lib/config/product'
import { bandFromRow, type PriceBand } from '@/lib/recommendation/priceBand'
import { renderPlacesMarker } from '@/lib/recommendation/marker'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'
/** Item 2: cards above the fold — the model's picks (pick + alternatives) filled from the engine. */
const CARDS_SHOWN = 3
import { renderCtaBlock, stripModelCta } from '@/lib/recommendation/cta'
import { unlinkMislabelledMerchantLinks, validateModelCtaBlock, stripFalseDisconnectClaims, unemphasizeLinks } from '@/lib/recommendation/ctaValidation'
import { actionTranslator } from '@/lib/recommendation/actionLabel'
import { entertainmentCapabilityOf, requestedProviderOf } from './tools/commerceIntent'
import { suppressUngroundedVenues, isGrounded, normalizeHeading, isVenueHeading, type PlaceSearchStatus } from './groundingGate'
import { shoppingPickFromMarker } from './consultative/pickBackstop'
import { appendFileSync } from 'fs'
import { guardClarifications } from './clarificationGuard'
import { guardSearchClaims } from './consultative/searchClaimGuard'
import { extractAttributes, guardAtmosphereClaims, attributeForHard } from './consultative/reviewAttributes'
import { HARD_GAP_WORDS } from './consultative/hardConstraints'
import { capHedges } from './consultative/hedgeCap'
import type { Hard } from './consultative/situationFrame'
import { guardProseShape } from './consultative/proseShape'
import type { Recommendation } from '@/lib/recommendation/recommendation'

// The AI SDK data-stream protocol used by streamText().toDataStreamResponse():
//   0:"<text delta>"                         — assistant text chunk
//   9:{"toolCallId","toolName","args"}       — tool invocation
//   a:{"toolCallId","result"}                — tool result
//   e:{"finishReason",...}                   — end of one step (multi-step tool calls repeat 0/9/a/e)
//   d:{"finishReason",...}                   — end of the whole response, appears exactly once

type PlatformLink = { name: string; url: string }
type PlaceLike = {
  name?: string
  photo_url?: string
  photo_urls?: string[]
  order_links?: PlatformLink[]
  platform_links?: PlatformLink[]
  // Identity used to resolve photos late (B7-A). Present on the slim tool result
  // the model sees, so it survives into the stream frames the filter parses.
  place_id?: string
  website_uri?: string
  address?: string
  /**
   * Google photo RESOURCE NAMES from the widened search field mask. Carried on
   * the carved enrichment (never model-facing) so the late resolver can build a
   * media URL directly, instead of paying a legacy Place Details call to learn
   * a reference the search response already returned.
   */
  photo_names?: string[]
  /** Backend-validated TikTok review/video URL, or absent when the provider found none. */
  tiktok_review_url?: string
  // Structured place facts carried alongside the localized `google_rating` sentence, so the
  // [TAPPY_PLACES] block can state them as values instead of a client parsing them back out of
  // prose. Provider-dependent, hence all optional (Google: rating/review count; OSM: hours,
  // distance, cuisine).
  rating?: number
  review_count?: number
  /**
   * Whether the provider ranked this place against the query TEXT (Google Places textSearch) or
   * only by category and radius (the OpenStreetMap fallback). Gates [TAPPY_PLACES] — see
   * renderPlacesMarker. Carried from the tool result by toolResultSplit.
   */
  text_ranked?: boolean
  distance_km?: number
  hours?: string
  attributes?: string[]
}
// get_hotel_prices / search_products' primary content — 'title' stands in for 'name'.
type SearchResultLike = { title?: string; photo_url?: string; photo_urls?: string[] }

/**
 * Fetches photos for exactly the places handed to it, keyed by place name (B7-A).
 * Supplied by the route so this module stays free of tool/vendor imports and the
 * pre-B7-A tests keep running with no network at all.
 */
export type PhotoResolver = (places: PlaceLike[]) => Promise<Map<string, string[]>>

/**
 * Finds TikTok reviews for the entities that will actually render.
 *
 * Separate from `PhotoResolver` because it runs at a different moment for a
 * different reason: photos are resolved for whatever the reply named, TikTok is
 * resolved for whatever SURVIVED ADMISSION — the card's own list. Injected like
 * the photo resolver so the filter stays testable without a network.
 */
export type TikTokResolver = (
  names: readonly string[],
  location: string | undefined,
) => Promise<{ perPlace: Map<string, string>; batch: string | null }>

function decodeSafe(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

// Google gstatic thumbnail URLs end with a &s=NN size suffix that the AI sometimes drops
// (e.g. "...&s=10" -> "...&s") when copying near-verbatim — strip it before the fallback
// comparison so that still counts as "already present".
function coreImageUrl(url: string): string {
  return url.replace(/&s=?\d*$/, '')
}

// Images are copied verbatim by the AI or not at all — it can't reformulate a working CDN
// URL the way it sometimes rewrites a search-link query string — so an exact (decoded) match
// is reliable here, unlike the domain-based check used for TikTok/order links below. Falls
// back to a suffix-tolerant core match for the gstatic truncation case above.
function imageUrlPresent(url: string, decodedText: string): boolean {
  const decoded = decodeSafe(url)
  if (decodedText.includes(decoded)) return true
  const core = coreImageUrl(decoded)
  return core !== decoded && decodedText.includes(core)
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

// The AI sometimes writes its OWN version of a link (different query string, city suffix
// dropped, etc.) rather than copying the tool's exact URL — so even a decoded string match
// misses it. What actually matters is whether that place already has a link to the same
// domain somewhere near its own name, regardless of the exact URL content. windowEnd (the
// next chosen place's own mention, or the CTA_BUTTONS marker) is the real boundary — no
// extra fixed-length cap, since a single long image URL (CDN tracking params etc.) can
// otherwise push a place's own TikTok/order line past an arbitrary short cutoff.
function hasDomainNearName(placeName: string, domain: string, lowerText: string, windowEnd: number): boolean {
  if (!domain) return false
  const idx = lowerText.indexOf(placeName.toLowerCase())
  if (idx === -1) return false
  const window = lowerText.slice(idx, windowEnd)
  return window.includes(domain)
}

// Tool-provided names sometimes lack diacritics the AI adds back in when it writes its own
// prose (e.g. tool: "Long Bien", AI's text: "Long Biên") — normalize BOTH the text and every
// name lookup the same way, or position-finding silently fails.
const normName = (n: string) => normalizeVN(n.toLowerCase())

const hasPhoto = (p: PlaceLike) => !!((p.photo_urls && p.photo_urls.length > 0) || p.photo_url)

/**
 * Which places a durable card may name, and in which order.
 *
 * 🚨 THIS USED TO BE A SECOND `[TAPPY_PLACES]` RENDERER. It serialized its own
 * `{ v: 1, places: [...] }` payload while `lib/recommendation/marker.ts` serialized
 * `{ v: 1, items: [...] }` under the SAME marker literal and the SAME version number —
 * two schemas, one wire contract, and only the latter had a client parser
 * (`parsePlacesMarker` checks `payload.items`), a persistence policy (`mayPersist`) and a
 * place in the shared three-platform fixture suite. The serializer therefore lives there
 * and only there; what survives here is the part that was NOT duplicated: the two
 * conditions under which a place has earned a card at all.
 *
 * 1. THE PROVIDER MUST HAVE RANKED IT AGAINST THE USER'S WORDS (`text_ranked`).
 *    Google Places textSearch does. The OpenStreetMap fallback does not: it is handed a
 *    category and a radius, so for "bún bò" it returns whatever restaurants are nearby.
 *    Measured on 2026-09-08, with Google returning 403, that produced a Western
 *    restaurant, a French restaurant and a steakhouse — all real, all nearby, none of
 *    them an answer. Those rows still reach the model and can inform its prose; what they
 *    must not do is become a numbered "Tappy recommends" rail.
 *
 * 2. THE REPLY MUST ALREADY NAME IT. A card can never advertise a place the reader was
 *    not shown, nor contradict the order they read, so the result is ordered by where the
 *    prose mentions each name.
 *
 * Returns [] when either condition removes everything — the caller emits no marker at all
 * rather than an empty one.
 */
export function placesGroundedInProse(places: PlaceLike[], prose: string): PlaceLike[] {
  if (!places || places.length === 0 || !prose.trim()) return []

  const ranked = places.filter(p => p.text_ranked === true)
  if (ranked.length === 0) return []
  places = ranked

  // Same alignment guard injectPlaceEnrichment uses: normalizeVN must stay index-aligned for
  // offsets to mean anything. When it does not, fall back to the source order rather than mis-rank.
  const norm = normalizeVN(prose.toLowerCase())
  const aligned = norm.length === prose.length
  const headers: Header[] = aligned ? proseHeaders(norm) : []

  const named = places
    .map((place, index) => {
      const name = (place.name ?? '').trim()
      const at = aligned && name ? findPlaceOffset(name, norm, headers) : -1
      return { place, name, at, index }
    })
    .filter(entry => entry.name !== '' && (!aligned || entry.at !== -1))
    .sort((a, b) => (aligned ? a.at - b.at : a.index - b.index))

  return named.map(entry => entry.place)
}

/**
 * The same two conditions, applied to the RECOMMENDATIONS the durable marker serializes.
 *
 * `renderPlacesMarker` (marker.ts) takes `Recommendation[]`; the evidence for both
 * conditions lives on the tool rows (`text_ranked`) and in the prose. So the rows decide,
 * and the recommendations follow them — matched by name, ordered exactly as
 * [placesGroundedInProse] ordered the rows, so the card cannot rank differently from the
 * text the reader just read.
 *
 * A recommendation whose place is not in the grounded set is dropped rather than
 * reordered: it has no card because the reply gave it no mention.
 */
export function recommendationsGroundedInProse(
  recs: Recommendation[],
  places: PlaceLike[],
  prose: string,
): Recommendation[] {
  const grounded = placesGroundedInProse(places, prose)
  if (grounded.length === 0) return []
  const order = new Map(grounded.map((p, i) => [normName((p.name ?? '').trim()), i]))
  return recs
    .map(r => ({ r, at: order.get(normName(r.entity.identity.name.trim())) }))
    .filter((e): e is { r: Recommendation; at: number } => e.at !== undefined)
    .sort((a, b) => a.at - b.at)
    .map(e => e.r)
}

// ── System-owned enrichment placement ────────────────────────────────────────
// Architecture: the LLM writes PROSE ONLY; the app OWNS where each place's images
// and order/platform links appear. If the model also emits any of that markdown
// (old habit / partial disobedience), we STRIP its copies here and re-inject them
// positionally, so placement never depends on the model obeying. We ONLY strip
// markdown whose URL matches THIS batch's tool data (an owned image URL or order/
// platform domain) — product-marketplace links, [TAPPY_PLAN]/[CTA_BUTTONS]/
// [FOLLOWUPS] blocks, and prose are never touched.
//
// TikTok review links (product decision 2026-08-16, consultative only): a place MAY carry one,
// but only the URL the backend validated out of a real provider result — see
// lib/links/tiktokReview. The model is never the source. Every tiktok.com line it writes is
// stripped here; the validated URL is then re-injected positionally, so the only TikTok link a
// user can ever see is one the backend approved. A model that invents `/@quan/video/<name>`
// produces nothing.
//
// This does NOT change the review composer, whose LINK_VIDEO_PROVIDERS = ['youtube'] contract is
// separate and still enforced by its own parity guards.
type Owned = { imageCores: Set<string>; linkDomains: Set<string>; tiktokUrls: Set<string> }

function buildOwned(places: PlaceLike[]): Owned {
  const imageCores = new Set<string>()
  const linkDomains = new Set<string>()
  const tiktokUrls = new Set<string>()
  for (const p of places) {
    const photos = p.photo_urls && p.photo_urls.length > 0 ? p.photo_urls : (p.photo_url ? [p.photo_url] : [])
    for (const u of photos) imageCores.add(coreImageUrl(decodeSafe(u)))
    for (const l of (p.order_links || [])) { const d = domainOf(l.url); if (d) linkDomains.add(d) }
    for (const l of (p.platform_links || [])) { const d = domainOf(l.url); if (d) linkDomains.add(d) }
    // Re-validate at the boundary rather than trusting the field: this set is the ONLY thing
    // that can put a TikTok URL in front of a user.
    if (isValidTikTokContentUrl(p.tiktok_review_url)) tiktokUrls.add(p.tiktok_review_url as string)
  }
  return { imageCores, linkDomains, tiktokUrls }
}

function isOwnedImageUrl(url: string, owned: Owned): boolean {
  const decoded = decodeSafe(url)
  return owned.imageCores.has(decoded) || owned.imageCores.has(coreImageUrl(decoded))
}

const IMG_TOKEN = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g
const LINK_TOKEN = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g

// True only for a WHOLE line that is nothing but system-owned enrichment, so removing
// it can never disturb prose: a run of owned image tokens; a "🎵 [..](tiktok..)"
// review line (TikTok is unsupported in V1 — always stripped); or a run of owned
// order/platform link tokens joined by "·".
function isOwnedEnrichmentLine(line: string, owned: Owned): boolean {
  const t = line.trim()
  if (t === '') return false

  const imgs = [...t.matchAll(IMG_TOKEN)]
  if (imgs.length > 0) {
    const rest = t.replace(IMG_TOKEN, '').trim()
    if (rest === '' && imgs.every(m => isOwnedImageUrl(m[1], owned))) return true
  }

  // TikTok review line. Stripped whether or not it is the validated one: the backend re-injects
  // its own copy positionally, so removing the model's saves us from trusting its placement, and
  // removing an UNvalidated one is what makes invention impossible.
  const tiktok = t.match(/^🎵\s*\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/)
  if (tiktok && /(^|\.)tiktok\.com$/.test(domainOf(tiktok[1]))) return true

  const links = [...t.matchAll(LINK_TOKEN)]
  if (links.length > 0) {
    const rest = t.replace(LINK_TOKEN, '').replace(/·/g, '').trim()
    if (rest === '' && links.every(m => owned.linkDomains.has(domainOf(m[1])))) return true
  }
  return false
}

// Remove the LLM's own copies of owned enrichment (line-wise) so injection re-places
// them; collapse the blank runs the removals leave behind.
/**
 * Remove every markdown link to TikTok that is not the backend-validated URL — inline in prose
 * too, not just whole lines.
 *
 * Without this, `xem review trên [TikTok](https://tiktok.com/@guess/video/1)` mid-sentence would
 * survive the line-wise pass and the model WOULD be able to publish a URL it invented. Stripping
 * to the link's own label keeps the sentence readable.
 */
function stripUnvalidatedTikTokLinks(text: string, owned: Owned): string {
  return text.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (whole, label: string, url: string) =>
    /(^|\.)tiktok\.com$/.test(domainOf(url)) && !owned.tiktokUrls.has(url) ? label : whole)
}

function stripOwnedEnrichment(places: PlaceLike[], text: string): string {
  const owned = buildOwned(places)
  // Always run: even with no owned images/links there may be an LLM-emitted TikTok
  // review line to strip (unsupported provider in V1).
  const kept = text.split('\n').filter(line => !isOwnedEnrichmentLine(line, owned))
  return stripUnvalidatedTikTokLinks(kept.join('\n'), owned).replace(/\n{3,}/g, '\n\n')
}

// The image/review/order-link markdown a place is still MISSING from the text (dedup-aware),
// WITHOUT any place-name header — the caller decides whether these lines are injected inline
// (right after the place) or wrapped under a header in the legacy trailing block.
function placeContentLines(
  p: PlaceLike,
  decodedText: string,
  dedupText: string,
  windowEnd: number,
): { lines: string[]; missingPhotoCount: number } {
  const ownName = normName(p.name as string)
  const lines: string[] = []
  // Images are checked one-by-one by exact URL, not by domain — the gallery can have several
  // gstatic.com images, and having ONE of them already in the text must not skip the other two.
  // P3-S4: this is the one place retrieved content becomes user-visible markup
  // WITHOUT passing through the model, so the structure has to be guaranteed
  // here. Photo URLs come from a merchant's own og:image and from Serper image
  // search — third-party strings — and link labels/URLs from the deterministic
  // builders. Both are encoded so a retrieved value can never close the token
  // it sits in. Encoding does not disturb the dedup below: imageUrlPresent
  // percent-decodes both sides, so the encoded and raw forms compare equal.
  const rawPhotos = (p.photo_urls && p.photo_urls.length > 0 ? p.photo_urls : (p.photo_url ? [p.photo_url] : []))
  const photos = rawPhotos.map(sanitizeUrlForMarkdown)
  // Universal Plan (cross-domain): ONE representative photo per place, not a
  // per-place gallery. Several places EACH with a 3-photo gallery turns a food /
  // spa / places reply into a visual catalogue — the "9-image flood" — which
  // reads as "here are N listings" instead of a decision. A single representative
  // image per place keeps the reply decision-oriented (the shopping standard),
  // while every place still keeps its order/platform links and TikTok review
  // below. Trip plans are unaffected: injectPlanPhotos already injects exactly
  // one photo per plan item and never calls this.
  const missingPhotos = photos.filter(url => !imageUrlPresent(url, decodedText)).slice(0, 1)
  // Sanitised again at the point the markup is built, even though `photos` is
  // already canonical. The call is idempotent ('%' is never encoded), so the
  // second pass costs a no-op scan and buys a LINE-LOCAL invariant: the
  // architecture guard can require every markdown token in this layer to name
  // its sanitiser, with no exemptions to keep correct as the file changes.
  for (const url of missingPhotos) lines.push(`![Ảnh địa điểm](${sanitizeUrlForMarkdown(url)})`)
  // Validated TikTok review, injected positionally like every other owned link. Re-validated
  // here so a malformed field can never reach the user even if it slipped into the tool result.
  //
  // 🔑 Kept from the release branch — the D3 side predates the validated-TikTok feature entirely.
  // The URL goes through the same sanitiser as the photo above for the same line-local reason,
  // which is the one thing this side gains from the integration.
  if (isValidTikTokContentUrl(p.tiktok_review_url)) {
    const url = p.tiktok_review_url as string
    if (!hasDomainNearName(ownName, domainOf(url), dedupText, windowEnd)) {
      // Fixed label, like the injected `![Ảnh địa điểm]` above: "Review TikTok" reads the same
      // either language and the platform name carries the meaning.
      lines.push(`🎵 [${escapeMarkdownLabel('Review TikTok')}](${sanitizeUrlForMarkdown(url)})`)
    }
  }
  const links = p.order_links || p.platform_links
  if (links && links.length > 0) {
    const missing = links.filter(l => !hasDomainNearName(ownName, domainOf(l.url), dedupText, windowEnd))
    if (missing.length > 0) {
      lines.push(missing
        .map(l => `[${escapeMarkdownLabel(l.name)}](${sanitizeUrlForMarkdown(l.url)})`)
        .join(' · '))
    }
  }
  return { lines, missingPhotoCount: missingPhotos.length }
}

// Offsets of EVERY place the reply mentions — including photo-less ones. These are
// the block boundaries for injection. (Root-cause fix: bounding a place's window by
// only the *enriched* places let a first place's gallery run past its photo-less
// neighbours all the way to the end of the message.) Index-aligned to the raw text.
function placeMentionOffsets(places: PlaceLike[], dedupText: string, headers: Header[]): number[] {
  const allNames = places.map(p => p.name || '').filter(Boolean)
  const offs: number[] = []
  for (const p of places) {
    if (!p.name) continue
    // Competitors = every OTHER place this turn. Without them a token-overlap
    // match cannot know it is contested, which is how a link landed on the wrong
    // restaurant (see headerIsContested in placeMatch.ts).
    const i = findPlaceOffset(p.name, dedupText, headers, allNames.filter(n => n !== p.name))
    if (i !== -1) offs.push(i)
  }
  return offs
}

/**
 * G3 (MEDIA_PLACEMENT_V2) — where an owned block may be INSERTED: the end of the
 * markdown block that contains the mention, never inside it.
 *
 * 🚨 `boundaryAfter` below is the DEDUP WINDOW, not an insertion point. Using it
 * for both spliced a photo into the middle of "… hoặc **B** …" whenever two venues
 * shared a sentence — 13 of 69 blocks on the 2026-09-17 mobile-path replay. The
 * window stays as it is; this decides the offset:
 *   · paragraph            → after its last non-blank line
 *   · unordered list item  → after that item's line (a following bullet starts fresh)
 *   · ordered list item    → after the WHOLE ordered list, so the Android renderer
 *                            never sees "1." … ⟨image⟩ … "2." and restarts the count
 *   · table / block quote  → after the whole table / quote
 *   · code fence           → after the closing fence
 * Capped at `textEnd` (first structured marker / end of text). Owner rules, G3 Q1.
 */
const LIST_ITEM_RE = /^\s{0,3}(?:[-*+•]|\d{1,3}[.)])\s/
const ORDERED_ITEM_RE = /^\s{0,3}\d{1,3}[.)]\s/
const CONTINUATION_RE = /^\s{2,}\S/
const TABLE_ROW_RE = /^\s*\|/
const QUOTE_RE = /^\s{0,3}>/
const FENCE_RE = /^\s{0,3}(?:```|~~~)/
function blockEndAfter(text: string, idx: number, textEnd: number): number {
  const scope = text.slice(0, textEnd)
  const lines: Array<{ start: number; end: number; s: string }> = []
  let pos = 0
  for (const raw of scope.split('\n')) { lines.push({ start: pos, end: pos + raw.length, s: raw }); pos += raw.length + 1 }
  let i = lines.findIndex(l => idx >= l.start && idx <= l.end)
  if (i === -1) return textEnd
  // Inside a code fence? Count fences above the mention.
  let open = false, openAt = -1
  for (let k = 0; k <= i; k++) if (FENCE_RE.test(lines[k].s)) { open = !open; openAt = k }
  if (open) {
    for (let k = openAt + 1; k < lines.length; k++) if (FENCE_RE.test(lines[k].s)) return Math.min(lines[k].end, textEnd)
    return textEnd
  }
  const line = lines[i].s
  const extend = (pred: (s: string) => boolean): number => { let k = i; while (k + 1 < lines.length && pred(lines[k + 1].s)) k++; return Math.min(lines[k].end, textEnd) }
  if (TABLE_ROW_RE.test(line)) return extend(s => TABLE_ROW_RE.test(s))
  if (QUOTE_RE.test(line)) return extend(s => QUOTE_RE.test(s))
  if (ORDERED_ITEM_RE.test(line)) {
    // walk back to the first item of this ordered list, then forward over the whole list
    while (i > 0 && (ORDERED_ITEM_RE.test(lines[i - 1].s) || CONTINUATION_RE.test(lines[i - 1].s))) i--
    return extend(s => ORDERED_ITEM_RE.test(s) || CONTINUATION_RE.test(s))
  }
  if (LIST_ITEM_RE.test(line)) return extend(s => CONTINUATION_RE.test(s))
  return extend(s => s.trim() !== '' && !LIST_ITEM_RE.test(s) && !TABLE_ROW_RE.test(s) && !QUOTE_RE.test(s) && !FENCE_RE.test(s))
}

// End of a place's block = the nearest mentioned-place offset AFTER it (so its links
// can't be attributed to a later place), capped at textEnd (first structured marker
// / end of text).
function boundaryAfter(ownIdx: number, mentionOffsets: number[], textEnd: number): number {
  let end = textEnd
  for (const i of mentionOffsets) if (i > ownIdx) end = Math.min(end, i)
  return end
}

// Structured, computer-parsed blocks (not free prose): the client extracts these and renders
// them itself, so we must NEVER splice image markdown inside them — doing so corrupts the
// [TAPPY_PLAN] JSON (breaking the trip brochure) or the CTA/followups markers.
const STRUCTURED_MARKERS = ['[TAPPY_PLAN]', '[CTA_BUTTONS]', '[FOLLOWUPS]']

// Offset of the earliest structured-block marker (or end of text) — the hard upper bound for
// where positional injection may write.
function earliestMarker(text: string): number {
  let end = text.length
  for (const m of STRUCTURED_MARKERS) {
    const i = text.indexOf(m)
    if (i !== -1 && i < end) end = i
  }
  return end
}

// Add each matched place's representative photo to its plan item INSIDE the [TAPPY_PLAN]
// JSON, so TripPlanCard renders a thumbnail per item (no trailing image block for plans).
// Edits the PARSED object then re-serializes — never string-splices markdown into the JSON.
// A plan item with no place match (transport, "dự phòng"…) simply gets no photo. If the JSON
// can't be parsed or nothing matches, the text is returned unchanged (no photos, no crash).
function injectPlanPhotos(places: PlaceLike[], fullText: string): string {
  const open = '[TAPPY_PLAN]'
  const close = '[/TAPPY_PLAN]'
  const start = fullText.indexOf(open)
  const end = fullText.indexOf(close)
  if (start === -1 || end === -1 || end < start) return fullText

  let plan: { days?: Array<{ items?: Array<{ name?: string; photo_url?: string }> }> }
  try {
    plan = JSON.parse(fullText.slice(start + open.length, end).trim())
  } catch {
    return fullText // malformed JSON — leave it for the client to handle, never corrupt it
  }
  if (!plan || !Array.isArray(plan.days)) return fullText

  // name → first photo, from the tool's places
  const photoByName = new Map<string, string>()
  for (const p of places) {
    if (!p.name) continue
    const photo = (p.photo_urls && p.photo_urls.length > 0 ? p.photo_urls[0] : p.photo_url)
    if (photo) photoByName.set(normName(p.name), photo)
  }
  if (photoByName.size === 0) return fullText

  let changed = false
  for (const day of plan.days) {
    if (!Array.isArray(day?.items)) continue
    for (const item of day.items) {
      if (!item?.name || item.photo_url) continue
      const key = normName(item.name)
      let photo = photoByName.get(key)
      if (!photo) {
        for (const [n, url] of photoByName) {
          if (n.length >= 4 && (key.includes(n) || n.includes(key))) { photo = url; break }
        }
      }
      if (photo) { item.photo_url = photo; changed = true }
    }
  }
  if (!changed) return fullText

  return fullText.slice(0, start) + open + '\n' + JSON.stringify(plan) + '\n' + fullText.slice(end)
}

// POSITION-AWARE injection: the app owns enrichment layout. It (1) STRIPS any
// enrichment the LLM wrote itself, then (2) rebuilds the assistant text with each
// place's image/review/order-link markdown inserted IMMEDIATELY AFTER that place's
// own block — bounded by the NEXT MENTIONED PLACE (photo-less ones included) / the
// first structured marker / end of text — so photos stay grouped with their place
// instead of piling up in one trailing block, regardless of what the model emitted.
const hasLinks = (p: PlaceLike) =>
  !!((p.order_links && p.order_links.length > 0) || (p.platform_links && p.platform_links.length > 0))

/** A validated TikTok review is enrichment in its own right — same reasoning as the B4 finding
 *  below: a place that has only this must still reach the injector, or the link is silently lost
 *  for every place without a photo or an order link. */
const hasTikTok = (p: PlaceLike) => isValidTikTokContentUrl(p.tiktok_review_url)

/**
 * Which places will actually receive enrichment, given the finished reply — and
 * therefore the only ones worth resolving photos for (B7-A).
 *
 * Mirrors what the injector below does, so selection and injection cannot drift:
 * a [TAPPY_PLAN] reply enriches every place matching a plan ITEM (6-10 is normal
 * and must not be capped), while ordinary prose enriches at most 3.
 */
/**
 * How many places may be sent for a BILLED photo lookup.
 *
 * 🚨 THIS USED TO BE THE ONLY RULE, AND IT COST FIVE OF EIGHT CARDS THEIR IMAGE.
 * The card renders up to `MAX_ITEMS` (8) entities; this capped photo resolution
 * at 3, chosen by which places the PROSE happened to name. Measured across four
 * domains: 3/6, 3/8, 3/8 — the shortfall was structural, not provider coverage.
 *
 * 🔑 THE CAP NOW APPLIES ONLY TO PLACES THAT STILL NEED A PAID LOOKUP. Serper
 * `/maps` returns `thumbnailUrl` WITH the place record, so a `/maps`-sourced turn
 * arrives with photos already attached and spends nothing here. What remains is
 * the genuine gap — an OSM row, or a `/maps` row the provider gave no thumbnail
 * for — and those are worth the call precisely because nothing else will fill
 * them. Raised to the card's own ceiling so the two stop disagreeing.
 */
const PHOTO_ENRICHMENT_LIMIT = 8

export function selectPlacesNeedingEnrichment(places: PlaceLike[], fullText: string): PlaceLike[] {
  // A place that already HAS a photo is not a candidate for a billed lookup —
  // this is the single highest-volume Serper call in the product, and paying for
  // an image we were handed for free is pure waste.
  const named = places.filter(p => p.name && !hasPhoto(p))
  if (named.length === 0) return []

  if (fullText.includes('[TAPPY_PLAN]')) {
    const itemNames = planItemNames(fullText)
    if (itemNames.length === 0) return []
    return named.filter(p => itemNames.some(item => namesMatch(item, normName(p.name as string))))
  }

  const text = fullText
  const normRaw = normalizeVN(text.toLowerCase())
  // Same alignment guard the injector uses; without it offsets are meaningless,
  // so fall back to the leading places rather than guessing.
  if (normRaw.length !== text.length) return named.slice(0, PHOTO_ENRICHMENT_LIMIT)
  const dedupText = normRaw.slice(0, earliestMarker(text))
  const headers = proseHeaders(dedupText)
  const rivals = named.map(p => (p.name as string) || '').filter(Boolean)
  const mentioned = named.filter(p => findPlaceOffset(p.name as string, dedupText, headers, rivals.filter(n => n !== p.name)) !== -1)
  /**
   * Prose-named places first, then everything else that still lacks an image —
   * the card shows them all, so "the model did not mention it" is not a reason
   * for a card entry to be blank. Bounded by PHOTO_ENRICHMENT_LIMIT.
   */
  const rest = named.filter(p => !mentioned.includes(p))
  return [...mentioned, ...rest].slice(0, PHOTO_ENRICHMENT_LIMIT)
}

/** Place names referenced by a [TAPPY_PLAN] block's items. */
function planItemNames(fullText: string): string[] {
  const start = fullText.indexOf('[TAPPY_PLAN]')
  const end = fullText.indexOf('[/TAPPY_PLAN]')
  if (start === -1 || end === -1 || end < start) return []
  try {
    const plan = JSON.parse(fullText.slice(start + '[TAPPY_PLAN]'.length, end).trim()) as
      { days?: Array<{ items?: Array<{ name?: string }> }> }
    if (!Array.isArray(plan?.days)) return []
    return plan.days.flatMap(d => (Array.isArray(d?.items) ? d.items : []))
      .map(i => (i?.name ? normName(i.name) : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

/** The same tolerant match injectPlanPhotos uses: exact, else containment ≥4 chars. */
function namesMatch(itemKey: string, placeKey: string): boolean {
  if (itemKey === placeKey) return true
  return placeKey.length >= 4 && (itemKey.includes(placeKey) || placeKey.includes(itemKey))
}

/** G3: `placement: 'v2'` = block-end insertion (MEDIA_PLACEMENT_V2); omitted ⇒ byte-identical v1. */
export interface InjectPlaceEnrichmentOptions { placement?: 'v1' | 'v2' }

export function injectPlaceEnrichment(places: PlaceLike[], fullText: string, lang = 'vi', opts: InjectPlaceEnrichmentOptions = {}): string {
  const v2 = opts.placement === 'v2'
  // A photo is no longer a precondition for enrichment. It used to be, which
  // meant a failed photo lookup silently took the order/platform links down with
  // it — nothing about an order link needs a photo to exist (B4 finding).
  const usable = places.filter(p => p.name && (hasPhoto(p) || hasLinks(p) || hasTikTok(p)))
  // Nothing to inject — but the unvalidated-TikTok strip must still run. A place with no photo
  // and no order links used to take this early exit with the model's own tiktok.com link intact,
  // which is exactly the invention path the contract forbids.
  if (usable.length === 0) return stripUnvalidatedTikTokLinks(fullText, buildOwned(places))

  // A trip/evening plan renders as a structured [TAPPY_PLAN] JSON card whose place names live
  // INSIDE the JSON. Instead of the old trailing image block, add each matched place's photo
  // to its plan item INSIDE the JSON so TripPlanCard shows a thumbnail per item (owner request
  // 2026-07-25). Splicing markdown would corrupt the JSON, so we edit the parsed object.
  if (fullText.includes('[TAPPY_PLAN]')) return injectPlanPhotos(places, fullText)

  // System owns placement: drop the LLM's own copies of owned enrichment, then re-inject.
  const text = stripOwnedEnrichment(places, fullText)
  const decodedText = decodeSafe(text)

  // We insert into the RAW text, so name positions must be found in a normalized view that
  // stays index-aligned to it. normalizeVN strips diacritics via NFD-then-remove, so each
  // source char maps to exactly one char for precomposed input; if some exotic input ever
  // breaks that alignment, fall back to the legacy trailing block (images still show).
  const normRaw = normalizeVN(text.toLowerCase())
  if (normRaw.length !== text.length) return appendTrailingBlock(usable, places, text, decodedText, lang)

  const textEnd = earliestMarker(text)
  // CTA_BUTTONS is a general block, not scoped to any one place — links inside it must never
  // count as "already covered" for a specific place's own dedup window.
  const dedupText = normRaw.slice(0, textEnd)
  // The LLM rewrites tool place names (shortens / respells), so match with the tiered
  // canonical→exact→segment→token matcher instead of a raw full-name indexOf — otherwise
  // unmatched places drop to the trailing "📸" block. See placeMatch.ts.
  const headers = proseHeaders(dedupText)
  const mentionOffsets = placeMentionOffsets(places, dedupText, headers)

  const rivals = places.map(p => (p.name as string) || '').filter(Boolean)
  const mentioned = usable.filter(p => findPlaceOffset(p.name as string, dedupText, headers, rivals.filter(n => n !== p.name)) !== -1)
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const insertions: { offset: number; text: string; order: number }[] = []
  for (const p of chosen) {
    const ownIdx = findPlaceOffset(p.name as string, dedupText, headers, rivals.filter(n => n !== p.name))
    if (ownIdx === -1) continue
    const windowEnd = boundaryAfter(ownIdx, mentionOffsets, textEnd)
    const { lines } = placeContentLines(p, decodedText, dedupText, windowEnd)
    if (lines.length === 0) continue
    let offset: number
    if (v2) {
      // G3: the dedup window above is unchanged; the block itself lands at the end of
      // the markdown block that mentions the venue (see blockEndAfter).
      offset = blockEndAfter(text, ownIdx, textEnd)
    } else {
      // Insert at this place's block boundary. When the boundary is the NEXT place, snap back
      // to the start of that place's header line so we never split its markdown header; when
      // it's the CTA marker / end of text, insert exactly there (after this place's last line).
      offset = windowEnd
      if (windowEnd < textEnd) {
        const lineStart = text.lastIndexOf('\n', windowEnd - 1) + 1
        if (lineStart > ownIdx) offset = lineStart
      }
    }
    insertions.push({ offset, text: lines.join('\n'), order: insertions.length })
  }
  // Stripped the LLM's copies but couldn't place them positionally (names not found, etc.) —
  // re-add them as the trailing block so nothing is lost.
  if (insertions.length === 0) return appendTrailingBlock(usable, places, text, decodedText, lang)

  // Apply from the last boundary backwards so earlier offsets stay valid as we splice.
  // G3: blocks that share an offset (two venues in one paragraph) are applied in REVERSE
  // mention order, so the finished text carries them in mention order (owner rule, Q2).
  insertions.sort((a, b) => b.offset - a.offset || b.order - a.order)
  let out = text
  for (const ins of insertions) {
    const before = out.slice(0, ins.offset).replace(/\s+$/, '')
    const after = out.slice(ins.offset).replace(/^\s+/, '')
    out = before + '\n\n' + ins.text + (after ? '\n\n' + after : '')
  }
  return out
}

// Legacy fallback: one trailing "Hình ảnh & link review" block appended at the very end. Only
// used when normalized/raw offsets can't be aligned for safe in-place insertion. Kept so
// images still surface (grouped per place) even in that rare case. Only surfaces a place that
// is missing at least one IMAGE — a name+link-only entry duplicates the rich main list.
function appendTrailingBlock(usable: PlaceLike[], places: PlaceLike[], fullText: string, decodedText: string, lang = 'vi'): string {
  const ctaIdx = decodedText.indexOf('[CTA_BUTTONS]')
  const dedupText = normalizeVN((ctaIdx === -1 ? decodedText : decodedText.slice(0, ctaIdx)).toLowerCase())
  const textEnd = dedupText.length
  const headers = proseHeaders(dedupText)
  const mentionOffsets = placeMentionOffsets(places, dedupText, headers)
  const rivals = places.map(p => (p.name as string) || '').filter(Boolean)
  const mentioned = usable.filter(p => findPlaceOffset(p.name as string, dedupText, headers, rivals.filter(n => n !== p.name)) !== -1)
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const parts: string[] = []
  for (const p of chosen) {
    const ownIdx = findPlaceOffset(p.name as string, dedupText, headers, rivals.filter(n => n !== p.name))
    const windowEnd = boundaryAfter(ownIdx === -1 ? 0 : ownIdx, mentionOffsets, textEnd)
    const { lines, missingPhotoCount } = placeContentLines(p, decodedText, dedupText, windowEnd)
    if (missingPhotoCount > 0) parts.push([`**${p.name}**`, ...lines].join('\n'))
  }
  if (parts.length === 0) return fullText
  const label = lang === 'vi' ? '📸 _Hình ảnh & link review:_' : '📸 _Images & review links:_'
  return fullText + '\n\n' + label + '\n\n' + parts.join('\n\n')
}

// Deterministically re-groups image/TikTok-review/order-link markdown next to the place it
// belongs to. Text streamed BEFORE the first place-search tool call (intro line, plain
// chitchat) passes through live so its typewriter reveal is preserved; only the place-list
// text that follows is buffered and re-emitted (repositioned) once the full text is known.
/**
 * @param collector Request-scoped enrichment gathered by the tools themselves
 *   (B4). Since the tool results on the wire are now slim, this is where photos
 *   and order/platform links actually come from. Omitted, the filter falls back
 *   to reading them out of the `a:` frames, which is how it worked before B4 and
 *   what the pre-B4 tests still exercise.
 */
/**
 * Tool-call scaffolding the MODEL emits into the TEXT channel by mistake.
 *
 * Observed live on two consecutive `search_products` turns that returned no
 * results: the reply ended `[CTA_BUTTONS]{…}</parameter>\n</invoke>`. These tags
 * are not ours — `invoke`/`parameter`/`function_calls`/`antml:*` appear nowhere
 * in our prompts or tool definitions (grepped) — they are the provider's own
 * tool-use syntax leaking out of the structured channel into prose.
 *
 * Two consequences, both user-visible:
 *   1. Raw XML renders in the message.
 *   2. Worse, it breaks CTA extraction. The clients' no-closing-tag fallback is
 *      END-ANCHORED (`\[CTA_BUTTONS\](\{[\s\S]*\})\s*$` in Android's
 *      ChatResponse.kt), so trailing junk stops it matching and the WHOLE CTA
 *      JSON blob is left in the visible text while the buttons never render.
 *
 * Stripped server-side rather than in each client: the defect is in what the
 * server emits, and one fix covers web, Android and iOS. This removes only
 * complete, well-formed tags from this fixed vocabulary — it never touches the
 * user-facing sentence, so it is not response rewriting.
 */
const MODEL_SCAFFOLDING_RE = /<\/?(?:antml:)?(?:invoke|parameter|function_calls|function_results)\b[^>]*>/gi

export function stripModelScaffolding(text: string): string {
  if (!text || text.indexOf('<') === -1) return text
  return text.replace(MODEL_SCAFFOLDING_RE, '').replace(/[ \t]+\n/g, '\n').trimEnd()
}

/** Grounded evidence for one turn, handed over once the reply has been emitted. */
export interface TurnEvidence {
  places: PlaceLike[]
  productRecords: EvidenceRecord[]
  productQueries: string[]
  /**
   * OUTPUT ONLY — the candidates the assistant actually NAMED in the reply the
   * user just read. Ignored when this shape is used as a pre-search seed.
   *
   * This is the ground truth for "these" in "I don't like these": the reply
   * typically names 2-3 of the ~10 candidates held in state. Rejecting all held
   * candidates threw away options the user never saw (observed: Cà Phê MVTTS
   * and Cà Phê Linh rejected while never displayed); rejecting an arbitrary
   * first-N was equally wrong in the other direction.
   */
  presentedNames?: string[]
  /**
   * INPUT — the candidates already held in state, so a turn that presents from
   * the existing pool WITHOUT searching can still be recorded.
   *
   * Before this, "what was shown" was derived only from places a search
   * returned this turn. Once the cost work made follow-up turns reuse held
   * evidence instead of searching, those turns stopped updating the record:
   * a reuse turn named MVTTS/Orick/Van Viet, the user rejected "quán đó", and
   * the rejection landed on the three places shown two turns earlier while
   * MVTTS stayed eligible.
   */
  heldCandidates?: Array<{ candidateId: string; name: string }>
  /**
   * OUTPUT — canonical ids of the candidates this reply actually named. Ids,
   * not display names: two sellers can list the same title, and the id is the
   * project's existing identity (productId -> link -> title).
   */
  presentedIds?: string[]
  /**
   * OUTPUT — option names the reply presented that no evidence backs. Reported,
   * never acted on; see `ungroundedNamesIn`.
   */
  ungroundedNames?: string[]
}

/**
 * Which option names in this reply does no evidence back?
 *
 * MEASUREMENT ONLY — this reports, it never edits the text. The reply is the
 * model's; rewriting it here would be exactly the post-generation mutation this
 * project ruled out. What it buys is that identity fabrication stops being
 * invisible: it was found by reading one reply by hand, and without a counter
 * it would go back to being found by hand.
 *
 * Measured 2026-08-19, VI place turn: the tool returned ten real venues and the
 * reply bolded "Cà Phê Acoustic" (real), "The Workshop Coffee" (invented) and
 * "Soo Kafe" (invented) — the authoritative list was in front of it.
 *
 * A bolded run is the reply's option heading; nothing else in the format names
 * a venue. Substring matching in BOTH directions, because a reply legitimately
 * shortens "Cà Phê Acoustic" to "Acoustic".
 */
export function ungroundedNamesIn(
  text: string,
  places: PlaceLike[],
  productRecords: EvidenceRecord[],
  heldCandidates: Array<{ candidateId: string; name: string }>,
): string[] {
  if (!text) return []
  const known = [
    ...places.map(p => p.name || ''),
    ...productRecords.map(r => r.title || ''),
    ...heldCandidates.map(c => c.name),
  ]
    .map(n => normalizeVN(n.trim().toLowerCase()))
    .filter(Boolean)
  if (known.length === 0) return []   // nothing to check against; not a finding

  const out: string[] = []
  for (const m of text.matchAll(/\*\*([^*\n]{3,60})\*\*/g)) {
    // Only a bold segment PRESENTED as a venue heading is a venue claim — the gate's positive
    // shape rule (owner 2026-09-19); a bold label or a bold sentence is prose.
    const at = m.index ?? 0
    const lineEnd = text.indexOf('\n', at) === -1 ? text.length : text.indexOf('\n', at)
    const nextLine = text.slice(lineEnd + 1).split('\n').find(l => l.trim() !== '') ?? ''
    if (!isVenueHeading(m[1], text.slice(at + m[0].length, lineEnd), nextLine)) continue
    // Strip list numbering and trailing punctuation the heading carries.
    const shown = m[1].replace(/^\s*\d+[.)]\s*/, '').replace(/[:：\-–—\s]+$/, '').trim()
    if (!shown) continue
    const norm = normalizeVN(shown.toLowerCase())
    if (norm.length < 3) continue
    if (known.some(k => k.includes(norm) || norm.includes(k))) continue
    out.push(shown)
  }
  return [...new Set(out)]
}

/**
 * Wording for a TikTok result that belongs to the SEARCH, not to a place.
 *
 * "Video liên quan" rather than "Review TikTok" is the whole point: the batch search cannot show
 * which restaurant a video is about, so the label must not say it reviews one. Same `lang === 'vi'`
 * convention as the images/review-links header above.
 */
function relatedVideoLabel(lang: string): string {
  return lang === 'vi' ? 'Video liên quan trên TikTok' : 'Related video on TikTok'
}

/**
 * Copy the photos the late resolver found onto the recommendations, by name.
 *
 * The recommendations were built at tool time, before any photo existed. Matching
 * is by trimmed lowercase name because that is the only identity both sides
 * carry here; a place whose photos never resolved simply keeps none.
 */
/**
 * Attach validated, attributed TikTok reviews to the recommendations.
 *
 * 🚨 THE ACTION IS BUILT HERE, NOT RE-DERIVED FROM THE ROW. `buildPlaceEntity`
 * ran at tool time, before any TikTok lookup existed, so the entity's action list
 * cannot already contain this. Appending one `review` action carrying the
 * validated URL is the smallest change that reaches the card — `liveActions`
 * already renders `review`, and `attributed: true` is what tells the label it may
 * say "review" rather than "search".
 *
 * A name with no attributed URL is left exactly as it was: no action, no
 * placeholder. That is what "no coverage" has to look like.
 */
function withTikTokReviews(recs: Recommendation[], perPlace: Map<string, string>): Recommendation[] {
  if (perPlace.size === 0) return recs
  const byName = new Map([...perPlace].map(([k, v]) => [k.trim().toLowerCase(), v]))
  /**
   * 🚨 ONE VIDEO CANNOT BE TWO VENUES' REVIEW.
   *
   * `attributeTikTok` already claims each URL for at most one place, so a
   * duplicate should be impossible — this is defence in depth against a future
   * caller that builds the map some other way. Showing the same clip under two
   * restaurants would be the cross-venue misattribution the whole attribution
   * layer exists to prevent, arriving one layer later.
   */
  const claimed = new Set<string>()
  return recs.map(r => {
    const url = byName.get(r.entity.identity.name.trim().toLowerCase())
    if (!url || claimed.has(url)) return r
    // One URL, one button — the same rule `dedupe` enforces in actions.ts.
    if (r.entity.actions.some(a => a.url === url)) return r
    claimed.add(url)
    const action = {
      kind: 'review' as const,
      urlKind: 'direct' as const,
      url,
      labelKey: 'v3.action.reviewOn',
      platform: 'TikTok',
      priority: 0,
      attributed: true,
    }
    return {
      ...r,
      entity: {
        ...r.entity,
        actions: [...r.entity.actions, action],
        reviews: { ...r.entity.reviews, actions: [...r.entity.reviews.actions, action] },
      },
      /**
       * 🚨 BOTH LISTS, OR THE CARD NEVER SEES IT. `contextualActions` is a COPY
       * of `entity.actions` taken when the recommendation was built, and it is
       * the one `toLive` actually projects. Updating only the entity left the
       * action provably present and invisible — caught by this file's own
       * end-to-end test, which is precisely why the chain is tested end to end
       * rather than hop by hop.
       */
      contextualActions: [...r.contextualActions, action],
    }
  })
}

function withResolvedPhotos(recs: Recommendation[], resolved: PlaceLike[]): Recommendation[] {
  const byName = new Map(resolved.map(p => [(p.name || '').trim().toLowerCase(), p]))
  return recs.map(r => {
    const hit = byName.get(r.entity.identity.name.trim().toLowerCase())
    const urls = hit?.photo_urls?.length ? hit.photo_urls : (hit?.photo_url ? [hit.photo_url] : [])
    if (urls.length === 0) return r
    const gallery = urls.map(url => ({ url, source: 'serper_images' as const, stability: 'volatile' as const }))
    return { ...r, entity: { ...r.entity, images: { primary: gallery[0], gallery } } }
  })
}

export function applyPlaceEnrichmentStreamFilter(
  response: Response,
  lang = 'vi',
  collector?: EnrichmentCollector,
  resolvePhotos?: PhotoResolver,
  onEvidence?: (evidence: TurnEvidence) => Promise<void>,
  /**
   * Evidence gathered BEFORE the stream started (Task 3F-2.4 — preparation for
   * the pre-search gate; nothing calls this yet).
   *
   * Today every signal this filter needs is read out of the LLM's own frames:
   * `9:` sets bufferMode, the tool-name map and `productQueries`; `a:` fills
   * `latestPlaces` and the money guard's `productRecords`. If a search ever runs
   * server-side before generation, those frames never appear — and the failure
   * is silent: photos and order links stop being injected and the money guard
   * loses the entity list it needs to judge a price. This param is the explicit
   * substitute, deliberately the SAME `TurnEvidence` shape the filter already
   * hands back, so there is no second candidate schema.
   *
   * Purely additive: the `9:`/`a:` path below is untouched, and seeding plus
   * live frames in the same turn de-duplicate rather than double up.
   */
  seed?: TurnEvidence,
  /**
   * P0 travel guard. When the turn is travel-intent, it ALWAYS buffers and any
   * dynamic travel fact (fare/price/schedule/availability) not backed by live
   * fetched evidence is redacted before a byte reaches the client — the
   * fail-closed boundary for the flight/hotel price hallucination.
   */
  travelIntent = false,
  /** The user's own message this turn — numbers in it are never redacted. */
  userText = '',
  /**
   * A5 P0. True when this turn is about places (food/spa/venues), whether or not it retrieves
   * anything. Like `travelIntent` it forces buffering, so the fail-closed price guard sees the
   * complete prose even when the model answered from memory with NO tool call — which is exactly
   * how a fabricated menu price reached production on 5708211 ("Thường ... khoảng 30.000 -
   * 50.000đ/tô" on a follow-up that searched nothing).
   */
  placeIntent = false,
  /**
   * Finds TikTok reviews for the entities that survived admission. Optional, so
   * every existing caller and test keeps today's behaviour untouched.
   */
  resolveTikTok?: TikTokResolver,
  /** The city the search was about, passed straight into the TikTok query. */
  tiktokLocation?: string,
): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let lineRemainder = ''
  let mainText = '' // assistant text buffered AFTER a place-search tool call
  const toolNameByCallId = new Map<string, string>()
  const productQueries: string[] = []   // C3-B.10: what search_products was asked for
  const productRecords: EvidenceRecord[] = [] // C3-B.10: structured evidence, price included
  let latestPlaces: PlaceLike[] = []
  let bufferMode = false
  /** Live VND fares fetched by get_flight_prices this turn. Empty ⇒ every travel
   *  price the model states is unverifiable and gets redacted by the travel guard. */
  const travelFares: number[] = []
  /** VND amounts that appeared in food/spa price snippets (search_places). A stated
   *  price must trace to one of these (A5); a number in no snippet is fabricated. */
  const snippetPrices: number[] = []
  /**
   * The same prices, but keyed by the place each snippet actually NAMED.
   *
   * 🚨 `snippetPrices` alone cannot tell an area price from a restaurant price,
   * which is how "Danh sách quán bún bò Quận 1" became one restaurant's menu
   * price. `searchPlaces` stamps `evidence_scope` per snippet; this carries it
   * to the guard instead of flattening it away.
   */
  const snippetPricesByEntity = new Map<string, number[]>()
  const snippetPlaceNames: string[] = []
  /** Retrieved prose that named exactly one place, keyed by that place. */
  const placeEntityTexts = new Map<string, string[]>()
  /** Places with a DIRECT ordering page — the only ones prose may call orderable. */
  const orderablePlaces = new Set<string>()
  /**
   * Venues with a DIRECT, entity-level ticket page — the only ones prose may
   * say sell tickets. A chain homepage (`https://cinestar.com.vn/`) is a front
   * door, not evidence about one cinema; `isDirectTicketUrl` draws that line.
   */
  const ticketablePlaces = new Set<string>()
  /** Validated commerce links the system handed the model this turn (CCP route / event / film projections). */
  const systemLinkUrls = new Set<string>()
  const systemLinks: Array<{ name: string; url: string }> = []
  /**
   * Quality facts keyed by the venue they belong to.
   *
   * 🚨 THE FLAT ARRAYS CANNOT SAY WHOSE NUMBER IT IS. `placeRatings` is
   * batch-wide, so one rated row let the model state a rating for a DIFFERENT
   * restaurant. A rating, a review count and a phone number are each facts about
   * ONE business; they travel keyed by that business.
   */
  const ratingsByEntity = new Map<string, number[]>()
  const reviewCountsByEntity = new Map<string, number[]>()
  const phonesByEntity = new Map<string, string[]>()
  /** Today's opening hours per venue (G1b fallback sentence only; never a claim source). */
  const hoursByEntity = new Map<string, string>()
  /** Consultative V1: the row's own address per venue, so a bare "Địa chỉ: …" line reads as a card listing. */
  const addressesByEntity = new Map<string, string>()
  /** G2: the provider's own price band per venue (`price_range_text` / `price_range`) — entity-level price evidence. */
  const priceBandsByEntity = new Map<string, PriceBand>()
  /**
   * Rating / distance evidence for `guardPlaceClaimsInText`, gathered the same
   * way and at the same moment as `snippetPrices`: read off the provider's own
   * rows as they stream past, never re-derived later. Empty means the provider
   * returned none, which is exactly when a stated rating or distance is
   * unsupported.
   */
  const placeRatings: number[] = []
  const placeDistancesKm: number[] = []
  const placeTexts: string[] = []
  /** True once a search_places (food/spa/places) tool result was seen this turn. */
  let hadPlaceSearch = false
  /** Consultative V1: any tool call at all this turn (a `9:` frame). */
  let anyToolCalled = false
  // Travel-intent turns ALWAYS buffer, so the fail-closed guard can inspect and
  // redact a fabricated fare BEFORE any byte reaches the client — even when the
  // model answered from memory with no tool call at all.
  if (travelIntent) bufferMode = true
  // Same reasoning, same shape, for food/spa: a place turn that runs no tool would otherwise
  // stream straight through, and a price already sent cannot be redacted. A turn that DOES search
  // already buffers (a PLACE_TOOLS `9:` frame sets it below), so this only adds buffering to the
  // no-retrieval turns — short conversational replies, where the cost is small and the exposure
  // is highest.
  if (placeIntent) bufferMode = true
  // Consultative V1: a decision turn buffers whether or not a tool runs, so the
  // search-claim guard can judge "mình đã kiểm tra" on a no-tool follow-up.
  if (collector?.consultativeV1) bufferMode = true
  /**
   * 🚨 A TICKET QUESTION MUST BE GUARDED EVEN WHEN NO PLACE TOOL RUNS.
   *
   * Measured 2026-09-09: "cuối tuần này ở Quận 1 có sự kiện gì hay, mua vé ở
   * đâu?" was answered with `get_news` + `web_search`. `needProfile.domain` was
   * not `places`, so `placeIntent` was false, `bufferMode` stayed false — and
   * `emitReconstructed` returns early on `!bufferMode`, so NOT ONE guard ran and
   * the bytes were already on the wire.
   *
   * 🔑 THE TRIGGER IS THE USER'S OWN WORDS, decided before generation, so it is
   * deterministic and costs nothing. Only turns that actually ask about vé /
   * suất chiếu are affected: weather, gold price, news and chitchat keep the
   * fully live path they have today.
   *
   * 🔑 STREAMING IS PRESERVED, NOT TRADED AWAY. Such a turn joins the
   * `progressive` path, and `safeFlushPoint` already holds exactly the sentences
   * the ticket rules can remove — so the claim-free part still streams as it
   * arrives.
   */
  const ticketIntent = mentionsTickets(userText)
  if (ticketIntent) bufferMode = true
  /**
   * The same shape for a COMMERCE HANDOFF turn (Final local live UAT, 14 Sep 2026): a user who
   * names a registry merchant or asks for events gets the platform's validated links, and the
   * prose hygiene that unmakes a mislabelled or front-door merchant link runs at settle time —
   * a live-streamed "[Ticketbox.vn](https://ticketbox.vn/)" was measured getting through.
   */
  const requestedProviderId = requestedProviderOf(userText)
  const commerceHandoffIntent = !!requestedProviderId || entertainmentCapabilityOf(userText) === 'event_ticket'
  if (commerceHandoffIntent) bufferMode = true
  /**
   * A5-P1. Buffering the WHOLE places reply was broader than the danger: measured on production
   * 63313d5, shopping showed content at 2.2s and food at 15.4s with the same pipeline and the same
   * total — 13.5s of blank screen.
   *
   * So the reply still buffers and the guard still runs on all of it, but the part that is
   * PROVABLY not redactable is released as it arrives. `safeFlushPoint` only ever returns whole
   * sentences containing no money claim, and the guard only ever removes sentences that contain
   * one — so nothing released here could have been taken away later.
   *
   * Stops the moment a place tool appears: after that, `injectPlaceEnrichment` rewrites the text
   * to position photos, and text already sent cannot be repositioned.
   */
  // Consultative V1: its guards judge sentences that carry no money claim (a search claim, an
  // atmosphere adjective, a card re-listing), so "provably not redactable" no longer holds for
  // a money-free sentence — the V1 turn keeps the whole reply until the guards have run.
  const progressive = (placeIntent || ticketIntent) && !travelIntent && !collector?.consultativeV1
  let placeToolSeen = false
  /**
   * Defaults to `not_run` and only moves when a place tool result actually arrives, so a
   * recall turn or a non-place conversation is left exactly as it was before this existed.
   */
  let placeSearchStatus: PlaceSearchStatus = 'not_run'
  let flushedText = ''
  /** True once the shopping decision has gone out early, so it is not sent twice. */
  let earlyShoppingMarkerSent = false
  /**
   * A tool step has completed and the model has not spoken since — B12.
   *
   * A tool turn is two model steps: the model says what it is about to do ("I'll find some great
   * coffee shops in District 1 for you!"), the tool runs, then the model answers ("Here are my
   * top picks…"). Both steps emit ordinary `0:` text frames, and the frames were appended with
   * nothing between them, so the reply read:
   *
   *     …in District 1 for you!Here are my top picks for you:
   *
   * Observed identically on Web and Android because both consume this same stream — which is why
   * the separator belongs here, once, and not as a space bolted on in each client.
   *
   * Set when a tool call or result goes by; consumed by the next text frame, which is what makes
   * it a BOUNDARY marker rather than a "did a tool ever run" flag.
   */
  let awaitingPostToolText = false
  /**
   * Everything the assistant has said this turn, across BOTH paths.
   *
   * 🚨 Needed because the two halves of a place turn live in different variables. The preamble
   * arrives BEFORE the `9:` frame, so `bufferMode` is still false and it streams live into
   * `liveText`; the answer arrives after and accumulates in `mainText`. A first attempt at this
   * fix tested `mainText` alone, found it empty at the boundary, and inserted nothing — the
   * concatenation survived on exactly the turn it was written for.
   *
   * Only the tail is ever read, but keeping the whole string costs nothing and keeps the meaning
   * obvious.
   */
  let assistantSoFar = ''
  /** Candidate names this reply actually named — see TurnEvidence.presentedNames. */
  let presentedNames: string[] = []
  /** Canonical ids of HELD candidates this reply named — see TurnEvidence.presentedIds. */
  let presentedIds: string[] = []
  /** Names the reply presents as options that no evidence backs — see below. */
  let ungroundedNames: string[] = []
  /**
   * The live-path text, recorded purely so presentation tracking does not
   * depend on bufferMode.
   *
   * Measured: a pure-reuse decision turn named Cosa Nostra and AnAn, but no
   * tool ran, so nothing buffered, so `presentedIds` stayed empty and the next
   * "quán đó" resolved against a reply two turns older.
   */
  let liveText = ''

  /**
   * Which HELD candidates does this text actually name?
   *
   * Presentation is about what the USER READ. Being held, ranked, or considered
   * is explicitly not enough — only a name appearing in the finished reply.
   */
  const namedHeldIds = (text: string): string[] => {
    if (!text) return []
    const hay = normalizeVN(text.toLowerCase())
    // ORDER OF APPEARANCE, not pool order: "quán đó" refers to the primary
    // recommendation, which is the FIRST candidate the reply names. Returning
    // pool order made that resolution arbitrary.
    return (seed?.heldCandidates ?? [])
      .map(c => ({ id: c.candidateId, at: c.name.trim() ? hay.indexOf(normalizeVN(c.name.trim().toLowerCase())) : -1 }))
      .filter(x => x.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map(x => x.id)
  }
  let emitted = false

  const PLACE_TOOLS = new Set(['search_places', 'get_hotel_prices', 'search_products'])

  /**
   * Structured shopping records seen this turn, for the spec guard.
   *
   * 🚨 READING ONLY `shopping_results` MADE THE GUARD INERT ON EVERY LIVE TURN.
   * `searchProducts` has two paths and they do not agree on a key: when Serper's
   * /shopping endpoint answers - the PRIMARY path, and the one production takes -
   * the structured rows land in `search_results` and there is no
   * `shopping_results` key at all. Only the organic fallback emits that name.
   *
   * So on a normal shopping turn this array stayed empty, the guard was skipped
   * for want of candidates, and a measured localhost reply asserted
   * "Máy này nhẹ, pin tốt" - a weight claim AND a battery claim, the two
   * attributes this guard exists to stop, neither of which Serper ever returns.
   *
   * The same wrong-key defect was already found and fixed for RANKING in
   * `route.ts` (see the comment on `keys` there); the collector was never
   * updated with it. Both arrays are read now, deduped by title, so whichever
   * path the provider took the guard sees real product names.
   */
  const specRecords: SpecEvidence[] = []
  const addSpecRecords = (rows: unknown) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      const r = row as { title?: string; weightKg?: number; batteryHours?: number }
      if (!r?.title || specRecords.some(e => e.name === r.title)) continue
      specRecords.push({ name: r.title, weightKg: r.weightKg, batteryHours: r.batteryHours })
    }
  }

  /**
   * Merge places by name, upgrading an entry that gains a photo later. Shared by
   * the `a:` handler and the seed so the two can never inject the same place
   * twice — CASE C in the tests.
   */
  const mergePlaces = (incoming: PlaceLike[]) => {
    for (const p of incoming) {
      const key = (p.name || '').trim().toLowerCase()
      if (!key) continue
      const existing = latestPlaces.find(q => (q.name || '').trim().toLowerCase() === key)
      if (!existing) { latestPlaces.push(p); continue }
      const savedPlaceId = existing.place_id
      const savedWebsiteUri = existing.website_uri
      if (!hasPhoto(existing) && hasPhoto(p)) Object.assign(existing, p)
      // Identity flows independently of photo — a later frame may carry
      // place_id / website_uri for a name we already saw. Preserve any valid
      // existing identity value; otherwise fill from incoming.
      if (!existing.place_id && savedPlaceId) existing.place_id = savedPlaceId
      if (!existing.website_uri && savedWebsiteUri) existing.website_uri = savedWebsiteUri
      if (!existing.place_id && typeof p.place_id === 'string') existing.place_id = p.place_id
      if (!existing.website_uri && typeof p.website_uri === 'string') existing.website_uri = p.website_uri
    }
  }

  // Seed BEFORE the stream is read, so the very first frame already sees the
  // same world the `9:`/`a:` path would have built. Presence of any evidence is
  // what `bufferMode` really means ("a place tool produced something this
  // turn"), so it is set from the same condition the `9:` frame uses.
  if (seed) {
    mergePlaces(Array.isArray(seed.places) ? seed.places : [])
    for (const r of Array.isArray(seed.productRecords) ? seed.productRecords : []) {
      const key = r?.link || r?.title
      if (key && !productRecords.some(e => (e.link || e.title) === key)) productRecords.push(r)
    }
    for (const q of Array.isArray(seed.productQueries) ? seed.productQueries : []) {
      if (q && !productQueries.includes(q)) productQueries.push(q)
    }
    if (latestPlaces.length > 0 || productRecords.length > 0 || productQueries.length > 0) {
      bufferMode = true
    }
  }

  // Collector first (it holds the real enrichment post-B4), then anything found
  // in the stream for a name the collector didn't cover — so a slim frame and a
  // legacy fat frame both work, and neither can shadow the other's photo.
  const resolvePlaces = (): PlaceLike[] => {
    if (!collector || collector.places.length === 0) return latestPlaces
    const merged: PlaceLike[] = [...collector.places]
    const seen = new Set(merged.map(p => (p.name || '').trim().toLowerCase()))
    for (const p of latestPlaces) {
      const key = (p.name || '').trim().toLowerCase()
      if (!key) continue
      const existing = merged.find(q => (q.name || '').trim().toLowerCase() === key)
      if (!existing) { merged.push(p); seen.add(key); continue }
      const savedPlaceId = existing.place_id
      const savedWebsiteUri = existing.website_uri
      if (!hasPhoto(existing) && hasPhoto(p)) Object.assign(existing, p)
      // Identity flows independently of photo — the collector holds enrichment
      // (photos / order links) while latestPlaces from the `a:` frame carries
      // the Google Places identity. Both must land on the same object so the
      // late photo resolver (resolvePlacePhotos) can use place_id / website_uri.
      if (!existing.place_id && savedPlaceId) existing.place_id = savedPlaceId
      if (!existing.website_uri && savedWebsiteUri) existing.website_uri = savedWebsiteUri
      if (!existing.place_id && typeof p.place_id === 'string') existing.place_id = p.place_id
      if (!existing.website_uri && typeof p.website_uri === 'string') existing.website_uri = p.website_uri
    }
    return merged
  }

  const emitReconstructed = async (controller: TransformStreamDefaultController) => {
    if (emitted) return
    emitted = true
    if (!bufferMode) return // nothing buffered — everything already streamed live
    const places = resolvePlaces()

    // B7-A: photos are fetched HERE, not inside the tool, because only here do we
    // know which places the reply actually named. The tool used to resolve the
    // top 8 blind while the injector used at most 3.
    if (resolvePhotos) {
      try {
        const needed = selectPlacesNeedingEnrichment(places, mainText)
        if (needed.length > 0) {
          const photos = await resolvePhotos(needed)
          for (const p of places) {
            const urls = p.name ? photos.get(p.name) : undefined
            if (urls && urls.length > 0) { p.photo_urls = urls; p.photo_url = urls[0] }
          }
        }
      } catch {
        // A photo lookup failing must cost photos, never the answer. Links and
        // prose still go out below.
      }
    }

    /**
     * The card's payload, built here rather than at the end, because whether it
     * EXISTS decides what the prose is allowed to repeat.
     *
     * Photos have just resolved above, the engine's recommendations are in the
     * collector, and nothing has been sent yet — this is the one point where both
     * halves of the answer are known.
     */
    /**
     * 🔑 TIKTOK IS RESOLVED HERE — AFTER ADMISSION, BEFORE THE CARD IS BUILT.
     *
     * `collector.placesRecommendations` is the post-eligibility, post-dedupe set,
     * and `MAX_ITEMS` is what the card will actually show. Asking about anything
     * beyond that spends a query on a venue nobody will see, which is the cost
     * mistake the old area query made in a different way.
     *
     * One batched request for the whole card (see `buildTikTokQuery`), so this
     * costs exactly what V1/V2's single area search cost — and unlike that
     * search, it names the venues, which is why it returns attributable results.
     */
    let recsForCard = collector?.placesRecommendations ?? []
    /**
     * Item 2 (2026-09-19) — THREE CARDS, THE MODEL'S. Stage 1 gave the model every row in compact
     * form (modelPayload.ts); stage 2 is its reply, and the venues it NAMED — pick first, in prose
     * order — are the cards above the fold. The engine's order fills up to three when it named
     * fewer. Only those three get the per-venue enrichment (TikTok here, photos above for the
     * named ones); the rest stay in the payload for "Xem thêm" and the filter row.
     */
    /**
     * 🚨 "NAMED" IS THE PIPELINE'S LOCATOR, NOT A WHOLE-NAME `indexOf`. Provider rows carry
     * compound names ("Béo Ơi Quán - Món ngon Hà Nội", "A Tùng Bánh mì bò nướng bơ Campuchia")
     * and the model writes the head ("Béo Ơi Quán"). A whole-name substring test found none of
     * the three venues the reply named (Android E2E turn 3, 2026-09-19: named_in_prose 0), so
     * the fold filled from the engine's order and card #1 was a venue the reply never mentioned.
     * `findPlaceOffset` is what photo placement already uses — bold header ⊂ tool name, exact,
     * distinctive segment, guarded token overlap — with the other rows as competitors so an
     * ambiguous header is refused rather than guessed.
     */
    /**
     * 🚨🚨 CARD #1 IS THE MODEL'S PICK OR IT IS AN ERROR — NEVER THE ENGINE'S ROW IN DISGUISE.
     * Three times a silent fallback re-introduced provider ordering at the display layer (the
     * ranker's rating-first order, the whole-name match above, and the fill below). So:
     *  - `picked` on the wire holds ONLY the venues the reply named. The engine-order fill is used
     *    here for the per-venue enrichment of the three cards (TikTok, photos) and by the clients to
     *    complete the fold, but it is never presented as a pick.
     *  - When the reply names venues (bold headers) and NONE matches a row, that is an error: it is
     *    logged as `tappyai_cards_error pick_unmatched` (console.error) and the payload carries
     *    `pickUnmatched: true` so a client can show that the order is the engine's, not the model's.
     *    A reply with no bold venue at all ("chưa xác nhận được…") is not that case.
     */
    const { pickedRecs, namedRecs, namedInProse, pickUnmatched } = (() => {
      const folded = normName(mainText)
      const headers = proseHeaders(folded)
      const allNames = recsForCard.map(r => r.entity.identity.name)
      const named = recsForCard
        .map(r => ({ r, at: findPlaceOffset(r.entity.identity.name, folded, headers, allNames.filter(n => n !== r.entity.identity.name)) }))
        .filter(x => x.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map(x => x.r)
      const seen = new Set(named)
      const fill = recsForCard.filter(r => !seen.has(r))
      // Only when there ARE rows to match: a no-tool turn with bold section titles is not this error.
      const unmatched = recsForCard.length > 0 && named.length === 0 && headers.length > 0
      if (unmatched) console.error(JSON.stringify({ type: 'tappyai_cards_error', reason: 'pick_unmatched', headers: headers.slice(0, 5).map(h => h.norm), rows: allNames.slice(0, 8) }))
      return {
        pickedRecs: [...named, ...fill].slice(0, CARDS_SHOWN),
        namedRecs: named.slice(0, CARDS_SHOWN),
        namedInProse: Math.min(named.length, CARDS_SHOWN),
        pickUnmatched: unmatched,
      }
    })()
    if (resolveTikTok && recsForCard.length > 0) {
      try {
        const cardNames = pickedRecs
          .map(r => r.entity.identity.name)
          .filter(Boolean)
        const found = await resolveTikTok(cardNames, tiktokLocation)
        recsForCard = withTikTokReviews(recsForCard, found.perPlace)
        if (found.batch && !collector?.batchTikTokUrl) collector?.setBatchTikTokUrl(found.batch)
      } catch {
        // A TikTok lookup must never cost the recommendation.
      }
    }

    const placesView = (EMIT_PLACES_ANNOTATION && recsForCard.length)
      ? buildPlacesLiveView(withResolvedPhotos(recsForCard, places), {
        mapsSearchUrl: collector?.placesMapsUrl,
        picked: namedRecs.map(r => r.entity.id),
        shown: CARDS_SHOWN,
        pickUnmatched,
      })
      : null
    if (placesView) console.log(JSON.stringify({ type: 'tappyai_cards', shown: placesView.shown ?? null, picked: placesView.picked?.length ?? 0, items: placesView.items.length, named_in_prose: namedInProse, pick_unmatched: pickUnmatched }))

    /**
     * \u{1F6A8} THE SAME CONTENT TWICE WAS THE BUG. `injectPlaceEnrichment` writes the
     * photo, the order links and the review link INTO the reply text, for clients
     * that have no card. When the card is about to render exactly those three
     * things, injecting them as well produced the duplicated Food answer the
     * approved design forbids: prose recommendation, a loose image, a row of
     * provider links — and then the same photo, the same links and the same
     * places again inside the card.
     *
     * So the injection is skipped only for a request that is rendering the card
     * (`rendersDecisionCard`, set from the web surface header). Android, iOS and
     * any client that sends no header keep the injected block exactly as today —
     * it is their only channel for these links.
     *
     * SHOPPING OBEYS THE SAME RULE, and used not to. `buildPlacesLiveView`
     * deliberately returns null for a product (shopping owns its own decision
     * card), so this read as "no card" on every shopping turn and injected
     * anyway: a measured localhost reply carried a loose product thumbnail plus a
     * "📸 Images & review links" block listing a Samsung Galaxy Note under an
     * iPhone question, directly above a card showing the same products. The
     * shopping marker is the shopping card's existence, so it counts here too.
     */
    const decisionCardRenders = !!placesView || !!collector?.shoppingMarker
    const cardOwnsEnrichment = decisionCardRenders && collector?.rendersDecisionCard === true
    const enrichedProse = cardOwnsEnrichment ? mainText : injectPlaceEnrichment(places, mainText, lang, { placement: mediaPlacementV2Enabled() ? 'v2' : 'v1' })
    /**
     * PLAN PRICE PROVENANCE. Every money guard below reads `proseOnly(text)`, so
     * the [TAPPY_PLAN] block — the one structured payload the client renders as
     * money — was never judged. Measured 2026-09-14 on OSM rows with no price
     * field: 4 of 5 delivered plans carried "800,000 – 1,200,000 VND (estimated)"
     * per item. Runs after `injectPlanPhotos` (same parse/re-serialize shape,
     * so the photo fields it added are kept) and before the prose guards, which
     * skip the block anyway. Evidence is the rows this turn retrieved plus the
     * user's own numbers; nothing is fetched and nothing is computed.
     */
    const planEvidence = {
      byEntity: planPriceEvidenceFromRows(latestPlaces as Record<string, unknown>[], snippetPricesByEntity),
      userAmounts: extractMoneyClaims(userText || '').flatMap(c => [c.lo, c.hi]),
    }
    const enriched = enrichedProse.includes('[TAPPY_PLAN]')
      ? guardPlanPrices(enrichedProse, planEvidence, lang).text
      : enrichedProse
    // C3-B.10: the last server-side point at which the COMPLETE prose exists and
    // has not yet reached the client. A monetary claim the structured evidence
    // does not support is removed here — deterministically, with no model call,
    // no network call, and nothing written that was not already in the text.
    // Inert unless the evidence carries structured prices (see moneyGuard).
    const guarded = guardMoneyClaimsInText(enriched, productRecords, productQueries)
    // The SPEC guard is the same idea applied to the other half of a product
    // claim. Money guards what a thing COSTS; this guards what it IS — weight
    // and battery, which /shopping never returns. They compose because both are
    // pure functions over the prose that take nothing from outside the input:
    // money runs first so the spec pass reads text whose prices are already
    // settled. Inert unless structured shopping records were collected, and
    // inert for every other domain.
    const specGuarded = specRecords.length > 0
      ? guardSpecClaimsInText(guarded.text, specRecords).text
      : guarded.text
    // P0 FAIL-CLOSED TRAVEL GUARD. On a travel-intent turn, redact any fare/price/
    // schedule/availability the model asserted that no live fetched evidence backs
    // (empty travelFares ⇒ all of them). Only travel turns are touched, so shopping/
    // food/etc. are unaffected. Runs after the shopping guards so it reads prose
    // whose shopping prices are already settled.
    const travelGuarded = travelIntent
      ? guardTravelClaimsInText(specGuarded, travelFares, userText).text
      : specGuarded
    // A5 EVIDENCE BOUNDARY for food/spa. Their menu/service prices exist only in
    // Serper snippets, so a stated price must TRACE to a retrieved snippet; a
    // number in no snippet is fabricated and removed. Snippet-traceable prices
    // survive (framed as reference by the prompt, never FACT). Only search_places
    // turns that aren't already travel-guarded; shopping keeps its own money guard.
    //
    // A5 P0 FIX: `|| placeIntent`. `hadPlaceSearch` is per-turn, so a follow-up answered from
    // context left the guard inert and a reconstructed price sailed through. A place turn is now
    // guarded whether or not it retrieved anything — with no snippets collected, `snippetPrices`
    // is empty and EVERY stated price is unsupported, which is the fail-closed direction travel
    // already takes. No evidence is carried between turns.
    /**
     * Scope is only supplied when this turn actually retrieved places to
     * attribute against. With no rows there is nothing a sentence could name,
     * and the guard keeps its existing area-level behaviour.
     */
    const placeScope = (): SnippetPriceScope | undefined =>
      snippetPlaceNames.length > 0
        ? { byEntity: snippetPricesByEntity, placeNames: snippetPlaceNames }
        : undefined
    const snippetV2 = snippetPriceGuardV2Enabled()
    const snippetGuardResult = ((hadPlaceSearch || placeIntent) && !travelIntent)
      ? guardSnippetPricesInText(travelGuarded, snippetPrices, userText, placeScope(), { v2: snippetV2, priceBandsByEntity })
      : null
    const foodGuarded = snippetGuardResult ? snippetGuardResult.text : travelGuarded
    // G2 telemetry: counts only — never text, never a venue name (same rule as the place guard line).
    if (snippetGuardResult?.stats) {
      console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'snippet_price', v2: snippetV2, band_rows: priceBandsByEntity.size, ...snippetGuardResult.stats }))
    }
    /**
     * PLACE QUALITY + DISTANCE BOUNDARY. Money guards what a place COSTS; this
     * guards how GOOD and how FAR it is — the other two things a place reply
     * asserts and the provider frequently never returned.
     *
     * Runs on place AND travel turns, because both make these claims: an OSM spa
     * row carries no rating at all, and a hotel's star class lives only in its
     * snippet. Composes with the guards above the same way they compose with
     * each other — a pure function over prose whose prices are already settled,
     * writing nothing that was not already in the text.
     *
     * Inert when the retrieval DID carry the evidence, which is the point: with
     * Google Places restored, ratings arrive per row and the claims stand.
     */
    /**
     * On a place/travel turn every rule applies. On a TICKET-ONLY turn (news,
     * events) the place-specific evidence was never collected, so only the
     * domain-independent ticket rules run — see `PlaceClaimOptions`.
     */
    const placeClaimScope: 'all' | 'tickets' =
      (hadPlaceSearch || placeIntent || travelIntent) ? 'all' : 'tickets'
    // G1: the engine's Pick, by row name — for attribution telemetry and the fallback sentence.
    const pickName = collector?.placesRecommendations?.find(r => r.recommended)?.entity.identity.name ?? null
    const guardV2 = placeGuardAttributionV2Enabled()
    /**
     * Consultative V1: a follow-up that ran no tool answers about the venues the
     * PREVIOUS reply named, with the numbers that reply stated. Without this the
     * guard reads an empty row set and cuts the very figures the user is asking
     * about (measured 2026-09-18, F6: 4 of 11 sentences removed, reply reduced to
     * a fragment). Seeded only when this turn retrieved nothing itself, so real
     * rows always win over carried prose.
     */
    if (collector?.consultativeV1 && !hadPlaceSearch) {
      for (const c of collector.consultativeV1.carried) {
        if (!c.name) continue
        snippetPlaceNames.push(c.name)
        if (c.rating !== null) { placeRatings.push(c.rating); ratingsByEntity.set(c.name, [...(ratingsByEntity.get(c.name) ?? []), c.rating]) }
        if (c.reviewCount !== null) reviewCountsByEntity.set(c.name, [...(reviewCountsByEntity.get(c.name) ?? []), c.reviewCount])
        if (c.distanceKm !== null) placeDistancesKm.push(c.distanceKm)
      }
    }
    const placeGuardResult = (hadPlaceSearch || placeIntent || travelIntent || ticketIntent)
      ? guardPlaceClaimsInText(foodGuarded, {
        ratings: placeRatings,
        distancesKm: placeDistancesKm,
        texts: placeTexts,
        entityTexts: placeEntityTexts,
        placeNames: snippetPlaceNames,
        orderablePlaces,
        ratingsByEntity,
        reviewCountsByEntity,
        phonesByEntity,
        ticketablePlaces,
        // CCP: sentences carrying a system-placed commerce link are never judged as claims.
        systemLinkUrls,
      }, { scope: placeClaimScope, attributionV2: guardV2, pickName })
      : null
    const placeGuarded = placeGuardResult ? placeGuardResult.text : foodGuarded
    // G1 telemetry: what the place-claim guard removed and why. Counts only — never user
    // text, never a venue name. Console-only, like `tappyai_tool_called`; the UsageEvent
    // vocabulary is a privacy surface and is deliberately not extended here.
    if (placeGuardResult?.stats) {
      const st = placeGuardResult.stats
      console.log(JSON.stringify({
        type: 'tappyai_guard', guard: 'place_claim', v2: guardV2,
        sentences_in: st.sentences_in, sentences_removed: st.sentences_removed,
        chars_in: st.chars_in, chars_removed: Math.max(0, st.chars_in - st.chars_out), chars_kept: st.chars_out,
        reasons: st.reasons, unattributable_claims: st.unattributable_claims, attribution: st.attribution,
        pick_attributable: st.pick_attributable,
      }))
    }
    // Last point before the bytes leave the server: drop any provider tool-use
    // tags that leaked into the prose, so no client has to defend against them
    // (and so the end-anchored CTA fallback still matches).
    //
    // 🔑 BOTH guards run, in this order, and the order is the decision. The spec guard rewrites
    // prose and must therefore see prose; the scaffolding strip removes non-prose tags and must
    // be last, because anything that runs after it could reintroduce a tag. Taking either side of
    // this conflict alone would have silently dropped one of the two.
    /**
     * CLARIFICATION BACKSTOP. The decision frame told the model whether a
     * question was worth asking; measured 2026-09-15 the model still closed
     * with "bạn thích ăn gì?" on turns where the frame said recommend-or-say-so.
     * Reflex taste/type questions go under `no_reflex`; decision-critical ones
     * (where, when, how many, budget, which item) always stay; at most one
     * question survives either way. Prose only — machine blocks untouched.
     */
    const clarifiedBase = guardClarifications(placeGuarded, collector?.clarificationPolicy ?? 'allow').text
    /**
     * Consultative V1 (flag): three prose guards, in this order, on prose only.
     *   search-claim  — "mình đã kiểm tra / tìm lại" on a turn that ran no tool.
     *   atmosphere    — an adjective about a named venue that its fetched text
     *                   does not support (the pick sentence is counted, not cut).
     *   prose-shape   — no card re-listing, one alternative, ≤ 6 sentences.
     * With the flag OFF `collector.consultativeV1` is undefined and this is the
     * identity — the string is untouched, byte for byte.
     */
    const clarified = (() => {
      const v1 = collector?.consultativeV1
      if (!v1) return clarifiedBase
      const claims = guardSearchClaims(clarifiedBase, { madeToolCall: anyToolCalled || v1.namedRefetch.length > 0 })
      const v1Attrs = extractAttributes(placeEntityTexts)
      const gapAttributes = v1.hardGaps.map(g => attributeForHard(g as Hard)).filter((a): a is NonNullable<typeof a> => a !== null)
      const atmosphere = guardAtmosphereClaims(claims.text, { attrs: v1Attrs, names: snippetPlaceNames, gapAttributes })
      // The shape rules are about a card-backed decision. A turn with no venues (a film
      // recommendation, a subject question) keeps its prose — measured E7: the cap dropped
      // films two and three as "least informative".
      const hasVenues = snippetPlaceNames.length > 0 || v1.carried.length > 0
      const shape = !hasVenues ? { text: atmosphere.text, stats: { sentences_in: 0, sentences_out: 0, listing_removed: 0, alternatives_removed: 0, capped: 0 } } : guardProseShape(atmosphere.text, {
        rendersCard: v1.rendersCard,
        venues: snippetPlaceNames.map(name => ({
          name,
          rating: ratingsByEntity.get(name)?.[0] ?? null,
          reviewCount: reviewCountsByEntity.get(name)?.[0] ?? null,
          hours: hoursByEntity.get(name) ?? null,
          address: addressesByEntity.get(name) ?? null,
          phone: phonesByEntity.get(name)?.[0] ?? null,
        })),
      })
      // A line the guards left with no letters or digits — a stranded emoji, a
      // lone dash — is not a sentence (measured F3: " 🍷" on its own line).
      // A line that is nothing but a markdown link ("[website của quán](…).") goes too when the
      // card renders — the card carries the links, the layout rule keeps them out of the prose.
      const machineLine = (l: string) => /^\s*\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_PLAN|TAPPY_SHOPPING|TAPPY_PLACES|\/)/.test(l)
      const linkOnlyLine = (l: string) => v1.rendersCard && /^\s*\[[^\]]+\]\([^)]+\)[\s.!,;:]*$/.test(l)
      // A FRAGMENT an earlier guard left behind — a line with more ")" than "(" ("Lau nhà, thời
      // gian chạy) để chọn…", measured S4), or one that opens lowercase mid-word after a paragraph
      // break — is not a sentence either. Machine lines and list items are never judged.
      const fragmentLine = (l: string) => {
        if (machineLine(l)) return false
        // A list marker with nothing after it ("1.", "2.3." — the items were cut by an earlier
        // guard, measured F6) is a fragment; a real list item is not judged.
        if (/^\s*(?:\d+[.)]\s*)+$/.test(l) || /^\s*[-*•]\s*$/.test(l)) return true
        if (/^\s*(?:[-*•]|\d+[.)])\s/.test(l)) return false
        const open = (l.match(/\(/g) ?? []).length
        const close = (l.match(/\)/g) ?? []).length
        if (close > open) return true
        // (measured Android F4: a 16-word tail "liên hệ trực tiếp qua số điện thoại …" left by a clause cut)
        return /^\s*\p{Ll}/u.test(l) && /[.!?…]\s*$/.test(l) && l.trim().split(/\s+/).length <= 24
      }
      const tidy = shape.text.split('\n')
        .filter(l => l.trim() === '' || machineLine(l) || (/[\p{L}\p{N}]/u.test(l) && !linkOnlyLine(l) && !fragmentLine(l)))
        .join('\n').replace(/\n{3,}/g, '\n\n')
      /**
       * The evidence gap, said out loud. The prompt asks the model to name a
       * stated constraint it found no evidence for; measured 2026-09-18 (F3,
       * F4) it did not. So the sentence is appended here, from the frame and
       * the row set, exactly like the G1b fallback: server-authored, placed
       * before the machine blocks, never a claim about the venue.
       */
      // One word list for every constraint (hardConstraints.ts) — a gap the route computed can no
      // longer be invisible here (this list used to know 7 of the 12 and filtered the rest away).
      const gapWords: Record<string, [string, string]> = HARD_GAP_WORDS
      /**
       * A budget-FIT claim with no price on any row — "Cả hai quán đều dưới 80k/bát", "hoàn
       * toàn vừa tầm", "trong tầm giá" (measured F2) — is a guess dressed as a fact. The money
       * guard lets it through because the amount echoes the user's own number; here, with the
       * budget gap known, the sentence goes (never the pick sentence — the price line below says
       * the honest thing once).
       */
      const fitClaim = /\b(?:deu |hoan toan |chac chan |van )?(?:duoi|trong tam(?: gia)?|vua tam|nam trong|hop (?:tui tien|ngan sach)|vua (?:voi )?ngan sach|dung ngan sach|khong vuot|re hon ngan sach|within (?:your )?budget|under your budget)\b/
      const tidyBudget = !v1.budgetGap ? tidy : (() => {
        const protB = protectedSpans(tidy)
        const spansB = sentenceSpans(tidy)
        let seenPick = false
        let removed = 0
        const kept = spansB.map(([a, b]) => {
          const s = tidy.slice(a, b)
          if (protB.some(([pa, pb]) => pa === a && pb === b) || !s.trim()) return s
          const f = normalizeVN(s.toLowerCase())
          const namesVenue = snippetPlaceNames.some(n => n && f.includes(normalizeVN(n.toLowerCase())))
          if (!seenPick && namesVenue) { seenPick = true; return s }
          if (fitClaim.test(f) && /\d/.test(f) && !/chua|khong (?:co|thay)|not/.test(f)) { removed++; return '' }
          return s
        }).join('')
        return removed === 0 ? tidy : kept.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      })()
      const said = normalizeVN(tidyBudget.toLowerCase())
      // "Said" means the gap was ACKNOWLEDGED, not that the word appears — measured F3, the pick
      // sentence claimed "yên tĩnh" with no evidence, which is the opposite of naming the gap.
      const acknowledged = /chua (?:thay|co|tim thay) (?:duoc )?bang chung|khong (?:tim )?thay bang chung|chua xac nhan duoc|no evidence|could not (?:find|confirm)/.test(said)
      const unsaid = acknowledged ? [] : v1.hardGaps.filter(g => gapWords[g])
      // A gap with no words is a table hole, never a silent skip.
      for (const g of v1.hardGaps) if (!gapWords[g]) console.warn(JSON.stringify({ type: 'tappyai_consultative_v1', step: 'gap_without_words', hard: g }))
      const contraryUnsaid = (v1.hardContrary ?? []).filter(g => gapWords[g] && !/khong (?:co|thay)|kem|lacks?|no (?:ac|air)/.test(said))
      const budgetUnsaid = v1.budgetGap && !/chua (?:co|thay|tim thay) (?:duoc )?(?:muc |thong tin )?gia|khong (?:co|tim thay) (?:muc |thong tin )?gia|no price/.test(said)
      const headsUp: string[] = []
      if (unsaid.length > 0) {
        headsUp.push(lang === 'en'
          ? `I found no evidence about ${unsaid.map(g => gapWords[g][1]).join(', ')} for these places — worth a call before you go.`
          : `Mình chưa thấy bằng chứng về ${unsaid.map(g => gapWords[g][0]).join(', ')} ở các quán này — nên gọi hỏi trước khi đi.`)
      }
      if (contraryUnsaid.length > 0) {
        headsUp.push(lang === 'en'
          ? `Some reviews say ${contraryUnsaid.map(g => gapWords[g][1]).join(', ')} is lacking here — worth checking before you go.`
          : `Có đánh giá nói ${contraryUnsaid.map(g => gapWords[g][0]).join(', ')} ở đây không tốt — nên hỏi trước khi đi.`)
      }
      if (budgetUnsaid) {
        headsUp.push(lang === 'en'
          ? 'None of these results carries a price, so I cannot confirm they fit your budget.'
          : 'Kết quả chưa có mức giá, nên mình chưa khẳng định được có vừa ngân sách của bạn không.')
      }
      const withHeadsUpRaw = headsUp.length === 0 ? tidyBudget : (() => {
        const at = earliestMarker(tidyBudget)
        const head = tidyBudget.slice(0, at).replace(/\s+$/, '')
        const tail = tidyBudget.slice(at)
        return `${head}${head ? '\n\n' : ''}${headsUp.join(' ')}${tail ? `\n\n${tail}` : ''}`
      })()
      // At most two hedges; beyond that they are merged into one sentence (hedgeCap.ts).
      const hedged = capHedges(withHeadsUpRaw, { lang, pickNames: snippetPlaceNames })
      const withHeadsUp = hedged.text
      console.log(JSON.stringify({
        type: 'tappyai_guard', guard: 'consultative_v1',
        search_claims_removed: claims.removed, any_tool_called: anyToolCalled,
        atmosphere_removed: atmosphere.removed, atmosphere_unsupported_in_pick: atmosphere.unsupportedInPick,
        ...shape.stats, orphan_lines_removed: shape.text.split('\n').length - tidy.split('\n').length,
        heads_up: headsUp.length, gaps_unsaid: unsaid, contrary_unsaid: contraryUnsaid, budget_unsaid: budgetUnsaid,
        hedges: hedged.hedges, hedges_merged: hedged.merged, hedges_unmergeable: hedged.unmergeable,
        carried: collector?.consultativeV1?.carried.length ?? 0,
      }))
      return withHeadsUp
    })()
    // A model link whose label names a registry merchant but whose URL is another site is unmade
    // here, at the same last point (live UAT 14 Sep 2026: "[Điện Máy Xanh](dienmaycholon.vn)").
    const systemPlaced = new Set<string>(systemLinkUrls)
    for (const p of places) for (const l of [...(p.order_links ?? []), ...(p.platform_links ?? [])]) systemPlaced.add(l.url)
    // The model's own [CTA_BUTTONS] block is validated HERE for every client (cross-platform CCP,
    // 14 Sep 2026): another registry merchant's button under a named-merchant request, a merchant
    // front door, a mislabelled destination — dropped; a promise on a results page — relabelled.
    // A false "chưa kết nối với <named provider>" claim is removed here too (the provider is in the
    // registry, so the claim is provably wrong — live UAT 15 Sep 2026, a Trip.com hotel turn).
    // …and any markdown link the model wrapped in bold/italic is un-emphasised, so Android's
    // single-pass renderer (which does not recurse into `**…**`) still linkifies the handoff.
    const scaffoldStripped = unemphasizeLinks(stripFalseDisconnectClaims(validateModelCtaBlock(unlinkMislabelledMerchantLinks(stripModelScaffolding(clarified), systemPlaced, requestedProviderId), actionTranslator(lang), requestedProviderId), requestedProviderId))
    /**
     * 🚨 THE GROUNDING GATE. Detection existed already; this is where it becomes
     * enforcement. Applied HERE, before the TikTok fold and before `finalText`
     * is composed, so every downstream consumer — the detectors, `presentedNames`,
     * `presentedIds`, and the bytes the user receives — sees the same gated text.
     *
     * Safe to run this late because place-list prose is BUFFERED: `flushedText`
     * is only released while `!placeToolSeen`, so nothing naming a venue has
     * been streamed yet and there is nothing to retract.
     */
    const gated = suppressUngroundedVenues(
      scaffoldStripped,
      [
        ...places.map(p => p.name || ''),
        ...productRecords.map(r => r.title || ''),
        ...(seed?.heldCandidates ?? []).map(c => c.name),
      ],
      lang,
      // The turn's retrieval verdict. Without it the gate cannot tell "nothing to check
      // against because nothing was retrieved" from "nothing to check against because this
      // is a recall turn" — and it stood down for both.
      { placeSearch: placeSearchStatus },
    )
    // AUDIT ONLY (env-gated, never in production): what the grounding gate cut and against which
    // names, plus the pre-gate prose — the one place a "0 rows" / "all cut" verdict can be checked.
    if (process.env.AUDIT_USAGE_LOG_FILE && gated.suppressed.length > 0) {
      try { appendFileSync(process.env.AUDIT_USAGE_LOG_FILE, JSON.stringify({ type: 'tappyai_audit_grounding', suppressed: gated.suppressed, known: places.map(p => p.name || ''), placeSearch: placeSearchStatus ?? null, preGate: scaffoldStripped.slice(0, 2000) }) + '\n') } catch { /* audit only */ }
    }
    /**
     * G1b — EVIDENCE-ONLY FALLBACK (v2 only). When the guards have taken every body
     * sentence and the engine did make a Pick with a retrieved rating, one sentence
     * built from card fields replaces the empty body. Nothing here can be invented:
     * name, rating, review count and hours are the row values the card renders.
     * Never says "đang mở" — hours from a provider are a schedule, not a live state
     * (owner rule). Vietnamese by default; English only when the user's message is
     * confidently English (the language detector reads undiacriticked Vietnamese
     * as English, so `lang` alone is not enough).
     */
    const fallbackSentence = (name: string | null = pickName): string | null => {
      if (!guardV2 || !name) return null
      const rating = ratingsByEntity.get(name)?.[0]
      if (typeof rating !== 'number') return null
      const count = reviewCountsByEntity.get(name)?.[0]
      const hours = hoursByEntity.get(name)
      const confidentlyEnglish = lang === 'en'
        && /\b(find|me|the|near|nearby|quiet|restaurant|please|want|looking|recommend|show|best|good|where|for|with)\b/i.test(userText)
        && !/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(userText)
      const ratingText = confidentlyEnglish
        ? `${rating}⭐${typeof count === 'number' ? ` (${count.toLocaleString('en-US')} Google Maps reviews)` : ''}`
        : `${rating}⭐${typeof count === 'number' ? ` (${count.toLocaleString('vi-VN')} đánh giá Google Maps)` : ''}`
      const hoursText = hours
        ? (confidentlyEnglish ? `; opening hours per Google Maps: ${hours}` : `; giờ mở cửa theo Google Maps: ${hours}`)
        : ''
      return confidentlyEnglish
        ? `I'd go with **${name}** — ${ratingText}${hoursText}.`
        : `Mình chọn **${name}** — ${ratingText}${hoursText}.`
    }
    const releasedPrefix = flushedText ?? ''
    const bodyAfterGuards = gated.text.startsWith(releasedPrefix) ? gated.text.slice(releasedPrefix.length) : gated.text
    const bodyLetters = (bodyAfterGuards.replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, '').replace(/\[FOLLOWUPS\][^\n]*/g, '').match(/\p{L}/gu) ?? []).length
    /**
     * 🚨 A FOLLOW-UP ABOUT ONE VENUE MAY ONLY EVER BE ANSWERED ABOUT THAT VENUE. Measured P3
     * 2026-09-19: "chỗ đó có đặt trước được không?" referred to Hyan Spa; the model re-searched with
     * "Hyan Spa Quận 1 đặt trước booking", Serper returned ten unrelated spas, the body named none,
     * and the backstop put "Mình chọn **AN's spa**" at the top — wrong information, stated as the
     * answer. When the route resolved the user's reference to prior venues (`referenced`), a
     * server-authored pick sentence is allowed ONLY for a row that matches one of them; when no
     * row does, no sentence is written (the honest "không tìm thấy" is the model's — the refetch
     * block asks for it) and the skip is logged.
     */
    const referenced = (collector?.consultativeV1?.referenced ?? []).map(n => normalizeVN(n.trim().toLowerCase())).filter(Boolean)
    const subjectOnly = (candidate: string | null): string | null => {
      if (referenced.length === 0) return candidate
      const matchesSubject = (name: string) => isGrounded(normalizeVN(name.trim().toLowerCase()), referenced)
      if (candidate && matchesSubject(candidate)) return candidate
      const inRows = places.map(p => p.name || '').find(n => n && matchesSubject(n)) ?? null
      console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'consultative_v1_pick_backstop', step: inRows ? 'subject_row' : 'skipped_referenced', candidate: candidate ?? null, subject: inRows }))
      return inRows
    }
    const g1bFallback = bodyLetters < 40 ? fallbackSentence(subjectOnly(pickName)) : null
    if (g1bFallback) console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'place_claim_fallback', v2: guardV2, body_letters: bodyLetters, emitted: true }))
    /**
     * Consultative V1 backstop — THE PICK MUST BE STATED (rule 1). Measured 2026-09-18 on the
     * CONSULTATIVE-40: with rows and an engine pick in hand the model still wrote "bạn ưu tiên cái
     * gì nhất — giá rẻ, hiệu năng hay pin?" (S2) and named nothing — a prompt rule does not stop
     * that. When the body names NO retrieved venue/product at all, the pick sentence is built from
     * card fields (the same evidence-only sentence G1b uses; for shopping, the decision card's
     * recommended entity) and placed at the top. The model's own text is not removed.
     */
    const v1PickBackstop = (() => {
      if (g1bFallback || !collector?.consultativeV1?.on) return null
      const body = bodyAfterGuards.replace(/\[(?:CTA_BUTTONS|TAPPY_SHOPPING|TAPPY_PLACES|TAPPY_PLAN)\][\s\S]*?\[\/(?:CTA_BUTTONS|TAPPY_SHOPPING|TAPPY_PLACES|TAPPY_PLAN)\]/g, '').replace(/\[FOLLOWUPS\][^\n]*/g, '')
      const shopping = shoppingPickFromMarker(collector.shoppingMarker)
      const known = [...places.map(p => p.name || ''), ...(shopping ? [shopping.name] : [])]
        .map(n => normalizeVN(n.trim().toLowerCase())).filter(Boolean)
      if (known.length === 0) return null
      // A venue named only inside an ALTERNATIVE sentence ("Nếu muốn…", "Ngoài ra…", "Hoặc…") is
      // not a pick — measured GATE A rerun 2026-09-19 (T5b ×2, S5b): the guards cut the pick
      // sentence and the body kept "Nếu muốn chỗ ngoài trời hơn, **Công viên Tao Đàn**…" alone,
      // so the reply offered alternatives to a choice it never made. A plain (un-bolded) mention
      // still counts (measured E4: "Dollhouse bar HCMC" without bold got a redundant pick on top).
      const ALT = /^\s*(?:n[eế]u|ngo[àa]i ra|ho[ặa]c|c[òo]n|thay v[àa]o [dđ][óo]|if you|or\b|alternatively|otherwise)/iu
      const namesKnown = (s: string) => {
        const f = normalizeVN(s.toLowerCase())
        return known.some(n => n.length >= 4 && f.includes(n)) || [...s.matchAll(/\*\*([^*\n]{3,80})\*\*/g)].some(m => isGrounded(normalizeHeading(m[1]), known))
      }
      const sentences = sentenceSpans(body).map(([a, b]) => body.slice(a, b)).filter(s => s.trim())
      const hasPickSentence = sentences.some(s => namesKnown(s) && !ALT.test(s))
      if (hasPickSentence) return null
      const altOnly = sentences.some(s => namesKnown(s))
      if (altOnly) console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'consultative_v1_pick_backstop', step: 'alternatives_only' }))
      // The engine's Pick, or — when derivePick made none (measured T8: five shortlisted hotels,
      // no pick) — the engine's #1, which V1 rule 8 already names as the default choice.
      const engineFirst = collector?.placesRecommendations?.[0]?.entity.identity.name ?? null
      const place = fallbackSentence(subjectOnly(pickName ?? engineFirst))
      if (place) return { sentence: place, kind: 'place' as const }
      if (shopping) return { sentence: shopping.sentence, kind: 'shopping' as const }
      return null
    })()
    if (v1PickBackstop) console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'consultative_v1_pick_backstop', kind: v1PickBackstop.kind, body_letters: bodyLetters }))
    const fallback = g1bFallback ?? v1PickBackstop?.sentence ?? null
    // The sentence goes where the body was — BEFORE the first structured block. Appending
    // it after [CTA_BUTTONS]/[FOLLOWUPS] put it below the buttons (measured on the
    // 2026-09-17 replay, run 2 #11), where the client renders it as an orphan line.
    const groundedProse = (() => {
      if (!fallback) return gated.text
      // V1 backstop: the pick is the FIRST sentence of the body; the model's text follows.
      if (v1PickBackstop && !g1bFallback) {
        const head = gated.text.startsWith(releasedPrefix) ? releasedPrefix : ''
        return `${head}${fallback}\n\n${bodyAfterGuards.replace(/^\s+/, '')}`
      }
      const at = earliestMarker(gated.text)
      const head = gated.text.slice(0, at).replace(/\s+$/, '')
      const tail = gated.text.slice(at)
      return `${head}${head ? '\n\n' : ''}${fallback}${tail ? `\n\n${tail}` : ''}`
    })()
    /**
     * The batch-level TikTok link, appended once at the very end of the reply.
     *
     * Deliberately OUTSIDE any place block, and under wording that says "related video": the TikTok
     * search is ONE query for the whole batch, so nothing establishes which restaurant a result is
     * about. It used to be attached to `results[0]` and captioned "Review TikTok" inside that
     * restaurant's card — measured on production, the video was about somewhere else entirely.
     *
     * 🔑 Folded in BEFORE the detector below, not after the enqueue. The reply the grounding
     * detector reads must be byte-identical to the reply the user gets; appending afterwards would
     * have made the detector analyse a different string than the one that shipped.
     */
    // 🚨 THE CARD CARRIES THE REVIEW LINK WHEN IT RENDERS, so the batch line is
    // dropped at its source rather than in the fold below — that keeps the fold
    // expression, and the ordering contract asserted on it, exactly as it was.
    const batchTikTok = cardOwnsEnrichment ? undefined : collector?.batchTikTokUrl
    // Phase 9: the app-owned shopping DECISION marker is folded into the SAME
    // string the detector analyses and the client receives — part of `finalText`,
    // never appended afterwards — so "detector in == user out" holds (the TikTok
    // line obeys the same rule). It carries only grounded synthesis data
    // (config/seller/price/url), has no prose or bold names for the grounding
    // detector to trip on, and — being in the message text — persists so the
    // decision survives reload (a tool-result field does not). Client parses +
    // strips it; see parseShoppingMarker.
    const markerSuffix = collector?.shoppingMarker ? `\n\n${collector.shoppingMarker}` : ''
    /**
     * The unified `[TAPPY_PLACES]` block, folded into `finalText` on exactly the
     * same terms as the shopping marker above — part of the string the detectors
     * read and the user receives, never appended afterwards.
     *
     * 🚨 EMISSION IS FLAG-GATED OFF. Two independent blockers, both recorded in
     * `config/product.ts`: Android and iOS cannot strip a marker they have never
     * been told about (shared fixture contract, rule 6), and a marker is
     * permanent storage, which Google Places terms forbid for Places content.
     * The recommendations are still BUILT on every turn — the data layer is
     * exercised and tested — they are simply not written into the reply.
     *
     * Built here rather than at tool time because photos resolve late, inside
     * this filter: serializing earlier would persist a block with no images.
     *
     * 🚨 DECLARED BELOW, NOT HERE. It needs `prose`, because a place earns a card
     * only if this reply already named it — see `recommendationsGroundedInProse`.
     */

    /**
     * Server-authored CTA. The model's own block is stripped FIRST — a prompt
     * rule is not a guarantee, and the client's parser takes the first match, so
     * leaving both would make the button set depend on ordering.
     *
     * 🚨 Also flag-gated off: the prompt still instructs the model to emit its
     * own block, and deleting that instruction is what must ship alongside this.
     * Until then the shipped behaviour is untouched.
     */
    const serverCta = (SERVER_AUTHORED_CTA && collector?.placesRecommendations?.length)
      ? renderCtaBlock(collector.placesRecommendations, lang)
      : ''
    const prose = (groundedProse && batchTikTok && isValidTikTokContentUrl(batchTikTok))
      ? `${groundedProse}\n\n🎵 [${escapeMarkdownLabel(relatedVideoLabel(lang))}](${sanitizeUrlForMarkdown(batchTikTok)})`
      : groundedProse
    // `finalText` keeps carrying the marker whether or not it was already sent.
    // It is not only what ships — it is what the money/spec/grounding detectors
    // read and what presentedNames/presentedIds are resolved against, so the
    // early send must not change it. Splitting delivery is allowed to change
    // WHEN the user sees the decision; it is not allowed to change what the
    // guards analysed or which candidates the turn recorded as presented.
    // The places block rides the SAME channel as the shopping decision, for the same reason: text
    // is the only thing that survives reload, so a structured card must live in the message. It is
    // therefore part of `finalText` too — the detectors read exactly what the user receives, and
    // "detector in == user out" still holds with two markers as it did with one.
    //
    // It cannot widen what the turn counts as presented: `recommendationsGroundedInProse` keeps
    // only places the prose ALREADY names (it drops any place `findPlaceOffset` cannot locate in
    // the prose), so every name the block carries is a name `seenIn` would have matched from the
    // prose alone. An empty grounded set emits no block at all, rather than an empty one.
    //
    // Appended after the shopping suffix so the existing marker order is untouched.
    const groundedRecs = (EMIT_TAPPY_PLACES && collector?.placesRecommendations?.length)
      ? recommendationsGroundedInProse(
        withResolvedPhotos(collector.placesRecommendations, places),
        places,
        prose,
      )
      : []
    const placesSuffix = groundedRecs.length > 0 ? `\n\n${renderPlacesMarker(groundedRecs)}` : ''
    // With the server authoring the CTA, the model's block is removed from the
    // prose before anything is appended; without the flag, `prose` is untouched.
    const ctaOwnedProse = serverCta ? stripModelCta(prose) : prose
    const ctaSuffix = serverCta ? `\n\n${serverCta}` : ''
    /**
     * Route / event / film handoffs the platform resolved (`_tappy_commerce`) reach the user through
     * the prose — and the model does not always copy them (Final local live UAT, 14 Sep 2026: "đã
     * tìm được link Traveloka" with no link). When NONE of the system's validated URLs made it into
     * the prose, the system appends them itself, the way it injects order links under a venue:
     * validated links, never the model's, never composed here.
     */
    const missingSystemLinks = systemLinks.filter(l => !prose.includes(l.url))
    const systemLinksSuffix = systemLinks.length > 0 && missingSystemLinks.length === systemLinks.length
      ? `\n\n${lang === 'vi' ? '🔗 Liên kết chính thức:' : '🔗 Official links:'} ${missingSystemLinks.map(l => `[${escapeMarkdownLabel(l.name)}](${sanitizeUrlForMarkdown(l.url)})`).join(' · ')}`
      : ''
    const finalText = `${ctaOwnedProse}${systemLinksSuffix}${markerSuffix}${placesSuffix}${ctaSuffix}`
    // Record which candidates this reply actually named — the only reliable
    // answer to "which ones did the user see?".
    const seenIn = normalizeVN(finalText.toLowerCase())
    presentedNames = [
      ...places.map(p => p.name || ''),
      ...productRecords.map(r => (r.title || '').split(' - ')[0]),
    ].filter(n => n.trim() && seenIn.includes(normalizeVN(n.trim().toLowerCase())))
    // Held candidates count too, and on a reuse turn they are the ONLY source —
    // nothing was searched, so `places` and `productRecords` are both empty.
    // A candidate is presented only if its name appears in the text the user
    // actually read; being in the pool, or considered by ranking, is not enough.
    presentedIds = namedHeldIds(finalText)
    // The gate removed these, so the detector can no longer see them in
    // `finalText`. Both are kept: the gate's own record is what shipped, and the
    // detector still runs as defence in depth against a shape the gate missed.
    ungroundedNames = [...new Set([
      ...gated.suppressed,
      ...ungroundedNamesIn(finalText, places, productRecords, seed?.heldCandidates ?? []),
    ])]
    // What still needs sending. When the decision already went out after the
    // tool result, only the prose is left — re-sending the marker here would
    // put a second copy in the message text and render a duplicate card.
    // The SHOPPING marker is the only thing the early send delivered, so it is the only thing
    // subtracted here. `placesSuffix` has not been sent by anyone and must still ride out, or a
    // turn that searched both places and products would lose its place cards entirely.
    const outText = earlyShoppingMarkerSent ? `${prose}${placesSuffix}` : finalText
    // A5-P1: whatever was already released early must not be sent a second time. The released
    // prefix is money-free whole sentences taken from before any place tool, so neither the guard
    // (which only removes sentences carrying a money claim) nor the photo injector (which writes
    // around place names, all of which arrive after the tool) rewrites it — `outText` still starts
    // with it. The `startsWith` check is the belt: if that ever stopped holding, repeating a short
    // opening line is a far better failure than silently dropping the reply.
    const send = flushedText && outText.startsWith(flushedText)
      ? outText.slice(flushedText.length)
      : outText
    if (send) controller.enqueue(encoder.encode('0:' + JSON.stringify(send) + '\n'))

    /**
     * The place decision, as a message ANNOTATION rather than as text.
     *
     * 🚨 EMITTED HERE, AFTER THE PROSE, AND EXACTLY ONCE. This is the only point
     * at which the turn is finished: photos have resolved (they resolve late,
     * inside this filter), the grounding gate has already removed anything
     * ungrounded, and the text the user will read is settled. Sending earlier
     * would ship a card for a place the gate then deleted from the reply.
     *
     * It is an `8:` frame, not text: nothing here can leak into the message body,
     * TTS, copy or a native client - Android reads only `0:` and iOS treats an
     * unknown prefix as `.unknown`. It is also never persisted, which is what
     * keeps the payload compliant where the durable marker is not. See
     * `EMIT_PLACES_ANNOTATION`.
     */
    // `null` when the engine did not choose - flights, transport, a turn with too
    // few candidates. No card is the honest answer there, and the prose then keeps
    // its injected links because nothing else is going to carry them.
    if (placesView) controller.enqueue(encoder.encode('8:' + JSON.stringify([placesView]) + '\n'))
  }

  const transform = new TransformStream<any, any>({
    async transform(chunk, controller) {
      lineRemainder += decoder.decode(chunk, { stream: true })
      const lines = lineRemainder.split('\n')
      lineRemainder = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('0:')) {
          // B12 — the step boundary. Only ever inserted BETWEEN two pieces of model speech:
          // nothing is added before the first word, after a tool that the model does not follow
          // up on, or when the model already ended its preamble with a newline of its own.
          const needsBreak = (): boolean =>
            awaitingPostToolText && assistantSoFar.length > 0 && !/\s$/.test(assistantSoFar)

          if (bufferMode) {
            if (needsBreak()) { mainText += '\n\n'; assistantSoFar += '\n\n' }
            awaitingPostToolText = false
            try {
              const delta = JSON.parse(line.slice(2)) as string
              mainText += delta
              assistantSoFar += delta
            } catch { /* skip malformed */ }
            // A5-P1: release the part that the guard provably cannot touch, instead of making the
            // user wait for the whole reply. Only before a place tool — see `progressive`.
            if (progressive && !placeToolSeen) {
              const point = safeFlushPoint(mainText)
              if (point > flushedText.length) {
                const slice = mainText.slice(flushedText.length, point)
                flushedText = mainText.slice(0, point)
                controller.enqueue(encoder.encode('0:' + JSON.stringify(slice) + '\n'))
              }
            }
            // the rest stays buffered — re-emitted (repositioned) at 'd:'
          } else {
            // Live path (intro / chitchat — no place tool ran, so nothing is
            // buffered). Strip whole scaffolding tags that land inside a single
            // delta. A tag split ACROSS deltas still gets through here: holding
            // bytes back to reassemble it would buffer the live stream, which
            // StreamingNotBufferedByLoggingTest exists to prevent. The buffered
            // path below — which covers every tool turn, and every leak actually
            // observed — sanitises the complete text instead.
            // Same boundary on the live path. A non-place tool (weather, gold price, news) leaves
            // bufferMode false, so its turn streams straight through and would run the two steps
            // together exactly the same way. The break is emitted as its own frame so the live
            // stream keeps its timing — nothing is held back.
            if (needsBreak()) {
              controller.enqueue(encoder.encode('0:' + JSON.stringify('\n\n') + '\n'))
              liveText += '\n\n'
              assistantSoFar += '\n\n'
            }
            awaitingPostToolText = false

            let out = line
            if (line.indexOf('<') !== -1) {
              try {
                const cleaned = stripModelScaffolding(JSON.parse(line.slice(2)) as string)
                out = '0:' + JSON.stringify(cleaned)
              } catch { /* malformed delta — forward untouched */ }
            }
            // Keep a copy of what went out, so presentation tracking works on
            // turns where no tool ran. This is a RECORD, not a buffer: the
            // chunk is enqueued on the next line either way, so nothing is held
            // back and the live stream keeps its timing.
            try {
              const delta = JSON.parse(out.slice(2)) as string
              liveText += delta
              assistantSoFar += delta
            } catch { /* skip malformed */ }
            controller.enqueue(encoder.encode(out + '\n'))
          }
        } else if (line.startsWith('9:')) {
          try {
            const call = JSON.parse(line.slice(2)) as { toolCallId?: string; toolName?: string; args?: { query?: string } }
            if (call.toolCallId && call.toolName) toolNameByCallId.set(call.toolCallId, call.toolName)
            anyToolCalled = true
            if (call.toolName && PLACE_TOOLS.has(call.toolName)) {
              // The pre-tool segment is now COMPLETE, so its final sentence is a real sentence end
              // and may be released — the usual "the last one might still be arriving" caution no
              // longer applies. Without this the common "one opening sentence, then the tool" shape
              // released nothing and the user still stared at ~13.6s of blank screen.
              if (progressive && !placeToolSeen) {
                const point = safeFlushPoint(mainText, true)
                if (point > flushedText.length) {
                  const slice = mainText.slice(flushedText.length, point)
                  flushedText = mainText.slice(0, point)
                  controller.enqueue(encoder.encode('0:' + JSON.stringify(slice) + '\n'))
                }
              }
              bufferMode = true
              placeToolSeen = true
            }
            // C3-B.10: the money guard needs to know WHAT was asked for. The
            // tool's own query is the only deterministic source — and it is what
            // distinguishes "đệm tai cho WH-1000XM5" (an accessory request,
            // where an accessory price is correct) from "WH-1000XM5".
            // De-duplicated: with the pre-search seed a query can arrive twice — once seeded,
            // once live — and the money guard treats a repeated query as a second entity.
            if (call.toolName === 'search_products' && call.args?.query && !productQueries.includes(call.args.query)) {
              productQueries.push(call.args.query)
            }
          } catch { /* ignore */ }
          controller.enqueue(encoder.encode(line + '\n'))
        } else if (line.startsWith('a:')) {
          try {
            const res = JSON.parse(line.slice(2)) as {
              toolCallId?: string
              result?: {
                results?: PlaceLike[]
                search_results?: SearchResultLike[]
                /** Structured /shopping records — the spec guard's evidence. */
                shopping_results?: Array<{ title?: string; weightKg?: number; batteryHours?: number }>
                /** Food/spa price snippets (title/link/snippet) — A5 evidence: a price
                 *  the reply states must trace to one of these, else it's fabricated. */
                price_search_results?: Array<{ title?: string; snippet?: string; link?: string; evidence_scope?: string; evidence_about?: string }>
                travel_editorial?: Array<{ title?: string; summary?: string; extract?: string }>
                /** Direct ordering pages, each attributed to the place its own text named. */
                order_search_results?: Array<{ evidence_scope?: string; evidence_about?: string }>
                /** The tool's own verdict on retrieval — see `PlaceSearchStatus`. */
                place_search_status?: PlaceSearchStatus
              }
            }
            const toolName = res.toolCallId ? toolNameByCallId.get(res.toolCallId) : undefined
            // CCP route / event / film projections (`_tappy_commerce` marks them): every URL the
            // platform validated for this turn, so the ticket guard can tell a system link from a claim.
            if (res.result && Array.isArray((res.result as { _tappy_commerce?: unknown })._tappy_commerce)) {
              const r = res.result as { booking_links?: Array<{ url?: string }>; event_links?: Array<{ url?: string }>; film_links?: Array<{ url?: string }>; vexere_link?: string }
              for (const l of [...(r.booking_links ?? []), ...(r.event_links ?? []), ...(r.film_links ?? [])] as Array<{ name?: string; platform?: string; url?: string }>) {
                if (typeof l?.url !== 'string' || systemLinkUrls.has(l.url)) continue
                systemLinkUrls.add(l.url)
                systemLinks.push({ name: [l.name, l.platform].filter(Boolean).join(' · ') || l.url, url: l.url })
              }
              if (typeof r.vexere_link === 'string' && !systemLinkUrls.has(r.vexere_link)) { systemLinkUrls.add(r.vexere_link); systemLinks.push({ name: 'Vexere', url: r.vexere_link }) }
            }
            // Same rows, two more kinds of evidence — see placeClaimGuard. Shared with the hotel
            // branch below: a Serper `/maps` hotel row carries the same fields as a place row.
            const readRowEvidence = (row: Record<string, unknown>) => {
              // 🚨 THE RATING EVIDENCE WAS ALWAYS EMPTY. The Google and Serper rows carry the
              // number as `rating_value` (`google_rating` is the FORMATTED STRING the prompt
              // reads), so `row.rating ?? row.google_rating` was never a number and
              // `ratingsByEntity` stayed empty on every real turn. Nobody noticed because v1
              // never read "4.9⭐" as a score; the G1 replay on the 2026-09-17 capture did
              // (15/15 turns, `ratingsByEntity: {}` beside a full `reviewCountsByEntity`).
              const rating = typeof row.rating_value === 'number' ? row.rating_value : (row.rating ?? row.google_rating)
              const rowName = typeof row.name === 'string' ? row.name : ''
              if (rowName) snippetPlaceNames.push(rowName)
              if (typeof rating === 'number') placeRatings.push(rating)
              // The same facts, keyed by the venue they actually describe.
              if (rowName && typeof rating === 'number') {
                ratingsByEntity.set(rowName, [...(ratingsByEntity.get(rowName) ?? []), rating])
              }
              if (rowName && typeof row.rating_count === 'number') {
                reviewCountsByEntity.set(rowName, [...(reviewCountsByEntity.get(rowName) ?? []), row.rating_count])
              }
              if (rowName && typeof row.website_uri === 'string' && isDirectTicketUrl(row.website_uri)) {
                ticketablePlaces.add(rowName)
              }
              if (rowName && typeof row.phone === 'string' && row.phone) {
                phonesByEntity.set(rowName, [...(phonesByEntity.get(rowName) ?? []), row.phone])
              }
              if (rowName && typeof row.opening_hours === 'string' && row.opening_hours && !hoursByEntity.has(rowName)) {
                hoursByEntity.set(rowName, row.opening_hours)
              }
              if (rowName && typeof row.address === 'string' && row.address && !addressesByEntity.has(rowName)) {
                addressesByEntity.set(rowName, row.address)
              }
              // Consultative V1: the row's own category text is evidence for category-level
              // attributes — "Khu vui chơi trẻ em" IS kid-friendly (measured E8: the heads-up
              // said no evidence of kids for a children's playground).
              if (rowName) {
                const cat = [rowName, row.type, row.amenity, row.cuisine, ...(Array.isArray(row.types) ? row.types : [])].filter((x): x is string => typeof x === 'string' && x.length > 0).join(' · ')
                if (cat) placeEntityTexts.set(rowName, [...(placeEntityTexts.get(rowName) ?? []), cat])
              }
              if (rowName && !priceBandsByEntity.has(rowName)) {
                const band = bandFromRow(row)
                if (band) priceBandsByEntity.set(rowName, band)
              }
              if (typeof row.distance_km === 'number') placeDistancesKm.push(row.distance_km)
              for (const k of ['snippet', 'address', 'opening_hours']) {
                if (typeof row[k] === 'string') placeTexts.push(row[k] as string)
              }
            }
            let newPlaces: PlaceLike[] = []
            if (toolName === 'search_places') {
              const results = res.result?.results
              if (Array.isArray(results)) newPlaces = results
              /**
               * 🚨 READ FROM THE TOOL, NEVER RE-DERIVED HERE.
               *
               * `searchPlaces` stamps this from the provider's rows before enrichment runs.
               * Recomputing it locally would be a second classifier free to disagree with the
               * one that actually saw the response — and the older `results?.length` reading
               * available here cannot see WHY the array is empty.
               *
               * The fallback is `has_results` only when rows exist, so a result from an older
               * shape without the field degrades to today's behaviour rather than to silence.
               */
              placeSearchStatus = res.result?.place_search_status
                ?? (Array.isArray(results) && results.length > 0 ? 'has_results' : 'empty')
              // A5: the only evidence a food/spa price may trace to.
              hadPlaceSearch = true
              const priceSnips = res.result?.price_search_results
              if (Array.isArray(priceSnips)) {
                snippetPrices.push(...pricesFromSnippets(priceSnips.map(r => `${r.title ?? ''} ${r.snippet ?? ''}`)))
                // Keep the ENTITY-scoped prices separately. A snippet is only
                // entity-scoped when its own text named exactly one place —
                // `searchPlaces` made that call with the audited matcher.
                for (const r of priceSnips) {
                  const scoped = r as { title?: string; snippet?: string; evidence_scope?: string; evidence_about?: string }
                  if (scoped.evidence_scope !== 'entity' || !scoped.evidence_about) continue
                  const prices = pricesFromSnippets([`${scoped.title ?? ''} ${scoped.snippet ?? ''}`])
                  if (prices.length === 0) continue
                  const bucket = snippetPricesByEntity.get(scoped.evidence_about) ?? []
                  bucket.push(...prices)
                  snippetPricesByEntity.set(scoped.evidence_about, bucket)
                }
                // An entity-scoped snippet whose link is a DIRECT page for that
                // venue is the only thing that can support a ticket-sale claim.
                for (const r of priceSnips) {
                  const scoped = r as { link?: string; evidence_scope?: string; evidence_about?: string }
                  if (scoped.evidence_scope !== 'entity' || !scoped.evidence_about) continue
                  if (isDirectTicketUrl(scoped.link)) ticketablePlaces.add(scoped.evidence_about)
                }
                // The same entity-scoped snippets are also the only text that can
                // support a claim about how popular THAT place is.
                for (const r of priceSnips) {
                  const scoped = r as { title?: string; snippet?: string; evidence_scope?: string; evidence_about?: string }
                  if (scoped.evidence_scope !== 'entity' || !scoped.evidence_about) continue
                  const bucket = placeEntityTexts.get(scoped.evidence_about) ?? []
                  bucket.push(`${scoped.title ?? ''} ${scoped.snippet ?? ''}`)
                  placeEntityTexts.set(scoped.evidence_about, bucket)
                }
              }
              for (const o of res.result?.order_search_results ?? []) {
                if (o.evidence_scope === 'entity' && o.evidence_about) orderablePlaces.add(o.evidence_about)
              }
              for (const row of (Array.isArray(results) ? results : []) as Array<Record<string, unknown>>) readRowEvidence(row)
              if (Array.isArray(priceSnips)) {
                for (const r of priceSnips) placeTexts.push(`${r.title ?? ''} ${r.snippet ?? ''}`)
              }
            }
            if (toolName === 'search_products') {
              // BOTH provider paths — see `addSpecRecords`. `shopping_results`
              // is the organic fallback's name for the structured array;
              // `search_results` is where the primary /shopping path puts it.
              addSpecRecords(res.result?.shopping_results)
              addSpecRecords(res.result?.search_results)
            }
            // P0 travel guard evidence: the ONLY live, structured travel price we
            // have. get_flight_prices returns `flights[].price_vnd` on success and
            // no price at all on error/missing-token, so an empty travelFares means
            // "no live fare" and the guard redacts every fare the model states.
            if (toolName === 'get_flight_prices') {
              const flights = (res.result as { flights?: Array<{ price_vnd?: number }> } | undefined)?.flights
              if (Array.isArray(flights)) {
                for (const f of flights) if (typeof f?.price_vnd === 'number') travelFares.push(f.price_vnd)
              }
            }
            if (toolName === 'get_hotel_prices') {
              // A hotel's star class and its "cách X 900 m" come from the row's own
              // snippet, never a structured field — so the snippet IS the evidence
              // for those numbers. Without this the place guard would redact a
              // grounded "khách sạn 3 sao" as if the model had invented it.
              for (const row of (res.result?.search_results ?? []) as Array<Record<string, unknown>>) {
                for (const k of ['snippet', 'title']) {
                  if (typeof row[k] === 'string') placeTexts.push(row[k] as string)
                }
              }
            }
            // VnExpress editorial (`travel_editorial`, any travel tool): retrieved TEXT, the
            // same standing as a hotel snippet for the place guard — a quality or distance
            // the article states may be restated. It is NOT a price source: `travelFares`
            // and `snippetPrices` are not read from it, so a fare or fee in an article
            // stays exactly as unsupported as it was — the guards redact it.
            for (const e of (res.result?.travel_editorial ?? []) as Array<Record<string, unknown>>) {
              for (const k of ['title', 'summary', 'extract']) {
                if (typeof e[k] === 'string') placeTexts.push(e[k] as string)
              }
            }
            if (toolName === 'get_hotel_prices' || toolName === 'search_products') {
              // Neither has a 'name'-shaped results[] — search_results is the primary content
              // instead, with 'title' standing in for the place name. Raw titles are "Hotel
              // Name - City - Booking.com"-style; the AI writes just "Hotel Name", so take the
              // part before the first " - " to match how it actually gets written.
              const searchResults = res.result?.search_results
              if (Array.isArray(searchResults)) {
                newPlaces = searchResults.map(r => ({ ...r, name: r.title?.split(' - ')[0]?.trim() }))
                // C3-B.10: keep the records verbatim for the money guard. It
                // reads ONLY the structured `price` field, never title/snippet.
                if (toolName === 'search_products') {
                  // Dedupe by link/title so a pre-seeded record and the same
                  // record arriving live count once (CASE C).
                  for (const r of searchResults as EvidenceRecord[]) {
                    const key = r?.link || r?.title
                    if (!key || !productRecords.some(e => (e.link || e.title) === key)) productRecords.push(r)
                  }
                }
              }
              /**
               * 🚨 Phase 4 hotels arrive in `hotel_list`, name-shaped, from Serper `/maps` — and
               * when `/maps` answers there is NO `search_results` at all. Measured 2026-09-18
               * (T2/T8): 18 real hotels with ratings landed here, this branch read none of them,
               * so every sentence naming a hotel was cut as fabricated and the reply degraded to
               * "bạn định check-in ngày nào?". The rows ARE the evidence; read them.
               */
              if (toolName === 'get_hotel_prices') {
                const hotelList = (res.result as { hotel_list?: PlaceLike[] } | undefined)?.hotel_list
                if (Array.isArray(hotelList) && hotelList.length > 0) {
                  newPlaces = [...newPlaces, ...hotelList.filter(h => typeof h?.name === 'string' && h.name)]
                  for (const row of hotelList as Array<Record<string, unknown>>) readRowEvidence(row)
                }
              }
            }
            // ACCUMULATE across EVERY place-tool call, not just the last one: a trip plan runs
            // several searches (hotels, food, attractions) and each plan item must be able to
            // match its own photo. Dedupe by name; if a later call carries a photo for a name we
            // saw without one, upgrade to the entry that has the photo. Same helper the seed
            // uses, so seeded + live evidence for one place merges instead of duplicating.
            mergePlaces(newPlaces)
          } catch { /* ignore */ }
          // B12 — a tool result closes the step. Whatever the model says next is a new paragraph,
          // not a continuation of the sentence it left off on.
          awaitingPostToolText = true
          controller.enqueue(encoder.encode(line + '\n'))
          // ── Early shopping decision ───────────────────────────────────────
          //
          // The decision card is FINISHED here. route.ts builds it from the
          // frozen shopping evidence inside the tool's own execute(), so by the
          // time this result frame lands `collector.shoppingMarker` is already
          // complete — grouping, recommendation, prices and seller URLs all
          // settled. Holding it until the end bought nothing: it waited on prose
          // it does not depend on, through a buffer it does not need.
          //
          // So send it now, as text. Text is the only channel that survives
          // reload — the chat renders from and persists `msg.content`, and a
          // tool-result field is gone on the next load. That is why the card
          // travels as a marker at all, and it is why the early copy is a `0:`
          // frame rather than a new frame type the client would have to learn
          // and the reload path would not see.
          //
          // Nothing model-authored rides along: this is the same server-built
          // object as before, emitted earlier and unchanged.
          if (!earlyShoppingMarkerSent && collector?.shoppingMarker) {
            earlyShoppingMarkerSent = true
            controller.enqueue(encoder.encode('0:' + JSON.stringify(collector.shoppingMarker + '\n\n') + '\n'))
          }
        } else if (line.startsWith('d:')) {
          await emitReconstructed(controller)
          controller.enqueue(encoder.encode(line + '\n'))
        } else {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
    async flush(controller) {
      await emitReconstructed(controller)
      if (lineRemainder) controller.enqueue(encoder.encode(lineRemainder + '\n'))
      // Task 3C: hand the turn's grounded evidence to the caller AFTER the reply
      // is fully emitted, so persisting it can never delay a byte to the user.
      // Deliberately awaited-but-swallowed: a failed write costs the next turn
      // its candidates, never this turn's answer.
      if (onEvidence) {
        try {
          // Presentation tracking is independent of bufferMode: buffered turns
          // resolved it from the reconstructed text above, live turns resolve
          // it here from what was actually streamed.
          if (presentedIds.length === 0) presentedIds = namedHeldIds(liveText)
          await onEvidence({ places: resolvePlaces(), productRecords, productQueries, presentedNames: [...new Set(presentedNames)], presentedIds: [...new Set(presentedIds)], ungroundedNames })
        } catch { /* state is best-effort; the reply already shipped */ }
      }
    },
  })

  const readable = body.pipeThrough(transform)
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
