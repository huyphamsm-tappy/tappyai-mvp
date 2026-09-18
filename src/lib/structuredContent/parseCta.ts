// ── The [CTA_BUTTONS] reader ─────────────────────────────────────────────────
//
// 🔑 MOVED HERE FROM `ChatInterface.tsx`, UNCHANGED, for the same reason `parsePlan`
// was: the G1 shared-result sanitizer builds a PUBLIC payload from a persisted assistant
// message on the SERVER, and it needs the same buttons the chat renders. Importing
// `ChatInterface` there would drag a 'use client' module (posthog, streaming hooks) into a
// route handler; a second copy of the parser would drift. So there is still exactly ONE
// parser. `ChatInterface` re-exports it, which is why existing imports keep working.
//
// 🚨 THIS FILE DOES NOT OWN THE WIRE FORMAT. `{label, type, url, primary}` is emitted by the
// server (`src/lib/recommendation/cta.ts`) and read by Android and iOS too. Read the shape;
// never redefine it.

export interface CTAButton {
  label: string
  type: 'maps' | 'call' | 'zalo' | 'website' | 'booking' | 'search' | 'internal_booking'
  url: string
  primary: boolean
}

const CTA_MARKER = '[CTA_BUTTONS]'

/**
 * Locates the `{…}` payload that follows `marker`, by matching braces.
 *
 * Brace matching rather than a regex because the block's POSITION is not fixed. The bare form
 * used to be anchored to end-of-content (`\[CTA_BUTTONS\](\{[\s\S]*\})\s*$`), which is how the
 * raw block reached users: the model emits `[FOLLOWUPS]` after the CTA block, and followups are
 * parsed after this step, so something still trailed the block, the anchor failed, and nothing
 * was stripped — leaving the JSON orphaned in the visible text once the followups line went.
 *
 * The obvious loosening (dropping the `$`) is worse, not better: `\{[\s\S]*\}` runs greedily to
 * the LAST brace in the message and swallows trailing prose. Braces inside JSON strings are
 * skipped, and `\"` is honoured, so a `}` in a label or URL cannot end the scan early.
 */
export function findMarkerJson(content: string, marker: string): { start: number; end: number; json: string } | null {
  const start = content.toLowerCase().indexOf(marker.toLowerCase())
  if (start < 0) return null

  let open = start + marker.length
  while (open < content.length && /\s/.test(content[open])) open++
  if (content[open] !== '{') return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = open; i < content.length; i++) {
    const c = content[i]
    if (escaped) { escaped = false; continue }
    if (inString) {
      if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return { start, end: i + 1, json: content.slice(open, i + 1) }
  }
  return null // payload still arriving — braces do not balance yet
}

export function parseCTA(content: string): { text: string; buttons: CTAButton[] } {
  const withTag = /\[CTA_BUTTONS\]([\s\S]*?)\[\/CTA_BUTTONS\]/i

  let text = content
  let payload: string | null = null

  const tagged = text.match(withTag)
  if (tagged) {
    payload = tagged[1]
    text = text.replace(withTag, '')
  } else {
    const span = findMarkerJson(text, CTA_MARKER)
    if (span) {
      payload = span.json
      text = text.slice(0, span.start) + text.slice(span.end)
    }
  }

  // Any further block is stripped without rendering: only the first has ever produced buttons,
  // and a leftover second block would otherwise show as raw JSON.
  for (let span = findMarkerJson(text, CTA_MARKER); span; span = findMarkerJson(text, CTA_MARKER)) {
    text = text.slice(0, span.start) + text.slice(span.end)
  }
  // A marker whose payload has not finished arriving; then orphan tags; then the marker itself
  // still being typed out character by character (`…[CTA_BU`), so none of it flickers mid-stream.
  text = text
    .replace(/\[CTA_BUTTONS\][\s\S]*$/i, '')
    .replace(/\[\/?CTA_BUTTONS\]/gi, '')
    .replace(/\[C(?:T(?:A(?:_(?:B(?:U(?:T(?:T(?:O(?:N(?:S)?)?)?)?)?)?)?)?)?)?$/i, '')

  if (text === content) return { text: content, buttons: [] }
  text = text.trimEnd()
  if (payload === null) return { text, buttons: [] }

  try {
    const parsed = JSON.parse(payload.trim())
    const buttons: CTAButton[] = Array.isArray(parsed.buttons) ? parsed.buttons : []
    return { text, buttons }
  } catch {
    return { text, buttons: [] }
  }
}
