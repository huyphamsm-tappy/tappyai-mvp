import type { Recommendation, RecommendationReason } from './recommendation'
import type { EntityDomain, EntityKind } from './entity'
import type { Action } from './actions'
import { resolveActionLabel } from './actionLabel'
import { UNKNOWN } from '@/lib/ai/consultative/normalizedEvidence'

// ── The TRANSIENT view of a place decision ───────────────────────────────────
//
// 🚨 WHY THIS EXISTS INSTEAD OF `[TAPPY_PLACES]`, WHICH IS ALREADY BUILT.
//
// Every place turn already computes a full decision — a deterministic Pick, the
// reasons that decided it, the runner-up's trade-off, a shortlist of
// alternatives, match verdicts and real action URLs. None of it reached a user:
// the marker that carries it is flag-gated off (`EMIT_TAPPY_PLACES`) for two
// reasons that have NOT gone away, and neither is a formality:
//
//   1. A marker is a shared contract. `shared/structured-content/marker-fixtures.json`
//      rule 6: a new marker requires web, Android and iOS shipped together.
//      A client that cannot strip it renders raw JSON in the chat — twice a
//      production defect already.
//   2. A marker is PERMANENT STORAGE. It is frozen into the message text and
//      saved with the conversation, and Google Places terms forbid storing
//      Places content (see `mayPersist` in ./marker.ts). That is why the
//      persisted projection has to drop exactly the fields — name, address,
//      rating, hours — that make a card worth rendering.
//
// This view answers both by NOT being a marker. It travels as an AI-SDK message
// ANNOTATION (`8:` on the data stream), which means:
//
//   · it is never inside the message text, so nothing can leak into prose, TTS,
//     copy, or a native client's renderer — Android reads only `0:` frames
//     (RealChatRepository) and iOS maps every unknown prefix to `.unknown`
//     (StreamingClient), so both ignore it by construction rather than by luck;
//   · it is never persisted — the chat saves `{role, content}` only, so the card
//     lives for the session and disappears on reload, exactly the "cache for the
//     request, do not store" shape the Places terms require.
//
// It is a PROJECTION, not a second schema: every field is copied from the
// canonical entity the ranker already produced, or omitted. No ranking, no
// grouping, no scoring and no defaults are computed here.

export const PLACES_ANNOTATION_KIND = 'tappy.places.v1'

/** The amenities a row can state. Nothing is inferred; each maps to a provider field. */
export type PlaceFlag = 'wifi' | 'outdoorSeating' | 'vegetarian'

export interface LiveAction {
  kind: Action['kind']
  /** 'direct' vs 'search' — the honesty field, carried so labels cannot overpromise. */
  urlKind: Action['urlKind']
  url: string
  /**
   * The RESOLVED label key (`v3.action.purchaseLoginOn`, `v3.action.viewOn`, `v3.action.searchOn` …),
   * decided once here by `resolveActionLabel` from (kind, urlKind, url, platform, attributed,
   * commerce). Cross-platform CCP contract (14 Sep 2026): web re-resolves and gets the same key;
   * Android and iOS render this key from their own dictionaries and never re-derive the
   * decision — a native client has no label logic to drift.
   */
  labelKey: string
  /** The merchant the label names, when the key takes one (`{platform}`). */
  platform?: string
  attributed?: boolean
  /** CCP facts for a commerce handoff (label boundary + handoff event). Absent on every other action. */
  commerce?: Action['commerce']
}

