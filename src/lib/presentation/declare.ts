// Layout slice 2 (14/11/2026, CONSULT_PRESENT_BLOCKS, default OFF): the model DECLARES which blocks its answer needs, in the presentation contract's own types, and points at tool results by id.
//
// Today the model has no typed way to say "this is a comparison table", "ask these questions with chips" or "this is where to book". It writes text in a shape and the app guesses. This file is the pure
// part of giving it that way: ids for the turn's tool results, the check of a declared contract against the turn, the tool's parameter schema and description. It decides nothing about WHICH blocks an
// answer needs: that is the model reading the question and the conversation. Nothing here writes a link: a booking names a partner and a result, the server attaches the partner link from the registry.
import { z } from 'zod'
import { COMMERCE_LINKS_KEY, isCommerceLinkRow } from '@/lib/ccp/row'
import { ACCESSTRADE_WRAPPER_HOSTS } from '@/lib/ccp/tracking/wrapperHosts'
import { parsePresentation, type Presentation, type PresentationBlock, type BookingKind } from './contract'

export const PRESENTATION_ANNOTATION_KIND = 'tappy.presentation.v1'

/** The turn's tool results, numbered. The model sees `result_id` on each object result and may point at it. The partner link rows a result carried are kept here (server side only). */
export class ResultLedger {
  private readonly tools = new Map<string, string>()
  private readonly links = new Map<string, LinkCandidate[]>()
  private readonly texts = new Map<string, string>()
  register(tool: string, links: readonly LinkCandidate[] = [], text?: string): string {
    const id = `r${this.tools.size + 1}`
    this.tools.set(id, tool)
    if (links.length) this.links.set(id, [...links])
    if (text) this.texts.set(id, text)
    return id
  }
  /**
   * What the turn's lookups returned, as one text: the evidence a declared card's points are checked against (factCheck.ts). Each result is cut to `perResult` characters and the whole to `total`;
   * the LATEST results come first (a late, more specific lookup is the better evidence). Server side only; never sent to the client.
   */
  evidence(total = 60_000, perResult = 15_000): string {
    const out: string[] = []
    let used = 0
    for (const id of [...this.texts.keys()].reverse()) {
      const t = (this.texts.get(id) ?? '').slice(0, perResult)
      if (!t || used + t.length > total) continue
      out.push(`[${this.tools.get(id) ?? 'tool'}] ${t}`)
      used += t.length
    }
    return out.join('\n')
  }
  toolOf(id: string): string | undefined { return this.tools.get(id) }
  linksOf(id: string): LinkCandidate[] { return this.links.get(id) ?? [] }
}

type Exec = (...args: unknown[]) => unknown
const isPlainObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** A link the partner layer put on a tool result, ready to be offered on a booking. Server side only. */
export interface LinkCandidate { url: string; label: string; providerId?: string; handoff: 'guest' | 'merchant_login' | 'app'; search?: boolean; primary?: boolean }

/** Which partner a link belongs to, by the host it lands on (an affiliate wrapper link is read through to its target). Built from the partner registry. */
export type ProviderOfUrl = (url: string) => string | undefined

const WRAPPER_HOSTS: readonly string[] = ACCESSTRADE_WRAPPER_HOSTS
const hostOf = (u: string): string | null => { try { return new URL(u).hostname.toLowerCase() } catch { return null } }

export function makeProviderOfUrl(registry: ReadonlyArray<{ providerId: string; allowedHosts: readonly string[] }>): ProviderOfUrl {
  return (url: string) => {
    let host = hostOf(url)
    if (host && WRAPPER_HOSTS.includes(host)) {
      try { const target = new URL(url).searchParams.get('url'); host = target ? hostOf(target) : null } catch { host = null }
    }
    if (!host) return undefined
    const h = host
    return registry.find(p => p.allowedHosts.some(a => { const x = a.toLowerCase(); return h === x || h.endsWith(`.${x}`) }))?.providerId
  }
}

