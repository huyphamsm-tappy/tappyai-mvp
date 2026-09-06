import type { Recommendation } from './recommendation'
import type { SourceId } from '@/lib/ai/consultative/evidenceProvenance'

// ── [TAPPY_PLACES] — the durable channel ─────────────────────────────────────
//
// The chat renders from message TEXT and persists ONLY text; `toolInvocations`
// is present on the live turn and gone after reload. So structured content
// travels as a marker block the server appends and the client parses — the same
// path `[TAPPY_PLAN]` and `[TAPPY_SHOPPING]` already use. The model never writes
// it; the app owns it.
//
// 🚨 GOVERNANCE. `shared/structured-content/marker-fixtures.json` is a shared
// conformance suite with three consumers (web, Android, iOS) and its rule 6 is
// explicit: adding a marker server-side requires all three clients updated in
// the same change. Android and iOS are out of scope for this task, so EMISSION
// IS FLAG-GATED OFF (`EMIT_TAPPY_PLACES` in config/product.ts). Nothing reaches
// a client that cannot strip it. See the implementation report for the exact
// fixture cases and native files the follow-up needs.

export const PLACES_MARKER_OPEN = '[TAPPY_PLACES]'
export const PLACES_MARKER_CLOSE = '[/TAPPY_PLACES]'

/** Schema version travels with the payload — a persisted block outlives its writer. */
export interface PlacesMarkerPayload {
  v: 1
  items: PersistedRecommendation[]
}

/** What actually gets written into the message. A projection, not the whole Recommendation. */
export interface PersistedRecommendation {
  id: string
  domain: string
  kind: string
  name?: string
  image?: string
  address?: string
  rating?: number
  ratingCount?: number
  openingHours?: string
  openNow?: boolean
  phone?: string
  priceLevel?: number
  distanceKm?: number
  rank: number
  shortlistPosition?: number
  recommended?: true
  matchVerdict?: string
  reasons?: { attribute: string; evidence: string }[]
  actions: { kind: string; urlKind: string; url: string; labelKey: string; platform?: string; attributed?: boolean }[]
}

/**
 * ── THE PERSISTENCE POLICY, AND WHY IT IS NOT A FORMALITY ────────────────────
 *
 * 🚨 GOOGLE PLACES CONTENT MUST NOT BE STORED. This repository already states
 * the rule, at `tools/common.ts`: "Places content (photos) must not be
 * pre-fetched, cached, or stored beyond the request — only place_id
 * (indefinitely) and lat/lng (<=30 days) are exempt."
 *
 * A marker frozen into a chat message is storage, permanently, by design. So a
 * field whose provenance is `google_places` CANNOT be written here, and this
 * function is where that is enforced rather than remembered.
 *
 * The consequence is real and is reported rather than worked around: for a
 * Google-sourced place the persisted payload keeps only the exempt identifiers
 * and the application's own derived values. Serper (`serper_*`) and OSM rows are
 * not subject to those terms and persist in full.
 */
export function mayPersist(source: SourceId | undefined): boolean {
  return source !== 'google_places'
}

/** Fields whose provenance is checked before they are written. */
const GUARDED: Array<[keyof PersistedRecommendation, string]> = [
  ['name', 'identity.name'],
  ['address', 'location.address'],
  ['rating', 'quality.rating'],
  ['ratingCount', 'quality.rating'],
  ['openingHours', 'availability.openingHours'],
  ['phone', 'attributes.phone'],
]

/**
 * Project one Recommendation into its persistable form.
 *
 * Everything the application computed itself — rank, match, reasons, and the
 * action URLs it constructed — is ours and always persists. Provider content
 * passes through `mayPersist` first.
 */
