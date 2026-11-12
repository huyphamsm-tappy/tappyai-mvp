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

export interface Presentation { v: typeof PRESENTATION_VERSION; blocks: PresentationBlock[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function jsonOf(x: unknown, max: number): string | null {
  try { const s = JSON.stringify(x); return typeof s === 'string' && s.length <= max ? s : null } catch { return null }
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
