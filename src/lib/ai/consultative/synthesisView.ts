import { UNKNOWN, CONDITION_KEY } from './normalizedEvidence'
import type { Entity } from './entityModel'
import type { ShoppingSynthesis, EntitySummary, ConfigMatch } from './synthesis'
import { buildSynthesisPayload, entityName } from './synthesis'

// ── Universal Plan — Phase 9: SYNTHESIS → CLIENT DISPLAY VIEW ────────────────
//
// The Phase-4 `_tappy_synthesis` payload is written FOR THE MODEL: it is compact
// on purpose (grouping + recommendation, no per-offer link/price, no image) so
// it stays cheap in context. The chat UI needs a little more to render a real
// decision — the offers' own links and prices — but it must render the SAME
// grouping the backend already decided, never a new one.
//
// So this adapter does NOT group, rank, match or recommend. It reuses the
// finished `ShoppingSynthesis` (Phase 3 entities + Phase 4 recommendation) and
// the compact payload (config label, price range, match, recommended flag),
// aligning them by INDEX — `buildSynthesisPayload` maps `s.entities` in order,
// so `nhom_san_pham[i]` describes `entities[i]`. The only thing it ADDS is the
// per-offer link/price/condition already present on each offer. It carries NO
// image: product photos are deliberately withheld from the tool result (they
// never reach the model); the client uses the photo the stream filter already
// injected as a representative hero instead.
//
// `Known<T>` markers (`UNKNOWN`) are normalised to `null` here so the client can
// treat "missing" as a plain absence and never render the sentinel string.

export interface SynthesisOfferView {
  seller: string | null
  url: string | null
  price: number | null
  currency: string | null
  condition: string | null
  /**
   * The rating THIS listing carries, never the entity's.
   *
   * Serper puts `rating` / `ratingCount` on the row, so it belongs to one
   * seller's listing. Hoisting it to the entity would show seller A's stars
   * beside seller B's price - a number the evidence does not support. The card
   * reads it from the offer it is actually featuring.
   */
  rating?: number | null
  ratingCount?: number | null
}

/** One stated specification. `value` is the listing's own figure, never derived. */
export interface SynthesisSpecView {
  key: 'chip' | 'ram' | 'storage' | 'size'
  value: string | number
}

/**
 * 🚨 THE NEW FIELDS ARE OPTIONAL BECAUSE A MARKER OUTLIVES ITS WRITER.
 *
 * This view is serialised into the assistant's message text and saved with the
 * conversation, so a reply written before `name` / `specs` / `condition` /
 * per-offer `rating` existed is parsed back by today's component. The builder
 * below always sets them; the TYPE says "may be absent" because a stored one
 * genuinely can be, and the card reads every one of them defensively.
 */
export interface SynthesisEntityView {
  key: string
  /**
   * The product's own name — the listing title.
   *
   * 🚨 THE CARD USED TO SHOW `config` AS THE PRODUCT'S IDENTITY, and for
   * anything that is not a Mac that read "chip ? · 16GB · 512GB". A configuration
   * is not a name; this is.
   */
  name?: string
  /** The stated configuration, as a SECONDARY line. Empty when nothing was stated. */
  config: string
  /** The same configuration as data, so the UI can label and localise each part. */
  specs?: SynthesisSpecView[]
  /** The seller's own condition wording, plus a key a dictionary can translate. */
  condition?: { key: string | null; label: string } | null
  matchesRequest: ConfigMatch
  recommended: boolean
  priceLow: number | null
  priceHigh: number | null
  /** A representative product photo for this entity, if any offer carried one. */
  image: string | null
  offers: SynthesisOfferView[]
}

/** A grounded reason, carrying both the engine's English and the data to say it. */
export interface SynthesisReasonView {
  attribute: string
  /** The engine's own wording. The fallback when a client has no dictionary entry. */
  evidence: string
  params?: Record<string, string | number>
}

export interface SynthesisRecommendationView {
  entityKey: string | null
  seller: string | null
  reasons: SynthesisReasonView[]
  tradeOff: SynthesisReasonView | null
  conditional: boolean
}

export interface SynthesisView {
  v: 1
  entities: SynthesisEntityView[]
  recommendation: SynthesisRecommendationView | null
  /**
   * The configuration the USER asked for, or null when they named none.
   *
   * 🚨 A MATCH VERDICT IS MEANINGLESS WITHOUT A REQUEST TO MATCH. `matchOf`
   * returns "chua_ro" both when a listing is unclear AND when the user stated no
   * configuration at all - two different facts wearing one label. On a measured
   * live turn ("Laptop khoảng 20 triệu để làm việc", which names no chip, RAM or
   * storage) that painted "Chưa rõ cấu hình" on all six rows: six badges saying
   * nothing, about a question nobody asked.
   *
   * Carrying the request lets the card tell the two apart and simply not offer
   * the badge when there was nothing to compare against. The verdict itself is
   * untouched.
   */
  requested?: string | null
}

/** UNKNOWN → null; everything else through unchanged. */
function nn<T>(v: T | typeof UNKNOWN): T | null {
  return v === UNKNOWN ? null : (v as T)
}

