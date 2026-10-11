// ── CONSULTATIVE_IN_AGENT — a page that could not be read still deserves its source button ─────────────────────────────────────────
//
// The agent searches the web and opens the best results. When every page it tried was blocked / empty / too slow, the honest answer is
// "I could not verify this" — but the user is left with nothing to tap. The search RESULT itself (url + host + title) was returned by the
// search tool this turn, so it is a link the system may show: this module picks up to two of them, ONLY when the reply itself says it could
// not verify, and hands them to the existing citation step (which renders "Nguồn: host · host" from the URL the tool returned — never from
// the model). Nothing is fetched here and no URL is invented; a reply that does not admit non-verification gets no source line from this path.

import { classifySource, hostOf, sourceClassOf } from './sourceType'
import { actionTypeFor, type SourceLink } from './evidence'

const DISCLOSES = /(?<!\p{L})(?:chưa|không)\s+(?:\S+\s+){0,3}?(?:xác minh|xác nhận|kiểm chứng|đọc được|mở được|kiểm tra được)|(?:could not|couldn't|cannot|can't|unable to)\s+(?:\S+\s+){0,2}?(?:verify|confirm|read|open)/iu

interface Row { link?: unknown; title?: unknown }

/** Up to `max` source links from this turn's web_search results, for a reply that admits it could not verify. [] otherwise. */
export function unreadableSourceLinks(results: readonly unknown[], reply: string, max = 2, force = false): SourceLink[] {
  // `force`: the links are returned whatever the model wrote — they are only HELD (collector.unverifiedSources) and shown by the settle step when
  // a guard cut every figure and the one "chưa xác minh" sentence was added there (streamEnrichment.ts, unverifiedFigure.ts).
  if (!force && (!DISCLOSES.test(reply) || /\[S\d/.test(reply))) return []
  const out: SourceLink[] = []
  const seenHosts = new Set<string>()
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const rows = (r as { results?: unknown }).results
    if (!Array.isArray(rows)) continue
    const failed = new Set(((r as { pages?: unknown }).pages as Array<{ url?: unknown; error?: unknown }> | undefined ?? []).filter(p => p?.error === 'page_unreadable' && typeof p.url === 'string').map(p => String(p.url)))
    // Pages that were tried and failed first (those are the sources the answer wanted), then the best-ranked results.
    const ordered = [...(rows as Row[]).filter(x => typeof x?.link === 'string' && failed.has(x.link as string)), ...(rows as Row[]).filter(x => typeof x?.link === 'string' && !failed.has(x.link as string))]
    for (const row of ordered) {
      const url = String(row.link)
      if (!/^https:\/\//i.test(url)) continue
      const host = hostOf(url)
      if (!host || seenHosts.has(host)) continue
      seenHosts.add(host)
      const cls = sourceClassOf(classifySource(url), url)
      out.push({ id: `S${out.length + 1}`, url, label: host, title: typeof row.title === 'string' ? row.title.slice(0, 120) : host, source_type: cls, action_type: actionTypeFor(cls), host })
      if (out.length >= max) return out
    }
  }
  return out
}
