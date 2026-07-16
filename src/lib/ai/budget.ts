import { normalizeVN } from './intent'

export type Budget = { min: number; max: number; type: 'range' | 'under' | 'around' }

export const LUXURY_PRICE_FLOOR = 1_500_000

export const LUXURY_KEYWORDS = ['5 sao', '5-sao', 'five star', 'pullman', 'intercontinental', 'marriott', 'sheraton', 'hilton', 'hyatt', 'novotel', 'sofitel', 'melia', 'movenpick', 'radisson', 'wyndham', 'imperial hotel', 'resort luxury', 'luxury resort']

const PROMO_KEYWORDS = ['tinh tien', 'khuyen mai', 'uu dai', 'giam gia', 'tang kem', 'mua tang', 'flash sale', 'sale off', 'giam con', 'chi con', 'chi tu']

const LUXURY_BRANDS_FILTER = [
  'Pullman', 'pullman',
  'Marriott', 'marriott',
  'Hilton', 'hilton',
  'Sheraton', 'sheraton',
  'Intercontinental', 'intercontinental',
  'Sofitel', 'sofitel',
  'Novotel', 'novotel',
  'Melia', 'melia',
  'Hyatt', 'hyatt',
  'Wyndham', 'wyndham',
  'Movenpick', 'movenpick',
  'Radisson', 'radisson',
  'Renaissance', 'renaissance',
  'Imperial Hotel', 'imperial hotel',
]

function parseMoneyAmount(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr.replace(/\./g, '').replace(/,/g, '.'))
  if (isNaN(n) || n <= 0) return null
  const u = (unit || '').toLowerCase().trim()
  if (u === 'k') return n * 1000
  if (u === 'tr' || u.startsWith('tri') || u.startsWith('trieu')) return n * 1_000_000
  if (u === 'ngan' || u.startsWith('nghin')) return n * 1000
  if (!u && n > 0 && n <= 9999) return n * 1000
  return n
}

function extractPricesVND(text: string): number[] {
  const t = normalizeVN(text.toLowerCase())
  const prices: number[] = []
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d{3})+)\s*(?:d\b|dong|vnd)?/g)) {
    const n = parseFloat(m[1].replace(/\./g, '').replace(/,/g, ''))
    if (!isNaN(n) && n >= 5000) prices.push(n)
  }
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*k\b/g)) {
    const n = parseFloat(m[1]) * 1000
    if (!isNaN(n) && n >= 5000) prices.push(n)
  }
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:trieu|tri\b)/g)) {
    const n = parseFloat(m[1].replace(',', '.')) * 1_000_000
    if (!isNaN(n) && n > 0) prices.push(n)
  }
  return prices
}

function extractRepresentativePriceVND(text: string): number | null {
  const prices = extractPricesVND(text)
  if (prices.length === 0) return null
  const t = normalizeVN(text.toLowerCase())
  const hasPromo = PROMO_KEYWORDS.some(k => t.includes(k))
  return hasPromo ? Math.max(...prices) : Math.min(...prices)
}

export function extractBudget(userMessage: string): Budget | null {
  const t = normalizeVN(userMessage.toLowerCase())
  const N = '([\\d][\\d.,]*)'
  const U = '\\s*(k|tr|trieu|ngan|nghin)?'

  const rangeRe = new RegExp(`(?:tu\\s+)?${N}${U}\\s*(?:den|toi|-)\\s*${N}${U}`)
  let m = t.match(rangeRe)
  // A real money range names its unit on at least ONE side: "100k-200k",
  // "tu 500k den 1 trieu", "2-3 trieu". A BARE N-M with no unit anywhere is
  // almost never a budget in this app's traffic — it's "4-5 sao", "2-3 nguoi",
  // "quan 1-3", "3-4 ngay", "8-10 gio". Those all matched here (the `tu` prefix
  // is optional and `-` is a separator), and parseMoneyAmount multiplies a
  // unitless n<=9999 by 1000 — so "khach san 4-5 sao" became a 4.000-5.000d
  // budget. That filtered away every real result ("Trong tam 4k-5k... chua tim
  // duoc") AND, being under LUXURY_PRICE_FLOOR, switched on the luxury-brand
  // stream filter that rewrites hotel names to "khach san" mid-answer.
  // Requiring a unit trades a rare miss ("tu 100 den 200" with no unit at all,
  // now unfiltered rather than wrong) for killing that entire class.
  if (m && (m[2] || m[4])) {
    const min = parseMoneyAmount(m[1], m[2] || '')
    const max = parseMoneyAmount(m[3], m[4] || '')
    if (min !== null && max !== null && max >= min && max > 0) return { min, max, type: 'range' as const }
  }

  const underRe = new RegExp(`(?:duoi|khong qua|toi da)\\s+${N}${U}`)
  m = t.match(underRe)
  if (m) {
    const max = parseMoneyAmount(m[1], m[2] || '')
    if (max !== null && max > 0) return { min: 0, max, type: 'under' as const }
  }

  const aroundRe = new RegExp(`(?:tam|khoang|xap xi)\\s+${N}${U}`)
  m = t.match(aroundRe)
  if (m) {
    const base = parseMoneyAmount(m[1], m[2] || '')
    if (base !== null && base > 0) return { min: Math.round(base * 0.8), max: Math.round(base * 1.2), type: 'around' as const }
  }

  return null
}

function fmtBudget(budget: Budget): string {
  const f = (n: number) => n >= 1_000_000
    ? (n / 1_000_000 % 1 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)) + ' triệu'
    : n / 1000 + 'k'
  return budget.min > 0 ? `${f(budget.min)}-${f(budget.max)}` : `dưới ${f(budget.max)}`
}