/** A representative product photo for an entity, from the first offer that carried one. */
function entityImage(e: Entity): string | null {
  for (const o of e.offers) {
    const raw = o.evidence.raw
    const url = raw.photo_url ?? raw.imageUrl
    if (typeof url === 'string' && url.startsWith('http')) return url
  }
  return null
}

// ── The DELIVERY channel: a text marker, exactly like [TAPPY_PLAN] ───────────
//
// The chat renders from message TEXT and persists ONLY text; a tool-result field
// (`toolInvocations`) is present on the live turn but GONE after reload. So the
// decision travels as a marker block the server appends to the assistant text
// (see streamEnrichment) and the client parses (see ChatInterface) — the same
// durable path `[TAPPY_PLAN]` uses. The model never writes it; the app owns it.
export const SHOPPING_MARKER_OPEN = '[TAPPY_SHOPPING]'
export const SHOPPING_MARKER_CLOSE = '[/TAPPY_SHOPPING]'

/** Server: the marker block carrying the view as compact JSON. */
export function renderShoppingMarker(view: SynthesisView): string {
  return `${SHOPPING_MARKER_OPEN}${JSON.stringify(view)}${SHOPPING_MARKER_CLOSE}`
}

/**
 * Client: pull the view out of an assistant reply and return the text WITHOUT
 * the marker (so it never reaches formatMessage / TTS / copy). A missing or
 * malformed marker degrades to `{ text, view: null }` — never throws.
 */
/** Removes any marker tag the block extraction below did not consume. A lone closing tag has no
 *  opening to anchor on, so the span logic never sees it — and it rendered as message body. */
function stripOrphanShoppingTags(text: string): string {
  const orphan = text.split(SHOPPING_MARKER_CLOSE).join('').split(SHOPPING_MARKER_OPEN).join('')
  return orphan === text ? text : orphan.trim()
}

export function parseShoppingMarker(content: string): { text: string; view: SynthesisView | null } {
  const open = content.indexOf(SHOPPING_MARKER_OPEN)
  // P0-1: no opening tag does NOT mean nothing to clean. A reply carrying only
  // `[/TAPPY_SHOPPING]` — an opening consumed upstream, or a truncated stream — used to be handed
  // back untouched and the bare tag reached the user.
  if (open === -1) return { text: stripOrphanShoppingTags(content), view: null }
  const from = open + SHOPPING_MARKER_OPEN.length
  const close = content.indexOf(SHOPPING_MARKER_CLOSE, from)
  const end = close === -1 ? content.length : close
  const text = (content.slice(0, open) + content.slice(close === -1 ? content.length : close + SHOPPING_MARKER_CLOSE.length)).trim()
  try {
    const view = JSON.parse(content.slice(from, end).trim()) as SynthesisView
    if (!view || !Array.isArray(view.entities) || view.entities.length === 0) return { text, view: null }
    return { text, view }
  } catch {
    return { text, view: null }
  }
}

/**
 * Project the finished synthesis into the shape the chat UI renders.
 *
 * Pure and additive: no clock, no network, no new grouping. Reuses the compact
 * payload so the config label / price range / match / recommended flag are
 * EXACTLY what the model was told — the UI can never disagree with the text.
 */
export function buildSynthesisView(s: ShoppingSynthesis): SynthesisView {
  const payload = buildSynthesisPayload(s)
  const groups = (payload.nhom_san_pham as EntitySummary[] | undefined) ?? []

  const entities: SynthesisEntityView[] = s.entities.map((e, i) => {
    const g = groups[i]
    const id = e.identity
    const specs: SynthesisSpecView[] = []
    if (id.model !== UNKNOWN) specs.push({ key: 'chip', value: id.model })
    if (id.ramGb !== UNKNOWN) specs.push({ key: 'ram', value: id.ramGb })
    if (id.storageGb !== UNKNOWN) specs.push({ key: 'storage', value: id.storageGb })
    if (id.size !== UNKNOWN) specs.push({ key: 'size', value: id.size })
    const conditionLabel = id.condition === UNKNOWN ? null : String(id.condition)
    return {
      key: e.entityKey,
      name: entityName(e),
      config: g ? g.config : '',
      specs,
      condition: conditionLabel ? { key: CONDITION_KEY[conditionLabel] ?? null, label: conditionLabel } : null,
      matchesRequest: g ? g.matchesRequest : 'chua_ro',
      recommended: g ? g.recommended : false,
      priceLow: g ? nn(g.priceLow) : null,
      priceHigh: g ? nn(g.priceHigh) : null,
      image: entityImage(e),
      offers: e.offers.map(o => ({
        seller: nn(o.seller),
        url: nn(o.url),
        price: nn(o.price),
        currency: nn(o.currency),
        condition: nn(o.condition),
        rating: nn(o.evidence.signals.rating),
        ratingCount: nn(o.evidence.signals.reviewCount),
      })),
    }
  })

  const rec = s.recommendation
  const requested = payload.ban_hoi
  return {
    v: 1,
    entities,
    requested: typeof requested === 'string' && requested.trim() ? requested : null,
    recommendation: rec
      ? {
        entityKey: rec.entityKey,
        seller: nn(rec.seller),
        reasons: rec.reasons,
        tradeOff: rec.tradeOff,
        conditional: rec.conditional,
      }
      : null,
  }
}
