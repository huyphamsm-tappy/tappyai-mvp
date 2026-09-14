import { describe, it, expect, vi } from 'vitest'
import { attachCommerceLinks } from './commerce'
import { COMMERCE_LINKS_KEY, resolveCommerce, type CommerceLinkRow } from '@/lib/ccp'
import { adaptersFor, ADAPTERS, marketplaceSearchTemplates } from '@/lib/ccp/adapters'
import { shopeeAdapter, tiktokshopAdapter, lazadaAdapter } from '@/lib/ccp/adapters/marketplace'
import { getProvider } from '@/lib/ccp/registry'
import { productRecommendations } from '@/lib/recommendation/fromToolResult'
import { resolveActionLabel } from '@/lib/recommendation/actionLabel'
import { isMisleadingModelCta, validateModelCtaButtons } from '@/lib/recommendation/ctaValidation'
import { buildShoppingSynthesis } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView, parseShoppingMarker, renderShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import { productIdentityMatch } from '@/lib/links/productIdentity'
import { buildShoppingLinks } from '@/lib/platformLinks/shopping'
import { buildSystem } from '@/lib/ai/promptBuilder'
import type { Candidate } from '@/lib/ai/consultative/candidate'

// ── Shopping Marketplace Expansion — Shopee & TikTok Shop (owner decision 14 Sep 2026) ──
//
// §12 test matrix (A Shopee · B TikTok Shop · C DMX · D CellphoneS): intent → capability →
// provider → result → CommerceLink → link kind · depth · auth boundary · freshness →
// presentation → handoff. Plus cross-provider ranking and the §13 negative tests.
// Offline: every search goes through the seam stub.

const NOW = new Date('2026-09-14T08:00:00Z')
const links = (row: Record<string, unknown>) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const t = (key: string, vars?: Record<string, string>) => vars ? `${key}:${vars.platform}` : key
const REQ = { domain: 'shopping', intentType: 'buy_product', capability: 'product_purchase', subject: 'iPhone 16 Pro 128GB' } as const

const SHOPEE_PAGE = 'https://shopee.vn/iPhone-16-Pro-128GB-Ch%C3%ADnh-H%C3%A3ng-VN-A-i.288286284.24185993819'
const TIKTOK_PAGE = 'https://shop.tiktok.com/vn/pdp/iphone-16-pro-128gb-chinh-hang-vn-a/1730912910119373196'
const TIKTOK_ALT = 'https://www.tiktok.com/shop/vn/pdp/1730912910119373196?source=anchor'
const TIKTOK_VIEW = 'https://www.tiktok.com/view/product/1730912910119373196?_t=abc'
const TIKTOK_KEYWORD = 'https://shop.tiktok.com/vn/k/iphone-16-pro-128gb'
const LAZADA_PAGE = 'https://www.lazada.vn/products/iphone-16-pro-128gb-chinh-hang-vna-i2806208680.html?srsltid=xyz'
const DMX_PAGE = 'https://www.dienmayxanh.com/dien-thoai/iphone-16-pro'
const CPS_PAGE = 'https://cellphones.com.vn/iphone-16-pro.html'

/** One combined-scope search per subject: the stub answers with every marketplace's page for the iPhone. */
function marketplaceSearch(rows: Array<{ title: string; link: string }>) {
  const calls: string[] = []
  const search = vi.fn(async (q: string) => { calls.push(q); return rows.map(r => ({ ...r, snippet: '' })) })
  return { search, calls }
}
const ALL_HITS = [
  { title: 'iPhone 16 Pro 128GB Chính Hãng VN/A | Shopee Việt Nam', link: SHOPEE_PAGE },
  { title: 'iPhone 16 Pro 128GB Chính Hãng VN/A [ShopDunk Store] - TikTok Shop Vietnam', link: TIKTOK_PAGE },
  { title: 'iPhone 16 Pro 128GB Chính Hãng (VN/A) - Lazada', link: LAZADA_PAGE },
  { title: 'iPhone 16 Pro 128GB | Chính hãng VN/A - CellphoneS', link: CPS_PAGE },
]