/** The fields of a tool result that carry partner links (arrays of { name, platform, url } and single URLs), and the label a bare URL gets. */
const LINK_ARRAYS = ['booking_links', 'event_links', 'film_links', 'product_links', 'order_links', 'platform_links'] as const
const LINK_STRINGS: Record<string, string> = { vexere_link: 'Vexere', train_booking_link: 'Vexere', agoda_link: 'Agoda' }
const labelOf = (x: unknown): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, 80) : '')

/**
 * The partner links a tool result carries, in the fields the partner layer writes them to (on the result and on each of its rows, one level of arrays) and as the partner layer's own link
 * rows. Every one is a link the app would show as a button anyway; the model never wrote any.
 */
export function linkCandidatesOf(result: Record<string, unknown>, providerOf: ProviderOfUrl): LinkCandidate[] {
  const out: LinkCandidate[] = []
  const seen = new Set<string>()
  const add = (c: LinkCandidate) => { if (!seen.has(c.url)) { seen.add(c.url); out.push(c) } }
  const takeFrom = (holder: Record<string, unknown>) => {
    const rows = holder[COMMERCE_LINKS_KEY]
    if (Array.isArray(rows)) for (const r of rows.slice(0, 20)) if (isCommerceLinkRow(r)) add({ url: r.url, label: labelOf(r.merchantName) || r.providerId, providerId: r.providerId, handoff: r.handoff === 'merchant_login' || r.handoff === 'app' ? r.handoff : 'guest', search: r.fallback === 'search' || r.kind === 'SEARCH_HANDOFF', primary: r.primary !== false })
    for (const key of LINK_ARRAYS) {
      const arr = holder[key]
      if (Array.isArray(arr)) for (const l of arr.slice(0, 20)) if (isPlainObject(l) && typeof l.url === 'string') add({ url: l.url, label: labelOf(l.platform) || labelOf(l.name) || (providerOf(l.url) ?? ''), providerId: providerOf(l.url), handoff: 'guest' })
    }
    for (const [key, label] of Object.entries(LINK_STRINGS)) { const u = holder[key]; if (typeof u === 'string') add({ url: u, label, providerId: providerOf(u), handoff: 'guest' }) }
  }
  takeFrom(result)
  for (const v of Object.values(result)) if (Array.isArray(v)) for (const row of v.slice(0, 50)) if (isPlainObject(row)) takeFrom(row)
  return out.filter(c => c.label)
}

/** A tool result as plain text for the evidence ledger: JSON with the noise (urls, ids, keys of commerce links) left in only as far as it fits; a result that cannot be written is no evidence. */
const NOISE_KEYS = /^(link|url|href|image|imageUrl|image_url|thumbnail|favicon|icon|result_id|_tappy_data|position|rank|source_url|serpapi_link)$/i
const withoutNoise = (x: unknown, depth = 0): unknown => {
  if (depth > 8) return undefined
  if (Array.isArray(x)) return x.map(v => withoutNoise(v, depth + 1))
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([k]) => !NOISE_KEYS.test(k)).map(([k, v]) => [k, withoutNoise(v, depth + 1)]))
  return x
}
export function resultText(r: unknown): string {
  try { return JSON.stringify(withoutNoise(r)).replace(/\\n/g, ' ').replace(/\s+/g, ' ').slice(0, 30_000) } catch { return '' }
}

/** Adds `result_id` to every object result of the tools except `skip` (the presenting tools themselves). The original result is not changed; errors pass through untouched. */
export function withResultIds<T extends Record<string, object>>(set: T, ledger: ResultLedger, skip: ReadonlySet<string>, providerOf: ProviderOfUrl = () => undefined): T {
  const out: Record<string, unknown> = {}
  for (const [name, t0] of Object.entries(set)) {
    const t = t0 as { execute?: Exec }
    if (!t || typeof t.execute !== 'function' || skip.has(name)) { out[name] = t0; continue }
    const exec = t.execute
    const tag = (r: unknown): unknown => (isPlainObject(r) ? { ...r, result_id: ledger.register(name, linkCandidatesOf(r, providerOf), resultText(r)) } : r)
    out[name] = {
      ...t,
      execute: (...args: unknown[]) => {
        const r = exec(...args)
        return r && typeof (r as Promise<unknown>).then === 'function' ? (r as Promise<unknown>).then(tag) : tag(r)
      },
    }
  }
  return out as T
}

