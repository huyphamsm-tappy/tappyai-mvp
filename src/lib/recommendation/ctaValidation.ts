import { actionLabel } from './actionLabel'
import { isDirectEntityUrl } from '@/lib/links/directUrl'
import type { ActionKind } from './actions'
// The registry module only (providers + domain types): this file is client-bundled.
import { PROVIDER_REGISTRY, isRemovedMerchant } from '@/lib/ccp/registry'
import { resultsPagePrefixes, searchTemplates } from '@/lib/ccp/adapters'

// ── MODEL-AUTHORED CTA BUTTONS, VALIDATED DETERMINISTICALLY ─────────────────
//
// 🚨 THE MEASURED DEFECT. While `SERVER_AUTHORED_CTA` is off the model writes
// its own `[CTA_BUTTONS]`, and `parseCTA` returned `parsed.buttons` with NO
// validation at all — label, type and url straight from the model to the render.
// On the event turn 2026-09-09 that produced:
//
//     "🎫 Ticketbox - Mua vé sự kiện"  →  https://ticketbox.vn/
//
// a purchase promise pointing at an aggregator HOMEPAGE, on a turn that had just
// said it found no events. The card layer has been honest about this since
// `actionLabel` was written — a `search` URL renders "Tìm vé trên …", never
// "Mua vé" — but a model-authored button never went through it.
//
// 🔑 THE URL DECIDES THE KIND, THE LABEL NEVER DOES. A button cannot be promoted
// from search to purchase by writing a stronger word: `urlKind` is derived from
// the URL with `isDirectEntityUrl` — the same test the ticket prose rules use —
// and the label is then RE-DERIVED from `actionLabel`. Nothing here invents a
// destination: a downgraded button keeps its URL and only stops over-promising.

/** A button as the model wrote it. */
export interface ModelCtaButton {
  label: string
  type: string
  url: string
  primary?: boolean
}

/**
 * Labels that PROMISE a completed transaction, mapped to the action kind they
 * claim. Anything not listed here is left exactly as the model wrote it — this
 * validator narrows over-promises, it does not rewrite prose.
 */
const PROMISE_KINDS: ReadonlyArray<[RegExp, ActionKind]> = [
  [/(mua vé|đặt vé|mua ve|dat ve|buy tickets?|book tickets?|get tickets?)/iu, 'ticket'],
  [/(đặt phòng|dat phong|book (?:a )?(?:room|hotel)|reserve (?:a )?room)/iu, 'booking'],
  [/(đặt bàn|dat ban|đặt chỗ|dat cho|book (?:a )?table|reserve (?:a )?table)/iu, 'reservation'],
  [/(đặt món|dat mon|gọi món|goi mon|order now|đặt hàng|dat hang)/iu, 'order'],
  [/(mua ngay|mua hàng|mua hang|buy now|purchase now)/iu, 'purchase'],
]

/** The kind a label claims, or null when it promises nothing. */
export function promisedKind(label: string): ActionKind | null {
  for (const [re, kind] of PROMISE_KINDS) if (re.test(label)) return kind
  return null
}

/**
 * Validate one model-authored button against its own URL.
 *
 * A promise backed by a direct entity-level URL stands. A promise backed by a
 * homepage or a search page is DOWNGRADED: the label is re-derived through
 * `actionLabel` for the same kind at `urlKind: 'search'`, which is where "Tìm vé
 * trên {platform}" comes from, and the wire `type` becomes `search` so no
 * downstream reader can mistake it for a purchase.
 */
export function validateModelCtaButton(
  btn: ModelCtaButton,
  t: (key: string, vars?: Record<string, string>) => string,
): ModelCtaButton {
  const kind = promisedKind(btn.label)
  if (!kind) return btn
  // A registry RESULTS page (a dated fare list has a deep path and a query) is still a search.
  if (isDirectEntityUrl(btn.url) && !isRegistryResultsPage(btn.url)) return btn
  return {
    ...btn,
    type: 'search',
    label: actionLabel({ kind, urlKind: 'search', url: btn.url, attributed: false }, t),
  }
}

/** Hotel OTAs: a hotel search there is an honest "Tìm phòng"; a TICKET promise there is not. */
const HOTEL_OTA_HOST = /(^|\.)(booking\.com|agoda\.[a-z.]+|traveloka\.[a-z.]+)$/i

