// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import ShoppingDecision from './ShoppingDecision'
import { setLocale } from '@/lib/i18n/useTranslation'
import { normalizeShopping } from '@/lib/ai/consultative/candidate'
import { rankCandidates } from '@/lib/ai/consultative/rank'
import { shortlistShopping } from '@/lib/ai/consultative/shortlist'
import { derivePick, isExplicitChoiceRequest, hasImplicitPurchaseIntent } from '@/lib/ai/consultative/pick'
import { deriveNeedProfile } from '@/lib/ai/consultative/needProfile'
import { deriveShoppingConstraints, budgetFromHistory, validateShoppingCandidates } from '@/lib/ai/consultative/shoppingConstraints'
import { extractBudget } from '@/lib/ai/budget'
import { buildShoppingSynthesis } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView, renderShoppingMarker, parseShoppingMarker } from '@/lib/ai/consultative/synthesisView'

// ─────────────────────────────────────────────────────────────────────────────
// THE WHOLE PATH, NOT A HAND-WRITTEN VIEW.
//
// tool-shaped result → normalizeShopping → rankCandidates → shortlistShopping
//   → derivePick → buildShoppingSynthesis → buildSynthesisView
//   → renderShoppingMarker → parseShoppingMarker → rendered DOM
//
// 🚨 WHY THIS EXISTS. Every shopping UI test before it started from a
// hand-written `SynthesisView`, so all of them passed while the surface was
// dead in production: measured on localhost three times, `derivePick` declined,
// route.ts returned before the synthesis was built, and the user got prose with
// no card at all. A fixture that begins after the decision cannot see that.
//
// The rows below are the shape `searchProducts` emits on the PRIMARY Google
// Shopping path — the one production takes — including its two awkward facts:
// the structured rows land in `search_results` (there is no `shopping_results`
// key), and `link` points at a google.com/search redirect rather than the shop.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)
beforeEach(() => setLocale('vi'))

/** A row exactly as `searchProducts` emits it on the Google Shopping branch. */
const row = (over: Record<string, unknown> = {}) => ({
  title: 'Laptop Dell 15 DC15250 i5-1334U/8GB/512GB',
  link: 'https://www.google.com/search?ibp=oshop&prds=productid:7078939334457953923',
  price: 16_990_000,
  price_vnd: 16_990_000,
  source: 'Fptshop.com.vn',
  rating: 4.9,
  rating_count: 88,
  product_id: '7078939334457953923',
  photo_url: 'https://img/dell.jpg',
  ram_gb: 8,
  storage_gb: 512,
  ...over,
})

const ROWS = [
  row(),
  row({
    title: 'Laptop ASUS Vivobook 15 i5 16GB 512GB Chính hãng',
    link: 'https://tiki.vn/vivobook-p333.html',
    price: 19_490_000, price_vnd: 19_490_000, source: 'Tiki',
    rating: 4.6, rating_count: 210, product_id: 'p-asus',
    photo_url: 'https://img/asus.jpg', ram_gb: 16, storage_gb: 512,
    condition: 'new', condition_label: 'Chính hãng',
  }),
  row({
    title: 'MacBook Air M1 8GB 256GB Like New',
    link: 'https://shopee.vn/mba-i.33.44',
    price: 15_900_000, price_vnd: 15_900_000, source: 'Shopee',
    rating: 4.7, rating_count: 1500, product_id: 'p-mba',
    photo_url: 'https://img/mba.jpg', ram_gb: 8, storage_gb: 256,
  }),
]

const toolResult = (rows: Record<string, unknown>[]) => ({
  query: 'laptop 20 trieu lam viec',
  source: 'Google Shopping (Serper)',
  search_results: rows,
  links: [],
  note: 'reference prices',
})

/**
 * Everything `route.ts` does inside `search_products.execute()`, in the same
 * order — including the branch that used to return early when there was no Pick.
 */
