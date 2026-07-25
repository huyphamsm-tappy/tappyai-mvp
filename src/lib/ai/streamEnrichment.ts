import { normalizeVN } from './intent'

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
  tiktok_url?: string
  order_links?: PlatformLink[]
  platform_links?: PlatformLink[]
}
// get_hotel_prices / search_products' primary content — 'title' stands in for 'name'.
type SearchResultLike = { title?: string; photo_url?: string; photo_urls?: string[] }

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

// ── System-owned enrichment placement ────────────────────────────────────────
// Architecture: the LLM writes PROSE ONLY; the app OWNS where each place's images,
// TikTok review link, and order/platform links appear. If the model also emits any
// of that markdown (old habit / partial disobedience), we STRIP its copies here and
// re-inject them positionally, so placement never depends on the model obeying.
// We ONLY strip markdown whose URL matches THIS batch's tool data (an owned image
// URL, tiktok.com host, or an owned order/platform domain) — product-marketplace
// links, [TAPPY_PLAN]/[CTA_BUTTONS]/[FOLLOWUPS] blocks, and prose are never touched.
type Owned = { imageCores: Set<string>; linkDomains: Set<string>; hasTiktok: boolean }

function buildOwned(places: PlaceLike[]): Owned {
  const imageCores = new Set<string>()
  const linkDomains = new Set<string>()
  let hasTiktok = false
  for (const p of places) {
    const photos = p.photo_urls && p.photo_urls.length > 0 ? p.photo_urls : (p.photo_url ? [p.photo_url] : [])
    for (const u of photos) imageCores.add(coreImageUrl(decodeSafe(u)))
    for (const l of (p.order_links || [])) { const d = domainOf(l.url); if (d) linkDomains.add(d) }
    for (const l of (p.platform_links || [])) { const d = domainOf(l.url); if (d) linkDomains.add(d) }
    if (p.tiktok_url) hasTiktok = true
  }
  return { imageCores, linkDomains, hasTiktok }
}

function isOwnedImageUrl(url: string, owned: Owned): boolean {
  const decoded = decodeSafe(url)
  return owned.imageCores.has(decoded) || owned.imageCores.has(coreImageUrl(decoded))
}

const IMG_TOKEN = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g
const LINK_TOKEN = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g

// True only for a WHOLE line that is nothing but system-owned enrichment, so removing
// it can never disturb prose: a run of owned image tokens; a "🎵 [..](tiktok..)"
// review line; or a run of owned order/platform link tokens joined by "·".
function isOwnedEnrichmentLine(line: string, owned: Owned): boolean {
  const t = line.trim()
  if (t === '') return false

  const imgs = [...t.matchAll(IMG_TOKEN)]
  if (imgs.length > 0) {
    const rest = t.replace(IMG_TOKEN, '').trim()
    if (rest === '' && imgs.every(m => isOwnedImageUrl(m[1], owned))) return true
  }

  const tiktok = t.match(/^🎵\s*\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/)
  if (tiktok && domainOf(tiktok[1]) === 'tiktok.com') return true

  const links = [...t.matchAll(LINK_TOKEN)]
  if (links.length > 0) {
    const rest = t.replace(LINK_TOKEN, '').replace(/·/g, '').trim()
    if (rest === '' && links.every(m => owned.linkDomains.has(domainOf(m[1])))) return true
  }
  return false
}

// Remove the LLM's own copies of owned enrichment (line-wise) so injection re-places
// them; collapse the blank runs the removals leave behind.
function stripOwnedEnrichment(places: PlaceLike[], text: string): string {
  const owned = buildOwned(places)
  if (owned.imageCores.size === 0 && owned.linkDomains.size === 0 && !owned.hasTiktok) return text
  const kept = text.split('\n').filter(line => !isOwnedEnrichmentLine(line, owned))
  return kept.join('\n').replace(/\n{3,}/g, '\n\n')
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
  const photos = (p.photo_urls && p.photo_urls.length > 0 ? p.photo_urls : (p.photo_url ? [p.photo_url] : []))
  const missingPhotos = photos.filter(url => !imageUrlPresent(url, decodedText))
  for (const url of missingPhotos) lines.push(`![Ảnh địa điểm](${url})`)
  if (p.tiktok_url && !hasDomainNearName(ownName, 'tiktok.com', dedupText, windowEnd)) {
    lines.push(`🎵 [Xem review TikTok](${p.tiktok_url})`)
  }
  const links = p.order_links || p.platform_links
  if (links && links.length > 0) {
    const missing = links.filter(l => !hasDomainNearName(ownName, domainOf(l.url), dedupText, windowEnd))
    if (missing.length > 0) lines.push(missing.map(l => `[${l.name}](${l.url})`).join(' · '))
  }
  return { lines, missingPhotoCount: missingPhotos.length }
}

