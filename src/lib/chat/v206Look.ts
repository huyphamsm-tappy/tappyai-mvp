// Workspace v206 look (build flags NEXT_PUBLIC_WORKSPACE_V206=1 + NEXT_PUBLIC_RESPONSE_PRESENTATION=1): the PURE parts of the mockup's place card, history rows, conversation header and product header.
// Everything here is read from data the app really has. A field that is missing yields null and the control that would show it is NOT drawn (never a placeholder, never a made-up value).
// No network, no model call.

import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { formatPriceBandText } from '@/lib/recommendation/priceBand'
import { WORKSPACE_V206 } from '@/lib/chat/v206'
import { RESPONSE_PRESENTATION } from '@/lib/chat/presentation'

/** The mockup's look (place cards, header, product header, history rows) needs both build flags. */
export const V206_LOOK = WORKSPACE_V206 && RESPONSE_PRESENTATION

/** The rail's "Đã lưu" asks the conversation header (which owns the saved-places drawer) to open it. */
export const OPEN_SAVED_EVENT = 'tappy:open-saved'
/** A place was saved or un-saved from a card: the rail re-reads its real count. */
export const FAVORITES_CHANGED_EVENT = 'tappy:favorites-changed'

// ---------------------------------------------------------------------------------------------------------------------
// place card
// ---------------------------------------------------------------------------------------------------------------------

/** 537 → "537", 2449 → "2.4k", 1000 → "1k", 12500 → "13k". */
export function compactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1000) return String(Math.round(n))
  const k = n / 1000
  const one = Math.round(k * 10) / 10
  if (one < 10) return `${one % 1 === 0 ? one.toFixed(0) : one.toFixed(1)}k`
  return `${Math.round(k)}k`
}

/** What the card needs of a place (LivePlace, typed structurally so this file does not import the card). */
export interface PlaceCardInput {
  id: string
  name: string
  domain?: string
  image?: string
  address?: string
  rating?: number
  ratingCount?: number
  openingHours?: string
  openNow?: boolean
  phone?: string
  priceLevel?: number
  priceRangeText?: string
  priceSignal?: string
  categories?: string[]
  actions: ReadonlyArray<{ kind: string; url: string }>
}

export interface PlaceCardView {
  badge: string | null
  rating: { value: string; count: string | null } | null
  address: string | null
  hours: string | null
  open: 'open' | 'closed' | null
  price: string | null
  phone: { display: string; href: string } | null
  maps: string | null
  website: string | null
  image: string | null
  /** at least one of hours / open state / price: the mono row is drawn only then */
  hasMeta: boolean
}

const BADGE_MAX = 26
const clean = (s: string | undefined | null): string => String(s ?? '').replace(/\s+/g, ' ').trim()
const https = (u: string | undefined): string | null => (u && isSafeHttpsUrl(u) ? u : null)

