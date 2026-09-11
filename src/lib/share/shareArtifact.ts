import type { LivePlace, PlacesLiveView } from '@/lib/recommendation/liveView'
import type { TappyPlan } from '@/components/TripPlanCard'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { BRAND, absoluteUrl } from './openGraph'

// ── THE ONE CANONICAL TAPPYAI SHARE ARTIFACT ─────────────────────────────────
//
// 🚨 WHAT THIS REPLACES. `MessageActionBar.handleShare` called
// `navigator.share({ text: stripMd(text) })` — the reply's prose with the
// markdown stripped — and on Windows that opened the OS share sheet listing
// Nearby Sharing, Teams, Outlook and Copilot. Nothing about the recommendation
// survived: no card, no rating, no address, no links, no TappyAI identity. The
// same call shipped on Android (`ACTION_SEND text/plain`) and iOS
// (`UIActivityViewController([stripped])`).
//
// 🔑 ONE ARTIFACT, MANY DELIVERIES. Every target — email, Zalo, Viber, Messenger,
// LINE, the Tappy Inbox, Save, Copy, the OS sheet — receives the SAME object.
// `text` is the canonical form because it is the only form every channel can
// carry without a server: a mailto body, a chat message body, a clipboard, a
// `viber://forward?text=`, a `line.me/R/share?text=`, an `ACTION_SEND`. `image`
// is optional enrichment and can never be a prerequisite for any target.
//
// 🚨 WHITELIST, NEVER BLACKLIST. `SharedPlace` below names every field that may
// leave the app, and `pickPlace` copies exactly those. Provenance, evidence
// types, scopes, verdicts, ranks, entity ids, `_tappy_*`, conversation ids —
// none of them has a field to land in, so "did we remember to strip this?" is
// not a question any call site answers. That is the same design as
// `buildPrivateMetadata`: a function that cannot be handed the data cannot leak it.
//
// 🚨 `distanceKm` IS EXCLUDED FOR PRIVACY. "1.2 km từ chỗ bạn" is a fact about
// the SENDER's position, not about the venue, and a recipient can triangulate
// from a few of them. It is not in `SharedPlace`, so it cannot be shared.
//
// 🚨 NO SERVER SNAPSHOT. The card's data is live-only under the Places/Maps
// terms (see liveView.ts and serperPlaces.ts). This module never persists, and
// the `url` is the BRAND entry point — the only URL `isShareableUrl` admits —
// not a per-recommendation page that does not and must not exist.

export type ShareLang = 'vi' | 'en'

export interface ShareArtifact {
  /** Email subject / share title. */
  subject: string
  /** The canonical branded brochure. Everything else is derived from this. */
  text: string
  /** The brand entry point — admitted by `isShareableUrl`, never a private route. */
  url: string
  /** Optional rendered card. Absent whenever rendering is unavailable or failed. */
  image?: Blob
  /** What kind of thing this is, for previews. */
  kind: 'places' | 'plan'
  /** The user-facing title (place query subject or plan title). */
  title: string
  /** The whitelisted entities, for the preview to render. */
  places: SharedPlace[]
}

/**
 * The ONLY fields of a place that may leave the app.
 *
 * Every entry is user-facing information the card already shows. Adding a field
 * here is a product decision, not a convenience.
 */
export interface SharedPlace {
  name: string
  category?: string
  rating?: number
  ratingCount?: number
  address?: string
  phone?: string
  openingHours?: string
  priceRangeText?: string
  /** Why Tappy recommended it, in the ranker's own words. */
  reasons?: string[]
  /** Only https links that pass the URL guard. Kind decides the label. */
  links: SharedLink[]
  /** Card image URL, for previews. Never drawn to canvas without a CORS check. */
  image?: string
}

export type SharedLinkKind = 'maps' | 'website' | 'review' | 'order' | 'booking' | 'ticket' | 'reservation'

export interface SharedLink {
  kind: SharedLinkKind
  url: string
  /** 'TikTok', 'ShopeeFood' — present when the action carried one. */
  platform?: string
}

/** Action kinds that are worth sharing, and only these. `call` is the phone, already a field. */
const SHARED_ACTION_KINDS = new Set<SharedLinkKind>(['maps', 'website', 'review', 'order', 'booking', 'ticket', 'reservation'])

