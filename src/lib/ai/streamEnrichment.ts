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

function buildInjectedBlock(places: PlaceLike[], accumulatedText: string): string {
  const usable = places.filter(p => p.name && ((p.photo_urls && p.photo_urls.length > 0) || p.photo_url || p.tiktok_url))
  if (usable.length === 0) return ''

  // Tool-provided names sometimes lack diacritics the AI adds back in when it writes its
  // own prose (e.g. tool: "Long Bien", AI's text: "Long Biên") — normalize BOTH the text
  // and every name lookup the same way throughout, or position-finding silently fails.
  const decodedText = decodeSafe(accumulatedText)
  const ctaIdx = decodedText.indexOf('[CTA_BUTTONS]')
  // CTA_BUTTONS is a general block, not scoped to any one place — links inside it must
  // never count as "already covered" for a specific place's own dedup window.
  const dedupText = normalizeVN((ctaIdx === -1 ? decodedText : decodedText.slice(0, ctaIdx)).toLowerCase())
  const textEnd = dedupText.length
  const normName = (n: string) => normalizeVN(n.toLowerCase())

  const mentioned = usable.filter(p => dedupText.includes(normName(p.name as string)))
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const parts: string[] = []
  for (const p of chosen) {
    const name = p.name as string
    const ownName = normName(name)
    // Bound this place's window at wherever the NEXT chosen place's name first appears,
    // so its links can't be attributed to this one.
    let windowEnd = textEnd
    for (const other of chosen) {
      if (other === p) continue
      const otherIdx = dedupText.indexOf(normName(other.name as string))
      const ownIdx = dedupText.indexOf(ownName)
      if (otherIdx !== -1 && ownIdx !== -1 && otherIdx > ownIdx) windowEnd = Math.min(windowEnd, otherIdx)
    }

    const lines: string[] = [`**${name}**`]
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
    if (lines.length > 1) parts.push(lines.join('\n'))
  }
  if (parts.length === 0) return ''
  return '\n\n📸 _Hình ảnh & link review:_\n\n' + parts.join('\n\n')
}

// Deterministically appends image/TikTok-review/order-link markdown for places the search_places
// tool actually found — the LLM has proven unreliable at copying these fields into its own text
// even when explicitly instructed to (verified against real production responses). This never
// delays or rewrites the model's own streamed text; it only adds one extra chunk at the very end.
export function applyPlaceEnrichmentStreamFilter(response: Response): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let lineRemainder = ''
  let accumulatedText = ''
  const toolNameByCallId = new Map<string, string>()
  let latestPlaces: PlaceLike[] = []
  let injected = false

  const injectIfNeeded = (controller: TransformStreamDefaultController) => {
    if (injected) return
    injected = true
    const block = buildInjectedBlock(latestPlaces, accumulatedText)
    if (block) controller.enqueue(encoder.encode('0:' + JSON.stringify(block) + '\n'))
  }

  const transform = new TransformStream<any, any>({
    transform(chunk, controller) {
      lineRemainder += decoder.decode(chunk, { stream: true })
      const lines = lineRemainder.split('\n')
      lineRemainder = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('0:')) {
          try { accumulatedText += JSON.parse(line.slice(2)) as string } catch { /* pass through regardless */ }
          controller.enqueue(encoder.encode(line + '\n'))
        } else if (line.startsWith('9:')) {
          try {
            const call = JSON.parse(line.slice(2)) as { toolCallId?: string; toolName?: string }
            if (call.toolCallId && call.toolName) toolNameByCallId.set(call.toolCallId, call.toolName)
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
              // Neither has a 'name'-shaped results[] — search_results is the primary
              // content instead, with 'title' standing in for the place name. Raw titles
              // are "Hotel Name - City - Booking.com"-style (from the Serper snippet); the
              // AI writes just "Hotel Name", so matching on the full title never hits —
              // take the part before the first " - " to match how it actually gets written.
              const searchResults = res.result?.search_results
              if (Array.isArray(searchResults) && searchResults.length > 0) {
                latestPlaces = searchResults.map(r => ({ ...r, name: r.title?.split(' - ')[0]?.trim() }))
              }
            }
          } catch { /* ignore */ }
          controller.enqueue(encoder.encode(line + '\n'))
        } else if (line.startsWith('d:')) {
          injectIfNeeded(controller)
          controller.enqueue(encoder.encode(line + '\n'))
        } else {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
    flush(controller) {
      injectIfNeeded(controller)
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
