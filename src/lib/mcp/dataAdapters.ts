import { createClient } from '@supabase/supabase-js'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { vi as DEALS_VI, en as DEALS_EN } from '@/lib/i18n/w3/deals'
import type { ServiceAdapter } from './serviceMap'

// The 'deals.search' and 'clips.search' services of the Gateway (27/11/2026). Both read PUBLIC data Tappy already shows: the Deal page's active deals and the public Explore clips.
// No LLM, no paid provider, no service key: the clips read uses an ANON client with no cookies, so row-level security applies exactly as for a visitor.

type Env = Record<string, string | undefined>

/** Lower case, accents removed (đ too), so "mua sam" finds "Mua sắm". */
const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

/** Words that only say "offers" or "give me": they do not narrow the search ("ưu đãi giảm giá" lists everything on now). */
const OFFER_WORDS: ReadonlySet<string> = new Set(['uu', 'dai', 'khuyen', 'mai', 'giam', 'gia', 'deal', 'deals', 'voucher', 'ma', 'promo', 'promotion', 'discount', 'offer', 'offers', 'sale', 'coupon', 'cho', 'toi', 'tim', 'co', 'nao', 'nhung', 'cac', 'va', 'cua', 'on', 'now', 'hien', 'nay'])

const words = (q: string): string[] => fold(q).split(/[^a-z0-9]+/).filter(w => w.length >= 2)

/**
 * The tracked partner cards the Deal page shows (Lazada, Vexere, Agoda, Traveloka): the SAME resolver (`affiliatePartnerCards`) after the SAME provider-config refresh as GET /api/deals/partners. A card exists
 * only when its link carries affiliate tracking, and makes no claim of a price or discount (it is the partner's booking front door). Any failure here yields no cards, never an error.
 */
async function partnerCardRows(lang: 'vi' | 'en'): Promise<Array<Record<string, unknown>>> {
  try {
    const { hasProviderConfigSource, refreshProviderConfig } = await import('@/lib/ccp')
    const { installProviderConfigSource } = await import('@/lib/commerce/providerConfigSource')
    if (!hasProviderConfigSource()) installProviderConfigSource()
    await refreshProviderConfig()
    const { affiliatePartnerCards } = await import('@/lib/deals/affiliatePartners')
    const dict = lang === 'en' ? DEALS_EN : DEALS_VI
    return affiliatePartnerCards({ locale: lang }).map(card => {
      const description = dict[card.descriptionKey] ?? DEALS_VI[card.descriptionKey] ?? null
      return { id: `partner:${card.providerId}`, partnerName: card.partnerName, title: description ? `${card.partnerName}: ${description}` : card.partnerName, category: lang === 'en' ? 'Partner' : 'Đối tác', description, officialUrl: card.url }
    })
  } catch { return [] }
}

/**
 * What the Deal page shows, for Vietnam: the tracked partner cards FIRST (Lazada, Vexere, ...: the Deal page puts them first, and they are the partners Tappy really has a tracked link for), then the managed deals
 * (the page's own reader), both filtered by the words of the ask; managed deals featured first, then the ones ending soonest. A partner that already has a managed deal is not listed twice. A failure of either
 * source never takes the other with it.
 */
export const dealsAdapter: ServiceAdapter = async c => {
  let deals: Array<Record<string, unknown>> = []
  try {
    const { getActiveDeals } = await import('@/lib/deals/partnerDeals')
    deals = (await getActiveDeals('VN', c.lang)) as unknown as Array<Record<string, unknown>>
  } catch { deals = [] }
  const cards = await partnerCardRows(c.lang)
  const need = words(c.query).filter(w => !OFFER_WORDS.has(w))
  const hay = (d: Record<string, unknown>) => fold([d.partnerName, d.title, d.category, d.description].filter(x => typeof x === 'string').join(' '))
  const match = (list: Array<Record<string, unknown>>) => (need.length === 0 ? list : list.filter(d => { const h = hay(d); return need.every(w => h.includes(w)) }))
  const withDeal = new Set(deals.map(d => fold(String(d.partnerName ?? ''))))
  const keptCards = match(cards).filter(card => !withDeal.has(fold(String(card.partnerName))))
  const end = (d: Record<string, unknown>) => (typeof d.endAt === 'string' ? Date.parse(d.endAt) : Number.POSITIVE_INFINITY)
  const sorted = [...match(deals)].sort((a, b) => Number(b.isFeatured === true) - Number(a.isFeatured === true) || end(a) - end(b))
  // A deal that states a real discount or voucher is the most concrete thing there is: it leads. The partner cards come next, then the deals that only name the partner.
  const concrete = (d: Record<string, unknown>) => !!(typeof d.discountLabel === 'string' && d.discountLabel.trim()) || !!(typeof d.voucherCode === 'string' && d.voucherCode.trim())
  return { rows: [...sorted.filter(concrete), ...keptCards, ...sorted.filter(d => !concrete(d))].slice(0, c.limit) }
}

// Only what the clip DTO needs. 🚨 No user_id, no profile, no source link, no media URL, no photos: the author and the file never leave the database call.
const CLIP_COLUMNS = 'id, place_name, place_address, body, thumbnail, like_count, comment_count, created_at'

/**
 * Public video clips, the SAME visibility as the public Explore feed: not hidden, published by the content-safety gate (fail-closed), a video with a file. Every word of the ask must match the place, the caption
 * or the address (one OR group per word, at most four words); quotes and backslashes are escaped so nothing breaks out of the filter. Most liked first, then newest. null when the public database settings are absent.
 */
export function clipsAdapterFromEnv(env: Env): ServiceAdapter | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return async c => {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    let q = sb.from('reviews').select(CLIP_COLUMNS)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .or(publishableFilter(env))
      .eq('content_type', 'video')
      .not('media_url', 'is', null)
    for (const t of c.query.trim().split(/\s+/).filter(w => w.length >= 2).slice(0, 4)) {
      const safe = t.replace(/[\\"]/g, m => '\\' + m)
      q = q.or(`place_name.ilike."%${safe}%",body.ilike."%${safe}%",place_address.ilike."%${safe}%"`)
    }
    const { data, error } = await q.order('like_count', { ascending: false }).order('created_at', { ascending: false }).limit(c.limit)
    if (error) throw new Error('clips_read_failed')
    return { rows: (data ?? []) as Array<Record<string, unknown>> }
  }
}
