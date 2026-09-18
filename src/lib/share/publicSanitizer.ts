// ─────────────────────────────────────────────────────────────────────────────
// The privacy sanitizer: private AI result → public SharedResultPayload.
//
// Runs on the SERVER, at share time, BEFORE anything is persisted. Rendering
// never sanitizes — by the time /r/<slug> reads a row, the row is already
// public by construction.
//
// Input is the persisted assistant message text (and the user's question).
// That is deliberate: the persisted text has already been through the storage
// policy (`mayPersist` — Google Places content never enters a saved message),
// so the public snapshot inherits that guarantee instead of re-deriving it.
// The live places annotation (`tappy.places.v1`) is NOT an input here and must
// never become one: it carries Places content that may not be stored.
//
// Everything is deterministic. There is no model call in this file and there
// must never be one — the cost of a share is a few regexes and one INSERT.
// ─────────────────────────────────────────────────────────────────────────────

import { parsePlan } from '@/lib/structuredContent/parsePlan'
import { parseCTA, type CTAButton } from '@/lib/structuredContent/parseCta'
import { parseFollowups } from '@/lib/structuredContent/parseFollowups'
import { parseShoppingMarker, type SynthesisView } from '@/lib/ai/consultative/synthesisView'
import { parsePlacesMarker, type PlacesMarkerPayload } from '@/lib/recommendation/marker'
import type { TappyPlan, PlanItem } from '@/components/TripPlanCard'
import {
  PUBLIC_PAYLOAD_LIMITS,
  SHARED_RESULT_PAYLOAD_VERSION,
  isPublicActionUrl,
  isSharedResultDomain,
  type PublicButton,
  type SharedResultDomain,
  type SharedResultLocale,
  type SharedResultPayload,
} from './sharedResult'

export const REDACTED = '[đã ẩn]'

// ── PII redaction (text) ─────────────────────────────────────────────────────
//
// Patterns, not intelligence. Each is a shape that is almost never a useful
// public fact and almost always personal: an email, a phone number, a Vietnamese
// national id, a bank account, a street address stated in the first person.
// Business phone numbers on a place card live in structured fields, not prose,
// and are not touched by this.

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]{2,})+/g
// VN mobile/landline and international forms: 0xx xxx xxxx, +84 xx..., (028) ....
const PHONE_RE = /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b|\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g
// CCCD (12 digits) / CMND (9 digits) — a bare run of exactly those lengths.
const NATIONAL_ID_RE = /\b\d{12}\b|\b(?<!\d[\d.,])\d{9}\b(?![\d.,])/g
// Long digit runs (bank/card numbers) — 13+ digits with optional separators.
const LONG_NUMBER_RE = /\b(?:\d[ -]?){13,19}\b/g
// First-person address statements: "nhà tôi ở 12 Nguyễn Trãi", "my address is 12 ..."
const FIRST_PERSON_ADDRESS_RE = /\b(?:nhà (?:tôi|mình|em|anh|chị)|địa chỉ (?:của )?(?:tôi|mình|em)|(?:tôi|mình|em) (?:ở|sống ở|đang ở)|my (?:home|address|house)(?: is)?|i live (?:at|in))\b[^.\n,;]{0,80}/gi

export function redactPii(text: string): string {
  if (!text) return ''
  return text
    .replace(EMAIL_RE, REDACTED)
    .replace(FIRST_PERSON_ADDRESS_RE, REDACTED)
    .replace(LONG_NUMBER_RE, REDACTED)
    .replace(PHONE_RE, REDACTED)
    .replace(NATIONAL_ID_RE, REDACTED)
}

// ── Personal-context generalisation (query/title) ────────────────────────────
//
// The question is the most personal thing in a result ("plan for my wife and
// two kids, budget 2,500,000, near my office in District 7"). The public form
// keeps the ASK and drops the WHO/HOW MUCH. Deterministic and lossy on purpose;
// the preview shows the exact output and lets the user retitle before sharing.

