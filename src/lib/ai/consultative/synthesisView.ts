import { UNKNOWN } from './normalizedEvidence'
import type { ShoppingSynthesis, EntitySummary, ConfigMatch } from './synthesis'
import { buildSynthesisPayload } from './synthesis'

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
}

export interface SynthesisEntityView {
  key: string
  config: string
  matchesRequest: ConfigMatch
  recommended: boolean
  priceLow: number | null
  priceHigh: number | null
  offers: SynthesisOfferView[]
}

export interface SynthesisRecommendationView {
  entityKey: string | null
  seller: string | null
  reasons: { attribute: string; evidence: string }[]
  tradeOff: { attribute: string; evidence: string } | null
  conditional: boolean
}

export interface SynthesisView {
  v: 1
  entities: SynthesisEntityView[]
  recommendation: SynthesisRecommendationView | null
}

/** UNKNOWN → null; everything else through unchanged. */
function nn<T>(v: T | typeof UNKNOWN): T | null {
  return v === UNKNOWN ? null : (v as T)
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
    return {
      key: e.entityKey,
      config: g ? g.config : '',
      matchesRequest: g ? g.matchesRequest : 'chua_ro',
      recommended: g ? g.recommended : false,
      priceLow: g ? nn(g.priceLow) : null,
      priceHigh: g ? nn(g.priceHigh) : null,
      offers: e.offers.map(o => ({
        seller: nn(o.seller),
        url: nn(o.url),
        price: nn(o.price),
        currency: nn(o.currency),
        condition: nn(o.condition),
      })),
    }
  })

  const rec = s.recommendation
  return {
    v: 1,
    entities,
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