export function toPersisted(r: Recommendation): PersistedRecommendation {
  const e = r.entity
  const prov = e.provenance
  const out: PersistedRecommendation = {
    id: e.id,
    domain: e.domain,
    kind: e.kind,
    rank: r.rank,
    actions: r.contextualActions.map(a => ({
      kind: a.kind,
      urlKind: a.urlKind,
      url: a.url,
      labelKey: a.labelKey,
      ...(a.platform ? { platform: a.platform } : {}),
      ...(a.attributed !== undefined ? { attributed: a.attributed } : {}),
    })),
  }

  const candidate: Partial<PersistedRecommendation> = {
    name: e.identity.name || undefined,
    address: typeof e.location.address === 'string' ? e.location.address : undefined,
    rating: typeof e.quality.rating.value === 'number' ? e.quality.rating.value : undefined,
    ratingCount: typeof e.quality.ratingCount.value === 'number' ? e.quality.ratingCount.value : undefined,
    openingHours: typeof e.availability.openingHours.value === 'string' ? e.availability.openingHours.value : undefined,
    phone: e.attributes.phone,
  }
  // Assigned through a mutable alias rather than a cast: `Partial` already has
  // the right value type per key, so the copy is checked instead of asserted.
  const writable: Partial<PersistedRecommendation> = out
  for (const [field, path] of GUARDED) {
    if (candidate[field] !== undefined && mayPersist(prov[path])) {
      Object.assign(writable, { [field]: candidate[field] })
    }
  }

  // An image from a Google Photo redirect is Places content; a provider or
  // Serper image is not.
  const img = e.images.primary
  if (img && img.source !== 'google_photo') out.image = img.url

  // Application-derived and exempt values — always safe to write.
  if (typeof e.availability.openNow === 'boolean' && mayPersist(prov['availability.openingHours'])) out.openNow = e.availability.openNow
  if (e.pricing.priceLevel !== null && mayPersist(prov['pricing.priceLevel'])) out.priceLevel = e.pricing.priceLevel
  if (e.location.distanceKm !== null) out.distanceKm = e.location.distanceKm
  if (r.shortlistPosition !== null) out.shortlistPosition = r.shortlistPosition
  if (r.recommended) out.recommended = true
  if (r.matchVerdict) out.matchVerdict = r.matchVerdict
  if (r.reasons.length > 0) out.reasons = r.reasons

  return out
}

/** Server: the marker block carrying the payload as compact JSON. */
export function renderPlacesMarker(recs: Recommendation[]): string {
  const payload: PlacesMarkerPayload = { v: 1, items: recs.map(toPersisted) }
  return `${PLACES_MARKER_OPEN}${JSON.stringify(payload)}${PLACES_MARKER_CLOSE}`
}

/**
 * Removes any marker tag the block extraction below did not consume.
 *
 * A lone closing tag has no opening to anchor on, so the span logic never sees
 * it — and it would render as message body. Same defect `parseShoppingMarker`
 * had to fix, so it is handled the same way here from the start.
 */
function stripOrphanTags(text: string): string {
  const orphan = text.split(PLACES_MARKER_CLOSE).join('').split(PLACES_MARKER_OPEN).join('')
  return orphan === text ? text : orphan.trim()
}

/**
 * Client: pull the payload out of an assistant reply and return the text WITHOUT
 * the marker, so it never reaches formatMessage, TTS or copy.
 *
 * 🔑 STRIP IS UNCONDITIONAL AND INDEPENDENT OF DECODE — rule 1 of the shared
 * fixture contract. A block that cannot be decoded is still a block the user
 * must never read, so a malformed payload degrades to `{ text, payload: null }`
 * and never throws.
 */
export function parsePlacesMarker(content: string): { text: string; payload: PlacesMarkerPayload | null } {
  const open = content.indexOf(PLACES_MARKER_OPEN)
  if (open === -1) return { text: stripOrphanTags(content), payload: null }
  const from = open + PLACES_MARKER_OPEN.length
  const close = content.indexOf(PLACES_MARKER_CLOSE, from)
  const end = close === -1 ? content.length : close
  const text = (
    content.slice(0, open) + content.slice(close === -1 ? content.length : close + PLACES_MARKER_CLOSE.length)
  ).trim()
  try {
    const payload = JSON.parse(content.slice(from, end).trim()) as PlacesMarkerPayload
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return { text, payload: null }
    return { text, payload }
  } catch {
    return { text, payload: null }
  }
}