function renderFromTool(rows: Record<string, unknown>[], question: string, history: string[] = []) {
  const result = toolResult(rows) as unknown as Record<string, unknown>
  const messages = [...history, question].map(content => ({ role: 'user', content }))
  const need = deriveNeedProfile(messages as never)
  const everyRow = normalizeShopping(result)
  // VALIDATE, THEN RANK — the same order route.ts runs, and the whole point of
  // it: a candidate the user did not ask for must never reach the ranker, where
  // a low price would carry it into the top three.
  const constraints = deriveShoppingConstraints(messages, extractBudget(question) ?? budgetFromHistory(messages, extractBudget))
  const { kept, rejected } = validateShoppingCandidates(everyRow, constraints)
  const candidates = kept
  if (kept.length < 2) return { pick: null, view: null, kept, rejected, constraints }
  const ranked = rankCandidates(candidates, need)
  // route.ts returns before any of this when the ranker declines, so a fixture
  // that is not rankable is testing nothing. Fail loudly rather than silently.
  expect(ranked.rankable, 'the fixture gives the ranker something to order by').toBe(true)
  const order = new Map(ranked.ranked.map((e, i) => [e.candidate.raw, i]))
  // route.ts strips the rejected rows from the array the MODEL reads too, so the
  // prose cannot cite a product the card refuses to show. Mirror that here.
  const rejectedRaw = new Set(rejected.map(x => x.candidate.raw))
  const rowsLeft = (result.search_results as unknown[]).filter(r => !rejectedRaw.has(r))
  const ordered = rowsLeft.filter(r => order.has(r)).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  const untouched = rowsLeft.filter(r => !order.has(r))
  const { rows: shortRows } = shortlistShopping(ordered, untouched)
  const shortlisted = shortRows.map(r => candidates.find(c => c.raw === r)!).filter(Boolean)
  const pick = derivePick(ranked, need, {
    explicitChoiceRequest: isExplicitChoiceRequest(question),
    implicitPurchaseIntent: hasImplicitPurchaseIntent(question),
  })
  const synthesis = buildShoppingSynthesis(shortlisted, pick, question)
  const view = buildSynthesisView(synthesis)
  // Through the marker and back, because that is how it reaches the browser.
  const round = parseShoppingMarker('Mình tìm được vài lựa chọn.\n\n' + renderShoppingMarker(view))
  expect(round.view, 'the marker round-trips to a view').not.toBeNull()
  expect(round.text).not.toContain('TAPPY_SHOPPING')
  render(<ShoppingDecision view={round.view!} onPriceWatch={() => {}} />)
  return { pick, view: round.view!, kept, rejected, constraints }
}

const QUESTION = 'Laptop khoảng 20 triệu để làm việc, tư vấn giúp mình chọn'

describe('shopping projection — the product is identifiable', () => {
  it('🚨 renders the PRODUCT NAME from the listing title, never a config placeholder', () => {
    const { rejected } = renderFromTool(ROWS, QUESTION)
    const body = document.body.textContent ?? ''
    expect(body).toContain('Laptop Dell 15 DC15250')
    expect(body).toContain('Laptop ASUS Vivobook 15')
    // All three survive validation: "khoảng 20 triệu" is generous downward, so a
    // genuinely cheaper machine at 15.9M is still an answer to it.
    expect(rejected).toHaveLength(0)
    expect(body).toContain('MacBook Air M1')
    for (const placeholder of ['chip ?', 'RAM ?', 'storage ?']) {
      expect(body, `"${placeholder}" reached the card`).not.toContain(placeholder)
    }
  })

  it('renders every product exactly once, with its own photo', () => {
    renderFromTool(ROWS, QUESTION)
    const srcs = [...document.querySelectorAll('img')].map(i => i.getAttribute('src'))
    expect(srcs.length).toBeGreaterThan(0)
    expect(new Set(srcs).size).toBe(srcs.length)
    expect(srcs.every(s => (s ?? '').startsWith('https://img/'))).toBe(true)
  })

  it('🚨 renders the specs the TITLE stated, labelled — and nothing it did not', () => {
    renderFromTool(ROWS, QUESTION)
    const specs = screen.getAllByTestId('product-specs').map(s => s.textContent ?? '').join(' | ')
    expect(specs).toMatch(/8GB RAM/)
    expect(specs).toMatch(/512GB/)
    expect(specs).not.toContain('?')
  })
})

