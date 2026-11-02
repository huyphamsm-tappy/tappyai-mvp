import { CCP_ENABLED } from '@/lib/config/product'
import { adapterState, claimableAvailability, claimablePrice, logRealtime } from '@/lib/providers/realtime/common'
import { liveSentence, REALTIME_ADAPTERS, resolveBooking, type ResolveDeps } from '@/lib/providers/realtime/resolve'
import type { RealtimeProviderId, SearchCriteria, SearchResult, Vertical } from '@/lib/providers/realtime/types'
import { buildRecheckUrl } from '@/lib/providers/realtime/recheckLink'
import type { CommerceAttachContext, CommerceToolName } from './commerce'

// ── Realtime booking data in the chat flow (owner brief 06/10: "connect the realtime layer into user chat") ───────────────────────────
//
// The seam is the one every booking tool already passes through: attachCommerceLinks(toolName, result, ctx). After the existing CCP links are
// attached, THIS adds the realtime answer — only when a provider is switched on (CCP_REALTIME_<P>='1') AND fully credentialed AND able to answer
// the vertical. Otherwise the function returns the result UNTOUCHED: no flag, no credential, no change to what Tappy says today. The existing
// dynamic deeplinks, cards, ranking and consultative wording are never replaced; realtime only ADDS data when it genuinely exists.
//
// What it adds to the tool result (all optional, all absent when there is no realtime answer):
//   · realtime_results       — the normalized offers: provider, name, price + currency (only while fresh), availability, `checked_at`, booking URL, sentence;
//   · realtime_note          — the rule the model must follow when it mentions them (give the time; never say "realtime"; the page re-checks);
//   · booking_links          — the provider booking pages, so the system appends them if the model does not copy them (streamEnrichment, same channel as flights);
//   · price_search_results   — the price as EVIDENCE (entity-scoped), so a price Tappy fetched is not mistaken for an unsupported claim by the price guards.
// A result Tappy could not refresh inside its TTL is shown WITHOUT a price and says the price is checked on the provider's page.

type Row = Record<string, unknown>
const isRecord = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)

const VERTICAL_OF: Partial<Record<CommerceToolName, Vertical>> = { get_hotel_prices: 'hotel', get_flight_prices: 'flight', get_transport_options: 'bus' }
const ISO = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_ADULTS = 2
const MAX_RESULTS = 5
const MERCHANT: Record<RealtimeProviderId, string> = { agoda: 'Agoda', booking: 'Booking.com', traveloka: 'Traveloka', vexere: 'Vexere' }

/** The public site origin for links the reply carries (https only; the production host otherwise) — the same rule as the click links. */
function siteBase(): string {
  const v = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  return v && /^https:\/\//.test(v) ? v : 'https://www.tappyai.com'
}

const vnd = (n: number, cur: 'VND' | 'USD') => (cur === 'VND' ? `${Math.round(n).toLocaleString('vi-VN')}đ` : `${n} USD`)
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })

/** The search the tool call corresponds to, from what the tool/route already extracted — never a new extraction. Null = not a realtime-capable question. */
export function criteriaFor(toolName: CommerceToolName, r: Row, ctx: CommerceAttachContext): { criteria: SearchCriteria; assumedAdults: boolean } | null {
  const vertical = VERTICAL_OF[toolName]
  if (!vertical) return null
  if (vertical === 'hotel') {
    const destination = typeof ctx.location === 'string' ? ctx.location.trim().slice(0, 80) : ''
    const { checkIn, checkOut } = ctx
    if (!destination || !checkIn || !checkOut || !ISO.test(checkIn) || !ISO.test(checkOut) || !(checkOut > checkIn)) return null
    const assumedAdults = !(typeof ctx.passengers === 'number' && ctx.passengers >= 1)
    return { assumedAdults, criteria: { vertical, subject: (ctx.query ?? `khách sạn ${destination}`).slice(0, 120), currency: 'VND', userCountry: 'VN', context: { destination, checkIn, checkOut, adults: assumedAdults ? DEFAULT_ADULTS : ctx.passengers, rooms: 1 } } }
  }
  const origin = typeof r.origin === 'string' && /^[A-Z]{3}$/.test(r.origin) ? r.origin : typeof ctx.origin === 'string' ? ctx.origin : ''
  const destination = typeof r.destination === 'string' && /^[A-Z]{3}$/.test(r.destination) ? r.destination : typeof ctx.destination === 'string' ? ctx.destination : ''
  const departureDate = ctx.departDate ?? (typeof r.depart_date === 'string' ? r.depart_date : undefined)
  if (!origin || !destination || !departureDate || !ISO.test(departureDate)) return null
  return { assumedAdults: false, criteria: { vertical, subject: `${origin} → ${destination}`, currency: 'VND', userCountry: 'VN', context: { origin, destination, departureDate, ...(ctx.returnDate && ISO.test(ctx.returnDate) ? { returnDate: ctx.returnDate } : {}), adults: ctx.passengers && ctx.passengers >= 1 ? ctx.passengers : 1 } } }
}

