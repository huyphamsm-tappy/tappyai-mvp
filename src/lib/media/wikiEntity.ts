// CONSULT_V3 layouts (owner 17/10, "biết elon ko": ChatGPT shows the subject's picture, a summary, and a panel to read more without leaving).
// The subject card's data: the Wikipedia REST summary of the answer's main subject. FREE (no Serper), one GET to a FIXED host — only the
// title is variable and it is URL-encoded into the path, so the request can never go anywhere else. Kept only when Wikipedia's page is a
// standard article whose title matches the subject (no disambiguation page, no different person), its picture is on upload.wikimedia.org,
// and its link is the article page (sanitizeMediaBlock checks again). Any failure / timeout / mismatch → null (no card; never a guess).
import { sanitizeMediaBlock, type MediaEntity } from './mediaHosts'

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const STOP = new Set(['biet', 'khong', 'ong', 'ba', 'anh', 'chi', 'em', 'cai', 'gi', 'la', 'ai', 'cho', 'toi', 'tui', 'minh', 'ban', 'nhe', 'nha', 'voi', 'the', 'nao', 've', 'hoi', 'giai', 'thich', 'ke', 'nghe', 'xem', 'co', 'duoc', 'what', 'who', 'the', 'about'])

/**
 * The answer's main subject: its first bold name that is not a point heading ("**Tesla:**") nor a sentence — and, when the user's message is
 * given, that the user actually asked about (a word of it, ≥ 3 letters, is in the name or the name's word starts with it: "hít le" → "Hitler").
 * Eval 17/10: "ông là ai" fetched the racing drivers "Tappy"; "biết elon musk không" fetched the unit "Tesla". No match → null (no card).
 */
export function mainSubjectOf(reply: string, userText?: string): string | null {
  const asked = userText ? fold(userText).split(' ').filter(w => w.length >= 3 && !STOP.has(w)) : null
  const mentions = (name: string) => !asked || fold(name).split(' ').some(nw => asked.some(uw => nw === uw || (uw.length >= 3 && nw.startsWith(uw))))
  for (const m of reply.matchAll(/\*\*([^*\n]{3,60})\*\*(\s*[:：])?/g)) {
    const name = m[1].trim()
    if (m[2] || /[:?!.,]$/.test(name) || name.split(/\s+/).length > 6 || /\d{3,}/.test(name)) continue
    if (!/^\p{Lu}/u.test(name)) continue
    if (!mentions(name)) continue
    return name
  }
  return null
}

/** Wikipedia's title matches the subject: same words, or one contains the other with at least two words in common. */
export function sameSubject(title: string, subject: string): boolean {
  const a = fold(title), b = fold(subject)
  if (!a || !b) return false
  if (a === b) return true
  const wa = new Set(a.split(' ')), wb = b.split(' ')
  const common = wb.filter(w => wa.has(w)).length
  return (a.includes(b) || b.includes(a)) && common >= Math.min(2, wb.length)
}

export async function fetchWikiEntity(subject: string, lang: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = 1500): Promise<MediaEntity | null> {
  const title = subject.trim().replace(/\s+/g, '_')
  if (!title || title.length > 80) return null
  for (const wiki of lang === 'en' ? ['en'] : ['vi', 'en']) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, { headers: { accept: 'application/json', 'user-agent': 'TappyAI/1.0 (https://www.tappyai.com)' }, signal: ctrl.signal })
      if (!res.ok) continue
      const j = (await res.json()) as Record<string, any>
      if (j?.type !== 'standard' || typeof j.title !== 'string' || !sameSubject(j.title, subject)) continue
      const block = sanitizeMediaBlock({ v: 1, kind: 'entity', entity: { name: j.title, summary: j.extract, image: j.thumbnail?.source ?? j.originalimage?.source, href: j.content_urls?.desktop?.page, source: 'Wikipedia' } })
      if (block && block.kind === 'entity') return block.entity
    } catch { /* timeout / network / bad JSON: try the next wiki, then give up */ } finally { clearTimeout(timer) }
  }
  return null
}

/**
 * The title of the SAME article in the other Wikipedia (its interlanguage link): vi "Tesla" → en "Tesla (unit)", en "Tesla, Inc." → vi
 * "Tesla, Inc.". One GET to a fixed host (`from` is one of two literals; only the title varies, URL-encoded). Any failure → null.
 */
export async function wikiLanglink(title: string, from: 'vi' | 'en', to: 'vi' | 'en', fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = 1500): Promise<string | null> {
  const t = title.trim()
  if (!t || t.length > 100 || from === to) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`https://${from}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=langlinks&redirects=1&lllang=${to}&titles=${encodeURIComponent(t)}`, { headers: { accept: 'application/json', 'user-agent': 'TappyAI/1.0 (https://www.tappyai.com)' }, signal: ctrl.signal })
    if (!res.ok) return null
    const j = (await res.json()) as { query?: { pages?: Array<{ langlinks?: Array<{ lang?: string; title?: string }> }> } }
    const link = j?.query?.pages?.[0]?.langlinks?.find(l => l?.lang === to)?.title
    return typeof link === 'string' && link.trim() ? link.trim().slice(0, 100) : null
  } catch { return null } finally { clearTimeout(timer) }
}