const RELATION_VI = '(?:vợ|chồng|bạn gái|bạn trai|người yêu|con|bé|mẹ|ba|bố|gia đình|sếp|đồng nghiệp|bạn)'
const RELATION_EN = '(?:wife|husband|girlfriend|boyfriend|partner|kids?|children|mom|dad|parents|family|boss|colleagues?|friends?)'
const PERSONAL_FRAGMENTS: RegExp[] = [
  // relations: "cho vợ tôi", "với chồng và 2 con", "for my wife and two kids".
  // The "và …" tail is bounded to ONE more relation phrase so it can never eat the place name.
  new RegExp(String.raw`(?:^|\s)(?:cho|với|cùng)\s+(?:\d+\s+)?${RELATION_VI}(?:\s+(?:tôi|mình|em|anh|chị))?(?:\s+(?:và|,)\s+(?:\d+\s+)?${RELATION_VI}(?:\s+(?:tôi|mình|em))?)?(?=\s|[,.;!?]|$)`, 'gi'),
  new RegExp(String.raw`\b(?:for|with)\s+my\s+(?:\w+\s+)?${RELATION_EN}(?:\s+and\s+(?:\w+\s+)?${RELATION_EN})?\b`, 'gi'),
  // budgets: "ngân sách 2.500.000", "budget $50", "khoảng 500k"
  /(?:^|\s)(?:ngân sách|budget|tầm giá|giá khoảng|khoảng)\s*(?:là|of|is|:)?\s*[$€£]?\s*[\d.,]+\s*(?:k|nghìn|ngàn|triệu|tr|m|vnd|đ|₫|dollars?|\$)?(?=\s|[,.;!?]|$)/gi,
  /(?:^|\s)[\d.,]{4,}\s*(?:vnd|đ|₫)(?=\s|[,.;!?]|$)/gi,
  // first-person location: "gần nhà tôi", "gần công ty mình", "near my office"
  /(?:^|\s)(?:gần|quanh|cạnh)\s+(?:nhà|công ty|văn phòng|trường|chỗ)\s+(?:tôi|mình|em|anh|chị)(?=\s|[,.;!?]|$)/gi,
  /\bnear\s+my\s+(?:home|house|office|work|school|place)\b/gi,
  // a location the PII pass already redacted leaves a dangling preposition
  /(?:^|\s)(?:gần|quanh|cạnh|near|at)\s+\[đã ẩn\]/gi,
  // self references that become odd once the asker is gone
  /(?:^|\s)(?:của tôi|của mình|của em)(?=\s|[,.;!?]|$)/gi,
]

export function generalizeQuery(query: string): string {
  let out = redactPii(query)
  for (const re of PERSONAL_FRAGMENTS) out = out.replace(re, ' ')
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,.;!?])(?:\s*[,.;])+/g, '$1') // ",," and ", ," left by removed clauses
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim()
  return out
}

/** A headline from the (generalised) question: first clause, sentence case, capped. */
export function deriveTitle(publicQuery: string, fallback: string): string {
  const first = publicQuery.split(/[.!?\n]/)[0]?.trim() ?? ''
  const base = first.length >= 8 ? first : publicQuery.trim()
  const capped = base.length > PUBLIC_PAYLOAD_LIMITS.title ? `${base.slice(0, PUBLIC_PAYLOAD_LIMITS.title - 1).trimEnd()}…` : base
  const titled = capped ? capped.charAt(0).toUpperCase() + capped.slice(1) : ''
  return titled || fallback
}

// ── Images ───────────────────────────────────────────────────────────────────
//
// Google Places PHOTOS may not be stored (Places terms; see `mayPersist`). The
// shapes those take are excluded by host/path. A gstatic image-search thumbnail
// or a merchant CDN image is not Places content and may be kept.

const PLACES_PHOTO_RE = /googleusercontent\.com\/(?:p\/|places\/)|maps\.googleapis\.com|\/maps\/api\/place\/photo|ggpht\.com/i
const UNSERVABLE_RE = /\.blob\.vercel-storage\.com|^https?:\/\/(?:localhost|127\.|10\.|192\.168\.)/i

export function isStorableImageUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false
  if (PLACES_PHOTO_RE.test(url) || UNSERVABLE_RE.test(url)) return false
  try { new URL(url) } catch { return false }
  return true
}

const MD_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g

/** Lift image markdown out of prose. Returns the prose without images and the URLs found. */
export function extractImages(text: string): { text: string; images: string[] } {
  const images: string[] = []
  let m: RegExpExecArray | null
  while ((m = MD_IMAGE_RE.exec(text))) if (isStorableImageUrl(m[1]) && !images.includes(m[1])) images.push(m[1])
  const stripped = text.replace(MD_IMAGE_RE, '').replace(/\n{3,}/g, '\n\n')
  return { text: stripped, images }
}

// ── Structured blocks ────────────────────────────────────────────────────────

const BUTTON_TYPE_MAP: Record<string, PublicButton['type'] | null> = {
  maps: 'maps', website: 'website', booking: 'booking', search: 'search', call: 'call',
  // Private routes and app-only handoffs never leave the app.
  internal_booking: null, zalo: null,
}