/** The tools whose results can ground each kind of booking. Anything else points at no real lookup. */
const KIND_TOOLS: Record<BookingKind, readonly string[]> = {
  flight: ['get_flight_prices'],
  hotel: ['get_hotel_prices'],
  transport: ['get_transport_options'],
  product: ['search_products'],
  ticket: ['web_search'],
  activity: ['web_search'],
}

/**
 * A contract the model declared, checked against the turn: the contract's own validation first (sizes, text, no link anywhere), then
 * a booking must point at a result of a tool that fits its kind and name only a partner the registry knows; a compare row's reference
 * to a result that does not exist is removed (the row's words stay). Null when nothing usable is left. Never throws.
 */
export function validateDeclared(raw: unknown, ledger: ResultLedger, knownProviders: ReadonlySet<string>): Presentation | null {
  const p = parsePresentation(raw)
  if (!p) return null
  const blocks: PresentationBlock[] = []
  for (const b of p.blocks) {
    if (b.type === 'booking') {
      const tool = ledger.toolOf(b.ref)
      if (!tool || !KIND_TOOLS[b.kind].includes(tool)) continue
      if (b.providerId !== undefined && !knownProviders.has(b.providerId)) continue
      blocks.push(b)
    } else if (b.type === 'compare') {
      blocks.push({ ...b, rows: b.rows.map(r => (r.ref && !ledger.toolOf(r.ref) ? { label: r.label, cells: r.cells } : r)) })
    } else {
      blocks.push(b)
    }
  }
  return blocks.length ? { v: p.v, blocks } : null
}

/** What a booking's button opens: a partner link the PARTNER LAYER produced for the tool result the booking points at. */
export interface BookingLink { url: string; label: string; providerId: string; handoff: 'guest' | 'merchant_login' | 'app' }

const safeHttps = (u: unknown): u is string => {
  if (typeof u !== 'string' || u.length > 2000) return false
  try { return new URL(u).protocol === 'https:' } catch { return false }
}

/**
 * Gives every booking the link of its own tool result (the partner layer's row, the one the app would show as a button anyway) and drops the booking that has none: a booking card is
 * always actionable. A named partner only ever gets its own link. The model never wrote any of it. Null when no block is left.
 */
export function resolveBookingLinks(p: Presentation, ledger: ResultLedger): { presentation: Presentation; links: Record<string, BookingLink> } | null {
  const links: Record<string, BookingLink> = {}
  const blocks: PresentationBlock[] = []
  for (const b of p.blocks) {
    if (b.type !== 'booking') { blocks.push(b); continue }
    const rows = ledger.linksOf(b.ref).filter(r => (b.providerId === undefined || r.providerId === b.providerId) && safeHttps(r.url))
    const ordered = [...rows.filter(r => !r.search && r.primary !== false), ...rows.filter(r => !r.search && r.primary === false), ...rows.filter(r => r.search)]
    const row = ordered[0]
    if (!row) continue
    links[b.id] = { url: row.url, label: row.label, providerId: row.providerId ?? b.providerId ?? '', handoff: row.handoff }
    blocks.push(b)
  }
  return blocks.length ? { presentation: { v: p.v, blocks }, links } : null
}

/**
 * A second present_blocks call used to REPLACE the first, so a model that declared the cards in one call and the table in another (final UAT 19/11: two of three comparisons of two subjects) ended with the
 * table alone. A later call now replaces only the blocks of the types it declares again; the types it leaves out stay. The partner links of both are kept. Pure.
 */
