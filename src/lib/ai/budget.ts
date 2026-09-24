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
  // English millions, so "budget 5 million" resolves the same as "5 triệu".
  if (u === 'm' || u.startsWith('mil')) return n * 1_000_000
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

/**
 * 🚨 A PERCENTAGE IS NEVER MONEY (PRELAUNCH 5a, Session D 2026-09-24) — and neither is a head count,
 * an age, a weight, a distance, a year, a time or a spec.
 *
 * The range / "dưới" / "khoảng" forms accept a number with NO unit and read a bare number ≤ 9999
 * as thousands of đồng (`parseMoneyAmount`), which is right for "từ 50 đến 60" and "tầm 500". It
 * also turned "iPhone cũ pin 98-99%" into a 98k–99k budget — measured: the reply offered to "nâng
 * budget lên 119k" for an iPhone — and "5-6 người", "dưới 5 tuổi", "khoảng 2 km", "20-25kg",
 * "2020-2023", "7-9h" into money the same way.
 *
 * So a UNITLESS match is money only when the words around it do not say otherwise: nothing in
 * NON_MONEY_AFTER follows it (a trailing range half such as "-9" is skipped first), nothing in
 * NON_MONEY_BEFORE precedes it, and it does not look like a year. A match that carries a money unit
 * (k, tr, triệu, nghìn) is money regardless. Every match is tried, so a later real amount still
 * wins: "pin 98-99%, giá dưới 15 triệu" → 15 triệu.
 */
