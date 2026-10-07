// The text that leaves the app on EVERY share channel (Zalo, Facebook, WhatsApp, Telegram,
// Viber, LINE, Email, Inbox, "Copy content").
//
// Owner decision 2026-10-02: ONE title line + ONE summary line + ONE short Tappy link. Never the
// full answer, never a raw affiliate/tracking link (`/go/at?u=https%3A%2F%2Fgo.isclix.com…`):
// those live only on the public result page's buttons. The link is the `/r/<slug>` page, whose
// Open Graph tags draw the preview card (image, title, description) in the receiving app.

export const SHARE_TITLE_MAX = 90
export const SHARE_SUMMARY_MAX = 160

const URL_RE = /(?:https?:\/\/|www\.)\S+/gi

/** One flat line: no markdown, no URLs, no line breaks. */
export function flatLine(input: string): string {
  return (input ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(URL_RE, ' ')
    .replace(/[#*_>`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cut at a word boundary, add an ellipsis only when something was cut. */
export function clip(line: string, max: number): string {
  if (line.length <= max) return line
  const cut = line.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`
}

/**
 * A summary line that never ends in a cut-off "…": text that fits is kept whole; text that does not
 * (or that already arrives ellipsised from a server excerpt) is cut back to the last sentence end,
 * else the last clause break, else the last word, and loses its trailing punctuation fragment.
 */
export function tidySummary(input: string, max = SHARE_SUMMARY_MAX): string {
  const flat = flatLine(input)
  const hadEllipsis = /(…|\.\.\.)$/.test(flat)
  const text = flat.replace(/(…|\.\.\.)$/, '').trimEnd()
  if (!hadEllipsis && text.length <= max) return text
  const window = text.slice(0, max)
  const floor = Math.floor(max * 0.35)
  let cut = -1
  const sentence = /[.!?](?=\s|$)/g
  for (let m = sentence.exec(window); m; m = sentence.exec(window)) if (m.index + 1 >= floor) cut = m.index + 1
  // A text that was cut by the server may stop exactly at a sentence end: keep it whole.
  if (cut < 0 && hadEllipsis && text.length <= max && /[.!?]$/.test(text)) cut = text.length
  if (cut < 0) {
    const clause = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(' — '), window.lastIndexOf(' - '))
    cut = clause >= floor ? clause : window.lastIndexOf(' ')
    if (text.length <= max && !hadEllipsis) cut = text.length
  }
  if (cut <= 0) cut = window.length
  return window.slice(0, cut).replace(/[\s,;:—–-]+$/, '').trim()
}

export interface ShareMessageInput {
  title: string
  summary?: string
  /** The short Tappy link: `/r/<slug>`, a plan page, or the brand root when nothing was published. */
  url: string
}

/** `title\nsummary\nurl` — three lines at most, the link always last and never cut. */
export function buildShareMessage({ title, summary, url }: ShareMessageInput): string {
  const t = clip(flatLine(title), SHARE_TITLE_MAX)
  let s = tidySummary(summary ?? '')
  if (s && s.toLowerCase() === t.toLowerCase()) s = ''
  return [t, s, url.trim()].filter(Boolean).join('\n')
}

/** First sentence(s) of prose, up to the summary cap. */
export function summaryFromProse(text: string): string {
  return clip(flatLine(text), SHARE_SUMMARY_MAX)
}

/** Names of the first few places: "A, B, C và 2 nơi khác" is the summary of a recommendation. */
export function summaryFromPlaces(names: readonly string[], lang: 'vi' | 'en'): string {
  const shown = names.map(flatLine).filter(Boolean).slice(0, 3)
  const more = names.length - shown.length
  const tail = more > 0 ? (lang === 'vi' ? ` và ${more} nơi khác` : ` and ${more} more`) : ''
  return clip(shown.join(', ') + tail, SHARE_SUMMARY_MAX)
}