/** One place, with only the fields its entity actually knows. */
export interface LivePlace {
  id: string
  domain: EntityDomain
  kind: EntityKind
  name: string
  image?: string
  address?: string
  rating?: number
  ratingCount?: number
  /**
   * Hotel CLASS, 1-5 — not a guest rating.
   *
   * 🚨 STAYS HAD NO QUALITY SIGNAL AT ALL ON THE CARD. `buildStayEntity`
   * records `quality.stars` from the provider and deliberately leaves
   * `rating`/`ratingCount` UNKNOWN, because Booking/Agoda guest scores are not
   * extracted and inventing one would be a fabricated fact. The projection then
   * dropped stars too, so a hotel rendered with no quality information whatever.
   * Carried separately from `rating` so the card can never present a class as a
   * review score.
   */
  stars?: number
  tappyRating?: { avg: number; count: number }
  openingHours?: string
  openNow?: boolean
  phone?: string
  priceLevel?: number
  /** A price seen in a search snippet. Weak evidence — the UI must label it as reference. */
  priceSignal?: string
  distanceKm?: number
  /** Provider categories, verbatim. Real values only — never a guessed cuisine. */
  categories?: string[]
  /** Boolean amenities the provider actually stated. The UI owns their wording. */
  flags?: PlaceFlag[]
  rank: number
  shortlistPosition?: number
  recommended?: true
  matchVerdict?: string
  reasons?: RecommendationReason[]
  tradeOff?: RecommendationReason
  actions: LiveAction[]
}

export interface PlacesLiveView {
  kind: typeof PLACES_ANNOTATION_KIND
  v: 1
  /** Lets each domain render its own information architecture from one payload. */
  domain: EntityDomain
  /**
   * 🚨 WHETHER THE ENGINE ACTUALLY RANKED THIS SET.
   *
   * False when rows were retrieved but nothing in them was scoreable, so the
   * order is the provider's and no position means anything. The card still
   * renders — see `buildPlacesLiveView` — but it must not print "#1", because
   * that is the claim RANK-07 exists to prevent.
   *
   * Optional so a payload written before the flag existed still type-checks, and
   * absent means ranked - which is what those payloads were.
   */
  ranked?: boolean
  /**
   * The whole ranked set, best first.
   *
   * 🚨 NOT JUST THE THREE ON SCREEN. The approved composition puts a filter row
   * above the cards ("Tất cả (8)"), and a filter that can only choose between the
   * three already rendered is decoration. The engine's order is preserved exactly;
   * the UI decides how many to show and which the filters admit, and never
   * reorders.
   */
  items: LivePlace[]
  /** The provider's own map search for this query, when the tool returned one. */
  mapsSearchUrl?: string
}

/** The provider already caps a place search at 8 rows; this is the same ceiling. */
const MAX_ITEMS = 8
/**
 * The approved action set per card: Maps, an order platform, website, call and a
 * review link, plus room for a second order platform.
 *
 * 🚨 THREE WAS TOO FEW ONCE THE KINDS WERE REAL. With ShopeeFood, GrabFood,
 * Maps, website, call and a review link all genuine, a cap of three kept the two
 * highest-priority order platforms and dropped the website and the phone
 * entirely. The kind-first pass in `liveActions` still guarantees variety before
 * a second platform of the same kind gets a slot.
 */
const MAX_ACTIONS = 6

const isHttpUrl = (u: unknown): u is string =>
  typeof u === 'string' && (u.startsWith('https://') || u.startsWith('http://'))

/**
 * A destination this action can actually open.
 *
 * 🚨 `tel:` IS A REAL DESTINATION, AND FILTERING IT OUT SILENTLY LOST THE PHONE.
 * `actions.ts` builds a `call` action from a place's phone number and states the
 * rule in as many words: "`tel:` is the one non-https scheme allowed, and only
 * for `call`". This projection then dropped every non-http URL, so a place that
 * published its number reached the card with no way to ring it — measured on a
 * live turn where the payload carried `phone` and no call action.
 *
 * The rule is mirrored here rather than relaxed: `call` must be `tel:`, and
 * everything else must still be http(s), so a `tel:` smuggled onto a website
 * action is still refused.
 */
const isUsableActionUrl = (kind: Action['kind'], url: unknown): url is string =>
  kind === 'call'
    ? typeof url === 'string' && url.startsWith('tel:') && url.length > 'tel:'.length
    : isHttpUrl(url)

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
/**
 * A string the entity actually knows.
 *
 * 🚨 `UNKNOWN` IS A STRING ('KHONG CO DU LIEU'), NOT `undefined`. A plain
 * `typeof v === 'string'` check therefore passes the sentinel straight through
 * and the card renders the words "KHONG CO DU LIEU" where an address should be —
 * the exact class of fabricated-looking field this projection exists to avoid.
 */
