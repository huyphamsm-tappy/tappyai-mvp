// ─────────────────────────────────────────────────────────────────────────────
// SharedResultPayload — the ONE public result model.
//
// This is what `shared_results.payload` holds, what /r/<slug> renders, what the
// OG card is composed from, and what the Zalo Mini App consumes. It is a
// FROZEN SNAPSHOT: written once by the sanitizer at share time, never
// regenerated, never re-read from the private conversation.
//
// Everything here is a PROJECTION of content the product already produced —
// the persisted assistant message and its markers. No field is filled by a
// model at share or render time; a public view therefore costs zero inference.
//
// 🚨 WHAT CAN NEVER BE IN THIS OBJECT (enforced by `validateSharedResultPayload`
// and the sanitizer tests): user ids, anon ids, session ids, memory, stored
// preferences, emails, phone numbers of the user, auth tokens, internal
// prompts, private API responses, Google Places photo URLs (storage terms).
// ─────────────────────────────────────────────────────────────────────────────

import type { TappyPlan } from '@/components/TripPlanCard'
import type { SynthesisView } from '@/lib/ai/consultative/synthesisView'
import type { PlacesMarkerPayload } from '@/lib/recommendation/marker'
import type { EntityDomain } from '@/lib/recommendation/entity'

export const SHARED_RESULT_PAYLOAD_VERSION = 1 as const

export type SharedResultDomain = EntityDomain | 'general'
export type SharedResultLocale = 'vi' | 'en'

/** An outbound action a viewer can take. Only https (or tel:) URLs survive sanitization. */
export interface PublicButton {
  label: string
  type: 'maps' | 'website' | 'booking' | 'search' | 'call'
  url: string
  primary: boolean
}

export interface SharedResultPayload {
  v: typeof SHARED_RESULT_PAYLOAD_VERSION
  /** Public headline. User-editable in the preview; PII-redacted server-side regardless. */
  title: string
  /** The public form of the question. Redacted; never the raw prompt. */
  query: string
  domain: SharedResultDomain
  locale: SharedResultLocale
  /** Markdown prose, markers stripped, PII redacted, images lifted out. */
  body: string
  buttons: PublicButton[]
  /** Up to 3 https image URLs from stable, storable providers. */
  images: string[]
  /** Suggested follow-up questions the model offered — seeds for "Hỏi Tappy câu khác". */
  suggestedQuestions: string[]
  plan?: TappyPlan
  shopping?: SynthesisView
  places?: PlacesMarkerPayload
  /** ISO timestamp of the underlying result. */
  createdAt: string
}

export const PUBLIC_PAYLOAD_LIMITS = {
  title: 120,
  query: 200,
  body: 12_000,
  buttons: 8,
  images: 3,
  suggestedQuestions: 3,
  /** Hard cap on the serialized payload. Bigger means something leaked in. */
  bytes: 64_000,
} as const

/**
 * Keys that must not appear ANYWHERE in a public payload tree, at any depth.
 * Case-insensitive. Deliberately broad: a false positive costs one refused
 * share; a false negative publishes something private.
 */
export const FORBIDDEN_PAYLOAD_KEYS: readonly string[] = [
  'user_id', 'userid', 'owner_id', 'anon_id', 'anonid', 'session_id', 'sessionid',
  'conversation_id', 'conversationid', 'memory', 'memories', 'preferences', 'user_preferences',
  'email', 'phone_number', 'access_token', 'refresh_token', 'token', 'jwt', 'authorization',
  'system_prompt', 'prompt', 'decisionevidenceid', 'decision_evidence_id', 'userlocation', 'user_location',
  'ip', 'device_context', 'raw',
]

const FORBIDDEN = new Set(FORBIDDEN_PAYLOAD_KEYS.map(k => k.toLowerCase()))

/** Walk an object tree and return the first forbidden key found, or null. */
export function findForbiddenKey(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(k.toLowerCase())) return path ? `${path}.${k}` : k
      const hit = findForbiddenKey(v, path ? `${path}.${k}` : k)
      if (hit) return hit
    }
  }
  return null
}