const hostOf = (url: string): string => {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** Hosts the Commerce Capability Platform owns the handoff for (registry allow-lists, exact). */
const CCP_MERCHANT_HOSTS = new Set(PROVIDER_REGISTRY.flatMap(e => e.allowedHosts.map(h => h.toLowerCase().replace(/^www\./, ''))))
/** The marketplaces' declared search grammars (URL prefixes) — honest L2 searches the registry itself projects. */
// Only a grammar that CARRIES the query is an honest search button. A front-door template (Agoda,
// Vexere — declared so the legacy builders stay registry projections) is a front door here, and a
// model button on it ("🏨 Agoda - Phú Quốc" → agoda.com/vi-vn/, live UAT 14 Sep 2026) is dropped.
const MARKETPLACE_SEARCH_PREFIXES = searchTemplates().filter(t => t.template.includes('{q}')).map(t => t.template.slice(0, t.template.indexOf('{q}')))
const isMarketplaceSearchLink = (url: string) => MARKETPLACE_SEARCH_PREFIXES.some(p => url.startsWith(p))
/** A results page an adapter composes (dated fare lists, routes, OTA results) — honest as a search, relabelled never dropped. */
const RESULTS_PAGE_PREFIXES = resultsPagePrefixes()
const isRegistryResultsPage = (url: string) => RESULTS_PAGE_PREFIXES.some(p => url.startsWith(p))
const isFlightResultsPage = (url: string) => /^https:\/\/(vn\.trip\.com\/flights\/|www\.traveloka\.com\/vi-vn\/flight\/)/i.test(url)

/**
 * CCP Phase 8 (owner-like UAT R1, P1-7 / P2-4): two model-authored buttons that no relabelling
 * can make honest, so they are DROPPED rather than downgraded.
 *
 *   · A ticket promise on a hotel OTA ("🎫 Tìm vé trên Booking.com" for a theme park): Booking
 *     and Agoda sell rooms; "search for tickets there" sends the user to a hotel search.
 *   · On a merchant host the Commerce Capability Platform owns (cgv.vn, klook.com,
 *     dienmayxanh.com, trip.com, shopee.vn, tiktok — the registry allow-lists): a bare FRONT DOOR
 *     (cgv.vn/), or a search page carrying a transaction PROMISE ("Mua ngay" on a search
 *     page). The application is the only URL authority for those merchants: their
 *     verified handoff arrives on the card as a Commerce Link when one exists. A DIRECT entity
 *     page on such a host is left alone, and so is an honest search link — the marketplaces'
 *     registry search grammars in particular (owner decision 14 Sep 2026), which the
 *     downgrade below labels as searches.
 */
export function isMisleadingModelCta(btn: ModelCtaButton): boolean {
  const host = hostOf(btn.url)
  if (!host) return false
  // 🚨 A REMOVED PROVIDER NEVER COMES BACK THROUGH THE MODEL (cross-platform UAT, 15 Sep 2026).
  // The frozen registry is the allow-list of merchants TappyAI hands off to; Tiki, PasGo, TGDD and
  // California Fitness were deliberately removed. The model still writes "📦 Tiki" / "Lazada, Tiki"
  // buttons from its own training, and because those hosts are not in the registry no other rule
  // here drops them — measured live on Android, a Tiki button under "mua … trên Shopee". A button
  // that names or points at a forbidden merchant is dropped, on every client.
  if (isForbiddenMerchant(btn.label, host)) return true
  // Completion Pass live UAT (14 Sep 2026): "🚌 Vexere - Phương Trang" pointed at a redBus page. A
  // label that NAMES a registry merchant must point at that merchant — anything else is a
  // mislabelled destination, and no relabelling can make it honest.
  if (namesOtherMerchant(btn.label, host)) return true
  const kind = promisedKind(btn.label) ?? (btn.type === 'ticket' ? 'ticket' : null)
  // A FLIGHT results page (Trip.com / Traveloka fare list) is judged before the hotel-OTA ticket
  // rule — Traveloka is a "hotel OTA" host that sells flights: relabelled by the downgrade, never
  // dropped. A ticket promise on a HOTEL results page (Booking.com "Tìm vé" for a theme park)
  // stays dropped, as measured in Phase 8.
  if (isFlightResultsPage(btn.url)) return false
  if (kind === 'ticket' && HOTEL_OTA_HOST.test(host)) return true
  // Any other registry results page (marketplace / OTA / event searches, routes) is honest as a
  // search: relabelled by the downgrade, never dropped — the system may have handed the model
  // that very URL (booking_links / event_links).
  if (isMarketplaceSearchLink(btn.url) || isRegistryResultsPage(btn.url)) return false
  if (!CCP_MERCHANT_HOSTS.has(host)) return false
  let path = '/'
  try { path = new URL(btn.url).pathname.replace(/\/+$/, '') || '/' } catch { return true /* unparseable on a CCP host */ }
  // A front door: the root, or a one-word section like tiktok.com/shop — never a product slug.
  // A locale segment ("/vi-vn/", "/vn/vi/") is not a subject: agoda.com/vi-vn/ is a front door.
  const segments = path.split('/').filter(Boolean).filter(s => !/^[a-z]{2}(?:-[a-z]{2})?$/i.test(s))
  if (segments.length === 0 || (segments.length === 1 && !/[-.\d]/.test(segments[0]))) return true
  if (isDirectEntityUrl(btn.url)) return false
  return !!kind
}

/**
 * Providers the owner deliberately REMOVED from the frozen registry and forbade reintroducing
 * (PasGo / Tiki / TGDD / California Fitness). They have no registry entry, so the registry-driven
 * rules above never see them — this list is what keeps a model-authored button or prose link to one
 * of them from reaching a user. Hosts and a name matcher, so both "[Tiki](https://tiki.vn/…)" and a
 * bare "📦 Tiki" button on a non-Tiki URL are caught.
 */
/** A button/link that names or points at a removed provider (never reintroduced through the model). Delegates to the CCP registry, which is the one place a removed merchant's host is spelled. */
export function isForbiddenMerchant(label: string, host: string): boolean {
  return isRemovedMerchant(label, host)
}

/** Registry merchants by name (longest first, so "ShopeeFood" is matched before "Shopee"). */
const MERCHANTS_BY_NAME = PROVIDER_REGISTRY
  .map(e => ({ name: e.merchantName, re: new RegExp(`(?<![\\p{L}\\p{N}])${e.merchantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'), hosts: e.allowedHosts.map(h => h.toLowerCase().replace(/^www\./, '')) }))
  .sort((a, b) => b.name.length - a.name.length)

/** Does the label name a registry merchant whose hosts do not include the URL's host? */
export function namesOtherMerchant(label: string, host: string): boolean {
  const named = MERCHANTS_BY_NAME.find(m => m.re.test(label))
  return !!named && !named.hosts.includes(host)
}

const PROSE_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g

/**
 * Prose hygiene for MODEL-authored markdown links (Final local live UAT, 14 Sep 2026): the reply
 * to "Mua iPhone trên Điện Máy Xanh" carried "[Điện Máy Xanh](https://www.dienmaycholon.vn)" —
 * a registry merchant's NAME on another retailer's site. A label that names a registry merchant
 * must point at that merchant; otherwise the link is unmade and only the words remain. Nothing
 * else in the prose is touched (system-provided links point where their labels say).
 */
export function unlinkMislabelledMerchantLinks(text: string, systemUrls?: ReadonlySet<string>, requestedProviderId?: string | null): string {
  if (!text || text.indexOf('](http') === -1) return text
  // URLs the SYSTEM placed (injected order / platform links, CCP handoffs) are never judged here.
  return text.replace(PROSE_LINK_RE, (whole, label: string, url: string) => {
    if (systemUrls?.has(url)) return whole
    // A mislabelled destination, a registry front door, OR — when the user NAMED a merchant this
    // turn — a link to ANY OTHER registry merchant (live UAT 14 Sep 2026: "… trên Trip.com" whose
    // reply still linked "[Booking.com] hoặc [Agoda]"). The named merchant's own links stay.
    const other = !!requestedProviderId && isOtherRegistryMerchant(url, requestedProviderId)
    return other || isForbiddenMerchant(label, hostOf(url)) || namesOtherMerchant(label, hostOf(url)) || isRegistryFrontDoor(url) ? label : whole
  })
}

/** A registry merchant's front door (root or a bare section, locale segments ignored) — a button on it is dropped, a prose link to it is unmade. */
export function isRegistryFrontDoor(url: string): boolean {
  const host = hostOf(url)
  if (!host || !CCP_MERCHANT_HOSTS.has(host)) return false
  if (isMarketplaceSearchLink(url) || isRegistryResultsPage(url)) return false
  let path = '/'
  try { path = new URL(url).pathname.replace(/\/+$/, '') || '/' } catch { return false }
  const segments = path.split('/').filter(Boolean).filter(s => !/^[a-z]{2}(?:-[a-z]{2})?$/i.test(s))
  return segments.length === 0 || (segments.length === 1 && !/[-.\d]/.test(segments[0]))
}

/**
 * 🚨 A CONNECTED PROVIDER IS NEVER CALLED "chưa kết nối" (cross-platform UAT, 15 Sep 2026).
 *
 * Rule 18b tells the model, in as many words, never to answer "chưa kết nối với X" for a platform in
 * the frozen registry — yet it still did: a Trip.com hotel turn whose CARD correctly showed "Đặt
 * phòng trên Trip.com" opened with "hệ thống mình chưa kết nối trực tiếp với Trip.com". The claim is
 * provably false — `requestedProviderId` is only ever a REGISTRY provider — so the sentence carrying
 * it (and only that sentence) is removed at settle time. Nothing else in the prose is touched;
 * a genuinely unsupported capability (table reservation, showtimes) names no registry provider and
 * so is never matched.
 */
const DISCONNECT_CLAIM = /(ch[ưu]a|kh[ôo]ng)\s+(k[ếe]t n[ốo]i|h[ỗo] tr[ợo]|li[êe]n k[ếe]t|t[íi]ch h[ợo]p)/iu

// 🚨 A SECOND false-disconnect shape (cross-platform UAT, 15 Sep 2026): the model denies the
// requested provider by OMISSION rather than negation — "bạn yêu cầu Trip.com nhưng hệ thống mình
// CHỈ kết nối VỚI Booking.com và Agoda". The Trip.com card rendered correctly, so the limitation is
// false. Matched only when the connectivity verb is followed by "với" (a connected-WITH scope claim,
// not feature support like "chỉ hỗ trợ thẻ"); kept when the requested provider is itself in that list.
const LIMITED_CONNECT = /ch[ỉi]\s+(?:hi[ệe]n\s+(?:t[ạa]i\s+)?)?(?:c[óo]\s+)?(?:k[ếe]t n[ốo]i|h[ỗo] tr[ợo]|li[êe]n k[ếe]t|t[íi]ch h[ợo]p)(?:\s+tr[ựu]c ti[ếe]p)?\s+v[ớo]i\b/iu

function isFalseLimitationSentence(s: string, nameRe: RegExp): boolean {
  const m = LIMITED_CONNECT.exec(s)
  if (!m) return false
  // If the requested provider is named AFTER "chỉ … với", it is IN the connected list — a true,
  // positive statement ("chỉ kết nối với Trip.com") — never strip that.
  return !nameRe.test(s.slice(m.index + m[0].length))
}

export function stripFalseDisconnectClaims(text: string, requestedProviderId?: string | null): string {
  if (!text || !requestedProviderId) return text
  const entry = PROVIDER_REGISTRY.find(e => e.providerId === requestedProviderId)
  if (!entry) return text
  const name = entry.merchantName
  const nameRe = new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
  // Split into sentences at a "." / "!" / "?" that is FOLLOWED BY whitespace (so the "." inside
  // "Trip.com" never splits the name), and at newlines; keep every delimiter so a rejoin is lossless.
  const parts = text.split(/(?<=[.!?])(?=\s)|(?<=\S)(?=\n)/)
  const kept = parts.filter(s => !(nameRe.test(s) && (DISCONNECT_CLAIM.test(s) || isFalseLimitationSentence(s, nameRe))))
  if (kept.length === parts.length) return text
  return kept.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 🚨 A markdown link WRAPPED in emphasis is untappable on Android (cross-platform UAT, 15 Sep 2026).
 *
 * The Android chat renderer (`TappyMarkdown`) is a single-pass scanner that does NOT recurse into
 * bold/italic — its `**…**` handler appends the inner text verbatim — so `**[label](url)**` renders
 * as raw, unclickable markdown there (the web parser handles it fine). The model wraps entertainment
 * event/film handoff links in bold; a Ticketbox turn's `**[Chào Show…](ticketbox.vn/…)**` was dead on
 * Android while the identical-shape, UN-bolded flight links tapped through. The canonical handoff must
 * render on every client, so emphasis that surrounds a single markdown link is unwrapped here (the
 * link, not the bold, is what matters). Only link-wrapping emphasis is touched; ordinary bold text is
 * left alone.
 */
export function unemphasizeLinks(text: string): string {
  if (!text) return text
  const link = '\\[[^\\]\\n]+\\]\\([^)\\s]+\\)'
  return text
    .replace(new RegExp(`\\*\\*(${link})\\*\\*`, 'g'), '$1')
    .replace(new RegExp(`(?<!\\*)\\*(${link})\\*(?!\\*)`, 'g'), '$1')
    .replace(new RegExp(`__(${link})__`, 'g'), '$1')
    .replace(new RegExp(`(?<!_)_(${link})_(?!_)`, 'g'), '$1')
}

/**
 * Every button, validated. Order is preserved; only a button that cannot be made honest is dropped.
 * `requestedProviderId` (the registry merchant the user NAMED this turn, live UAT 14 Sep 2026):
 * a model button on ANOTHER registry merchant is dropped — "… trên Agoda" never renders a
 * Booking.com search button. Buttons on no registry merchant (Maps, a website) are untouched.
 */
export function validateModelCtaButtons(
  buttons: readonly ModelCtaButton[],
  t: (key: string, vars?: Record<string, string>) => string,
  requestedProviderId?: string | null,
): ModelCtaButton[] {
  return buttons
    .filter(b => !isMisleadingModelCta(b))
    .filter(b => !requestedProviderId || !isOtherRegistryMerchant(b.url, requestedProviderId))
    .map(b => validateModelCtaButton(b, t))
}

const MERCHANT_BY_HOST = new Map(PROVIDER_REGISTRY.flatMap(e => e.allowedHosts.map(h => [h.toLowerCase().replace(/^www\./, ''), e.providerId] as const)))

// ── The model's [CTA_BUTTONS] block, validated ONCE on the server ─────────────
//
// 🚨 CROSS-PLATFORM CCP (14 Sep 2026): `validateModelCtaButtons` ran only in the web client
// (`parseCTAValidated`). Android and iOS parse the same block and rendered it verbatim — so a
// "🛒 Mua iPhone trên Shopee" button under a TikTok Shop request, dropped on web, would have opened
// Shopee on a phone. The canonical layer is the URL authority for every client, so the block is
// validated here, in the settle path of the stream, before the bytes leave the server; the web
// client's own pass stays as defence in depth (it is idempotent on an already-validated block).
//
// The block is re-emitted in its CLOSED form, which all three parsers accept
// (shared/structured-content/marker-fixtures.json `cta-closed`). A block whose JSON cannot be read
// is left exactly as it was: the clients already strip an undecodable block, and rewriting bytes we
// could not parse is how prose gets corrupted.
const CTA_OPEN = '[CTA_BUTTONS]'
const CTA_CLOSE = '[/CTA_BUTTONS]'

/** Where the model's block sits inside the text, and its JSON, or null when there is none / it is unreadable. */
function findModelCtaBlock(text: string): { start: number; end: number; json: string } | null {
  const lower = text.toLowerCase()
  const start = lower.indexOf(CTA_OPEN.toLowerCase())
  if (start < 0) return null
  const closeAt = lower.indexOf(CTA_CLOSE.toLowerCase(), start)
  if (closeAt >= 0) return { start, end: closeAt + CTA_CLOSE.length, json: text.slice(start + CTA_OPEN.length, closeAt).trim() }
  // Bare form: brace matching (strings and escapes honoured), never end-anchored, never greedy.
  let open = start + CTA_OPEN.length
  while (open < text.length && /\s/.test(text[open])) open++
  if (text[open] !== '{') return null
  let depth = 0, inString = false, escaped = false
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (inString) { if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return { start, end: i + 1, json: text.slice(open, i + 1) }
  }
  return null
}

/**
 * Validate the model's `[CTA_BUTTONS]` block inside a reply, in place. Buttons that name another
 * registry merchant than the one the user asked for, mislabelled destinations and merchant front
 * doors are dropped; over-promises on results pages are relabelled — exactly the web client's rule
 * set. Text without a readable block is returned unchanged.
 */
export function validateModelCtaBlock(
  text: string,
  t: (key: string, vars?: Record<string, string>) => string,
  requestedProviderId?: string | null,
): string {
  if (!text || text.indexOf('[') === -1) return text
  const block = findModelCtaBlock(text)
  if (!block) return text
  let parsed: unknown
  try { parsed = JSON.parse(block.json) } catch { return text }
  const raw = parsed && typeof parsed === 'object' ? (parsed as { buttons?: unknown }).buttons : undefined
  if (!Array.isArray(raw)) return text
  const buttons = raw.filter((b): b is ModelCtaButton => !!b && typeof b === 'object' && typeof (b as ModelCtaButton).url === 'string' && typeof (b as ModelCtaButton).label === 'string')
  const kept = validateModelCtaButtons(buttons, t, requestedProviderId)
  const before = text.slice(0, block.start).replace(/[ \t]+$/, '')
  const after = text.slice(block.end)
  if (kept.length === 0) return (before + after.replace(/^[ \t]*\n?/, '')).replace(/[ \t]+\n/g, '\n').trimEnd()
  return `${before}${CTA_OPEN}${JSON.stringify({ buttons: kept })}${CTA_CLOSE}${after}`
}
function isOtherRegistryMerchant(url: string, requestedProviderId: string): boolean {
  const owner = MERCHANT_BY_HOST.get(hostOf(url))
  return !!owner && owner !== requestedProviderId
}