describe('capability model — Shopee and TikTok Shop are first-class, capability-aware shopping providers', () => {
  it('both declare product_discovery / product_detail / product_purchase / commerce_handoff and are candidates for a purchase request', () => {
    const ids = adaptersFor(REQ).map(a => a.providerId)
    expect(ids).toContain('shopee')
    expect(ids).toContain('tiktokshop')
    expect(ids).toContain('dmx')
    expect(ids).toContain('cellphones')
    expect(ids).toContain('lazada')
    expect(ADAPTERS.map(a => a.providerId)).toEqual(expect.arrayContaining(['shopee', 'tiktokshop']))
  })

  it('the depth profiles are the verified boundaries, not claims: Shopee web guest = login wall (L2), TikTok Shop = detail (L3) then account at checkout', () => {
    expect(getProvider('shopee')!.depth.buy_product).toMatchObject({ guestDepth: 2, authenticatedDepth: 5, authRequiredAt: 'before_selection' })
    expect(getProvider('tiktokshop')!.depth.buy_product).toMatchObject({ guestDepth: 3, authenticatedDepth: 5, authRequiredAt: 'before_checkout' })
    // Never L5 for a guest on either marketplace.
    expect(getProvider('shopee')!.depth.buy_product!.guestDepth).toBeLessThan(5)
    expect(getProvider('tiktokshop')!.depth.buy_product!.guestDepth).toBeLessThan(5)
  })
})

describe('A · Shopee', () => {
  it('a product URL → identity from the path (shopId.itemId), canonical URL, DETAIL_HANDOFF L3, login before selection, static identity', () => {
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: SHOPEE_PAGE, title: 'iPhone 16 Pro 128GB Chính Hãng VN/A' }] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'shopee')!
    expect(l).toMatchObject({ kind: 'DETAIL_HANDOFF', depth: 3, authRequiredAt: 'before_selection', merchantName: 'Shopee' })
    expect(l.depthProfile.guestDepth).toBe(2)
    expect(l.directUrl).toBe('https://shopee.vn/iPhone-16-Pro-128GB-Ch%C3%ADnh-H%C3%A3ng-VN-A-i.288286284.24185993819')
    expect(l.paramsPreserved).toEqual(['productRef'])
    expect(l.freshness.freshnessType).toBe('static')
    // Affiliate pending → direct link, no wrapper, still a valid Commerce Link.
    expect(l.tracking.mode).toBe('none')
    expect(new URL(l.url).hostname).toBe('shopee.vn')
  })

  it('no product page → the honest SEARCH fallback (L2), labelled as a search with the login boundary; never a fabricated product id', () => {
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'shopee')!
    expect(l).toMatchObject({ kind: 'SEARCH_HANDOFF', depth: 2 })
    expect(l.directUrl).toBe('https://shopee.vn/search?keyword=iPhone+16+Pro+128GB')
    expect(l.paramsDropped).toEqual(['productRef'])
    const label = resolveActionLabel({ kind: 'purchase', urlKind: 'search', url: l.url, platform: 'Shopee', commerce: { linkId: l.linkId, requestId: 'r', providerId: 'shopee', depth: 2, guestDepth: 2, authRequiredAt: 'before_selection', loginRequired: true, freshnessType: 'static', expiresAt: null, tracked: false, primary: true } })
    expect(label).toEqual({ key: 'v3.action.searchLoginOn', params: { platform: 'Shopee' } })
  })

  it('a ShopeeFood URL is not a Shopee marketplace offer, and a Shopee URL is not a food-delivery offer', () => {
    expect(shopeeAdapter.toOffer(REQ, { url: 'https://shopeefood.vn/ho-chi-minh/pho-24' }, NOW)).toBeNull()
    const food = resolveCommerce({ domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'Phở 24' }, { enabled: true, now: NOW, hints: [{ url: SHOPEE_PAGE }] })
    expect(('links' in food ? food.links : []).map(l => l.providerId)).not.toContain('shopee')
    expect('providersQueried' in food ? food.providersQueried : []).not.toContain('shopee')
  })
})