const REALTIME_KEYS = ['realtime_results', 'realtime_note'] as const

/** What a realtime-capable provider says for this vertical, with the state that decides whether it is called at all. */
function readyFor(vertical: Vertical, env: Record<string, string | undefined>, adapters = REALTIME_ADAPTERS) {
  return adapters.filter(a => a.verticals.includes(vertical)).map(a => ({ adapter: a, ...adapterState(a, env) }))
}

export async function attachRealtime(toolName: CommerceToolName, result: unknown, ctx: CommerceAttachContext = {}): Promise<unknown> {
  const vertical = VERTICAL_OF[toolName]
  if (!vertical || !(ctx.enabled ?? CCP_ENABLED) || !isRecord(result)) return result
  const seam: Partial<ResolveDeps> = ctx.realtime ?? {}
  const env = seam.env ?? (process.env as Record<string, string | undefined>)
  const adapters = seam.adapters ?? REALTIME_ADAPTERS

  // Idempotent on a cached result object (the tools memoise it for minutes): the previous turn's realtime attachment goes first.
  for (const k of REALTIME_KEYS) delete result[k]
  if (Array.isArray(result.booking_links)) result.booking_links = (result.booking_links as Array<Row>).filter(l => !(isRecord(l) && l._realtime === true))
  if (Array.isArray(result.price_search_results)) result.price_search_results = (result.price_search_results as Array<Row>).filter(l => !(isRecord(l) && l._realtime === true))

  const states = readyFor(vertical, env, adapters)
  const ready = states.filter(s => s.state === 'READY')
  if (ready.length === 0) {
    // Default path (flags OFF): silent and untouched. A switched-on provider without credentials is logged once (names only) so the block is visible.
    for (const s of states) if (s.state === 'BLOCKED_CREDENTIALS') logRealtime(s.adapter.provider, 'attach', { ok: false, reason: 'credentials_missing' })
    return result
  }
  const built = criteriaFor(toolName, result, ctx)
  if (!built) { for (const s of ready) logRealtime(s.adapter.provider, 'attach', { ok: false, reason: 'unsupported' }); return result }

  const now = ctx.now ?? new Date()
  let res
  try {
    res = await resolveBooking(built.criteria, { ...seam, env, adapters, fallbackLinks: false, now: seam.now ?? (() => new Date()) })
  } catch {
    return result // the layer never throws; this is the belt to its braces — a realtime failure never costs the user the tool result
  }
  if (res.realtime.length === 0) {
    for (const s of res.statuses) if (s.state === 'READY') logRealtime(s.provider, 'attach', { ok: false, reason: s.reason ?? 'empty' })
    return result
  }

  const offers = res.realtime
    .filter(o => o.availabilityStatus !== 'sold_out')
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    .slice(0, MAX_RESULTS)
  if (offers.length === 0) return result

  const rows = offers.map(o => describe(o, now, built.assumedAdults, built.criteria))
  result.realtime_results = rows
  result.realtime_note = noteFor(rows, built.assumedAdults, built.criteria)
  // Web only: ONE "Kiểm tra giá & tình trạng" link per offer whose provider can recheck, placed BEFORE its booking link (flow: recheck → booking CTA).
  // Native clients never receive it (no client shows a dead link); a provider with no recheck, or a result Tappy does not hold, gets none.
  const canRecheck = new Set(adapters.filter(a => a.recheck).map(a => a.provider))
  const links: Row[] = []
  offers.forEach((o, i) => {
    const row = rows[i]
    const c = built.criteria.context
    if (ctx.platform === 'web' && built.criteria.vertical === 'hotel' && canRecheck.has(o.provider) && (o.provider === 'agoda' || o.provider === 'booking') && c.checkIn && c.checkOut && c.adults) {
      links.push({
        name: `Kiểm tra giá & tình trạng: ${o.title}`,
        platform: row.provider as string,
        _realtime: true,
        url: buildRecheckUrl(siteBase(), {
          v: 1,
          provider: o.provider,
          providerItemId: o.providerItemId,
          title: o.title,
          previousPrice: typeof row.price === 'number' ? row.price : null,
          ...(o.currency ? { currency: o.currency } : {}),
          stay: { ...(c.destination ? { destination: c.destination } : {}), checkIn: c.checkIn, checkOut: c.checkOut, adults: c.adults, ...(c.rooms ? { rooms: c.rooms } : {}) },
        }),
      })
    }
    if (row.booking_url) links.push({ name: row.link_label as string, platform: row.provider as string, url: row.booking_url as string, _realtime: true })
  })
  if (links.length > 0) {
    result.booking_links = [...(Array.isArray(result.booking_links) ? result.booking_links : []), ...links]
    // The marker streamEnrichment reads (an array) to collect these as system links; an existing array is never replaced.
    if (!Array.isArray(result._tappy_commerce)) result._tappy_commerce = []
  }
  // The same facts as price EVIDENCE for the price guards: an entity-scoped row per fresh price.
  const evidence = rows.filter(r => typeof r.price === 'number').map(r => ({ title: `${r.name} — ${r.provider}`, snippet: `${r.price_text} (${r.provider}, ${r.checked_at})`, link: r.booking_url ?? undefined, evidence_scope: 'entity', evidence_about: r.name, _realtime: true }))
  if (evidence.length > 0) result.price_search_results = [...(Array.isArray(result.price_search_results) ? result.price_search_results : []), ...evidence]
  for (const o of offers) logRealtime(o.provider, 'attach', { ok: true, results: offers.length })
  return result
}

