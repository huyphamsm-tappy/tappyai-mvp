import type { CommerceRequest, Configuration, Offer, TransactionDepth } from '../domain/types'
import { getProvider } from '../registry'
import type { ProviderRegistryEntry } from '../registry/types'
import { q } from '../validation/url'
import type { DirectLinkBuild, DiscoveryHint } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'
import type { SearchCapableAdapter } from './marketplace'

// ── Handoff-grammar adapters — Provider Integration Completion Pass (14 Sep 2026) ─
//
// The travel search providers and the event provider share one shape, which
// is the fourth adapter shape the architecture audit anticipated (a "dated
// search"): a DETAIL page the index can find (a property, a route, an event),
// a way to APPEND the user's configuration to it (dates, guests), and a
// composable SEARCH or LANDING page for the request when no detail page is
// known. Each grammar below was checked read-only on the date recorded in the
// registry entry; a page that could not be checked is 'observed', never
// 'verified', and a merchant with no composable search (Agoda, Vexere) gets
// its landing page as the honest fallback — depth L0/L1, every field dropped,
// ranked below anything that carries the intent.
//
// 🔑 NOTHING IS INVENTED. A detail page comes from a discovered URL on the
// provider's allow-listed host (the id is the merchant's); a route page must
// name both places the user asked for; a search URL carries only what the
// merchant's own grammar accepts and records the rest as page-only or dropped.

interface SearchBuild {
  url: string
  depth: TransactionDepth
  preserved: string[]
  pageOnly: string[]
  dropped: string[]
  expiresAt: string | null
  grammar: 'verified' | 'observed'
  limitation: string
}

export interface HandoffGrammar {
  /** A discovered page that IS the subject → id + canonical, else null. `request` lets a grammar check identity (routes). */
  detail?(u: URL, request: CommerceRequest): { id: string; canonical: string } | null
  /** Append the configuration to a canonical detail page. Returns null when the configuration kind is not this grammar's. */
  configure?(canonical: string, configuration: Configuration): Omit<SearchBuild, 'limitation'> | null
  /** The composable results / landing page for the request (subject + configuration). */
  search?(request: CommerceRequest): SearchBuild | null
  /** Depth the bare detail page lands at and what the user sets there. */
  detailDepth: TransactionDepth
  detailPageOnly: string[]
  detailLimitation: string
  /** Legacy projection: a `{q}` search template when the merchant has a composable one, else its front door. */
  legacySearchTemplate?: string
}

const SEARCH_REF = 'search:'
const DMY = (iso: string) => iso.split('-').reverse().join('-') // YYYY-MM-DD → DD-MM-YYYY
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const isoDay = (iso: string) => new Date(`${iso}T00:00:00+07:00`).toISOString()