export function mergePresentations(
  prev: { presentation: Presentation; links: Record<string, BookingLink> } | null | undefined,
  next: { presentation: Presentation; links: Record<string, BookingLink> },
): { presentation: Presentation; links: Record<string, BookingLink> } {
  if (!prev || prev.presentation.blocks.length === 0) return next
  const again = new Set(next.presentation.blocks.map(b => b.type))
  const kept = prev.presentation.blocks.filter(b => !again.has(b.type))
  const blocks = [...kept, ...next.presentation.blocks]
  const live = new Set(blocks.map(b => b.id))
  const links: Record<string, BookingLink> = {}
  for (const [id, l] of Object.entries({ ...prev.links, ...next.links })) if (live.has(id)) links[id] = l
  return { presentation: { v: next.presentation.v, blocks }, links }
}

/** The live frame the server sends after the prose (an `8:` annotation: not stored, not in the text, ignored by clients that do not know it). `links` = the bookings' partner links by block id. */
export function presentationAnnotation(p: Presentation, links?: Record<string, BookingLink>): { kind: typeof PRESENTATION_ANNOTATION_KIND; v: 1; presentation: Presentation; links?: Record<string, BookingLink> } {
  return { kind: PRESENTATION_ANNOTATION_KIND, v: 1, presentation: p, ...(links && Object.keys(links).length ? { links } : {}) }
}

export const PRESENT_BLOCKS_DESCRIPTION = 'Show blocks with the answer. "compare": a table (columns = the options, rows = the criteria, "pick" = the recommended column). '
  + '"profiles": ONE CARD PER SUBJECT when the answer compares or lists TWO OR MORE named subjects (people, companies, products, places, courses, plans...) and you have several facts about each: '
  + 'name (as your text writes it), subtitle (one short line, only what you know), points (2-6, each a short "lead" label and the fact), sources (names of the sites you used, never an address). '
  + 'Put those facts in the cards, not again in the text: the text keeps the introduction, the verdict and the cautions. '
  + '"gallery": 2-3 pictures that show what the answer is about, ONLY when seeing it helps the reader understand (a product, a vehicle, a place, a person, a landmark, an object) and the look of it is recognisable; at most one per answer, never for an abstract topic, a how-to, a short answer or a figure. '
  + 'Each image: a short caption (what it shows, as the text names it) and a query (the exact words to search a picture of THAT thing, specific enough to find the right one: the model, the place and the year when they matter). The app finds the pictures; never write an address. '
  + '"ask": up to 3 short questions, each with 2-6 options the person can tap. '
  + '"booking": a way to book something a tool returned: its kind, a short title and "ref" = the result_id of that tool result (a partner only when the result shows one). '
  + 'The app attaches the links itself: never write one. Use only result_id values you were given. A block exists only through this call: never write a block name, placeholder or marker in the answer text.'

const blockSchema = z.object({
  id: z.string().describe('short unique id, e.g. "cmp1"'),
  type: z.enum(['compare', 'profiles', 'gallery', 'ask', 'booking']),
  images: z.array(z.object({ caption: z.string(), query: z.string() })).optional().describe('gallery: 2-3 pictures, each a short caption and the search words for that exact thing'),
  title: z.string().optional().describe('compare / profiles: the heading; booking: what is offered'),
  items: z.array(z.object({
    name: z.string(),
    subtitle: z.string().optional(),
    points: z.array(z.object({ lead: z.string().optional(), text: z.string() })),
    sources: z.array(z.string()).optional(),
  })).optional().describe('profiles: 2-6 subjects, one card each'),
  columns: z.array(z.string()).optional().describe('compare: 2-6 column headings'),
  rows: z.array(z.object({ label: z.string(), cells: z.array(z.string()), ref: z.string().optional() })).optional().describe('compare: up to 12 rows; cells = one per column'),
  pick: z.number().optional().describe('compare: index of the recommended column'),
  questions: z.array(z.object({ text: z.string(), options: z.array(z.string()) })).optional().describe('ask: up to 3 questions'),
  kind: z.enum(['flight', 'hotel', 'transport', 'ticket', 'activity', 'product']).optional().describe('booking: what it is'),
  detail: z.string().optional().describe('booking: dates, people, one line'),
  providerId: z.string().optional().describe('booking: partner id from the tool result'),
  ref: z.string().optional().describe('booking: result_id of the tool result'),
})

export const presentBlocksParameters = z.object({ blocks: z.array(blockSchema).min(1).max(8) })