const DOMAINS: ReadonlySet<string> = new Set(['food', 'shopping', 'travel', 'entertainment', 'spa', 'general'])
const BUTTON_TYPES: ReadonlySet<string> = new Set(['maps', 'website', 'booking', 'search', 'call'])

export function isSharedResultDomain(v: unknown): v is SharedResultDomain {
  return typeof v === 'string' && DOMAINS.has(v)
}

/** https only for the web; `tel:` is allowed for the call button. Nothing else. */
export function isPublicActionUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  if (/^tel:\+?[\d\s-]{6,20}$/.test(url)) return true
  if (!/^https:\/\//i.test(url)) return false
  try {
    const u = new URL(url)
    // Never publish a link back into a private TappyAI surface.
    if (/(^|\.)tappyai\.(com|vn)$/i.test(u.hostname) && /^\/(api|chat|admin|auth|login|profile|messages)(\/|$)/i.test(u.pathname)) return false
    return true
  } catch { return false }
}

/**
 * Structural validation of a payload about to be persisted or rendered.
 * Returns a reason string when invalid, null when valid. Pure.
 */
export function validateSharedResultPayload(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'not_an_object'
  const x = p as Record<string, unknown>
  if (x.v !== SHARED_RESULT_PAYLOAD_VERSION) return 'bad_version'
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.length > PUBLIC_PAYLOAD_LIMITS.title) return 'bad_title'
  if (typeof x.query !== 'string' || !x.query.trim() || x.query.length > PUBLIC_PAYLOAD_LIMITS.query) return 'bad_query'
  if (!isSharedResultDomain(x.domain)) return 'bad_domain'
  if (x.locale !== 'vi' && x.locale !== 'en') return 'bad_locale'
  if (typeof x.body !== 'string' || x.body.length > PUBLIC_PAYLOAD_LIMITS.body) return 'bad_body'
  if (!Array.isArray(x.buttons) || x.buttons.length > PUBLIC_PAYLOAD_LIMITS.buttons) return 'bad_buttons'
  for (const b of x.buttons as unknown[]) {
    const btn = b as Record<string, unknown>
    if (!btn || typeof btn.label !== 'string' || !BUTTON_TYPES.has(String(btn.type)) || !isPublicActionUrl(btn.url)) return 'bad_button'
  }
  if (!Array.isArray(x.images) || x.images.length > PUBLIC_PAYLOAD_LIMITS.images) return 'bad_images'
  for (const img of x.images as unknown[]) if (typeof img !== 'string' || !/^https:\/\//i.test(img)) return 'bad_image'
  if (!Array.isArray(x.suggestedQuestions) || x.suggestedQuestions.length > PUBLIC_PAYLOAD_LIMITS.suggestedQuestions) return 'bad_suggestions'
  if (typeof x.createdAt !== 'string' || Number.isNaN(Date.parse(x.createdAt))) return 'bad_created_at'
  // A residual marker means the sanitizer did not run, or ran on the wrong input.
  if (/\[\/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]/i.test(x.body as string)) return 'marker_in_body'
  const forbidden = findForbiddenKey(p)
  if (forbidden) return `forbidden_key:${forbidden}`
  if (JSON.stringify(p).length > PUBLIC_PAYLOAD_LIMITS.bytes) return 'too_large'
  return null
}

/** What the public page and the OG card actually need from a row. Never `owner_id`. */
export interface PublicSharedResult {
  id: string
  slug: string
  query: string
  payload: SharedResultPayload
  domain: SharedResultDomain
  locale: SharedResultLocale
  og_version: number
  view_count: number
  ask_count: number
  created_at: string
}

/** A hub/sitemap listing row. Public fields only — safe for a client component to type against. */
export interface PublicSharedResultSummary {
  slug: string
  title: string
  query: string
  domain: string
  locale: string
  created_at: string
  image: string | null
}

/** The columns a public read is allowed to project. `owner_id`/`status` are deliberately absent. */
export const PUBLIC_SHARED_RESULT_COLUMNS = 'id, slug, query, payload, domain, locale, og_version, view_count, ask_count, created_at'
