// CONSULT_V3 layouts (owner 17/10: "trình bày và layout như ChatGPT"): the ONLY image hosts a [TAPPY_MEDIA] block may show, and the only
// page links it may carry. Shared by the server (which builds the block from tool / Wikipedia data) and the client (which re-checks every
// URL before rendering, so a stored or forged block can never point the browser anywhere else). Pure, no I/O.
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

/** News CDNs of the three RSS feeds get_news reads, and Wikimedia's file hosts (the REST summary's thumbnails are on thumb.wikimedia.org,
 *  measured 17/10; originals on upload.wikimedia.org). */
const IMAGE_HOSTS = [/(^|\.)vnecdn\.net$/, /(^|\.)tuoitre\.vn$/, /(^|\.)tuoitre\.com\.vn$/, /(^|\.)dantri\.com\.vn$/, /(^|\.)dtrinews\.vn$/, /^upload\.wikimedia\.org$/, /^thumb\.wikimedia\.org$/]
/** Article pages of those outlets (a news item's own link), and Wikipedia article pages. */
const PAGE_HOSTS = [/(^|\.)vnexpress\.net$/, /(^|\.)tuoitre\.vn$/, /(^|\.)dantri\.com\.vn$/, /^(vi|en)\.wikipedia\.org$/]

const hostOf = (u: string): string | null => { try { return new URL(u).hostname.toLowerCase() } catch { return null } }

export function isAllowedMediaImage(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 1024 || !isSafeHttpsUrl(url)) return false
  const h = hostOf(url)
  return !!h && IMAGE_HOSTS.some(re => re.test(h))
}

export function isAllowedMediaPage(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 1024 || !isSafeHttpsUrl(url)) return false
  const h = hostOf(url)
  if (!h || !PAGE_HOSTS.some(re => re.test(h))) return false
  // a Wikipedia link is an article page only
  return !/wikipedia\.org$/.test(h) || /^https:\/\/(vi|en)\.wikipedia\.org\/wiki\/[^?#\s]+$/.test(url)
}

/** One picture of a news layout: the article's own image, its own link, the outlet's name. */
export interface MediaNewsItem { src: string; href: string; label: string; title: string }
/** The subject card of a knowledge answer: a Wikipedia summary. */
export interface MediaEntity { name: string; summary: string; image?: string; href: string; source: 'Wikipedia' }
/**
 * CONSULT_ONE_BRAIN (owner 31/10, ChatGPT's option cards): one option of a recommendation that has no place or product card of its own (a tour,
 * a service, a plan, a course, a tool). Text only, written by the model through present_options; its link is one this turn's tools returned
 * (checked by the server before the block is emitted, re-checked here as safe https). No image: there is no owned picture for such an item.
 */
export interface MediaOption {
  name: string
  /** A short tag: who or what it suits best ("Phù hợp nhất về thời lượng"). */
  badge?: string
  /** The one figure to compare by (a price, a duration), shown large. */
  figure?: string
  /** What the figure is and how old it is ("giá niêm yết/người, cập nhật 10/2026"). */
  figureNote?: string
  verdict?: string
  highlights: string[]
  /** Costs or conditions on top of the figure. */
  extras?: string[]
  caveat?: string
  href?: string
  linkLabel?: string
}
/** TAPPY_ANSWER_V4: `entities` = the subjects of a comparison side by side (2–3 Wikipedia cards). `options` = the option cards of a recommendation. */
export type MediaBlock = { v: 1; kind: 'news'; items: MediaNewsItem[] } | { v: 1; kind: 'entity'; entity: MediaEntity } | { v: 1; kind: 'entities'; entities: MediaEntity[] } | { v: 1; kind: 'options'; title?: string; options: MediaOption[] }

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

function cleanEntity(raw: unknown): MediaEntity | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  const name = clean(e.name, 80)
  const summary = clean(e.summary, 700)
  if (!name || !summary || !isAllowedMediaPage(e.href)) return null
  return { name, summary, href: e.href, source: 'Wikipedia', ...(isAllowedMediaImage(e.image) ? { image: e.image } : {}) }
}