describe('B · TikTok Shop', () => {
  it('all three product grammars resolve to the same id; DETAIL_HANDOFF L3, account before checkout', () => {
    for (const url of [TIKTOK_PAGE, TIKTOK_ALT, TIKTOK_VIEW]) {
      const o = tiktokshopAdapter.toOffer(REQ, { url, title: 'x' }, NOW)!
      expect(o.subjectRef).toBe('1730912910119373196')
      expect(new URL(o.canonicalUrl).search).toBe('')
    }
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: TIKTOK_PAGE, title: 'iPhone 16 Pro 128GB' }] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'tiktokshop')!
    expect(l).toMatchObject({ kind: 'DETAIL_HANDOFF', depth: 3, authRequiredAt: 'before_checkout', merchantName: 'TikTok Shop' })
    expect(l.depthProfile.guestDepth).toBe(3)
    expect(l.directUrl).toBe('https://shop.tiktok.com/vn/pdp/iphone-16-pro-128gb-chinh-hang-vn-a/1730912910119373196')
  })

  it('a video / profile URL on tiktok.com is never an offer; a discovered keyword page is an L2 search offer; nothing is composed', () => {
    expect(tiktokshopAdapter.toOffer(REQ, { url: 'https://www.tiktok.com/@shopdunk/video/7300000000000000000' }, NOW)).toBeNull()
    expect(tiktokshopAdapter.toOffer(REQ, { url: 'https://www.tiktok.com/shop' }, NOW)).toBeNull()
    const kw = tiktokshopAdapter.toOffer(REQ, { url: TIKTOK_KEYWORD, title: 'iphone 16 pro 128gb - TikTok Shop Vietnam' }, NOW)!
    const build = tiktokshopAdapter.buildDirectLink(kw, undefined)!
    expect(build).toMatchObject({ depth: 2, paramsDropped: ['productRef'] })
    // No composable search grammar → no search fallback, so the legacy builders carry no TikTok Shop search either.
    expect(tiktokshopAdapter.searchOffer(REQ, NOW)).toBeNull()
    expect(marketplaceSearchTemplates().map(x => x.providerId)).not.toContain('tiktokshop')
  })

  it('affiliate is a layer, not a prerequisite: with no publisher id the approved TikTok Shop campaign still yields a valid DIRECT link', () => {
    expect(getProvider('tiktokshop')!.tracking?.approval).toBe('approved')
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: TIKTOK_PAGE }] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'tiktokshop')!
    expect(l.tracking.mode).toBe('none')
    expect(l.url).toBe(l.directUrl)
    expect(l.validation.status).not.toBe('failed')
  })
})

describe('C · Điện Máy Xanh (retail)', () => {
  it('product page → DETAIL_HANDOFF L3, guest L5 (OTP at order), near-realtime identity', () => {
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: DMX_PAGE }] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'dmx')!
    expect(l).toMatchObject({ kind: 'DETAIL_HANDOFF', depth: 3, authRequiredAt: 'at_order' })
    expect(l.depthProfile.guestDepth).toBe(5)
    expect(l.freshness.freshnessType).toBe('near_realtime')
    expect(getProvider('dmx')!.segment).toBe('retail')
  })
})

describe('D · CellphoneS (retail, passthrough)', () => {
  it('a discovered product page → DETAIL_HANDOFF L3 at the verified depth (guest L4, login before checkout); the front door is refused', () => {
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: CPS_PAGE, title: 'iPhone 16 Pro 128GB' }] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'cellphones')!
    expect(l).toMatchObject({ kind: 'DETAIL_HANDOFF', depth: 3, authRequiredAt: 'before_checkout', merchantName: 'CellphoneS' })
    expect(l.depthProfile.guestDepth).toBe(4)
    expect(l.directUrl).toBe('https://cellphones.com.vn/iphone-16-pro.html')
    const home = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: 'https://cellphones.com.vn/' }] })
    expect(('links' in home ? home.links : []).map(x => x.providerId)).not.toContain('cellphones')
  })
})