function badgeOf(categories: string[] | undefined): string | null {
  const c = clean(categories?.find(x => clean(x)))
  if (!c) return null
  if (c.length <= BADGE_MAX) return c
  const cut = c.slice(0, BADGE_MAX - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at >= 8 ? cut.slice(0, at) : cut).trim()}…`
}

/** The place card of the mockup, from the real card: type badge, rating chip, address, hours / price row, links. Pure. */
export function placeCardView(p: PlaceCardInput, locale: string): PlaceCardView {
  const rating = typeof p.rating === 'number' && p.rating > 0
    ? { value: p.rating.toFixed(1), count: typeof p.ratingCount === 'number' && p.ratingCount > 0 ? compactCount(p.ratingCount) : null }
    : null
  const hours = clean(p.openingHours) || null
  const open = p.openNow === true ? 'open' : p.openNow === false ? 'closed' : null
  // the provider's own band, else Google's 1-4 level as money glyphs; a price spotted in a snippet is weak evidence and is never shown here
  const band = clean(formatPriceBandText(p.priceRangeText, locale)) || (typeof p.priceLevel === 'number' && p.priceLevel >= 1 && p.priceLevel <= 4 ? '₫'.repeat(p.priceLevel) : '')
  const price = band || null
  const digits = clean(p.phone).replace(/[^\d+]/g, '')
  const phone = digits.replace(/\D/g, '').length >= 6 ? { display: clean(p.phone), href: `tel:${digits}` } : null
  const link = (kinds: string[]) => https(p.actions.find(a => kinds.includes(a.kind) && isSafeHttpsUrl(a.url))?.url)
  return {
    badge: badgeOf(p.categories),
    rating,
    address: clean(p.address) || null,
    hours,
    open,
    price,
    phone,
    maps: link(['maps', 'directions']),
    website: link(['website']),
    image: https(p.image),
    hasMeta: !!(hours || open || price),
  }
}

export interface SaveBody { placeId: string; placeName: string; placeAddress: string; placeType: string }
/** The body the existing save mechanism (POST /api/favorites) takes; null when the card has no real id to save by. */
export function saveablePlace(p: { id?: string; name?: string; address?: string; categories?: string[]; domain?: string }): SaveBody | null {
  const placeId = clean(p.id)
  const placeName = clean(p.name)
  if (!placeId || !placeName) return null
  return { placeId, placeName, placeAddress: clean(p.address), placeType: clean(p.categories?.[0]) || clean(p.domain) || 'place' }
}

// ---------------------------------------------------------------------------------------------------------------------
// history rows
// ---------------------------------------------------------------------------------------------------------------------

interface PreviewMessage { role?: string; content?: unknown }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(x => (typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text : '')).filter(Boolean).join('\n')
  return ''
}

/** Plain one-line text of a saved message: machine blocks (`[TAPPY_PLAN]…[/TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`, also an unfinished one), images, links, markdown marks and bare URLs removed. */
export function plainSnippet(raw: string): string {
  return String(raw ?? '')
    .replace(/\[([A-Z][A-Z_]{2,})\][\s\S]*?\[\/\1\]/g, ' ')
    .replace(/\[[A-Z][A-Z_]{2,}\][\s\S]*$/, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A one-line preview of the conversation's real last message: the last assistant text that is readable, else the last readable text of the person. Cut on a word edge with an ellipsis. */
export function conversationPreview(messages: ReadonlyArray<PreviewMessage | null> | null | undefined, max = 90): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null
  const last = (role: (r: string | undefined) => boolean): string => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m || !role(m.role)) continue
      const s = plainSnippet(textOf(m.content).slice(0, 20000)) // a long report is cut before cleaning: the preview needs only its beginning
      if (s) return s
    }
    return ''
  }
  const text = last(r => r === 'assistant') || last(r => r === 'user')
  if (!text) return null
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at >= Math.floor(max / 2) ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

const EMOJI: Record<string, string> = {
  food: '🍽️', cafe: '☕', travel: '🧳', shopping: '🛍️', spa: '💆', entertainment: '🎬', deals: '🏷️', aitools: '🧰', recommendation: '📍', reading: '📚', phone: '📱', health: '🩺', finance: '💰',
}
/** The icon of a conversation row / header: its own category, a plain bubble when it has none we know. */
export function conversationEmoji(category: string | null | undefined): string {
  return EMOJI[String(category ?? '').toLowerCase()] ?? '💬'
}

// ---------------------------------------------------------------------------------------------------------------------
// headers
// ---------------------------------------------------------------------------------------------------------------------

/** The plan badge of the product header: the REAL active plan's name in capitals; no active plan (or unknown) = no badge. */
export function planBadgeLabel(sub: { state?: string; plan?: { id?: string; name?: string } | null } | null | undefined): string | null {
  if (!sub || sub.state !== 'ACTIVE') return null
  const n = clean(sub.plan?.name)
  return n ? n.toUpperCase() : null
}

/** The conversation header's status line: when it was updated and, when there are messages, how many. No verification or partner claim exists in the data, so none is made. */
export function statusLine(f: { updated: string; messages: number }, count: (n: number) => string): string {
  return f.messages > 0 ? `${f.updated} · ${count(f.messages)}` : f.updated
}
