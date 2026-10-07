import type { ReactNode } from 'react'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

// ── SAFE LINKIFICATION FOR MESSAGE BODIES ────────────────────────────────────
//
// 🚨 WHY THIS EXISTS. `ThreadView` rendered `message.body` as inert text. A
// brochure shared into the Tappy Inbox carries Maps, website and TikTok links —
// all of them unclickable, which makes the share materially worse than a plain
// email. This turns https URLs into anchors and nothing else.
//
// 🔑 ONLY `https://`, AND ONLY WHEN THE EXISTING GUARD AGREES. Every candidate
// goes through `isSafeHttpsUrl` — the same helper the AI enrichment path uses —
// so `javascript:`, `data:`, `http:`, private hosts and malformed URLs stay as
// text. No new URL rule is written here; a second rule is how two guards drift.
//
// Trailing punctuation that is almost never part of a URL (`.`, `,`, `)`, `!`)
// is left outside the anchor, so "xem tại https://a.b/c." links to `/c`.

/** Matches an https URL up to whitespace. Trailing punctuation is trimmed below. */
const URL_RE = /https:\/\/[^\s<>"']+/g

function splitTrailingPunct(raw: string): [string, string] {
  const m = raw.match(/[.,;:!?)\]]+$/)
  if (!m) return [raw, '']
  return [raw.slice(0, -m[0].length), m[0]]
}

/**
 * Body text → React nodes with safe anchors. Pure; safe to call in render.
 * Returns the input string untouched when it contains no linkable URL.
 */
export function linkifySafe(body: string): ReactNode[] | string {
  if (!body || !body.includes('https://')) return body
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of body.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const [url, tail] = splitTrailingPunct(m[0])
    if (!isSafeHttpsUrl(url)) continue
    if (start > last) out.push(body.slice(last, start))
    out.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline underline-offset-2 break-all"
        style={{ color: 'var(--v3-accent)' }}
      >
        {url}
      </a>,
    )
    if (tail) out.push(tail)
    last = start + m[0].length
  }
  if (out.length === 0) return body
  if (last < body.length) out.push(body.slice(last))
  return out
}
