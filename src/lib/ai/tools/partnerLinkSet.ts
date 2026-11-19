import type { CommerceLinkRow } from '@/lib/ccp'
import { normalizeVN } from '@/lib/ai/intent'

// ── The partner-link set of a travel answer (owner decision 17/11/2026) ─────────────────────────────────────────────────────
//
// A hotel answer's link row LEADS with Agoda (our affiliate, realtime price); a flight, coach or train answer's row LEADS with
// Vexere (our affiliate). For fairness each row also carries 2-3 other platforms. Pure ordering and labelling only: every URL
// comes from the commerce layer (the CCP resolver, or a public landing page declared in platformLinks/travel.ts), never from
// the model, and nothing here composes or edits a URL.

/** The affiliate platform a hotel row leads with (Agoda) and the one a flight / coach / train row leads with (Vexere): providerIds of the registry. */
export const HOTEL_LEAD = 'agoda'
export const TRANSPORT_LEAD = 'vexere'
/** The affiliate platform a shopping (product) row leads with: Lazada. */
export const SHOPPING_LEAD = 'lazada'

/** Entries of the lead (affiliate) platform kept at the head of the row (hotel: the first offer's "check price" + booking link). */
export const MAX_LEAD_LINKS = 2
/** Other platforms that follow the lead. */
export const MAX_OTHER_PLATFORMS = 3

export interface PartnerEntry {
  /** Which platform the link belongs to ('agoda', 'booking', 'traveloka', 'tripcom', 'vexere', ...): decides the order, never shown. */
  merchant: string
  name: string
  url: string
  platform?: string
  _realtime?: boolean
  _partnerSet?: boolean
  [k: string]: unknown
}

/** An entry as it is stored on the tool result (no `merchant` tag). */
export type PartnerLink = Omit<PartnerEntry, 'merchant'>

const HOST_MERCHANTS: Array<[RegExp, string]> = [
  [/(^|\.)agoda\.com$/, 'agoda'],
  [/(^|\.)booking\.com$/, 'booking'],
  [/(^|\.)traveloka\.com$/, 'traveloka'],
  [/(^|\.)trip\.com$/, 'tripcom'],
  [/(^|\.)vexere\.com$/, 'vexere'],
  [/(^|\.)futabus\.vn$/, 'futabus'],
  [/(^|\.)baolau\.com$/, 'baolau'],
  [/(^|\.)dsvn\.vn$/, 'dsvn'],
]

/** The platform a link already on a tool result belongs to: its `platform` label (realtime offers), else its host. */
export function merchantOfLink(l: { url?: unknown; platform?: unknown }): string {
  const p = typeof l.platform === 'string' ? l.platform.toLowerCase() : ''
  if (p) {
    if (p.includes('agoda')) return 'agoda'
    if (p.includes('booking')) return 'booking'
    if (p.includes('traveloka')) return 'traveloka'
    if (p.includes('trip')) return 'tripcom'
    if (p.includes('vexere')) return 'vexere'
  }
  try {
    const host = new URL(String(l.url)).hostname.toLowerCase()
    return HOST_MERCHANTS.find(([re]) => re.test(host))?.[1] ?? host
  } catch {
    return 'unknown'
  }
}

/**
 * Order a row: the lead platform's entries first (at most `maxLead`), then ONE entry for each of the next `maxOthers` platforms in the order
 * they appear, then everything else in its original order. Nothing is dropped except a repeated label or URL; non-https entries never pass.
 * The caller lists the entries in the order it prefers within each platform.
 */
export function orderLeadFirst(entries: readonly PartnerEntry[], lead: string, caps: { maxLead?: number; maxOthers?: number } = {}): PartnerLink[] {
  const maxLead = caps.maxLead ?? MAX_LEAD_LINKS
  const maxOthers = caps.maxOthers ?? MAX_OTHER_PLATFORMS
  const usable = entries.filter(e => typeof e.url === 'string' && /^https:\/\//i.test(e.url) && typeof e.name === 'string' && e.name.trim() !== '')
  const head = usable.filter(e => e.merchant === lead).slice(0, maxLead)
  const picked: PartnerEntry[] = []
  const seenMerchants = new Set<string>([lead])
  for (const e of usable) {
    if (picked.length >= maxOthers) break
    if (seenMerchants.has(e.merchant)) continue
    seenMerchants.add(e.merchant)
    picked.push(e)
  }
  const first = new Set<PartnerEntry>([...head, ...picked])
  const ordered = [...head, ...picked, ...usable.filter(e => !first.has(e))]
  const seenLabels = new Set<string>()
  const seenUrls = new Set<string>()
  const out: PartnerLink[] = []
  for (const e of ordered) {
    const label = e.name.trim().toLowerCase()
    if (seenLabels.has(label) || seenUrls.has(e.url)) continue
    seenLabels.add(label)
    seenUrls.add(e.url)
    const { merchant: _merchant, ...link } = e
    void _merchant
    out.push(link)
  }
  return out
}

/** A CCP link as a row entry. A landing page (depth 0-1: the route / stay is typed on the site) says so in its label; a deeper page carries the merchant's name only. */
export function entryFromCcp(l: CommerceLinkRow, locale?: string, name?: string): PartnerEntry {
  const en = /^en/i.test(locale ?? '')
  const landing = l.depth <= 1
  return { merchant: l.providerId, name: name ?? (landing ? `${l.merchantName} ${en ? '(home page)' : '(trang chủ)'}` : l.merchantName), url: l.url, _partnerSet: true }
}

/** A public landing page declared in platformLinks/travel.ts, as a row entry; its label says it is a landing page. */
export function landingEntry(p: { merchant: string; name: string; url: string }, locale?: string, kind: 'home' | 'hotels' | 'trains' = 'home'): PartnerEntry {
  const en = /^en/i.test(locale ?? '')
  const word = kind === 'hotels' ? (en ? 'hotels page' : 'trang khách sạn') : kind === 'trains' ? (en ? 'trains page' : 'trang vé tàu') : (en ? 'home page' : 'trang chủ')
  return { merchant: p.merchant, name: `${p.name} (${word})`, url: p.url, _partnerSet: true }
}

/** The partner links a previous call of the same (memoised) tool result put there: they are rebuilt on every call. */
export function withoutPartnerSet<T extends { _partnerSet?: unknown }>(links: readonly T[]): T[] {
  return links.filter(l => !(l && typeof l === 'object' && l._partnerSet === true))
}

/** What the person is asking about on a coach / train turn, from their own words (the tool returns both). Neither detected = both wanted. */
export function transportAsked(turns: string | readonly string[] | undefined): { coach: boolean; train: boolean } {
  const text = normalizeVN((Array.isArray(turns) ? turns.slice(-3).join(' ') : String(turns ?? '')).toLowerCase())
  const train = !/may bay/.test(text) && /\b(ve tau|tau hoa|tau lua|duong sat|di tau|bang tau|train)\b/.test(text)
  const coach = /\b(xe khach|xe giuong|limousine|nha xe|ve xe|di xe|bus|coach|futa|phuong trang)\b/.test(text)
  if (train === coach) return { coach: true, train: true }
  return { coach, train }
}