describe('cross-provider ranking — the engine decides among valid candidates', () => {
  it('"I want to buy an iPhone": every valid provider is a candidate and the ranked list is not a single hard-coded provider', () => {
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: ALL_HITS.map(h => ({ url: h.link, title: h.title })).concat([{ url: DMX_PAGE, title: 'iPhone 16 Pro' }]) })
    const ranked = 'links' in r ? r.links : []
    const providers = ranked.map(l => l.providerId)
    expect(new Set(providers).size).toBeGreaterThanOrEqual(5)
    expect(providers).toEqual(expect.arrayContaining(['shopee', 'tiktokshop', 'dmx', 'cellphones', 'lazada']))
    // Depth and auth friction decide, not monetisation: DMX (guest L5, no login) leads; the approved-affiliate
    // TikTok Shop does not outrank it merely for being affiliate-approved, and the login-walled Shopee ranks last.
    expect(providers[0]).toBe('dmx')
    expect(providers.indexOf('tiktokshop')).toBeLessThan(providers.indexOf('shopee'))
    // Every detail link sits above every search fallback.
    const lastDetail = Math.max(...ranked.map((l, i) => (l.kind !== 'SEARCH_HANDOFF' ? i : -1)))
    const firstSearch = ranked.findIndex(l => l.kind === 'SEARCH_HANDOFF')
    if (firstSearch !== -1) expect(lastDetail).toBeLessThan(firstSearch)
  })

  it('an affiliate wrapper cannot outrank a materially better direct provider (monetisation weight ≤ 0.05)', async () => {
    const { RANKING_WEIGHTS, MONETISATION_CAP } = await import('@/lib/ccp/ranking/weights')
    expect(RANKING_WEIGHTS.monetisation).toBeLessThanOrEqual(MONETISATION_CAP)
    expect(MONETISATION_CAP).toBe(0.05)
  })
})

describe('product identity (§8) — never a different product labelled as the requested one', () => {
  it('matches the same product, rejects accessories and other variants, and is uncertain when little overlaps', () => {
    expect(productIdentityMatch('Điện thoại Apple iPhone 16 Pro 128GB', 'iPhone 16 Pro 128GB Chính Hãng VN/A | Shopee Việt Nam')).toBe('match')
    expect(productIdentityMatch('iPhone 16 Pro 128GB', 'Ốp lưng iPhone 16 Pro 128GB chống sốc')).toBe('mismatch')
    expect(productIdentityMatch('iPhone 16 Pro 128GB', 'iPhone 16 Pro Max 256GB Chính Hãng')).toBe('mismatch')
    expect(productIdentityMatch('iPhone 16 Pro', 'Điện thoại Apple iPhone 16 128GB')).toBe('mismatch')
    expect(productIdentityMatch('Tủ lạnh Samsung RT31', 'Samsung RT31 Inverter 300L - Lazada')).toBe('match')
    expect(productIdentityMatch('Máy giặt LG', 'Hàng chính hãng giá tốt')).toBe('mismatch')
  })

  it('the seam drops a discovered listing for another product and offers the marketplace search instead', async () => {
    const row = { title: 'Điện thoại Apple iPhone 16 Pro 128GB', link: 'https://www.google.com/search?q=iphone+16+pro&prds=1', price_vnd: 25990000, source: 'Fogo Store' }
    const result = { search_results: [row], source: 'Google Shopping (Serper)' }
    const { search } = marketplaceSearch([
      { title: 'Ốp lưng iPhone 16 Pro Max MagSafe | Shopee', link: 'https://shopee.vn/op-lung-i.1.2' },
      { title: 'iPhone 16 Pro Max 256GB [ShopDunk] - TikTok Shop', link: TIKTOK_PAGE },
    ])
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, search })
    const ls = links(row)
    expect(ls.filter(l => l.kind !== 'SEARCH_HANDOFF')).toEqual([])
    expect(ls.find(l => l.providerId === 'shopee')).toMatchObject({ kind: 'SEARCH_HANDOFF', depth: 2 })
    expect(ls.find(l => l.providerId === 'tiktokshop')).toBeUndefined() // no search grammar, no detail: honestly absent
  })
})