const NON_MONEY_AFTER = /^\s*(?:%|phan tram|percent|kg|kilo|gram|gr?\b|km|kilomet|m\b|met\b|cm|mm|inch|in\b|"|mp\b|megapixel|gb|tb|mb\b|mah|w\b|kw|hz|nguoi|khach|be\b|chau|tre\b|tuoi|nam\b|thang|tuan|ngay|dem|gio|h\b|tieng|phut|giay|lan\b|cai|chiec|mon\b|phong|tang|lau\b|sao\b|ban\b|suat|ly\b|coc|chai|lon\b|hop\b|goi\b|ve\b|x\b|do\b|°|size|cho ngoi)/
const NON_MONEY_BEFORE = /(?:size|sz|pin|ram|rom|bo nho|dung luong|doi|model|phien ban|version|ios|android|tang|lau|phong|so nha|lop|khoi|nam|ngay|thang|luc|gio|tu gio|mo cua|dong cua|iphone|galaxy|note|series|ban)\s*$/
const RANGE_TAIL = /^\s*(?:-|den|toi)\s*[\d][\d.,]*/

function unitlessIsMoney(t: string, start: number, end: number, nums: string[]): boolean {
  const after = t.slice(end).replace(RANGE_TAIL, '')
  if (NON_MONEY_AFTER.test(after)) return false
  if (NON_MONEY_BEFORE.test(t.slice(Math.max(0, start - 24), start))) return false
  // A year (or a year range) is a date, not an amount.
  if (nums.every(n => /^\d{4}$/.test(n) && Number(n) >= 1900 && Number(n) <= 2100)) return false
  return true
}

export function extractBudget(userMessage: string): Budget | null {
  const t = normalizeVN(userMessage.toLowerCase())
  const N = '([\\d][\\d.,]*)'
  // The unit must END at a word boundary: without `\b` the `k` of "25kg" read as "25k".
  const U = '\\s*(?:(k|tr|trieu|ngan|nghin)\\b)?'

  const rangeRe = new RegExp(`(?:tu\\s+)?${N}${U}\\s*(?:den|toi|-)\\s*${N}${U}`, 'g')
  for (const m of t.matchAll(rangeRe)) {
    const numStart = (m.index ?? 0) + m[0].indexOf(m[1])
    if (!m[2] && !m[4] && !unitlessIsMoney(t, numStart, (m.index ?? 0) + m[0].length, [m[1], m[3]])) continue
    const min = parseMoneyAmount(m[1], m[2] || '')
    const max = parseMoneyAmount(m[3], m[4] || '')
    if (min !== null && max !== null && max >= min && max > 0) return { min, max, type: 'range' as const }
  }

  const underRe = new RegExp(`(?:duoi|khong qua|toi da)\\s+${N}${U}`, 'g')
  for (const m of t.matchAll(underRe)) {
    const numStart = (m.index ?? 0) + m[0].indexOf(m[1], m[0].search(/\d/))
    if (!m[2] && !unitlessIsMoney(t, numStart, (m.index ?? 0) + m[0].length, [m[1]])) continue
    const max = parseMoneyAmount(m[1], m[2] || '')
    if (max !== null && max > 0) return { min: 0, max, type: 'under' as const }
  }

  const aroundRe = new RegExp(`(?:tam|khoang|xap xi)\\s+${N}${U}`, 'g')
  for (const m of t.matchAll(aroundRe)) {
    const numStart = (m.index ?? 0) + m[0].search(/\d/)
    if (!m[2] && !unitlessIsMoney(t, numStart, (m.index ?? 0) + m[0].length, [m[1]])) continue
    const base = parseMoneyAmount(m[1], m[2] || '')
    if (base !== null && base > 0) return { min: Math.round(base * 0.8), max: Math.round(base * 1.2), type: 'around' as const }
  }

  // ── The BARE form: "ngân sách 5 triệu" / "budget 5 million" ───────────────
  //
  // Checked LAST so every qualifier above still wins — "ngân sách khoảng 5
  // triệu" keeps its ±20% band rather than collapsing to a ceiling.
  //
  // This is the most natural Vietnamese phrasing and it returned null, so a trip
  // request stating "ngân sách 5 triệu" carried NO budget into the prompt budget
  // block, applyBudgetFilter, or the ranker — the constraint was silently lost.
  //
  // A UNIT IS REQUIRED, and that requirement is what makes the rule safe: it is
  // the reason "Đà Nẵng 3 ngày" and "2 người" cannot become budgets. A bare
  // "budget 5" is genuinely ambiguous and is refused rather than guessed.
  // A BOUNDED, non-greedy gap is allowed between the keyword and the amount, so
  // natural phrasings reach the number: "ngân sách tối đa CỦA MÌNH LÀ 20 triệu",
  // "my maximum budget IS 20 million". Found by live acceptance 2026-08-17 — the
  // refinement turn was silently dropping the narrowed budget.
  //
  // Safe because of two guards, not one: the match must START at a budget
  // keyword, and it must END at a money unit. `[^.!?\n]` also stops it crossing
  // a sentence boundary, so "ngân sách. Chuyến đi 3 ngày" cannot become 3.
  const bareRe = new RegExp(
    `(?:ngan sach|budget)[^.!?\\n]{0,25}?${N}\\s*(k|tr|trieu|ngan|nghin|m|mil|million)\\b`)
  let m = t.match(bareRe)
  if (m) {
    const max = parseMoneyAmount(m[1], m[2] || '')
    if (max !== null && max > 0) return { min: 0, max, type: 'under' as const }
  }

  /**
   * 🚨 "gia 500k" - A STATED PRICE IS A CONSTRAINT, AND IT WAS BEING DROPPED.
   *
   * Measured on "muon mua op lung iphone 17pm gia 500k": every rule above needs
   * "duoi" / "khoang" / "ngan sach", none of which is present, so extractBudget
   * returned null. With no budget the filter, the ranker and
   * `validateShoppingCandidates` all had nothing to enforce, and the reply
   * offered cases at 620k, 719k, 1.05M, 1.09M and 1.33M against a stated 500k.
   *
   * Kept SEPARATE from the budget keywords above because it means something
   * different: "ngan sach X" is a ceiling, while "gia X" names a target, so it
   * gets the same +/-20% band "khoang X" already produces rather than becoming a
   * hard cap. Both safety guards are unchanged - the match must start at the
   * keyword and end at a money unit, so "gia re" and "gia tot" carry no number
   * and cannot match.
   */
  const priceRe = new RegExp(
    `\\b(?:gia|price)\\b[^.!?\\n]{0,25}?${N}\\s*(k|tr|trieu|ngan|nghin|m|mil|million)\\b`)
  m = t.match(priceRe)
  if (m) {
    const base = parseMoneyAmount(m[1], m[2] || '')
    if (base !== null && base > 0) {
      return { min: Math.round(base * 0.8), max: Math.round(base * 1.2), type: 'around' as const }
    }
  }

  return null
}

/**
 * The TOTAL budget of a plan, when the turn is a planning request.
 *
 * `extractBudget` names a per-item ceiling and, by design, refuses a bare
 * amount ("2 người, 5 triệu" must not become a budget in a shopping turn). A
 * plan is different: the amount a person states for an evening or a trip is
 * the whole envelope, and the shapes they use — "budget 5 triệu", "trong 5
 * triệu", "tầm 5 triệu", "dưới 5 triệu", "5 triệu cho 2 người", "20 triệu" —
 * all mean that envelope. So on a planning turn every `extractBudget` form is
 * accepted first (its band/ceiling becomes the total), then "trong / với /
 * cho / có N triệu", then a bare amount with a money UNIT — the unit is the
 * guard: "3 ngày" and "2 người" carry none and cannot become money.
 *
 * Returns the total in VND, or null when the message states no amount at all.
 * Callers use it ONLY when `detectPlanningIntent` fired; nothing else reads it.
 */
export function extractPlanTotalBudget(userMessage: string): number | null {
  const stated = extractBudget(userMessage)
  if (stated) return stated.type === 'around' ? Math.round((stated.min + stated.max) / 2) : stated.max
  const t = normalizeVN(userMessage.toLowerCase())
  const N = '([\\d][\\d.,]*)'
  // A full VND figure carries its own unit ("1.500.000đ", "1500000 vnd"); after
  // normalizeVN the đ is a bare "d". Such a figure parses as-is (parseMoneyAmount
  // strips the dots), so it is admitted here — never in the per-item extractor.
  const UNIT = '(k|tr|trieu|ngan|nghin|m|mil|million|d|dong|vnd)\\b'
  const withinRe = new RegExp(`\\b(?:trong|voi|co|chi co|tam|khoang|cho)\\s+${N}\\s*${UNIT}`)
  const bareRe = new RegExp(`${N}\\s*${UNIT}`)
  const m = t.match(withinRe) ?? t.match(bareRe)
  if (!m) return null
  const amount = parseMoneyAmount(m[1], m[2] || '')
  // Below 100k is not a plan envelope ("2k" in a nickname, "50k" for one dish).
  return amount !== null && amount >= 100_000 ? amount : null
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

  // Item 6 (2026-09-19): this is a HOTEL rule (luxury hotel brands vs a low nightly budget). It used
  // to ride every budgeted tool result — a restaurant search, a product search, a flight — as 160
  // tokens of hotel text the model had no use for on that turn. Measured F8 ("nhà hàng … 500k/người"):
  // the food result carried the Pullman/Marriott ban. Hotel results only.
  if (budget.max < LUXURY_PRICE_FLOOR && /khach san|hotel/i.test(category)) {
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