export function grammarAdapter(entry: ProviderRegistryEntry, grammar: HandoffGrammar): SearchCapableAdapter {
  return {
    providerId: entry.providerId,
    entry,
    supports(request: CommerceRequest) {
      return entry.domains.includes(request.domain) && entry.intents.includes(request.intentType)
    },
    toOffer(request, hint: DiscoveryHint, now = new Date()) {
      if (!grammar.detail) return null
      const u = ownedUrl(entry, hint)
      if (!u) return null
      const d = grammar.detail(u, request)
      if (!d) return null
      if (hint.verified?.bookable === false) return null
      return baseOffer(entry, request, d.id, d.canonical, hint.title ?? request.subject, now)
    },
    searchOffer(request, now = new Date()) {
      const s = grammar.search?.(request)
      if (!s) return null
      const offer = baseOffer(entry, request, `${SEARCH_REF}${request.subject.slice(0, 120)}`, s.url, request.subject, now)
      searchBuilds.set(offer, s)
      return offer
    },
    buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
      const auth = authLimitation(offer.depthProfile, offer.merchantName)
      if (offer.subjectRef.startsWith(SEARCH_REF)) {
        // The search offer carries the build it was made from (the request's configuration went
        // into the URL at searchOffer time); a search offer this adapter did not build has no
        // build and is emitted as a plain L2 page.
        const s = searchBuilds.get(offer)
        return {
          url: s?.url ?? offer.canonicalUrl,
          depth: s?.depth ?? 2,
          paramsPreserved: s?.preserved ?? [],
          paramsPageOnly: s?.pageOnly ?? [],
          paramsDropped: s?.dropped ?? [],
          expiresAt: s?.expiresAt ?? null,
          grammar: s?.grammar ?? 'verified',
          limitations: [s?.limitation ?? `Trang tìm kiếm trên ${offer.merchantName}.`, ...(auth ? [auth] : [])],
        }
      }
      const configured = configuration && grammar.configure ? grammar.configure(offer.canonicalUrl, configuration) : null
      if (configured) {
        return {
          url: configured.url,
          depth: configured.depth,
          paramsPreserved: configured.preserved,
          paramsPageOnly: configured.pageOnly,
          paramsDropped: configured.dropped,
          expiresAt: configured.expiresAt,
          grammar: configured.grammar,
          limitations: [grammar.detailLimitation, ...(auth ? [auth] : [])],
        }
      }
      return {
        url: offer.canonicalUrl,
        depth: grammar.detailDepth,
        paramsPreserved: [refFieldOf(offer.domain)],
        paramsPageOnly: [...grammar.detailPageOnly],
        paramsDropped: [],
        expiresAt: null,
        grammar: 'verified',
        limitations: [grammar.detailLimitation, ...(auth ? [auth] : [])],
      }
    },
  }
}

/** Which configuration field names the subject for this domain (paramsPreserved vocabulary). */
function refFieldOf(domain: string): string {
  return domain === 'travel' ? 'propertyRef' : domain === 'entertainment' ? 'eventRef' : 'subjectRef'
}

/** The build behind a search offer (an Offer carries no grammar fields); keyed by identity, never serialised. */
const searchBuilds = new WeakMap<Offer, SearchBuild>()

// ── Grammars ─────────────────────────────────────────────────────────────────

const BOOKING_HOTEL = /^\/hotel\/([a-z]{2})\/([a-z0-9-]+)(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.html$/
const AGODA_HOTEL = /^\/(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9-]+)\/hotel\/([a-z0-9-]+)\.html$/
const TRAVELOKA_HOTEL = /^\/(?:[a-z]{2}-[a-z]{2}\/)?hotel\/([a-z-]+)\/([a-z0-9-]+-\d{5,})\/?$/
const VEXERE_ROUTE = /^\/vi-VN\/(ve-xe-khach-tu-([a-z0-9-]+)-di-([a-z0-9-]+)-(\d+t\d+))\.html$/
const TICKETBOX_EVENT = /^\/([a-z0-9-]+-(\d{3,12}))\/?$/
const TICKETBOX_RESERVED = new Set(['search', 'events', 'about', 'help', 'login', 'my-tickets', 'blog'])

/** Hotel stay → the query-string fields two OTAs accept (names differ). */
function stay(configuration: Configuration): { checkIn: string; checkOut: string; adults: number; rooms: number; children: number } | null {
  if (configuration.kind !== 'hotel') return null
  return { checkIn: configuration.checkIn, checkOut: configuration.checkOut, adults: configuration.adults, rooms: configuration.rooms ?? 1, children: configuration.children ?? 0 }
}