const str = (v: unknown): string | undefined =>
  (typeof v === 'string' && v !== UNKNOWN && v.trim().length > 0 ? v : undefined)

/**
 * A place's actions, filtered to the ones a user can actually follow.
 *
 * 🚨 A BUTTON WITHOUT A DESTINATION IS A LIE. The entity's action list is built
 * by deterministic builders, but a provider can still hand back an empty
 * `website_uri`, and nothing else in the pipeline drops it. Deduped by URL so
 * the same destination cannot appear twice under two labels.
 */
function liveActions(actions: readonly Action[], limit: number): LiveAction[] {
  if (limit <= 0) return []
  const seen = new Set<string>()
  const kinds = new Set<string>()
  const out: LiveAction[] = []
  // 🚨 ONE ACTION PER KIND FIRST. Measured on a live food turn: the entity's
  // three highest-priority actions were ShopeeFood, GrabFood and BeFood - all
  // `order`, all the same job - which filled the card and pushed Maps out
  // entirely. A user with three ways to do one thing and no way to do the others
  // has fewer choices, not more.
  // Within one kind, a DIRECT destination outranks a search for it.
  //
  // 🚨 MEASURED ON A TRAVEL TURN: a hotel offered "Tìm phòng trên
  // Booking.com" (a city-wide search) above "Đặt phòng" (that hotel's own page
  // on the same site). Both were real; the useful one was second. The domain
  // priority table still decides which KIND comes first - this only settles ties
  // inside a kind, and never reorders across kinds.
  const ordered = [...actions].sort((x, y) =>
    x.priority - y.priority
    || (x.urlKind === 'direct' ? 0 : 1) - (y.urlKind === 'direct' ? 0 : 1))
  for (const pass of [1, 2]) {
    for (const a of ordered) {
      if (out.length >= limit) break
      if (!isUsableActionUrl(a.kind, a.url) || seen.has(a.url)) continue
      if (pass === 1 && kinds.has(a.kind)) continue
      seen.add(a.url)
      kinds.add(a.kind)
      const label = resolveActionLabel(a)
      const platform = label.params?.platform ?? a.platform
      out.push({
        kind: a.kind,
        urlKind: a.urlKind,
        url: a.url,
        labelKey: label.key,
        ...(platform ? { platform } : {}),
        ...(a.attributed !== undefined ? { attributed: a.attributed } : {}),
        ...(a.commerce ? { commerce: a.commerce } : {}),
      })
    }
  }
  return out
}

