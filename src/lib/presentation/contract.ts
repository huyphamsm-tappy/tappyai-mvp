// The presentation contract v1.
//
// WHY. An answer is text plus things the text does not carry: place cards, an itinerary, subject / option / news cards, a research report. Today those reach the screen through THREE
// channels with three different rules: markers inside the text ([TAPPY_PLAN], [TAPPY_MEDIA]: saved with the message), live annotations (the places view, the research card: NOT saved,
// so a reload loses them), and the SHAPE of the text (an answer of 8,000+ characters with four headings is "a report"). The renderer has to guess, so every new kind of question exposes
// another gap. This file is the ONE typed description of "what the answer shows besides its text", and the ONE reader of the old channels into it.
//
// WHAT IT IS NOT. It does not decide what an answer should show (the model and the tools do, as now), it adds no new block kind the product cannot already draw, and it removes no
// channel: the markers and annotations keep working, `presentationFromMessage` reads them. Wiring it into the chat, saving it with the message and emitting it from the server are later
// steps (docs/architecture/HOP-DONG-TRINH-BAY-V1.md). Pure: no network, no model, no I/O.
//
// TRUST. `parsePresentation` is the only door for a contract from outside (a stored message, a forged client value, a server frame). It drops what is wrong, keeps what is right,
// carries only known fields, bounds every size, reuses the product's own validators (card hosts, plan parser, places reader) and never throws.
import type { TappyPlan } from '@/components/TripPlanCard'
import { parsePlan } from '@/lib/structuredContent/parsePlan'
import { parseMediaBlocks, sanitizeMediaBlock, type MediaBlock } from '@/lib/media/mediaHosts'
import { readPlacesLiveView, type PlacesLiveView } from '@/lib/recommendation/liveView'
import { readResearchStatus } from '@/lib/ai/research/deepResearch'
import { looksLikeReport } from '@/lib/chat/requestHistory'
import { sourceCountOf } from '@/lib/answerDoc/reportExport'

export const PRESENTATION_VERSION = 1 as const
/** At most this many blocks in one answer. */
export const MAX_BLOCKS = 12
/** How many entries of a hostile array are even looked at. */
const MAX_SCAN = 200
const MAX_ID = 64
const MAX_TITLE = 160
const MAX_SOURCES = 1000
/** Serialized size ceilings: a bigger value is not a card, it is an attack or a bug. */
const MAX_PLAN_JSON = 60_000
const MAX_VIEW_JSON = 120_000

export type PresentationBlock =
  /** the place cards of the turn (the product's own places view) */
  | { id: string; type: 'places'; view: PlacesLiveView }
  /** a trip / evening itinerary (the product's own plan) */
  | { id: string; type: 'plan'; plan: TappyPlan }
  /** subject cards, option cards or news pictures (the product's own validated media block) */
  | { id: string; type: 'media'; media: MediaBlock }
  /** a finished research report: shown in the chat as a summary card that opens the full text */
  | { id: string; type: 'report'; title: string; sourceCount: number }
  /** a comparison table the MODEL asked for (columns x rows, an optional pick); `ref` ties a row to a tool result */
  | { id: string; type: 'compare'; title?: string; columns: string[]; rows: CompareRow[]; pick?: number }
  /** one card per named subject of a comparison or a list of two or more (people, companies, products, places...): a subtitle, key points with a bold lead, the names of the sources the points rest on */
  | { id: string; type: 'profiles'; title?: string; items: ProfileItem[] }
  /** 2-3 pictures that show what the answer is about (a product, a place, a person, a vehicle): the MODEL names what to show (`caption`) and the words to find it (`query`); the SERVER finds the pictures and the card carries none of its own */
  | { id: string; type: 'gallery'; title?: string; items: GalleryItem[] }
  /** narrowing questions with tap-to-send options */
  | { id: string; type: 'ask'; questions: AskQuestion[] }
  /** a "book it" handoff. It names the partner (`providerId`) and the tool result it came from (`ref`); it NEVER carries a link: the server attaches the partner link from the registry */
  | { id: string; type: 'booking'; kind: BookingKind; title: string; detail?: string; providerId?: string; ref: string }

export interface CompareRow { label: string; cells: string[]; ref?: string }
export interface ProfilePoint { lead?: string; text: string }
/** `sources` are NAMES of the places the points came from (a site, a report), never an address: a card carries no link. */
export interface ProfileItem { name: string; subtitle?: string; points: ProfilePoint[]; sources?: string[] }
export interface AskQuestion { text: string; options: string[] }
export interface GalleryItem { caption: string; query: string }
export const BOOKING_KINDS = ['flight', 'hotel', 'transport', 'ticket', 'activity', 'product'] as const
export type BookingKind = (typeof BOOKING_KINDS)[number]