const booking: HandoffGrammar = {
  detail(u) {
    const m = u.pathname.match(BOOKING_HOTEL)
    // Only Vietnamese properties are in scope (the audit and the hotel tool both work on /hotel/vn/).
    return m && m[1] === 'vn' ? { id: m[2], canonical: `https://www.booking.com/hotel/vn/${m[2]}.vi.html` } : null
  },
  configure(canonical, configuration) {
    const s = stay(configuration)
    if (!s) return null
    const p = new URLSearchParams({ checkin: s.checkIn, checkout: s.checkOut, group_adults: String(s.adults), no_rooms: String(s.rooms), group_children: String(s.children) })
    return { url: `${canonical}?${p}`, depth: 4, preserved: ['propertyRef', 'checkIn', 'checkOut', 'adults', 'rooms', 'children'], pageOnly: [], dropped: [], expiresAt: isoDay(s.checkIn), grammar: 'verified' }
  },
  search(request) {
    const s = request.configuration ? stay(request.configuration) : null
    const term = request.constraints?.city ?? request.subject
    const p = new URLSearchParams({ ss: term })
    const preserved: string[] = []
    if (s) { p.set('checkin', s.checkIn); p.set('checkout', s.checkOut); p.set('group_adults', String(s.adults)); p.set('no_rooms', String(s.rooms)); p.set('group_children', String(s.children)); preserved.push('checkIn', 'checkOut', 'adults', 'rooms', 'children') }
    return { url: `https://www.booking.com/searchresults.vi.html?${p}`, depth: 2, preserved, pageOnly: [], dropped: ['propertyRef'], expiresAt: s ? isoDay(s.checkIn) : null, grammar: 'verified', limitation: 'Trang kết quả Booking.com cho điểm đến và ngày đã chọn — bạn chọn khách sạn trên trang.' }
  },
  detailDepth: 3,
  detailPageOnly: ['checkIn', 'checkOut', 'adults', 'rooms'],
  detailLimitation: 'Chọn phòng trên trang Booking.com; bước đặt phòng theo luồng chuẩn của Booking.com.',
  legacySearchTemplate: 'https://www.booking.com/searchresults.vi.html?ss={q}',
}

const agoda: HandoffGrammar = {
  detail(u) {
    const m = u.pathname.match(AGODA_HOTEL)
    if (!m || !/-vn$/.test(m[2])) return null
    return { id: `${m[1]}/${m[2]}`, canonical: `https://www.agoda.com/vi-vn/${m[1]}/hotel/${m[2]}.html` }
  },
  configure(canonical, configuration) {
    const s = stay(configuration)
    if (!s) return null
    const p = new URLSearchParams({ checkIn: s.checkIn, checkOut: s.checkOut, adults: String(s.adults), rooms: String(s.rooms), children: String(s.children) })
    // The occupancy from the URL was seen applied (14 Sep 2026); date application was not confirmed in that session.
    return { url: `${canonical}?${p}`, depth: 3, preserved: ['propertyRef', 'adults', 'rooms', 'children'], pageOnly: ['checkIn', 'checkOut'], dropped: [], expiresAt: isoDay(s.checkIn), grammar: 'observed' }
  },
  search() {
    // /vi-vn/search?q= and ?textToSearch= drop the query (verified 14 Sep 2026): the landing page is the truth.
    return { url: 'https://www.agoda.com/vi-vn/', depth: 0, preserved: [], pageOnly: [], dropped: ['propertyRef', 'checkIn', 'checkOut', 'adults', 'rooms', 'children'], expiresAt: null, grammar: 'verified', limitation: 'Agoda không nhận điểm đến qua URL — nhập điểm đến và ngày trên trang Agoda.' }
  },
  detailDepth: 3,
  detailPageOnly: ['checkIn', 'checkOut', 'adults', 'rooms'],
  detailLimitation: 'Xem phòng và giá trên trang Agoda; chọn ngày nếu trang chưa áp dụng.',
  legacySearchTemplate: 'https://www.agoda.com/vi-vn/',
}

const CABIN: Record<NonNullable<Extract<Configuration, { kind: 'transport' }>['cabin']>, string> = { economy: 'ECONOMY', premium_economy: 'PREMIUM_ECONOMY', business: 'BUSINESS', first: 'FIRST' }