/** At most this many options in one block (ChatGPT's tour answer showed 3-4; a longer list belongs in a table). */
export const MAX_MEDIA_OPTIONS = 6

const cleanList = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.map(x => clean(x, max)).filter(Boolean).slice(0, n) : [])

function cleanOption(raw: unknown): MediaOption | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = clean(o.name, 90)
  if (!name) return null
  const opt = (k: keyof MediaOption, v: unknown, max: number) => { const s = clean(v, max); return s ? { [k]: s } : {} }
  const extras = cleanList(o.extras, 4, 140)
  const href = typeof o.href === 'string' && o.href.length <= 1024 && isSafeHttpsUrl(o.href) ? o.href : null
  return {
    name,
    ...opt('badge', o.badge, 40),
    ...opt('figure', o.figure, 40),
    ...opt('figureNote', o.figureNote, 120),
    ...opt('verdict', o.verdict, 220),
    highlights: cleanList(o.highlights, 5, 180),
    ...(extras.length ? { extras } : {}),
    ...opt('caveat', o.caveat, 220),
    ...(href ? { href, ...opt('linkLabel', o.linkLabel, 40) } : {}),
  }
}

/** Re-validates a block (server before emitting, client before rendering). Anything not allowed is dropped; nothing valid left → null. */
export function sanitizeMediaBlock(raw: unknown): MediaBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.v !== 1) return null
  if (r.kind === 'news' && Array.isArray(r.items)) {
    const items = r.items.flatMap((x): MediaNewsItem[] => {
      const o = (x ?? {}) as Record<string, unknown>
      return isAllowedMediaImage(o.src) && isAllowedMediaPage(o.href) ? [{ src: o.src, href: o.href, label: clean(o.label, 40) || (hostOf(o.href) ?? ''), title: clean(o.title, 160) }] : []
    }).slice(0, 6)
    return items.length ? { v: 1, kind: 'news', items } : null
  }
  if (r.kind === 'entity') {
    const entity = cleanEntity(r.entity)
    return entity ? { v: 1, kind: 'entity', entity } : null
  }
  if (r.kind === 'entities' && Array.isArray(r.entities)) {
    const seen = new Set<string>()
    const entities = r.entities.map(cleanEntity).filter((e): e is MediaEntity => !!e && !seen.has(e.href) && !!seen.add(e.href)).slice(0, 3)
    return entities.length > 1 ? { v: 1, kind: 'entities', entities } : entities.length === 1 ? { v: 1, kind: 'entity', entity: entities[0] } : null
  }
  if (r.kind === 'options' && Array.isArray(r.options)) {
    const options = r.options.map(cleanOption).filter((o): o is MediaOption => !!o).slice(0, MAX_MEDIA_OPTIONS)
    const title = clean(r.title, 90)
    return options.length ? { v: 1, kind: 'options', ...(title ? { title } : {}), options } : null
  }
  return null
}

const BLOCK = /\[TAPPY_MEDIA\]([\s\S]*?)\[\/TAPPY_MEDIA\]/g

/** Client: every [TAPPY_MEDIA] block is removed from the text (always, so raw JSON never shows); the valid ones are returned. */
export function parseMediaBlocks(content: string): { text: string; blocks: MediaBlock[] } {
  if (!content.includes('[TAPPY_MEDIA]')) return { text: content, blocks: [] }
  const blocks: MediaBlock[] = []
  const text = content.replace(BLOCK, (_m, body: string) => {
    try { const b = sanitizeMediaBlock(JSON.parse(body)); if (b) blocks.push(b) } catch { /* malformed: dropped */ }
    return ''
  }).replace(/\[\/?TAPPY_MEDIA\][\s\S]*$/, '').replace(/\n{3,}/g, '\n\n').trim()
  return { text, blocks }
}