describe('presentation — "Mua trên …" per provider, no generic search beside a verified handoff', () => {
  it('one combined discovery query per product row; the entity carries Shopee, TikTok Shop, DMX and CellphoneS handoffs with merchant-named labels', async () => {
    const row = { title: 'Điện thoại Apple iPhone 16 Pro 128GB', link: DMX_PAGE, price_vnd: 25990000, source: 'Điện Máy Xanh' }
    const result = { search_results: [row], source: 'Google Shopping (Serper)' }
    const { search, calls } = marketplaceSearch(ALL_HITS)
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, search })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('(site:shopee.vn OR site:shop.tiktok.com/vn OR site:lazada.vn/products OR site:cellphones.com.vn)')
    expect(calls[0]).not.toContain('site:dienmayxanh.com') // the row already owns DMX
    const ls = links(row)
    expect(ls.map(l => l.providerId)).toEqual(expect.arrayContaining(['dmx', 'shopee', 'tiktokshop']))
    expect(ls).toHaveLength(5) // one per provider (DMX, CellphoneS, Lazada, TikTok Shop, Shopee)
    expect(new Set(ls.map(l => l.providerId)).size).toBe(5)

    const view = buildSynthesisView(buildShoppingSynthesis([{ id: 'c0', name: row.title, raw: row } as unknown as Candidate], null, 'Tìm iPhone 16 Pro để mua.'))
    const e = view.entities[0]
    const labels = (e.commerceLinks ?? []).map(c => resolveActionLabel({ kind: 'purchase', urlKind: c.kind === 'SEARCH_HANDOFF' ? 'search' : 'direct', url: c.url, platform: c.merchantName, commerce: c }))
    const keys = labels.map(l => `${l.key}:${l.params?.platform}`)
    expect(keys).toContain('v3.action.purchaseOn:Điện Máy Xanh')
    expect(keys).toContain('v3.action.purchaseLoginOn:Shopee')
    expect(keys).toContain('v3.action.purchaseLoginOn:TikTok Shop')
    expect(e.commerce?.providerId).toBe('dmx')
    // The marker round-trips the full set.
    const back = parseShoppingMarker(`x\n${renderShoppingMarker(view)}`)
    expect(back.view?.entities[0].commerceLinks?.map(c => c.providerId)).toEqual(e.commerceLinks?.map(c => c.providerId))
    // …and the canonical Action list leads with the same handoff.
    expect(productRecommendations(result)[0].entity.actions[0].commerce?.providerId).toBe('dmx')
  })

  it('the legacy search builders are registry projections (Shopee + Lazada), TikTok Shop absent by fact, Tiki gone; the prompt template follows', () => {
    expect(buildShoppingLinks('iPhone 16 Pro').map(l => l.name)).toEqual(['Shopee', 'Lazada'])
    expect(buildShoppingLinks('iPhone 16 Pro')[0].url).toBe('https://shopee.vn/search?keyword=iPhone%2016%20Pro')
    const system = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
    const text = `${system.shared}\n${system.dynamic}`
    expect(text).toContain('label:"🛒 Shopee",type:"search",url:"https://shopee.vn/search?keyword={san+pham}"')
    expect(text).not.toContain('tiki.vn')
    expect(text).toContain('TikTok Shop KHONG co trang tim kiem web')
  })
})