const traveloka: HandoffGrammar = {
  detail(u) {
    const m = u.pathname.match(TRAVELOKA_HOTEL)
    return m ? { id: m[2], canonical: `https://www.traveloka.com/vi-vn/hotel/${m[1]}/${m[2]}` } : null
  },
  search(request) {
    const c = request.configuration
    if (request.intentType === 'book_flight' && c?.kind === 'transport' && c.mode === 'flight') {
      const o = c.originRef.toUpperCase(), d = c.destinationRef.toUpperCase()
      if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d)) return null
      const adults = c.passengers ?? 1
      const cabin = c.cabin ? CABIN[c.cabin] : 'ECONOMY'
      const url = `https://www.traveloka.com/vi-VN/flight/fullsearch?ap=${o}.${d}&dt=${DMY(c.departDate)}.${c.returnDate ? DMY(c.returnDate) : 'null'}&ps=${adults}.0.0&sc=${cabin}`
      const preserved = ['originRef', 'destinationRef', 'departDate', ...(c.returnDate ? ['returnDate'] : []), ...(c.passengers ? ['passengers'] : []), ...(c.cabin ? ['cabin'] : [])]
      // One-way economy verified 14 Sep 2026; the return date and other cabins use the same documented fields (observed).
      const grammar = !c.returnDate && (!c.cabin || c.cabin === 'economy') ? 'verified' : 'observed'
      return { url, depth: 2, preserved, pageOnly: [], dropped: [], expiresAt: isoDay(c.departDate), grammar, limitation: 'Kết quả chuyến bay theo ngày trên Traveloka; chọn chuyến và nhập thông tin hành khách trên trang.' }
    }
    if (request.intentType === 'book_hotel') {
      return { url: 'https://www.traveloka.com/vi-vn/hotel', depth: 1, preserved: [], pageOnly: [], dropped: ['propertyRef', 'checkIn', 'checkOut', 'adults', 'rooms', 'children'], expiresAt: null, grammar: 'verified', limitation: 'Trang khách sạn Traveloka — nhập điểm đến và ngày trên trang.' }
    }
    return null
  },
  detailDepth: 3,
  detailPageOnly: ['checkIn', 'checkOut', 'adults', 'rooms'],
  detailLimitation: 'Chọn ngày và phòng trên trang khách sạn Traveloka.',
}

/** Vexere spells Hồ Chí Minh City as "sai-gon"; the other city slugs follow the plain name. */
const VEXERE_ALIASES: Record<string, string> = { 'ho-chi-minh': 'sai-gon', 'tp-ho-chi-minh': 'sai-gon', 'tp-hcm': 'sai-gon', 'tphcm': 'sai-gon', 'hcm': 'sai-gon', 'saigon': 'sai-gon', 'thanh-pho-ho-chi-minh': 'sai-gon' }
const vexereSlug = (name: string) => { const s = slug(name); return VEXERE_ALIASES[s] ?? s }

const vexere: HandoffGrammar = {
  detail(u, request) {
    const m = u.pathname.match(VEXERE_ROUTE)
    if (!m) return null
    const c = request.configuration
    if (c?.kind !== 'transport' || c.mode !== 'bus') return null
    // Identity: the route page must name BOTH places the user asked for ("sai-gon" … "da-lat-lam-dong").
    const from = vexereSlug(c.originRef), to = vexereSlug(c.destinationRef)
    if (!from || !to || !m[2].startsWith(from) || !m[3].startsWith(to)) return null
    return { id: m[4], canonical: `https://vexere.com/vi-VN/${m[1]}.html` }
  },
  configure(canonical, configuration) {
    if (configuration.kind !== 'transport' || configuration.mode !== 'bus') return null
    // ?date=DD-MM-YYYY verified 14 Sep 2026 (route page 200, date applied to the trip list).
    return { url: `${canonical}?date=${q(DMY(configuration.departDate))}`, depth: 2, preserved: ['originRef', 'destinationRef', 'departDate'], pageOnly: ['passengers', ...(configuration.returnDate ? ['returnDate'] : [])], dropped: [], expiresAt: isoDay(configuration.departDate), grammar: 'verified' }
  },
  search() {
    return { url: 'https://vexere.com/vi-VN', depth: 0, preserved: [], pageOnly: [], dropped: ['originRef', 'destinationRef', 'departDate', 'passengers'], expiresAt: null, grammar: 'verified', limitation: 'Vexere không nhận tuyến qua URL tìm kiếm — nhập điểm đi, điểm đến và ngày trên trang.' }
  },
  detailDepth: 2,
  detailPageOnly: ['departDate', 'passengers'],
  detailLimitation: 'Chọn chuyến, ghế và điểm đón/trả trên trang Vexere; thông tin hành khách nhập ở bước sau.',
  legacySearchTemplate: 'https://vexere.com/vi-VN',
}

