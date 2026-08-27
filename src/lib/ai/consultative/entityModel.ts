import { UNKNOWN, type Known, type NormalizedEvidence } from './normalizedEvidence'

// ── Universal Plan — Phase 3: NORMALIZED EVIDENCE → ENTITY / OFFERS ──────────
//
// A generic, safe grouping layer. It takes the Phase-2 normalized rows and folds
// the ones that describe the SAME thing into a single Entity carrying many
// Offers, while keeping anything it cannot be sure about apart.
//
//   ENTITY  (a product/configuration, a restaurant, a trip option…)
//     └── OFFERS  (this seller, this price, this link)
//
// It groups NOTHING by title similarity and NOTHING by seller/domain/price. The
// only key it groups on is `identityKey` — the deterministic key Phase 2 built
// from the identity attributes a listing actually STATED — and only when Phase 2
// marked that identity certain. Everything else stays separate.
//
// ============================================================================
// THE SAFETY RULES (owner-approved, Phase 3)
// ============================================================================
//  · M1 ≠ M1 Pro, 16GB ≠ 32GB, 512GB ≠ 1TB, a different size ≠ the same — all of
//    these already live in `identityKey`, so grouping on it preserves them.
//  · Condition is IDENTITY-BEARING here: it is part of `identityKey`, so a used
//    unit and a genuine one do not merge. (A future policy could move condition
//    to the offer level; this one deliberately does not.)
//  · Unknown identity (`identityCertain === false`) is NEVER merged — each such
//    row becomes its own single-offer entity.
//  · Seller/domain/price establish nothing about identity.
//  · Similar titles are not evidence of the same entity.
//
// It does NOT rank, recommend or synthesise — that is Phase 4.

export interface Offer {
  seller: Known<string>
  url: Known<string>
  price: Known<number>
  currency: Known<string>
  /**
   * The offer's condition, copied from the row. Within a CERTAIN entity every
   * offer shares it (condition is in the identity key), so it is redundant there
   * but kept for traceability and for uncertain single-offer entities.
   */
  condition: Known<string>
  /** The full normalized row this offer came from — traceability. */
  evidence: NormalizedEvidence
}

export interface Entity {
  /** The identity key for a certain entity; a per-row synthetic key otherwise. */
  entityKey: string
  /** 'product' for shopping; the field is generic so other domains can extend it. */
  type: string
  /** The identity every offer here shares (the first row's, for a certain entity). */
  identity: NormalizedEvidence['identity']
  identityCertain: boolean
  offers: Offer[]
}

function toOffer(e: NormalizedEvidence): Offer {
  return {
    seller: e.offer.seller,
    url: e.offer.url,
    price: e.offer.price,
    currency: e.offer.currency,
    condition: e.identity.condition,
    evidence: e,
  }
}

/**
 * A stable per-offer key, for deduping the same listing appearing twice.
 *
 * A real URL identifies a listing exactly, so it wins. Without one, the same
 * seller at the same price and condition is treated as the same offer — two
 * genuinely distinct offers from one seller would differ on at least one of
 * those, and merging identical rows is the safe direction.
 */
function offerDedupeKey(o: Offer): string {
  if (o.url !== UNKNOWN) return `u:${o.url}`
  return `s:${o.seller}|p:${o.price}|c:${o.condition}`
}

/**
 * Fold normalized evidence into entities, each with its offers.
 *
 * Deterministic and order-preserving: entities appear in the order their first
 * row appeared, and offers in the order they were seen. Certain rows sharing an
 * identity key join one entity; uncertain rows each stand alone and never merge.
 */
export function groupIntoEntities(
  rows: readonly NormalizedEvidence[] | null | undefined,
  type = 'product',
): Entity[] {
  const entities: Entity[] = []
  const byKey = new Map<string, Entity>()
  if (!rows) return entities

  rows.forEach((e, i) => {
    if (e.identityCertain) {
      let ent = byKey.get(e.identityKey)
      if (!ent) {
        ent = { entityKey: e.identityKey, type, identity: e.identity, identityCertain: true, offers: [] }
        byKey.set(e.identityKey, ent)
        entities.push(ent)
      }
      const off = toOffer(e)
      const k = offerDedupeKey(off)
      if (!ent.offers.some(o => offerDedupeKey(o) === k)) ent.offers.push(off)
    } else {
      // Uncertain identity: its own entity, keyed uniquely so it can never merge
      // with anything — silence is not identity.
      entities.push({
        entityKey: `uncertain:${i}`,
        type,
        identity: e.identity,
        identityCertain: false,
        offers: [toOffer(e)],
      })
    }
  })

  return entities
}
