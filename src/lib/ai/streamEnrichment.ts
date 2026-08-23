import { normalizeVN } from './intent'
import { findPlaceOffset, proseHeaders, type Header } from './placeMatch'
import type { EnrichmentCollector } from './toolResultSplit'
import { guardMoneyClaimsInText, type EvidenceRecord } from './moneyGuard'
import { isValidTikTokContentUrl } from '@/lib/links/tiktokReview'
import { guardSpecClaimsInText, type SpecEvidence } from './consultative/specGuard'
import { sanitizeUrlForMarkdown, escapeMarkdownLabel } from './tools/common'

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
  /** Backend-validated TikTok review/video URL, or absent when the provider found none. */
  tiktok_review_url?: string
}
// get_hotel_prices / search_products' primary content — 'title' stands in for 'name'.
type SearchResultLike = { title?: string; photo_url?: string; photo_urls?: string[] }

/**
 * Fetches photos for exactly the places handed to it, keyed by place name (B7-A).
 * Supplied by the route so this module stays free of tool/vendor imports and the
 * pre-B7-A tests keep running with no network at all.
 */
export type PhotoResolver = (places: PlaceLike[]) => Promise<Map<string, string[]>>

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
  const missingPhotos = photos.filter(url => !imageUrlPresent(url, decodedText))
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
  const offs: number[] = []
  for (const p of places) {
    if (!p.name) continue
    const i = findPlaceOffset(p.name, dedupText, headers)
    if (i !== -1) offs.push(i)
  }
  return offs
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
export function selectPlacesNeedingEnrichment(places: PlaceLike[], fullText: string): PlaceLike[] {
  const named = places.filter(p => p.name)
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
  if (normRaw.length !== text.length) return named.slice(0, 3)
  const dedupText = normRaw.slice(0, earliestMarker(text))
  const headers = proseHeaders(dedupText)
  const mentioned = named.filter(p => findPlaceOffset(p.name as string, dedupText, headers) !== -1)
  return (mentioned.length > 0 ? mentioned : named).slice(0, 3)
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

export function injectPlaceEnrichment(places: PlaceLike[], fullText: string, lang = 'vi'): string {
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

  const mentioned = usable.filter(p => findPlaceOffset(p.name as string, dedupText, headers) !== -1)
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const insertions: { offset: number; text: string }[] = []
  for (const p of chosen) {
    const ownIdx = findPlaceOffset(p.name as string, dedupText, headers)
    if (ownIdx === -1) continue
    const windowEnd = boundaryAfter(ownIdx, mentionOffsets, textEnd)
    const { lines } = placeContentLines(p, decodedText, dedupText, windowEnd)
    if (lines.length === 0) continue
    // Insert at this place's block boundary. When the boundary is the NEXT place, snap back
    // to the start of that place's header line so we never split its markdown header; when
    // it's the CTA marker / end of text, insert exactly there (after this place's last line).
    let offset = windowEnd
    if (windowEnd < textEnd) {
      const lineStart = text.lastIndexOf('\n', windowEnd - 1) + 1
      if (lineStart > ownIdx) offset = lineStart
    }
    insertions.push({ offset, text: lines.join('\n') })
  }
  // Stripped the LLM's copies but couldn't place them positionally (names not found, etc.) —
  // re-add them as the trailing block so nothing is lost.
  if (insertions.length === 0) return appendTrailingBlock(usable, places, text, decodedText, lang)

  // Apply from the last boundary backwards so earlier offsets stay valid as we splice.
  insertions.sort((a, b) => b.offset - a.offset)
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
  const mentioned = usable.filter(p => findPlaceOffset(p.name as string, dedupText, headers) !== -1)
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const parts: string[] = []
  for (const p of chosen) {
    const ownIdx = findPlaceOffset(p.name as string, dedupText, headers)
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
   * Read from `shopping_results` — the /shopping array whose fields are the
   * provider's own — never from the organic `search_results`, which carry no
   * structured attributes at all.
   */
  const specRecords: SpecEvidence[] = []

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
      if (!existing) latestPlaces.push(p)
      else if (!hasPhoto(existing) && hasPhoto(p)) Object.assign(existing, p)
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
      if (!existing) { merged.push(p); seen.add(key) }
      else if (!hasPhoto(existing) && hasPhoto(p)) Object.assign(existing, p)
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

    const enriched = injectPlaceEnrichment(places, mainText, lang)
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
    // Last point before the bytes leave the server: drop any provider tool-use
    // tags that leaked into the prose, so no client has to defend against them
    // (and so the end-anchored CTA fallback still matches).
    //
    // 🔑 BOTH guards run, in this order, and the order is the decision. The spec guard rewrites
    // prose and must therefore see prose; the scaffolding strip removes non-prose tags and must
    // be last, because anything that runs after it could reintroduce a tag. Taking either side of
    // this conflict alone would have silently dropped one of the two.
    const scaffoldStripped = stripModelScaffolding(specGuarded)
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
    const batchTikTok = collector?.batchTikTokUrl
    const finalText = (scaffoldStripped && batchTikTok && isValidTikTokContentUrl(batchTikTok))
      ? `${scaffoldStripped}\n\n🎵 [${escapeMarkdownLabel(relatedVideoLabel(lang))}](${sanitizeUrlForMarkdown(batchTikTok)})`
      : scaffoldStripped
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
    ungroundedNames = ungroundedNamesIn(finalText, places, productRecords, seed?.heldCandidates ?? [])
    if (finalText) controller.enqueue(encoder.encode('0:' + JSON.stringify(finalText) + '\n'))
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
            // buffered — re-emitted (repositioned) at 'd:'; not streamed live
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
            if (call.toolName && PLACE_TOOLS.has(call.toolName)) bufferMode = true
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
              }
            }
            const toolName = res.toolCallId ? toolNameByCallId.get(res.toolCallId) : undefined
            let newPlaces: PlaceLike[] = []
            if (toolName === 'search_places') {
              const results = res.result?.results
              if (Array.isArray(results)) newPlaces = results
            }
            if (toolName === 'search_products') {
              const structured = res.result?.shopping_results
              if (Array.isArray(structured)) {
                for (const r of structured) {
                  if (r?.title) specRecords.push({ name: r.title, weightKg: r.weightKg, batteryHours: r.batteryHours })
                }
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