// Offsets of EVERY place the reply mentions — including photo-less ones. These are
// the block boundaries for injection. (Root-cause fix: bounding a place's window by
// only the *enriched* places let a first place's gallery run past its photo-less
// neighbours all the way to the end of the message.) Index-aligned to the raw text.
function placeMentionOffsets(places: PlaceLike[], dedupText: string): number[] {
  const offs: number[] = []
  for (const p of places) {
    if (!p.name) continue
    const i = dedupText.indexOf(normName(p.name))
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
export function injectPlaceEnrichment(places: PlaceLike[], fullText: string): string {
  const usable = places.filter(p => p.name && ((p.photo_urls && p.photo_urls.length > 0) || p.photo_url || p.tiktok_url))
  if (usable.length === 0) return fullText

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
  if (normRaw.length !== text.length) return appendTrailingBlock(usable, places, text, decodedText)

  const textEnd = earliestMarker(text)
  // CTA_BUTTONS is a general block, not scoped to any one place — links inside it must never
  // count as "already covered" for a specific place's own dedup window.
  const dedupText = normRaw.slice(0, textEnd)
  const mentionOffsets = placeMentionOffsets(places, dedupText)

  const mentioned = usable.filter(p => dedupText.includes(normName(p.name as string)))
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const insertions: { offset: number; text: string }[] = []
  for (const p of chosen) {
    const ownIdx = dedupText.indexOf(normName(p.name as string))
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
  if (insertions.length === 0) return appendTrailingBlock(usable, places, text, decodedText)

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
function appendTrailingBlock(usable: PlaceLike[], places: PlaceLike[], fullText: string, decodedText: string): string {
  const ctaIdx = decodedText.indexOf('[CTA_BUTTONS]')
  const dedupText = normalizeVN((ctaIdx === -1 ? decodedText : decodedText.slice(0, ctaIdx)).toLowerCase())
  const textEnd = dedupText.length
  const mentionOffsets = placeMentionOffsets(places, dedupText)
  const mentioned = usable.filter(p => dedupText.includes(normName(p.name as string)))
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const parts: string[] = []
  for (const p of chosen) {
    const ownIdx = dedupText.indexOf(normName(p.name as string))
    const windowEnd = boundaryAfter(ownIdx === -1 ? 0 : ownIdx, mentionOffsets, textEnd)
    const { lines, missingPhotoCount } = placeContentLines(p, decodedText, dedupText, windowEnd)
    if (missingPhotoCount > 0) parts.push([`**${p.name}**`, ...lines].join('\n'))
  }
  if (parts.length === 0) return fullText
  return fullText + '\n\n📸 _Hình ảnh & link review:_\n\n' + parts.join('\n\n')
}

// Deterministically re-groups image/TikTok-review/order-link markdown next to the place it
// belongs to. Text streamed BEFORE the first place-search tool call (intro line, plain
// chitchat) passes through live so its typewriter reveal is preserved; only the place-list
// text that follows is buffered and re-emitted (repositioned) once the full text is known.
export function applyPlaceEnrichmentStreamFilter(response: Response): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let lineRemainder = ''
  let mainText = '' // assistant text buffered AFTER a place-search tool call
  const toolNameByCallId = new Map<string, string>()
  let latestPlaces: PlaceLike[] = []
  let bufferMode = false
  let emitted = false

  const PLACE_TOOLS = new Set(['search_places', 'get_hotel_prices', 'search_products'])

  const emitReconstructed = (controller: TransformStreamDefaultController) => {
    if (emitted) return
    emitted = true
    if (!bufferMode) return // nothing buffered — everything already streamed live
    const finalText = injectPlaceEnrichment(latestPlaces, mainText)
    if (finalText) controller.enqueue(encoder.encode('0:' + JSON.stringify(finalText) + '\n'))
  }

  const transform = new TransformStream<any, any>({
    transform(chunk, controller) {
      lineRemainder += decoder.decode(chunk, { stream: true })
      const lines = lineRemainder.split('\n')
      lineRemainder = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('0:')) {
          if (bufferMode) {
            try { mainText += JSON.parse(line.slice(2)) as string } catch { /* skip malformed */ }
            // buffered — re-emitted (repositioned) at 'd:'; not streamed live
          } else {
            controller.enqueue(encoder.encode(line + '\n')) // intro / chitchat — stream live
          }
        } else if (line.startsWith('9:')) {
          try {
            const call = JSON.parse(line.slice(2)) as { toolCallId?: string; toolName?: string }
            if (call.toolCallId && call.toolName) toolNameByCallId.set(call.toolCallId, call.toolName)
            if (call.toolName && PLACE_TOOLS.has(call.toolName)) bufferMode = true
          } catch { /* ignore */ }
          controller.enqueue(encoder.encode(line + '\n'))
        } else if (line.startsWith('a:')) {
          try {
            const res = JSON.parse(line.slice(2)) as {
              toolCallId?: string
              result?: { results?: PlaceLike[]; search_results?: SearchResultLike[] }
            }
            const toolName = res.toolCallId ? toolNameByCallId.get(res.toolCallId) : undefined
            if (toolName === 'search_places') {
              const results = res.result?.results
              if (Array.isArray(results) && results.length > 0) latestPlaces = results
            } else if (toolName === 'get_hotel_prices' || toolName === 'search_products') {
              // Neither has a 'name'-shaped results[] — search_results is the primary content
              // instead, with 'title' standing in for the place name. Raw titles are "Hotel
              // Name - City - Booking.com"-style; the AI writes just "Hotel Name", so take the
              // part before the first " - " to match how it actually gets written.
              const searchResults = res.result?.search_results
              if (Array.isArray(searchResults) && searchResults.length > 0) {
                latestPlaces = searchResults.map(r => ({ ...r, name: r.title?.split(' - ')[0]?.trim() }))
              }
            }
          } catch { /* ignore */ }
          controller.enqueue(encoder.encode(line + '\n'))
        } else if (line.startsWith('d:')) {
          emitReconstructed(controller)
          controller.enqueue(encoder.encode(line + '\n'))
        } else {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
    flush(controller) {
      emitReconstructed(controller)
      if (lineRemainder) controller.enqueue(encoder.encode(lineRemainder + '\n'))
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