describe('shopping projection — price, rating and seller are on the card', () => {
  it('🚨 renders a FORMATTED price, never the provider integer', () => {
    renderFromTool(ROWS, QUESTION)
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/16,99 triệu|17 triệu/)
    expect(body).not.toContain('16990000')
    expect(body).not.toContain('19490000')
  })

  it('🚨 renders rating and review count as metadata, from the row', () => {
    renderFromTool(ROWS, QUESTION)
    const ratings = screen.getAllByTestId('product-rating').map(r => r.textContent ?? '').join(' | ')
    expect(ratings).toMatch(/4\.9/)
    expect(ratings).toContain('đánh giá')
  })

  it('renders the seller the row named', () => {
    renderFromTool(ROWS, QUESTION)
    const body = document.body.textContent ?? ''
    expect(body).toContain('Fptshop.com.vn')
    expect(body).toContain('Tiki')
  })

  it('🚨 a row that states NO rating shows no rating — and no placeholder number', () => {
    // A listing with no PRICE never becomes a candidate at all (there is nothing
    // to rank it by), so the honest probe for "absent field" is a priced listing
    // whose rating the provider did not return — which is most of them.
    renderFromTool([ROWS[0], row({
      title: 'Laptop Không Điểm', link: 'https://tiki.vn/x', source: 'Tiki',
      product_id: 'p-nr', rating: undefined, rating_count: undefined,
      price: 18_500_000, price_vnd: 18_500_000, photo_url: undefined,
    })], QUESTION)
    const bare = screen.getAllByTestId('product-row').find(r => (r.textContent ?? '').includes('Không Điểm'))
      ?? screen.getByTestId('recommended-entity')
    expect(bare.textContent).toContain('18,5 triệu')
    expect(within(bare).queryByTestId('product-rating')).toBeNull()
    expect(bare.textContent).not.toMatch(/undefined|null|NaN|KHONG CO DU LIEU/)
    expect(bare.querySelector('img')).toBeNull()
  })
})