export function sanitizeButtons(buttons: CTAButton[]): PublicButton[] {
  const out: PublicButton[] = []
  for (const b of buttons) {
    if (!b || typeof b.label !== 'string' || !b.label.trim()) continue
    const type = BUTTON_TYPE_MAP[String(b.type)] ?? null
    if (!type) continue
    if (!isPublicActionUrl(b.url)) continue
    if (out.some(o => o.url === b.url)) continue
    out.push({ label: redactPii(b.label).slice(0, 80), type, url: b.url, primary: !!b.primary })
    if (out.length >= PUBLIC_PAYLOAD_LIMITS.buttons) break
  }
  return out
}

function sanitizePlanItem(item: PlanItem): PlanItem {
  const out: PlanItem = {
    time: String(item.time ?? '').slice(0, 20),
    emoji: String(item.emoji ?? '').slice(0, 8),
    category: String(item.category ?? 'transport').slice(0, 20),
    name: redactPii(String(item.name ?? '')).slice(0, 120),
  }
  if (item.description) out.description = redactPii(String(item.description)).slice(0, 400)
  if (item.price) out.price = String(item.price).slice(0, 40)
  // A venue address is public information about the venue, not the user.
  if (item.address) out.address = String(item.address).slice(0, 200)
  if (isPublicActionUrl(item.maps_link)) out.maps_link = item.maps_link
  if (isPublicActionUrl(item.booking_link)) out.booking_link = item.booking_link
  // place_id is explicitly exempt from the Places storage restriction.
  if (item.place_id) out.place_id = String(item.place_id).slice(0, 200)
  if (isStorableImageUrl(item.photo_url)) out.photo_url = item.photo_url
  return out
}

export function sanitizePlan(plan: TappyPlan): TappyPlan {
  return {
    type: plan.type === 'evening' ? 'evening' : 'trip',
    title: redactPii(String(plan.title ?? '')).slice(0, 120),
    ...(typeof plan.people === 'number' ? { people: plan.people } : {}),
    // A plan's stated total is part of the plan, not the asker's finances — but it
    // is only kept when the plan itself declared it, never derived from the prompt.
    ...(plan.budget_total ? { budget_total: String(plan.budget_total).slice(0, 40) } : {}),
    days: (Array.isArray(plan.days) ? plan.days : []).slice(0, 14).map(d => ({
      label: String(d.label ?? '').slice(0, 60),
      items: (Array.isArray(d.items) ? d.items : []).slice(0, 20).map(sanitizePlanItem),
    })),
    ...(plan.cost_breakdown && typeof plan.cost_breakdown === 'object'
      ? { cost_breakdown: Object.fromEntries(Object.entries(plan.cost_breakdown).slice(0, 12).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 40)])) }
      : {}),
  }
}

export function sanitizeShopping(view: SynthesisView): SynthesisView {
  return {
    v: 1,
    entities: (view.entities ?? []).slice(0, 8).map(e => ({
      key: String(e.key ?? ''),
      ...(e.name ? { name: String(e.name).slice(0, 160) } : {}),
      config: String(e.config ?? '').slice(0, 160),
      ...(e.specs ? { specs: e.specs.slice(0, 8) } : {}),
      ...(e.condition !== undefined ? { condition: e.condition } : {}),
      matchesRequest: e.matchesRequest,
      recommended: !!e.recommended,
      priceLow: e.priceLow ?? null,
      priceHigh: e.priceHigh ?? null,
      image: isStorableImageUrl(e.image) ? e.image : null,
      offers: (e.offers ?? []).slice(0, 6).map(o => ({
        seller: o.seller ?? null,
        url: isPublicActionUrl(o.url) ? o.url : null,
        price: o.price ?? null,
        currency: o.currency ?? null,
        condition: o.condition ?? null,
        ...(o.rating !== undefined ? { rating: o.rating } : {}),
        ...(o.ratingCount !== undefined ? { ratingCount: o.ratingCount } : {}),
      })),
    })),
    recommendation: view.recommendation ?? null,
    ...(view.requested !== undefined ? { requested: view.requested } : {}),
  }
}

export function sanitizePlaces(p: PlacesMarkerPayload): PlacesMarkerPayload {
  return {
    v: 1,
    items: (p.items ?? []).slice(0, 8).map(item => ({
      ...item,
      // Distance depends on the sharer's GPS — request-scoped, never public.
      distanceKm: undefined,
      image: isStorableImageUrl(item.image) ? item.image : undefined,
      actions: (item.actions ?? []).filter(a => isPublicActionUrl(a.url)),
    })),
  }
}