/** Project one Recommendation. Every entry is a card, so every entry gets actions. */
function toLive(r: Recommendation, actionLimit: number): LivePlace {
  const e = r.entity
  const rating = num(e.quality.rating.value)
  const ratingCount = num(e.quality.ratingCount.value)
  const address = str(e.location.address as unknown)
  const hours = str(e.availability.openingHours.value as unknown)
  const priceSignal = str(e.pricing.priceSignal.value as unknown)
  const image = e.images.primary && isHttpUrl(e.images.primary.url) ? e.images.primary.url : undefined
  const categories = e.attributes.categories?.filter(c => typeof c === 'string' && c.length > 0)
  // Only amenities the provider stated. `EntityAttributes` is sparse by design:
  // a missing key means "not stated", never "no", so absence stays absence.
  const flags: PlaceFlag[] = []
  if (e.attributes.wifi) flags.push('wifi')
  if (e.attributes.outdoorSeating) flags.push('outdoorSeating')
  if (e.attributes.vegetarian) flags.push('vegetarian')

  return {
    id: e.id,
    domain: e.domain,
    kind: e.kind,
    name: e.identity.name,
    ...(image ? { image } : {}),
    ...(address ? { address } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
    ...(typeof e.quality.stars === 'number' ? { stars: e.quality.stars } : {}),
    ...(e.quality.tappyRating ? { tappyRating: e.quality.tappyRating } : {}),
    ...(hours ? { openingHours: hours } : {}),
    ...(typeof e.availability.openNow === 'boolean' ? { openNow: e.availability.openNow } : {}),
    ...(str(e.attributes.phone) ? { phone: e.attributes.phone } : {}),
    ...(e.pricing.priceLevel !== null && e.pricing.priceLevel !== undefined ? { priceLevel: e.pricing.priceLevel } : {}),
    ...(priceSignal ? { priceSignal } : {}),
    ...(e.location.distanceKm !== null && e.location.distanceKm !== undefined ? { distanceKm: e.location.distanceKm } : {}),
    ...(categories && categories.length > 0 ? { categories } : {}),
    ...(flags.length > 0 ? { flags } : {}),
    rank: r.rank,
    ...(r.shortlistPosition !== null ? { shortlistPosition: r.shortlistPosition } : {}),
    ...(r.recommended ? { recommended: true as const } : {}),
    ...(r.matchVerdict ? { matchVerdict: r.matchVerdict } : {}),
    ...(r.reasons.length > 0 ? { reasons: r.reasons } : {}),
    ...(r.tradeOff ? { tradeOff: r.tradeOff } : {}),
    actions: liveActions(r.contextualActions, actionLimit),
  }
}

/**
 * The one option the reply leads with.
 *
 * 🚨 THE PICK IS NOT THE ONLY WAY THE ENGINE CHOOSES, AND ASSUMING IT WAS MADE
 * THE CARD NEVER APPEAR. Measured on a live "quán cafe view đẹp" turn: the
 * ranker produced a three-item shortlist led by `best_overall`, `derivePick`
 * declined (a bare request states no criteria, so `hasDecidableNeed` is false),
 * and the reply still opened "I'd lean toward Cà Phê AnAn" — because prompt rule
 * R1b REQUIRES a decision-first sentence naming `shortlist[0]` in exactly that
 * case. A card that rendered only for a Pick would have sat out the turn its
 * own reply was already deciding.
 *
 * So the lead mirrors the engine, and nothing more:
 *   · the Pick, when `derivePick` made one;
 *   · else the head of the shortlist, which is the top of the ranker's own order.
 *
 * 🚨 THE ROLE LABEL IS NOT A PRECONDITION, AND REQUIRING IT EMPTIED THE CARD.
 * Measured on "Quán cafe view đẹp ở Quận 1": ten OSM rows with no rating and no
 * price, so `shortlistCandidates` could not justify `best_overall` / `value_gem`
 * for any of them and returned `role: null` three times — while still naming
 * which three, in which order. Keying the lead to the label threw that order
 * away and showed nothing. The order is the engine's answer; the label is only
 * its explanation of the order.
 *
 * What still yields NO card: no shortlist at all — flights, transport, and any
 * turn the ranker declined (fewer than two candidates, nothing rankable). There
 * the engine did not order anything, and `#1` would be this layer's invention.
 * `recommended` stays reserved for a real Pick, so the card's own emphasis never
 * claims more than `derivePick` did.
 */
function primaryOf(recs: readonly Recommendation[]): Recommendation | undefined {
  const picked = recs.find(r => r.recommended)
  if (picked) return picked
  const shortlisted = recs
    .filter(r => r.shortlistPosition !== null)
    .sort((a, b) => (a.shortlistPosition ?? 0) - (b.shortlistPosition ?? 0))
  return shortlisted[0]
}

/**
 * The turn's place decision, or `null` when there is no decision to show.
 *
 * 🚨 NULL IS A RESULT, NOT A FAILURE. Flights and intercity transport have no
 * deterministic ranking at all, and a place turn with fewer than two candidates
 * never reaches the ranker — in every one of those cases the engine did not
 * choose, and rendering a "Tappy's Pick" anyway would be the product inventing a
 * decision it did not make. Shopping is excluded for the opposite reason: it
 * already has its own decision card and must not get a second one.
 */
export function buildPlacesLiveView(
  recs: readonly Recommendation[],
  opts: { mapsSearchUrl?: string } = {},
): PlacesLiveView | null {
  if (!Array.isArray(recs) || recs.length === 0) return null

  /**
   * 🚨 NO RANKING IS NOT THE SAME AS NOTHING TO SHOW.
   *
   * This returned null whenever the ranker declined, and null meant the card did
   * not render — so `applyPlaceEnrichmentStreamFilter` fell back to injecting
   * loose images and bare links into the prose. Measured on localhost
   * 2026-09-08: "Trung tâm mua sắm lớn Sài Gòn" retrieved 10 real malls and
   * "rạp chiếu phim ở TP.HCM" retrieved 4 real cinemas (CGV, Cinestar, Galaxy),
   * and BOTH rendered as the old prose-plus-photo layout with no card at all.
   * The spa turn rendered that way too, which is how an unrelated suggestive
   * image ended up beside a massage answer.
   *
   * RANK-07 is about not dressing provider order up as a SCORE, and that rule is
   * kept exactly: `ranked: false` travels with the payload and the card drops its
   * position badges. What changes is only that real retrieved places are shown in
   * the product's own composition rather than dumped into prose.
   */
  const lead = primaryOf(recs)
  // A PRODUCT lead means this turn's decision belongs to Shopping, which renders
  // its own card. Returning a places card here would put a second, competing
  // decision on screen — so this stays null exactly as it always did.
  if (lead && lead.entity.kind === 'product') return null
  const usable = recs.filter(r => r.entity.kind !== 'product' && r.entity.identity.name.trim())
  if (usable.length === 0) return null
  if (!lead || !lead.entity.identity.name.trim()) {
    return {
      kind: PLACES_ANNOTATION_KIND,
      v: 1,
      domain: usable[0].entity.domain,
      ranked: false,
      items: usable.map(r => toLive(r, MAX_ACTIONS)).slice(0, MAX_ITEMS),
      ...(isHttpUrl(opts.mapsSearchUrl) ? { mapsSearchUrl: opts.mapsSearchUrl } : {}),
    }
  }

  // The engine's order, with the lead first. `rank` already carries that order;
  // the lead is moved to the front rather than re-scored, because on a
  // shortlist-led turn the head of the shortlist is not always rank 0.
  const rest = recs
    .filter(r => r !== lead && r.entity.identity.name.trim() && r.entity.kind !== 'product')
    .sort((a, b) => a.rank - b.rank)

  return {
    kind: PLACES_ANNOTATION_KIND,
    v: 1,
    domain: lead.entity.domain,
    ranked: true,
    items: [lead, ...rest].slice(0, MAX_ITEMS).map(r => toLive(r, MAX_ACTIONS)),
    ...(isHttpUrl(opts.mapsSearchUrl) ? { mapsSearchUrl: opts.mapsSearchUrl } : {}),
  }
}

/**
 * Client: find the view among a message's annotations.
 *
 * Defensive by contract — annotations are an open channel, so anything
 * unrecognised, malformed or half-arrived degrades to `null` rather than
 * throwing inside a render.
 */
export function readPlacesLiveView(annotations: unknown[] | undefined | null): PlacesLiveView | null {
  if (!Array.isArray(annotations)) return null
  for (const a of annotations) {
    if (!a || typeof a !== 'object') continue
    const candidate = a as Partial<PlacesLiveView>
    if (candidate.kind !== PLACES_ANNOTATION_KIND) continue
    const items = Array.isArray(candidate.items)
      ? candidate.items
        .filter(x => x && typeof x.name === 'string' && x.name)
        .map(x => ({ ...x, actions: Array.isArray(x.actions) ? x.actions : [] }))
      : []
    if (items.length === 0) continue
    return {
      kind: PLACES_ANNOTATION_KIND,
      v: 1,
      domain: (candidate.domain ?? 'food') as EntityDomain,
      // Absent on payloads written before the flag existed: those WERE ranked.
      ranked: candidate.ranked !== false,
      items,
      ...(isHttpUrl(candidate.mapsSearchUrl) ? { mapsSearchUrl: candidate.mapsSearchUrl } : {}),
    }
  }
  return null
}