/**
 * Whitelist one place. Reads named fields; never spreads.
 *
 * Links are re-checked with `isSafeHttpsUrl` even though `liveActions` already
 * did — this is the boundary where data leaves the app, and a second cheap
 * check here costs nothing next to the cost of being wrong.
 */
export function pickPlace(p: LivePlace): SharedPlace {
  const links: SharedLink[] = []
  const seen = new Set<string>()
  for (const a of p.actions) {
    if (!SHARED_ACTION_KINDS.has(a.kind as SharedLinkKind)) continue
    // Only DIRECT destinations are worth a recipient's tap. A "search on
    // ShopeeFood" URL is a search page, honest on our card, noise in a message.
    if (a.urlKind !== 'direct') continue
    if (!isSafeHttpsUrl(a.url) || seen.has(a.url)) continue
    seen.add(a.url)
    links.push({ kind: a.kind as SharedLinkKind, url: a.url, ...(a.platform ? { platform: a.platform } : {}) })
  }
  return {
    name: p.name,
    ...(p.categories?.[0] ? { category: p.categories[0] } : {}),
    ...(typeof p.rating === 'number' ? { rating: p.rating } : {}),
    ...(typeof p.ratingCount === 'number' ? { ratingCount: p.ratingCount } : {}),
    ...(p.address ? { address: p.address } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.openingHours ? { openingHours: p.openingHours } : {}),
    ...(p.priceRangeText ? { priceRangeText: p.priceRangeText } : {}),
    ...(p.reasons?.length ? { reasons: p.reasons.map(r => r.evidence).filter(Boolean) } : {}),
    ...(p.image && isSafeHttpsUrl(p.image) ? { image: p.image } : {}),
    links,
  }
}

// ── TEXT ─────────────────────────────────────────────────────────────────────

const L = {
  vi: {
    recommends: 'TappyAI gợi ý',
    plan: 'Kế hoạch từ TappyAI',
    reviews: 'đánh giá',
    why: 'Vì sao',
    maps: 'Bản đồ',
    website: 'Website',
    review: 'Review',
    order: 'Đặt món',
    booking: 'Đặt phòng',
    ticket: 'Mua vé',
    reservation: 'Đặt chỗ',
    more: 'và {n} địa điểm khác',
    footer: 'Gợi ý bởi TappyAI · {url}',
    people: '{n} người',
    budget: 'Ngân sách',
  },
  en: {
    recommends: 'TappyAI recommends',
    plan: 'A plan from TappyAI',
    reviews: 'reviews',
    why: 'Why',
    maps: 'Maps',
    website: 'Website',
    review: 'Review',
    order: 'Order',
    booking: 'Book',
    ticket: 'Tickets',
    reservation: 'Reserve',
    more: 'and {n} more',
    footer: 'Recommended by TappyAI · {url}',
    people: '{n} people',
    budget: 'Budget',
  },
} as const

/** Platform names that only restate the link kind — "Website (Official Website)" says nothing twice. */
const GENERIC_PLATFORMS = new Set(['website', 'official website', 'maps', 'google maps'])

const linkLabel = (lang: ShareLang, l: SharedLink): string => {
  const base = L[lang][l.kind]
  const platform = l.platform && !GENERIC_PLATFORMS.has(l.platform.trim().toLowerCase()) ? l.platform : undefined
  return platform ? `${base} (${platform})` : base
}