function describe(o: SearchResult, now: Date, assumedAdults: boolean, c: SearchCriteria): Row {
  const price = claimablePrice(o, now)
  const avail = claimableAvailability(o, now)
  const provider = MERCHANT[o.provider]
  const fresh = price !== null && o.currency !== null && o.lastCheckedAt !== null
  const priceText = fresh ? vnd(price as number, o.currency as 'VND' | 'USD') : null
  const checkedAt = fresh ? hhmm(o.lastCheckedAt as string) : null
  const guests = c.context.adults !== undefined ? `${c.context.adults} người${assumedAdults ? ' (mặc định)' : ''}` : null
  return {
    provider,
    name: o.title,
    ...(fresh ? { price, currency: o.currency, price_text: priceText } : {}),
    ...(fresh && avail === 'available' && o.availability !== null ? { rooms_left: o.availability } : {}),
    availability_status: avail,
    ...(checkedAt ? { checked_at: checkedAt } : {}),
    ...(guests ? { for_guests: guests } : {}),
    booking_url: o.bookingUrl,
    ...(o.contextMissingInUrl.length > 0 ? { context_missing_in_url: o.contextMissingInUrl } : {}),
    sentence: liveSentence(o, now),
    link_label: fresh ? `${o.title} — ${priceText}, kiểm tra lúc ${checkedAt}` : o.title,
  }
}

function noteFor(rows: Row[], assumedAdults: boolean, c: SearchCriteria): string {
  const fresh = rows.some(r => typeof r.price === 'number')
  const parts = [
    fresh
      ? 'realtime_results: giá do Tappy vừa kiểm tra với nhà cung cấp, kèm giờ kiểm tra (checked_at). Chỉ nêu giá có trong realtime_results, luôn kèm tên nhà cung cấp và "kiểm tra lúc <checked_at>"; KHÔNG dùng chữ "realtime"/"thời gian thực"; nói giá có thể đổi khi mở trang.'
      : 'realtime_results: kết quả không còn mới nên KHÔNG có giá — không nêu giá; nói giá và tình trạng được kiểm tra trên trang nhà cung cấp khi người dùng mở trang.',
    'Dẫn nguyên văn các link trong booking_links.',
  ]
  if (assumedAdults && c.vertical === 'hotel') parts.push(`Số khách chưa được nêu: giá tính cho ${c.context.adults} người lớn (mặc định) — nói rõ để người dùng đổi trên trang.`)
  if (rows.some(r => Array.isArray(r.context_missing_in_url))) parts.push('Một số link không mang đủ ngày/số khách (context_missing_in_url): nói người dùng chọn lại các mục đó trên trang.')
  return parts.join(' ')
}

