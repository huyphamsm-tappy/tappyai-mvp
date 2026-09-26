// ── CAPABILITY BOOLEANS — what the model may know, without what it may write ─
//
// The AI/deterministic boundary already carves photos and links out of the
// model-facing payload (see toolResultSplit). That leaves a gap the boundary
// created: the model can no longer tell whether a place is orderable, so any
// sentence it writes about ordering is generated from a prompt template rather
// than from evidence.
//
// 🔑 The fix is the one already proven in production by `has_tiktok_review`:
// hand over the BOOLEAN, keep the URL. The model learns what is possible and
// still cannot invent a link, because it never sees one.
//
// Every flag below is derived from the SAME carved values the application will
// build its buttons from. That is the whole safety property: a capability cannot
// claim an action the app did not actually build, because it is computed from
// the built action's own presence.

/** The carved shape these flags are derived from. Structural, so both the split layer and the
 *  entity builder can pass what they hold without adapting to each other. */
export interface CapabilitySource {
  /** Present on every real row; unused here, but accepting it keeps callers from having to strip it. */
  name?: string
  order_links?: { name: string; url: string }[]
  platform_links?: { name: string; url: string }[]
  photo_urls?: string[]
  photo_url?: string
  photo_names?: string[]
  tiktok_review_url?: string
  has_tiktok_review?: boolean
  website_uri?: string
  maps_link?: string
  place_id?: string
  booking_link?: string
  /** CCP row attachment (P6-B). Presence is the capability; the URLs stay carved. */
  commerce_links?: readonly unknown[]
  link?: string
  opening_hours?: string
  phone?: string
}

/**
 * What the model is told.
 *
 * 🚨 Absent means absent. A flag is emitted only when it is TRUE — a payload of
 * `has_order: false` on every non-food place is noise the model pays for, and
 * silence already reads as "no" to a model that was never told otherwise. The
 * one exception is `has_reviews`, which mirrors the existing tri-state review
 * ladder and must distinguish "a verified review exists" from "only a search".
 */
export interface Capabilities {
  has_order?: true
  has_delivery?: true
  has_booking?: true
  has_purchase?: true
  has_maps?: true
  has_website?: true
  has_photo?: true
  has_hours?: true
  has_phone?: true
  /**
   * 'verified' — an attributed piece of review content exists.
   * 'search'   — only a public search URL exists; the model must not call it "the review".
   * Omitted    — nothing at all.
   */
  has_reviews?: 'verified' | 'search'
  /**
   * The Commerce Capability Platform resolved a verified merchant handoff for
   * this row — the app will render it as a button. The model may say a direct
   * booking/purchase is possible; it never sees, and must never write, the URL.
   */
  has_direct_handoff?: true
}

const some = <T>(a: T[] | undefined) => Array.isArray(a) && a.length > 0

/**
 * Derive the model-facing capability flags for one result row.
 *
 * Pure, total and never throws: an unexpected shape yields fewer flags, never a
 * wrong one. Nothing here consults the network, the clock or the user.
 */
export function capabilitiesOf(src: CapabilitySource): Capabilities {
  const caps: Capabilities = {}

  // Ordering and delivery are the same real capability today — one set of
  // platform links reaches a page where both happen. They are separate fields
  // because a future direct-order integration would separate them, and a flag
  // that means two things cannot be split later without changing its meaning.
  if (some(src.order_links)) { caps.has_order = true; caps.has_delivery = true }

  // A booking link is travel's equivalent, and a product `link` is shopping's.
  if (src.booking_link) caps.has_booking = true
  if (src.link) caps.has_purchase = true

  if (src.maps_link || src.place_id) caps.has_maps = true
  if (src.website_uri) caps.has_website = true
  if (src.photo_url || some(src.photo_urls) || some(src.photo_names)) caps.has_photo = true
  if (src.opening_hours) caps.has_hours = true
  if (src.phone) caps.has_phone = true

  // 🔑 `attributed` semantics, preserved. `reviewActionsForPlace` already draws
  // this line: a verified TikTok/YouTube/Facebook URL is content, a YouTube
  // search is a place to look. Collapsing them here would let the model say
  // "here's the review" about a search page — the exact claim the review ladder
  // was built to prevent.
  if (Array.isArray(src.commerce_links) && src.commerce_links.length > 0) caps.has_direct_handoff = true
  if (src.has_tiktok_review && src.tiktok_review_url) caps.has_reviews = 'verified'
  else if (src.maps_link || src.website_uri || src.place_id) caps.has_reviews = 'search'

  return caps
}