/** One place, as brochure lines. Deterministic: same input, same text. */
export function placeBlock(p: SharedPlace, index: number, lang: ShareLang): string {
  const d = L[lang]
  const head: string[] = [`${index + 1}. ${p.name}`]
  const meta: string[] = []
  if (typeof p.rating === 'number') {
    meta.push(`★ ${p.rating}${typeof p.ratingCount === 'number' ? ` (${p.ratingCount.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')} ${d.reviews})` : ''}`)
  }
  if (p.category) meta.push(p.category)
  if (p.priceRangeText) meta.push(p.priceRangeText)
  if (meta.length) head.push(`   ${meta.join(' · ')}`)
  if (p.address) head.push(`   📍 ${p.address}`)
  if (p.openingHours) head.push(`   🕐 ${p.openingHours}`)
  if (p.phone) head.push(`   ☎ ${p.phone}`)
  if (p.reasons?.length) head.push(`   ${d.why}: ${p.reasons.join(' · ')}`)
  for (const l of p.links) head.push(`   ${linkLabel(lang, l)}: ${l.url}`)
  return head.join('\n')
}

function footer(lang: ShareLang, url: string): string {
  return L[lang].footer.replace('{url}', url.replace(/^https?:\/\//, ''))
}

/**
 * The brochure for a set of places.
 *
 * Header names TappyAI and the subject; body is one block per place; footer
 * names TappyAI again with the brand URL. A recipient who reads only the first
 * and last line still knows where this came from.
 */
export function placesBrochure(title: string, places: readonly SharedPlace[], lang: ShareLang, url: string): string {
  const parts = [`${L[lang].recommends}: ${title}`, '']
  places.forEach((p, i) => { parts.push(placeBlock(p, i, lang), '') })
  parts.push(footer(lang, url))
  return parts.join('\n')
}

// ── PLAN ─────────────────────────────────────────────────────────────────────

/**
 * The brochure for a [TAPPY_PLAN].
 *
 * 🚨 STRUCTURE COMES FROM `days[].items[]`, NOT FROM `share_text`. `share_text`
 * is model-authored prose and may say anything; the items are what the plan
 * actually contains. `share_text` contributes at most one introductory line,
 * and only when it is short and free of URLs — a model must not smuggle a link
 * into a brochure through a caption.
 */
export function planBrochure(plan: TappyPlan, lang: ShareLang, url: string): string {
  const d = L[lang]
  const parts: string[] = [`${d.plan}: ${plan.title}`]
  const intro = (plan.share_text ?? '').trim()
  if (intro && intro.length <= 160 && !/https?:\/\//i.test(intro)) parts.push(intro)
  const facts: string[] = []
  if (plan.people) facts.push(d.people.replace('{n}', String(plan.people)))
  if (plan.budget_total) facts.push(`${d.budget}: ${plan.budget_total}`)
  if (facts.length) parts.push(facts.join(' · '))
  parts.push('')
  for (const day of plan.days ?? []) {
    parts.push(day.label)
    for (const it of day.items ?? []) {
      const line = [it.time, it.emoji, it.name].filter(Boolean).join(' ')
      parts.push(`  ${line}`)
      if (it.description) parts.push(`     ${it.description}`)
      const extra: string[] = []
      if (it.price) extra.push(it.price)
      if (it.address) extra.push(`📍 ${it.address}`)
      if (extra.length) parts.push(`     ${extra.join(' · ')}`)
      if (it.maps_link && isSafeHttpsUrl(it.maps_link)) parts.push(`     ${d.maps}: ${it.maps_link}`)
      if (it.booking_link && isSafeHttpsUrl(it.booking_link)) parts.push(`     ${d.booking}: ${it.booking_link}`)
    }
    parts.push('')
  }
  parts.push(footer(lang, url))
  return parts.join('\n')
}

// ── COMPACTION (Tappy Inbox: chat_messages.body CHECK ≤ 4000) ────────────────

export const INBOX_MAX_BODY = 4000

/**
 * Fit a brochure into `max` characters without ever cutting a URL in half.
 *
 * Strategy, in order, each step deterministic:
 *   1. Drop trailing place blocks whole until it fits, appending "and N more".
 *   2. If even one block is too long, drop its optional lines from the bottom
 *      (reasons first, then links, then phone/hours) — never a URL mid-string.
 *   3. The header and the footer always survive.
 */
export function compactBrochure(
  title: string,
  places: readonly SharedPlace[],
  lang: ShareLang,
  url: string,
  max = INBOX_MAX_BODY,
): string {
  const full = placesBrochure(title, places, lang, url)
  if (full.length <= max) return full

  const d = L[lang]
  const head = `${d.recommends}: ${title}`
  const foot = footer(lang, url)
  let kept = places.length
  while (kept > 0) {
    const shown = places.slice(0, kept)
    const more = places.length - kept
    const body = [head, '', ...shown.map((p, i) => placeBlock(p, i, lang) + '\n'), more > 0 ? d.more.replace('{n}', String(more)) + '\n' : '', foot]
      .filter(s => s !== undefined).join('\n')
    if (body.length <= max) return body
    kept--
  }
  // Even a single block overflows: shed optional lines, never cut inside one.
  const p = places[0]
  const slim: SharedPlace = {
    name: p.name,
    links: [],
    ...(p.address !== undefined ? { address: p.address } : {}),
    ...(p.rating !== undefined ? { rating: p.rating } : {}),
    ...(p.ratingCount !== undefined ? { ratingCount: p.ratingCount } : {}),
    ...(p.category !== undefined ? { category: p.category } : {}),
  }
  const maps = p.links.find(l => l.kind === 'maps')
  if (maps) slim.links = [maps]
  const more = places.length - 1
  const body = [head, '', placeBlock(slim, 0, lang), '', more > 0 ? d.more.replace('{n}', String(more)) : '', foot].join('\n')
  return body.length <= max ? body : [head, '', `1. ${p.name}`, '', foot].join('\n').slice(0, max)
}

// ── BUILDERS ─────────────────────────────────────────────────────────────────

const brandUrl = (env?: NodeJS.ProcessEnv) => absoluteUrl('/', env).replace(/\/$/, '')

/** The artifact for a recommendation card. `title` is the user's own subject. */
export function buildPlacesArtifact(
  view: PlacesLiveView,
  title: string,
  lang: ShareLang = 'vi',
  env?: NodeJS.ProcessEnv,
): ShareArtifact {
  const url = brandUrl(env)
  const places = view.items.map(pickPlace)
  const subject = `${L[lang].recommends}: ${title}`
  return { kind: 'places', title, subject, text: placesBrochure(title, places, lang, url), url, places }
}

/** The artifact for a [TAPPY_PLAN]. */
export function buildPlanArtifact(plan: TappyPlan, lang: ShareLang = 'vi', env?: NodeJS.ProcessEnv): ShareArtifact {
  const url = brandUrl(env)
  const subject = `${L[lang].plan}: ${plan.title}`
  return { kind: 'plan', title: plan.title, subject, text: planBrochure(plan, lang, url), url, places: [] }
}

/**
 * Prose → share text. Markdown emphasis and headings go; a markdown link keeps
 * its destination as `label: url` when the URL passes the guard (a booking
 * link is the useful part of a flight answer), and loses it otherwise; images
 * are dropped whole; structured blocks never appear (they were stripped upstream).
 */
export function proseForShare(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => (isSafeHttpsUrl(url) ? `${label}: ${url}` : label))
    .replace(/(^|\s)(https?:\/\/\S+)/g, (_m, pre: string, url: string) => (isSafeHttpsUrl(url) ? `${pre}${url}` : pre))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** A turn with no card and no plan: the prose, under the TappyAI header. Strictly more than before. */
export function buildProseArtifact(subject: string, text: string, env?: NodeJS.ProcessEnv): ShareArtifact {
  const url = brandUrl(env)
  return {
    kind: 'places', title: subject, subject: `TappyAI: ${subject}`,
    text: `TappyAI\n\n${proseForShare(text)}\n\n— TappyAI · ${url.replace(/^https?:\/\/(www\.)?/, '')}`,
    url, places: [],
  }
}

/** The Inbox-safe body for an artifact. Same content, bounded. */
export function inboxBody(a: ShareArtifact, lang: ShareLang = 'vi'): string {
  if (a.kind === 'places') return compactBrochure(a.title, a.places, lang, a.url)
  if (a.text.length <= INBOX_MAX_BODY) return a.text
  // A plan that overflows keeps its header and footer and as many whole lines as fit.
  const lines = a.text.split('\n')
  const foot = lines[lines.length - 1]
  const out: string[] = []
  let len = foot.length + 1
  for (const line of lines.slice(0, -1)) {
    if (len + line.length + 1 > INBOX_MAX_BODY) break
    out.push(line); len += line.length + 1
  }
  return [...out, foot].join('\n')
}

/** Every https URL in the artifact text, for tests and for the preview. */
export function artifactUrls(a: ShareArtifact): string[] {
  return [...new Set(a.text.match(/https:\/\/[^\s)]+/g) ?? [])]
}

export { BRAND }