export interface Presentation { v: typeof PRESENTATION_VERSION; blocks: PresentationBlock[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function jsonOf(x: unknown, max: number): string | null {
  try { const s = JSON.stringify(x); return typeof s === 'string' && s.length <= max ? s : null } catch { return null }
}

const MAX_COLUMNS = 6
const MAX_ROWS = 12
const MAX_QUESTIONS = 3
const MAX_OPTIONS = 6
const MAX_COL = 60
const MAX_LABEL = 80
const MAX_CELL = 200
const MAX_QUESTION = 200
const MAX_OPTION = 60
const MAX_DETAIL = 240
const REF = /^[A-Za-z0-9_.:-]{1,64}$/
const PROVIDER = /^[a-z0-9_]{1,40}$/

/** Single-line plain text, control characters removed, bounded. A text marker inside it makes the whole value unusable (null): a card must not smuggle a marker into the answer. */
function cleanText(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null
  const t = x.replace(/[\u0000-\u001f\u007f]+/g, m => (/[\n\r\t]/.test(m) ? ' ' : '')).replace(/\s+/g, ' ').trim()
  if (/\[\/?TAPPY_/i.test(t)) return null
  return t.slice(0, max)
}

function readCompare(id: string, raw: Record<string, unknown>): PresentationBlock | null {
  const cols = raw.columns
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > MAX_COLUMNS) return null
  const columns: string[] = []
  for (const c of cols) { const t = cleanText(c, MAX_COL); if (!t) return null; columns.push(t) }
  if (!Array.isArray(raw.rows)) return null
  const rows: CompareRow[] = []
  for (let i = 0; i < Math.min(raw.rows.length, MAX_SCAN) && rows.length < MAX_ROWS; i++) {
    const r = raw.rows[i]
    if (!isObj(r) || !Array.isArray(r.cells) || r.cells.length !== columns.length) continue
    const label = cleanText(r.label, MAX_LABEL)
    const cells = r.cells.map(c => cleanText(c, MAX_CELL))
    if (!label || cells.some(c => c === null)) continue
    const row: CompareRow = { label, cells: cells as string[] }
    if (typeof r.ref === 'string' && REF.test(r.ref)) row.ref = r.ref
    rows.push(row)
  }
  if (!rows.length) return null
  const block: Extract<PresentationBlock, { type: 'compare' }> = { id, type: 'compare', columns, rows }
  const title = raw.title === undefined ? null : cleanText(raw.title, MAX_TITLE)
  if (title) block.title = title
  if (raw.pick !== undefined) {
    if (typeof raw.pick !== 'number' || !Number.isInteger(raw.pick) || raw.pick < 0 || raw.pick >= columns.length) return null
    block.pick = raw.pick
  }
  return block
}

// 16/11: one card is a valid block - the fact check may leave a comparison with the one subject whose points the turn's lookups support (the prompt still asks for cards only for two or more subjects)
const MIN_PROFILES = 1
const MAX_PROFILES = 6
const MAX_POINTS = 6
const MAX_NAME = 80
const MAX_SUBTITLE = 120
const MAX_LEAD = 60
const MAX_POINT = 260
const MAX_SOURCE_NAMES = 5
const MAX_SOURCE_NAME = 60

function readProfiles(id: string, raw: Record<string, unknown>): PresentationBlock | null {
  if (!Array.isArray(raw.items)) return null
  const items: ProfileItem[] = []
  const names = new Set<string>()
  for (let i = 0; i < Math.min(raw.items.length, MAX_SCAN) && items.length < MAX_PROFILES; i++) {
    const it = raw.items[i]
    if (!isObj(it) || !Array.isArray(it.points)) continue
    const name = cleanText(it.name, MAX_NAME)
    if (!name || names.has(name.toLowerCase())) continue
    const points: ProfilePoint[] = []
    for (let j = 0; j < Math.min(it.points.length, MAX_SCAN) && points.length < MAX_POINTS; j++) {
      const p = it.points[j]
      if (!isObj(p)) continue
      const text = cleanText(p.text, MAX_POINT)
      if (!text) continue
      const lead = p.lead === undefined ? null : cleanText(p.lead, MAX_LEAD)
      points.push(lead ? { lead, text } : { text })
    }
    if (!points.length) continue
    const item: ProfileItem = { name, points }
    const subtitle = it.subtitle === undefined ? null : cleanText(it.subtitle, MAX_SUBTITLE)
    if (subtitle) item.subtitle = subtitle
    if (Array.isArray(it.sources)) {
      const sources: string[] = []
      for (let k = 0; k < Math.min(it.sources.length, MAX_SCAN) && sources.length < MAX_SOURCE_NAMES; k++) {
        const s = cleanText(it.sources[k], MAX_SOURCE_NAME)
        // a source is a NAME: an address is not accepted here, a card carries no link
        if (s && !/https?:\/\/|www\./i.test(s) && !sources.includes(s)) sources.push(s)
      }
      if (sources.length) item.sources = sources
    }
    names.add(name.toLowerCase())
    items.push(item)
  }
  if (items.length < MIN_PROFILES) return null
  const block: Extract<PresentationBlock, { type: 'profiles' }> = { id, type: 'profiles', items }
  const title = raw.title === undefined ? null : cleanText(raw.title, MAX_TITLE)
  if (title) block.title = title
  return block
}

const MIN_GALLERY = 2
const MAX_GALLERY = 3
const MAX_CAPTION = 80
const MAX_QUERY = 100

/** A gallery: two or three shots, each a short caption and the words a picture search needs. No address and no picture comes from the model: a query that looks like a link is refused. */
function readGallery(id: string, raw: Record<string, unknown>): PresentationBlock | null {
  // the model declares `images` (its tool's field); the contract carries them as `items` (what the server sends and the client reads back): both are read, so a parsed block parses again
  const list = Array.isArray(raw.images) ? raw.images : Array.isArray(raw.items) ? raw.items : null
  if (!list) return null
  const items: GalleryItem[] = []
  const seen = new Set<string>()
  for (let i = 0; i < Math.min(list.length, MAX_SCAN) && items.length < MAX_GALLERY; i++) {
    const it = list[i]
    if (!isObj(it)) continue
    const caption = cleanText(it.caption, MAX_CAPTION)
    const query = cleanText(it.query, MAX_QUERY)
    if (!caption || !query || /https?:\/\/|www\./i.test(query) || seen.has(caption.toLowerCase())) continue
    seen.add(caption.toLowerCase())
    items.push({ caption, query })
  }
  if (items.length < MIN_GALLERY) return null
  const block: Extract<PresentationBlock, { type: 'gallery' }> = { id, type: 'gallery', items }
  const title = raw.title === undefined ? null : cleanText(raw.title, MAX_TITLE)
  if (title) block.title = title
  return block
}

function readAsk(id: string, raw: Record<string, unknown>): PresentationBlock | null {
  if (!Array.isArray(raw.questions)) return null
  const questions: AskQuestion[] = []
  for (let i = 0; i < Math.min(raw.questions.length, MAX_SCAN) && questions.length < MAX_QUESTIONS; i++) {
    const q = raw.questions[i]
    if (!isObj(q) || !Array.isArray(q.options)) continue
    const text = cleanText(q.text, MAX_QUESTION)
    if (!text) continue
    const options: string[] = []
    for (let j = 0; j < Math.min(q.options.length, MAX_SCAN) && options.length < MAX_OPTIONS; j++) {
      const o = cleanText(q.options[j], MAX_OPTION)
      if (o && !options.includes(o)) options.push(o)
    }
    if (options.length) questions.push({ text, options })
  }
  return questions.length ? { id, type: 'ask', questions } : null
}

function readBooking(id: string, raw: Record<string, unknown>): PresentationBlock | null {
  if (typeof raw.kind !== 'string' || !(BOOKING_KINDS as readonly string[]).includes(raw.kind)) return null
  const title = cleanText(raw.title, MAX_TITLE)
  if (!title || typeof raw.ref !== 'string' || !REF.test(raw.ref)) return null
  const block: Extract<PresentationBlock, { type: 'booking' }> = { id, type: 'booking', kind: raw.kind as BookingKind, title, ref: raw.ref }
  if (raw.detail !== undefined) { const d = cleanText(raw.detail, MAX_DETAIL); if (d) block.detail = d }
  if (raw.providerId !== undefined) { if (typeof raw.providerId !== 'string' || !PROVIDER.test(raw.providerId)) return null; block.providerId = raw.providerId }
  return block
}

/** The tool results a contract points at (each id once). The server checks every one exists in the turn's tool results before it sends the contract. */
export function blockRefs(p: Presentation): string[] {
  const out = new Set<string>()
  for (const b of p.blocks) {
    if (b.type === 'booking') out.add(b.ref)
    else if (b.type === 'compare') for (const r of b.rows) if (r.ref) out.add(r.ref)
  }
  return [...out]
}

function readBlock(raw: unknown): PresentationBlock | null {
  if (!isObj(raw)) return null
  const id = raw.id
  if (typeof id !== 'string' || id.length < 1 || id.length > MAX_ID) return null
  switch (raw.type) {
    case 'places': {
      if (!isObj(raw.view) || jsonOf(raw.view, MAX_VIEW_JSON) === null) return null
      const view = readPlacesLiveView([raw.view])
      return view ? { id, type: 'places', view } : null
    }
    case 'plan': {
      const json = isObj(raw.plan) ? jsonOf(raw.plan, MAX_PLAN_JSON) : null
      if (json === null || json.includes('[/TAPPY_PLAN]')) return null
      const plan = parsePlan(`[TAPPY_PLAN]${json}[/TAPPY_PLAN]`).plan
      return plan ? { id, type: 'plan', plan } : null
    }
    case 'media': {
      const media = sanitizeMediaBlock(raw.media)
      return media ? { id, type: 'media', media } : null
    }
    case 'report': {
      const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : ''
      const n = raw.sourceCount
      if (!title || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_SOURCES) return null
      return { id, type: 'report', title, sourceCount: n }
    }
    case 'compare': return readCompare(id, raw)
    case 'profiles': return readProfiles(id, raw)
    case 'gallery': return readGallery(id, raw)
    case 'ask': return readAsk(id, raw)
    case 'booking': return readBooking(id, raw)
    default:
      return null
  }
}

/** An untrusted value (stored, forged or sent by the server) as a contract the renderer can trust; null when nothing in it is usable. Never throws. */
export function parsePresentation(raw: unknown): Presentation | null {
  try {
    if (!isObj(raw) || raw.v !== PRESENTATION_VERSION) return null
    const list = raw.blocks
    if (!Array.isArray(list)) return null
    const blocks: PresentationBlock[] = []
    const seen = new Set<string>()
    for (let i = 0; i < Math.min(list.length, MAX_SCAN) && blocks.length < MAX_BLOCKS; i++) {
      const b = readBlock(list[i])
      if (!b || seen.has(b.id)) continue
      seen.add(b.id)
      blocks.push(b)
    }
    return blocks.length ? { v: PRESENTATION_VERSION, blocks } : null
  } catch {
    return null
  }
}

/** A report's title: its first heading line, else its first line, as plain text. */
function reportTitle(text: string, researchTitle: string): string {
  const line = text.split('\n').find(l => /^\s{0,3}#\s+\S/.test(l)) ?? text.split('\n').find(l => l.trim()) ?? ''
  const t = line.replace(/^\s{0,3}#+\s*/, '').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim()
  return (t || researchTitle).slice(0, MAX_TITLE)
}

/**
 * The channels the product already has, read into ONE contract. Returns the text with the markers the contract owns ([TAPPY_PLAN], [TAPPY_MEDIA]) removed (a broken marker is removed too, never
 * shown) and the contract, or null when the answer shows nothing besides its text. Blocks come in one fixed order: report, media, plan, places; ids are `type-n`, stable for the same input.
 * `recalledPlaces` is the tab's remembered places view; it is used only when the message carries no usable annotation. Never throws.
 */
export function presentationFromMessage(input: { content: unknown; annotations?: unknown; recalledPlaces?: PlacesLiveView | null }): { text: string; presentation: Presentation | null } {
  const content = typeof input.content === 'string' ? input.content : ''
  try {
    const annotations = Array.isArray(input.annotations) ? input.annotations : undefined
    const { text: afterPlan, plan } = parsePlan(content)
    const { text, blocks: media } = parseMediaBlocks(afterPlan)

    const blocks: unknown[] = []
    if (looksLikeReport(text)) {
      const research = readResearchStatus(annotations)
      blocks.push({ id: 'report-0', type: 'report', title: reportTitle(text, research?.title ?? ''), sourceCount: Math.min(MAX_SOURCES, Math.max(research?.links?.length ?? 0, sourceCountOf(text, []))) })
    }
    media.forEach((m, i) => blocks.push({ id: `media-${i}`, type: 'media', media: m }))
    if (plan) blocks.push({ id: 'plan-0', type: 'plan', plan })
    const places = readPlacesLiveView(annotations) ?? (input.recalledPlaces ? readPlacesLiveView([input.recalledPlaces]) : null)
    if (places) blocks.push({ id: 'places-0', type: 'places', view: places })

    return { text, presentation: parsePresentation({ v: PRESENTATION_VERSION, blocks }) }
  } catch {
    return { text: content, presentation: null }
  }
}