// ── Body prose ───────────────────────────────────────────────────────────────

/** Strip any residual app marker, closed or orphaned, whatever its name. */
export function stripAllMarkers(text: string): string {
  return text
    .replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/gi, '')
    .replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*$/gi, '')
    .replace(/\[\/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]/gi, '')
}

// Lines that address the asker's stored context. Best-effort: the model is not
// asked to label memory use, so these are the phrasings it actually produces.
const MEMORY_LINE_RE = /^.*(?:dựa (?:trên|vào) (?:sở thích|thông tin|lịch sử|những gì)[^\n]*(?:của bạn|bạn đã)|(?:như|theo) (?:bạn|anh|chị) (?:đã )?(?:nói|chia sẻ|kể)|based on (?:your|what you)[^\n]*(?:preferences|told|shared|history)|(?:as|since) you (?:mentioned|told|said)).*$/gim

export function sanitizeBody(text: string): string {
  const stripped = stripAllMarkers(text)
    .replace(MEMORY_LINE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const redacted = redactPii(stripped)
  return redacted.length > PUBLIC_PAYLOAD_LIMITS.body
    ? `${redacted.slice(0, PUBLIC_PAYLOAD_LIMITS.body - 1).trimEnd()}…`
    : redacted
}

// ── The builder ──────────────────────────────────────────────────────────────

export interface BuildPublicPayloadInput {
  /** The user's question that produced the result — private; only its generalised form is kept. */
  userQuery: string
  /** The persisted assistant message text, markers included. */
  assistantContent: string
  domain?: string
  locale?: string
  /** A title the user typed in the preview. Redacted and capped like everything else. */
  title?: string
  createdAt?: Date
}

/**
 * Build the public payload. Pure and deterministic: same input, same output,
 * no I/O, no model. Never throws on malformed markers — they are stripped.
 */
export function buildPublicPayload(input: BuildPublicPayloadInput): SharedResultPayload {
  const domain: SharedResultDomain = isSharedResultDomain(input.domain) ? input.domain : 'general'
  const locale: SharedResultLocale = input.locale === 'en' ? 'en' : 'vi'

  const { text: afterPlan, plan } = parsePlan(input.assistantContent ?? '')
  const { text: afterCta, buttons } = parseCTA(afterPlan)
  const { text: afterFollowups, followups } = parseFollowups(afterCta)
  const { text: afterShopping, view: shopping } = parseShoppingMarker(afterFollowups)
  const { text: afterPlaces, payload: places } = parsePlacesMarker(afterShopping)
  const { text: prose, images: proseImages } = extractImages(afterPlaces)

  const publicQuery = generalizeQuery(input.userQuery ?? '').slice(0, PUBLIC_PAYLOAD_LIMITS.query) || (locale === 'en' ? 'A TappyAI answer' : 'Một câu trả lời của TappyAI')
  const requestedTitle = input.title ? redactPii(input.title).trim().slice(0, PUBLIC_PAYLOAD_LIMITS.title) : ''
  const title = requestedTitle || deriveTitle(publicQuery, locale === 'en' ? 'TappyAI result' : 'Kết quả từ TappyAI')

  const images: string[] = []
  const pushImage = (u: unknown) => { if (isStorableImageUrl(u) && !images.includes(u) && images.length < PUBLIC_PAYLOAD_LIMITS.images) images.push(u) }
  if (shopping) for (const e of shopping.entities ?? []) pushImage(e.image)
  if (plan) for (const d of plan.days ?? []) for (const i of d.items ?? []) pushImage(i.photo_url)
  if (places) for (const i of places.items ?? []) pushImage(i.image)
  for (const u of proseImages) pushImage(u)

  const payload: SharedResultPayload = {
    v: SHARED_RESULT_PAYLOAD_VERSION,
    title,
    query: publicQuery,
    domain,
    locale,
    body: sanitizeBody(prose),
    buttons: sanitizeButtons(buttons),
    images,
    suggestedQuestions: followups.map(f => redactPii(f).slice(0, 140)).filter(Boolean).slice(0, PUBLIC_PAYLOAD_LIMITS.suggestedQuestions),
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  }
  if (plan) payload.plan = sanitizePlan(plan)
  if (shopping) payload.shopping = sanitizeShopping(shopping)
  if (places && places.items?.length) payload.places = sanitizePlaces(places)
  return payload
}
