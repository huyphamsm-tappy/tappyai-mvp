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
  tiktok_url?: string
  order_links?: PlatformLink[]
  platform_links?: PlatformLink[]
}

function buildInjectedBlock(places: PlaceLike[], accumulatedText: string): string {
  const usable = places.filter(p => p.name && (p.photo_url || p.tiktok_url))
  if (usable.length === 0) return ''

  const normText = normalizeVN(accumulatedText.toLowerCase())
  const mentioned = usable.filter(p => normText.includes(normalizeVN((p.name as string).toLowerCase())))
  const chosen = (mentioned.length > 0 ? mentioned : usable).slice(0, 3)

  const parts: string[] = []
  for (const p of chosen) {
    const lines: string[] = [`**${p.name}**`]
    // Skip a field if the AI already wrote that exact URL itself — avoids duplicate images/links
    // for the (rarer) case where the model did follow the prompt instruction correctly.
    if (p.photo_url && !accumulatedText.includes(p.photo_url)) lines.push(`![Ảnh địa điểm](${p.photo_url})`)
    if (p.tiktok_url && !accumulatedText.includes(p.tiktok_url)) lines.push(`🎵 [Xem review TikTok](${p.tiktok_url})`)
    const links = p.order_links || p.platform_links
    if (links && links.length > 0) {
      const linkLine = links.map(l => `[${l.name}](${l.url})`).join(' · ')
      if (!accumulatedText.includes(links[0].url)) lines.push(linkLine)
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
            const res = JSON.parse(line.slice(2)) as { toolCallId?: string; result?: { results?: PlaceLike[] } }
            const toolName = res.toolCallId ? toolNameByCallId.get(res.toolCallId) : undefined
            const results = res.result?.results
            if (toolName === 'search_places' && Array.isArray(results) && results.length > 0) {
              latestPlaces = results
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