function fmtSuggest(n: number): string {
  return n >= 1_000_000
    ? (n / 1_000_000 % 1 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)) + ' triệu'
    : n / 1000 + 'k'
}

function filterResultsByBudget<T extends { title?: string; snippet?: string; price_vnd?: number }>(
  items: T[], budget: Budget
): T[] {
  const tol = 1.1
  const enforceMin = budget.type === 'range' && budget.min > 0
  return items.filter(item => {
    if (typeof item.price_vnd === 'number') {
      const ok = item.price_vnd <= budget.max * tol
      return enforceMin ? ok && item.price_vnd >= budget.min * 0.9 : ok
    }
    const itemAny = item as Record<string, unknown>
    const linkText = typeof itemAny.link === 'string' ? itemAny.link : ''
    const text = normalizeVN(((item.title || '') + ' ' + (item.snippet || '') + ' ' + linkText).toLowerCase())
    const isLuxury = LUXURY_KEYWORDS.some(k => text.includes(k))
    if (isLuxury && budget.max < LUXURY_PRICE_FLOOR) return false
    const price = extractRepresentativePriceVND(text)
    if (price !== null) {
      const underMax = price <= budget.max * tol
      const aboveMin = enforceMin ? price >= budget.min * 0.9 : true
      return underMax && aboveMin
    }
    return true
  })
}

export function applyBudgetFilter(result: unknown, budget: Budget, category: string): unknown {
  if (!result || typeof result !== 'object') return result
  const r = { ...(result as Record<string, unknown>) }

  if (Array.isArray(r.search_results)) {
    const before = r.search_results as Array<{ title?: string; snippet?: string }>
    const after = filterResultsByBudget(before, budget)
    if (after.length === 0 && before.length > 0) {
      const suggest = Math.round(budget.max * 1.2 / 1000) * 1000
      return {
        budget_filter_empty: true,
        budget_range: fmtBudget(budget),
        message: `Trong tầm ${fmtBudget(budget)} ở khu vực này mình chưa tìm được ${category} phù hợp. Bạn có muốn nới budget lên ${fmtSuggest(suggest)} không, hay mình tìm khu vực khác?`,
      }
    }
    r.search_results = after
    if (Array.isArray(r.hotel_list)) r.hotel_list = []
  }

  if (Array.isArray(r.price_search_results)) {
    r.price_search_results = filterResultsByBudget(
      r.price_search_results as Array<{ title?: string; snippet?: string }>, budget
    )
  }

  if (Array.isArray(r.flights)) {
    type FlightEntry = { price_vnd: number }
    const before = r.flights as FlightEntry[]
    const after = before.filter(f => f.price_vnd <= budget.max * 1.1)
    if (after.length === 0 && before.length > 0) {
      const suggest = Math.round(budget.max * 1.2 / 1000) * 1000
      return {
        budget_filter_empty: true,
        budget_range: fmtBudget(budget),
        message: `Trong tầm ${fmtBudget(budget)} mình chưa tìm được ${category} phù hợp. Bạn có muốn nới budget lên ${fmtSuggest(suggest)} không?`,
      }
    }
    r.flights = after
  }

  if (budget.max < LUXURY_PRICE_FLOOR) {
    r._LENH_BAT_BUOC = `⚠️ LENH BAT BUOC - DOC TRUOC KHI VIET PHAN HOI: Nguoi dung co budget ${fmtBudget(budget)} VND - THAP HON gia khach san cao cap. TUYET DOI KHONG duoc de cap bat ky thuong hieu nao sau day du chi la de so sanh hay goi y: Pullman, Marriott, Hilton, Sheraton, Intercontinental, Sofitel, Novotel, Melia, Hyatt, Wyndham, Movenpick, Radisson, Imperial, Renaissance, Lotte, JW Marriott, Grand Mercure. Chi de cap cac khach san co trong search_results (da duoc loc theo budget). Neu khong con search_results phu hop, bao user nang budget.`
  }

  return r
}

function filterLuxuryBrands(text: string): string {
  let out = text
  for (const brand of LUXURY_BRANDS_FILTER) {
    if (out.includes(brand)) {
      out = out.split(brand).join('khách sạn')
    }
  }
  return out
}

export function applyLuxuryStreamFilter(response: Response): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let lineRemainder = ''

  const transform = new TransformStream<any, any>({
    transform(chunk, controller) {
      lineRemainder += decoder.decode(chunk, { stream: true })
      const parts = lineRemainder.split('\n')
      lineRemainder = parts.pop() ?? ''

      for (const line of parts) {
        if (line.startsWith('0:')) {
          try {
            const text = JSON.parse(line.slice(2)) as string
            const filtered = filterLuxuryBrands(text)
            controller.enqueue(encoder.encode('0:' + JSON.stringify(filtered) + '\n'))
          } catch {
            controller.enqueue(encoder.encode(line + '\n'))
          }
        } else {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
    flush(controller) {
      if (lineRemainder) {
        if (lineRemainder.startsWith('0:')) {
          try {
            const text = JSON.parse(lineRemainder.slice(2)) as string
            const filtered = filterLuxuryBrands(text)
            controller.enqueue(encoder.encode('0:' + JSON.stringify(filtered) + '\n'))
          } catch {
            controller.enqueue(encoder.encode(lineRemainder + '\n'))
          }
        } else {
          controller.enqueue(encoder.encode(lineRemainder + '\n'))
        }
      }
    },
  })

  const readable = body.pipeThrough(transform)
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