const vietnamairlines: HandoffGrammar = {
  search(request) {
    if (request.intentType !== 'book_flight') return null
    return { url: 'https://www.vietnamairlines.com/vn/vi/buy-tickets-other-products/booking-and-manage-bookings/book-tickets', depth: 1, preserved: [], pageOnly: [], dropped: ['originRef', 'destinationRef', 'departDate', 'returnDate', 'passengers', 'cabin'], expiresAt: null, grammar: 'verified', limitation: 'Vietnam Airlines không nhận chặng/ngày qua URL — nhập chặng bay và ngày trên trang đặt vé.' }
  },
  detailDepth: 1,
  detailPageOnly: [],
  detailLimitation: '',
}

const vietjet: HandoffGrammar = {
  search(request) {
    if (request.intentType !== 'book_flight') return null
    return { url: 'https://www.vietjetair.com/vi', depth: 1, preserved: [], pageOnly: [], dropped: ['originRef', 'destinationRef', 'departDate', 'returnDate', 'passengers', 'cabin'], expiresAt: null, grammar: 'verified', limitation: 'Vietjet không nhận chặng/ngày qua URL — nhập chặng bay và ngày trên trang chủ Vietjet.' }
  },
  detailDepth: 1,
  detailPageOnly: [],
  detailLimitation: '',
}

const ticketbox: HandoffGrammar = {
  detail(u) {
    const m = u.pathname.match(TICKETBOX_EVENT)
    if (!m || TICKETBOX_RESERVED.has(m[1])) return null
    return { id: m[2], canonical: `https://ticketbox.vn/${m[1]}` }
  },
  search(request) {
    const term = request.subject.replace(/\s+/g, ' ').trim()
    if (!term) return null
    return { url: `https://ticketbox.vn/search?q=${q(term)}`, depth: 2, preserved: [], pageOnly: ['date', 'quantity'], dropped: ['eventRef'], expiresAt: null, grammar: 'verified', limitation: 'Trang tìm kiếm sự kiện trên Ticketbox — bạn chọn đúng sự kiện trên trang.' }
  },
  detailDepth: 3,
  detailPageOnly: ['date', 'quantity'],
  detailLimitation: 'Chọn ngày và hạng vé trên trang sự kiện.',
  legacySearchTemplate: 'https://ticketbox.vn/search?q={q}',
}

export const GRAMMARS = { booking, agoda, traveloka, vexere, vietnamairlines, vietjet, ticketbox } as const

export const bookingAdapter = grammarAdapter(getProvider('booking')!, booking)
export const agodaAdapter = grammarAdapter(getProvider('agoda')!, agoda)
export const travelokaAdapter = grammarAdapter(getProvider('traveloka')!, traveloka)
export const vexereAdapter = grammarAdapter(getProvider('vexere')!, vexere)
export const vietnamairlinesAdapter = grammarAdapter(getProvider('vietnamairlines')!, vietnamairlines)
export const vietjetAdapter = grammarAdapter(getProvider('vietjet')!, vietjet)
export const ticketboxAdapter = grammarAdapter(getProvider('ticketbox')!, ticketbox)

/** The Completion Pass adapters: travel search / detail providers and events. */
export const GRAMMAR_ADAPTERS: readonly SearchCapableAdapter[] = [bookingAdapter, agodaAdapter, travelokaAdapter, vexereAdapter, vietnamairlinesAdapter, vietjetAdapter, ticketboxAdapter]

/** Composable legacy search templates these grammars publish (`{q}` placeholder). */
export function grammarSearchTemplates(): Array<{ providerId: string; name: string; template: string }> {
  const out: Array<{ providerId: string; name: string; template: string }> = []
  for (const a of GRAMMAR_ADAPTERS) {
    const g = GRAMMARS[a.providerId as keyof typeof GRAMMARS]
    if (g.legacySearchTemplate) out.push({ providerId: a.providerId, name: a.entry.merchantName, template: g.legacySearchTemplate })
  }
  return out
}