describe('shopping projection — actions are real and honest', () => {
  it('🚨 names GOOGLE when the row links to a Google Shopping redirect', () => {
    renderFromTool(ROWS, QUESTION)
    const body = document.body.textContent ?? ''
    // The measured defect: a button reading "Xem" beside "Fptshop.com.vn" that
    // opened google.com. The destination is stated instead.
    expect(body).toContain('Tìm trên Google')
  })

  it('every rendered link points at a URL the row actually carried', () => {
    renderFromTool(ROWS, QUESTION)
    const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(0)
    const known = ROWS.map(r => r.link as string)
    for (const h of hrefs) expect(known, `${h} was invented`).toContain(h)
    // No destination is offered twice.
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('offers the price watch, naming the product it would watch', () => {
    const { pick } = renderFromTool(ROWS, QUESTION)
    expect(pick, 'this question states a budget and asks Tappy to choose').not.toBeNull()
    expect(screen.getByTestId('price-watch-action').textContent).toContain('Theo dõi giá')
  })
})

describe('shopping projection — the decision', () => {
  it('🚨 crowns the Pick, and says why in Vietnamese', () => {
    const { pick } = renderFromTool(ROWS, QUESTION)
    expect(pick).not.toBeNull()
    const rec = screen.getByTestId('recommended-entity')
    expect(rec.textContent).toContain('Nên chọn')
    const reasons = screen.getByTestId('pick-reasons').textContent ?? ''
    expect(reasons).toMatch(/đánh giá|giá /)
    expect(reasons).not.toMatch(/rated |reviews| VND/)
  })

  it('🚨 with NO Pick, still renders the ranked products and crowns nobody', () => {
    // A bare browse states no criteria and asks nothing of Tappy, so
    // `hasDecidableNeed` is false and `derivePick` declines — the exact case that
    // used to erase the entire surface.
    const { pick } = renderFromTool(ROWS, 'laptop')
    expect(pick, 'no criteria and no request to choose ⇒ no Pick').toBeNull()
    expect(screen.queryByTestId('recommended-entity')).toBeNull()
    expect(screen.getByTestId('shortlist-header').textContent).toContain('Những lựa chọn sát nhất')
    const rows = screen.getAllByTestId('product-row')
    expect(rows.length).toBe(ROWS.length)
    const titles = ROWS.map(r => r.title as string)
    for (const r of rows) {
      // a real name from the data…
      expect(titles.some(t => (r.textContent ?? '').includes(t.slice(0, 24)))).toBe(true)
      expect(r.querySelector('a[href]')).toBeTruthy() // …and something to do with it
    }
    expect(document.body.textContent).not.toContain('Nên chọn')
  })

  it('🚨 the no-Pick view marks nothing as recommended', () => {
    const { view } = renderFromTool(ROWS, 'laptop')
    expect(view).not.toBeNull()
    expect(view!.recommendation).toBeNull()
    expect(view!.entities.some(e => e.recommended)).toBe(false)
  })

  it('preserves the engine ordering — the card never re-ranks', () => {
    const { view } = renderFromTool(ROWS, 'laptop')
    expect(view).not.toBeNull()
    const rendered = screen.getAllByTestId('product-row').map(r => r.textContent ?? '')
    view!.entities.forEach((e, i) => {
      expect(rendered[i], `row ${i} is not entity ${i}`).toContain((e.name || e.config).slice(0, 20))
    })
  })
})

describe('shopping projection — English', () => {
  it('renders an English decision with English reasons and specs', () => {
    setLocale('en')
    renderFromTool(ROWS, QUESTION)
    const body = document.body.textContent ?? ''
    expect(body).toContain('Best pick')
    expect(body).toMatch(/8GB RAM/)
    expect(body).not.toContain('Nên chọn')
    expect(body).not.toContain('đánh giá')
    // The condition CHIP is translated. The listing TITLE is the seller's own
    // words and is never rewritten — "…512GB Chính hãng" is the product's name.
    const specs = screen.getAllByTestId('product-specs').map(e => e.textContent ?? '').join(' | ')
    expect(specs).toContain('Genuine')
    expect(specs).not.toContain('Chính hãng')
  })
})

describe('shopping projection — the match badge answers a question that was asked', () => {
  it('🚨 offers NO match badge when the question named no configuration', () => {
    // "Laptop khoảng 20 triệu để làm việc" states a budget and a use, not a chip,
    // a RAM figure or a capacity — so every row scored "chua_ro" and six badges
    // read "Chưa rõ cấu hình" about a comparison nobody requested.
    const { view } = renderFromTool(ROWS, 'Laptop khoảng 20 triệu để làm việc')
    expect(view!.requested).toBeNull()
    expect(document.body.textContent).not.toContain('Chưa rõ cấu hình')
  })

  it('offers it when the question DID name one', () => {
    // 512GB is stated by both the Dell and the ASUS; the MacBook states 256GB and
    // is removed by the spec rule, leaving two options to badge.
    const { view } = renderFromTool(ROWS, 'Mình cần laptop 512GB, tư vấn giúp mình chọn')
    expect(view).not.toBeNull()
    expect(view!.requested).toBeTruthy()
    expect(document.body.textContent).toMatch(/Đúng cấu hình bạn cần|Khác cấu hình|Chưa rõ cấu hình/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RETRIEVAL CORRECTNESS, END TO END.
//
// Same harness as above — provider-shaped rows through validation, ranking,
// shortlist, Pick, synthesis, marker and the rendered card. These four are the
// demonstrations the retrieval work exists for: an irrelevant candidate never
// reaches the recommendation, a hard budget is a bound, a follow-up keeps its
// subject, and nothing is crowned when nothing wins.
// ─────────────────────────────────────────────────────────────────────────────

/** What "Rẻ hơn thì có lựa chọn nào?" actually returned on localhost. */
const CONTAMINATED = [
  row({ title: 'MÀN HÌNH LAPTOP 13.3IN HD 40PIN DÀY', link: 'https://shopee.vn/man-hinh', price: 399_000, price_vnd: 399_000, source: 'Shopee', product_id: 'p-man', ram_gb: undefined, storage_gb: undefined, rating: 5, rating_count: 67 }),
  row({ title: 'Chuột Máy Tính Không Dây Bluetooth Ziyou X2 PRO cho Laptop PC', link: 'https://shopee.vn/chuot', price: 489_000, price_vnd: 489_000, source: 'Shopee', product_id: 'p-chuot', ram_gb: undefined, storage_gb: undefined, rating: 4.7, rating_count: 125 }),
  row({ title: 'Thân máy laptop [cụm dưới - không màn hình]', link: 'https://shopee.vn/than', price: 2_000_000, price_vnd: 2_000_000, source: 'Shopee', product_id: 'p-than', ram_gb: undefined, storage_gb: undefined, rating: 5, rating_count: 1 }),
  row({ title: 'Dell Precision 3560 New Full Box', link: 'https://shopee.vn/prec', price: 18_500_000, price_vnd: 18_500_000, source: 'Le Trung', product_id: 'p-prec', ram_gb: undefined, storage_gb: undefined, rating: 4.3, rating_count: 104 }),
  row({ title: 'Lenovo ThinkBook 13s Gen 2 i7-1165G7 Ram 16Gb 512Gb 14 Inch', link: 'https://shopee.vn/tb', price: 15_500_000, price_vnd: 15_500_000, source: 'Shopee', product_id: 'p-tb', ram_gb: 16, storage_gb: 512, rating: 4.6, rating_count: 40 }),
]

describe('E2E — an irrelevant candidate never reaches the recommendation', () => {
  it('🚨 removes the screen, the mouse and the chassis BEFORE ranking', () => {
    const { kept, rejected, view } = renderFromTool(
      CONTAMINATED,
      'Rẻ hơn thì có lựa chọn nào?',
      ['Laptop khoảng 20 triệu để làm việc'],
    )
    expect(rejected.map(r => r.reason).sort()).toEqual(['accessory', 'accessory', 'accessory'])
    expect(kept.map(c => c.name)).toEqual(['Dell Precision 3560 New Full Box', 'Lenovo ThinkBook 13s Gen 2 i7-1165G7 Ram 16Gb 512Gb 14 Inch'])
    expect(view).not.toBeNull()

    // …and none of them is on screen, at any rank.
    const body = document.body.textContent ?? ''
    for (const gone of ['MÀN HÌNH', 'Chuột', 'Thân máy']) expect(body, gone).not.toContain(gone)
    expect(body).toContain('Dell Precision 3560')
  })

  it('🚨 the parts were CHEAPER than the laptops — ranking would have promoted them', () => {
    // The point of validating before ranking, in one assertion: on price alone a
    // 399k screen beats every real laptop in the set.
    const { kept } = renderFromTool(CONTAMINATED, 'Rẻ hơn thì có lựa chọn nào?', ['Laptop khoảng 20 triệu để làm việc'])
    const cheapest = Math.min(...kept.map(c => c.attrs.priceVnd ?? Infinity))
    expect(cheapest).toBeGreaterThan(2_000_000)
  })
})

describe('E2E — a hard budget is a bound, not a suggestion', () => {
  const OVER = [
    row({ title: 'Laptop Acer Aspire Go 15 (Core 5, 16GB, 512GB)', link: 'https://tiki.vn/acer', price: 19_490_000, price_vnd: 19_490_000, source: 'Gearvn', product_id: 'p-acer', ram_gb: 16, storage_gb: 512, rating: 4.9, rating_count: 39 }),
    row({ title: 'Laptop Dell 15 DC15250 CPH992 16GB 512GB', link: 'https://tiki.vn/dell2', price: 21_990_000, price_vnd: 21_990_000, source: 'mygear.com.vn', product_id: 'p-d2', ram_gb: 16, storage_gb: 512, rating: 4.9, rating_count: 88 }),
    row({ title: 'Laptop Asus ExpertBook P1403CVA 16GB 512GB', link: 'https://tiki.vn/asus2', price: 23_390_000, price_vnd: 23_390_000, source: 'Thế Giới Di Động', product_id: 'p-a2', ram_gb: 16, storage_gb: 512, rating: 4.8, rating_count: 20 }),
    row({ title: 'Laptop Acer Aspire Lite 15 AL15-42P 16GB 512GB', link: 'https://tiki.vn/lite', price: 16_800_000, price_vnd: 16_800_000, source: 'Gearvn', product_id: 'p-lite', ram_gb: 16, storage_gb: 512, rating: 4.7, rating_count: 15 }),
  ]

  it('🚨 "dưới 20 triệu" excludes 21.99M — the 10% courtesy is gone', () => {
    const { kept, rejected } = renderFromTool(OVER, 'Laptop 16GB RAM 512GB dưới 20 triệu')
    expect(rejected.map(r => r.reason)).toEqual(['budget', 'budget'])
    expect(kept.every(c => (c.attrs.priceVnd ?? 0) <= 20_000_000)).toBe(true)
    const body = document.body.textContent ?? ''
    expect(body).not.toContain('ExpertBook')
    expect(body).not.toContain('CPH992')
  })

  it('🚨 nothing under the bound ⇒ nothing is recommended', () => {
    // Fail closed. The alternative — showing a 21.99M laptop for "dưới 20 triệu" —
    // is the failure this replaces.
    const { kept, view } = renderFromTool(OVER, 'Laptop 16GB RAM 512GB dưới 10 triệu')
    expect(kept).toHaveLength(0)
    expect(view).toBeNull()
  })

  it('a price the provider did not state is not treated as over budget', () => {
    const priceless = [
      row({ title: 'Laptop Acer Aspire Go 15 16GB 512GB', link: 'https://tiki.vn/a', price: 19_490_000, price_vnd: 19_490_000, source: 'Gearvn', product_id: 'p1', ram_gb: 16, storage_gb: 512 }),
      row({ title: 'Laptop Dell Latitude 5320 16GB 512GB', link: 'https://tiki.vn/b', price: undefined, price_vnd: undefined, source: 'Shopee', product_id: 'p2', ram_gb: 16, storage_gb: 512 }),
    ]
    const { kept } = renderFromTool(priceless, 'Laptop 16GB RAM 512GB dưới 20 triệu')
    expect(kept.map(c => c.name)).toContain('Laptop Dell Latitude 5320 16GB 512GB')
  })
})

describe('E2E — a follow-up keeps the conversation it belongs to', () => {
  it('🚨 "Rẻ hơn" still means laptops, and still has a ceiling', () => {
    const { constraints } = renderFromTool(
      CONTAMINATED,
      'Rẻ hơn thì có lựa chọn nào?',
      ['Laptop khoảng 20 triệu để làm việc'],
    )
    expect(constraints.productType).toBe('laptop')
    expect(constraints.budget).toEqual({ min: 0, max: 24_000_000, type: 'under' })
  })

  it('🚨 "Con nào tốt hơn?" keeps the brand the earlier turn named', () => {
    const iphones = [
      row({ title: 'iPhone 13 128GB Chính Hãng', link: 'https://shopee.vn/i13', price: 11_790_000, price_vnd: 11_790_000, source: 'CellphoneS', product_id: 'i1', ram_gb: undefined, storage_gb: undefined, rating: 4.8, rating_count: 300 }),
      row({ title: 'Samsung Galaxy Note 20 5G Like New', link: 'https://shopee.vn/n20', price: 4_599_000, price_vnd: 4_599_000, source: 'Viettablet', product_id: 'i2', ram_gb: undefined, storage_gb: undefined, rating: 4.8, rating_count: 143 }),
      row({ title: 'iPhone 13 256GB Cũ', link: 'https://shopee.vn/i13b', price: 9_300_000, price_vnd: 9_300_000, source: 'Tuấn Nguyễn', product_id: 'i3', ram_gb: undefined, storage_gb: undefined, rating: 4.7, rating_count: 119 }),
    ]
    const { constraints, rejected, kept } = renderFromTool(iphones, 'Con nào tốt hơn?', ['iPhone khoảng 20 triệu'])
    expect(constraints.brand).toBe('apple')
    expect(rejected.map(r => r.reason)).toEqual(['brand'])
    expect(kept.every(c => /iphone/i.test(c.name))).toBe(true)
    expect(document.body.textContent).not.toContain('Samsung')
  })

  it('🚨 an installation SERVICE is not a phone', () => {
    const withService = [
      row({ title: 'iPhone 13 128GB Chính Hãng', link: 'https://shopee.vn/i13', price: 11_790_000, price_vnd: 11_790_000, source: 'CellphoneS', product_id: 'i1', ram_gb: undefined, storage_gb: undefined, rating: 4.8, rating_count: 300 }),
      row({ title: 'Dịch vụ cài đặt iPhone', link: 'https://shopee.vn/dv', price: 200_000, price_vnd: 200_000, source: 'Gió Biển', product_id: 'i9', ram_gb: undefined, storage_gb: undefined }),
      row({ title: 'iPhone 13 - Đen / 128GB', link: 'https://shopee.vn/i13c', price: 8_550_000, price_vnd: 8_550_000, source: 'Minh Hoàng', product_id: 'i4', ram_gb: undefined, storage_gb: undefined, rating: 4.7, rating_count: 293 }),
    ]
    const { rejected } = renderFromTool(withService, 'iPhone khoảng 20 triệu')
    expect(rejected.map(r => r.reason)).toEqual(['service'])
    expect(document.body.textContent).not.toContain('Dịch vụ')
  })
})