describe('§13 negative tests', () => {
  it('food delivery: ShopeeFood ≠ Shopee marketplace (different hosts, disjoint transactional capabilities)', () => {
    const shopee = getProvider('shopee')!, shopeefood = getProvider('shopeefood')!
    expect(shopee.allowedHosts.some(h => shopeefood.allowedHosts.includes(h))).toBe(false)
    expect(shopee.commerce.filter(c => c !== 'commerce_handoff').some(c => shopeefood.commerce.includes(c))).toBe(false)
    const delivery = adaptersFor({ domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'x' }).map(a => a.providerId)
    expect(delivery).not.toContain('shopee')
    expect(delivery).toContain('shopeefood')
  })

  it('table reservation: PasGo cannot be selected for product_purchase; entertainment: Klook cannot be selected for shopping', () => {
    const ids = adaptersFor(REQ).map(a => a.providerId)
    expect(ids).not.toContain('pasgo')
    expect(ids).not.toContain('klook')
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: 'https://pasgo.vn/nha-hang/rakuen-hotpot-le-van-sy-3875' }, { url: 'https://www.klook.com/vi/activity/43345-ha-spa/' }] })
    const providers = ('links' in r ? r.links : []).map(l => l.providerId)
    expect(providers).not.toContain('pasgo')
    expect(providers).not.toContain('klook')
  })

  it('TikTok Shop: the old "no tiktok.com" prohibition does not reject the provider — its product link survives resolution, validation and the CTA validator', () => {
    const r = resolveCommerce(REQ, { enabled: true, now: NOW, hints: [{ url: TIKTOK_PAGE }] })
    const l = ('links' in r ? r.links : []).find(x => x.providerId === 'tiktokshop')!
    expect(l.validation.status).not.toBe('unsafe_url')
    expect(isMisleadingModelCta({ label: 'TikTok Shop', type: 'website', url: TIKTOK_PAGE })).toBe(false)
  })

  it('Shopee: no fallback to a generic Google search when a verified Shopee commerce link exists (the card hides the Google offer beside a detail handoff)', async () => {
    const row = { title: 'iPhone 16 Pro 128GB', link: 'https://www.google.com/search?q=iphone&prds=1', price_vnd: 25990000, source: 'Shopee' }
    const result = { search_results: [row], source: 'Google Shopping (Serper)' }
    const { search } = marketplaceSearch([{ title: 'iPhone 16 Pro 128GB Chính Hãng VN/A | Shopee Việt Nam', link: SHOPEE_PAGE }])
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, search })
    const view = buildSynthesisView(buildShoppingSynthesis([{ id: 'c0', name: row.title, raw: row } as unknown as Candidate], null, 'iPhone 16 Pro'))
    const e = view.entities[0]
    expect(e.commerce).toMatchObject({ providerId: 'shopee', kind: 'DETAIL_HANDOFF' })
    // The offer (a Google redirect) stays in the data, but ShoppingDecision renders the Google link only when no detail handoff exists (handoffsOf).
    expect((e.commerceLinks ?? []).filter(c => c.kind !== 'SEARCH_HANDOFF').map(c => c.providerId)).toEqual(['shopee'])
  })

  it('model-authored marketplace SEARCH buttons stay (downgraded to honest search labels); a bare merchant front door or a promise on a search page is dropped', () => {
    const kept = validateModelCtaButtons([
      { label: '🛒 Shopee', type: 'search', url: 'https://shopee.vn/search?keyword=iphone+16' },
      { label: '📦 Lazada', type: 'search', url: 'https://www.lazada.vn/catalog/?q=iphone+16' },
      { label: '🎵 TikTok Shop', type: 'website', url: 'https://www.tiktok.com/shop' },
      { label: '🛒 Mua ngay trên Shopee', type: 'purchase', url: 'https://shopee.vn/search?keyword=iphone+16' },
    ], t)
    expect(kept.map(b => b.url)).toEqual(['https://shopee.vn/search?keyword=iphone+16', 'https://www.lazada.vn/catalog/?q=iphone+16'])
  })
})

describe('lazada (desired) resolves the same way', () => {
  it('product page → DETAIL_HANDOFF L3, guest L3, login before checkout; search fallback exists', () => {
    const o = lazadaAdapter.toOffer(REQ, { url: LAZADA_PAGE, title: 'x' }, NOW)!
    expect(o.subjectRef).toBe('2806208680')
    expect(o.canonicalUrl).toBe('https://www.lazada.vn/products/iphone-16-pro-128gb-chinh-hang-vna-i2806208680.html')
    expect(lazadaAdapter.searchOffer(REQ, NOW)?.canonicalUrl).toBe('https://www.lazada.vn/catalog/?q=iPhone+16+Pro+128GB')
  })
})
