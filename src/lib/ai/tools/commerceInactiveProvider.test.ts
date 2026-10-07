// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { setProviderConfigSource, refreshProviderConfig, __resetProviderConfig, PROVIDER_CONFIG_TTL_MS, type ProviderOverride } from '@/lib/ccp/registry'
import { isMisleadingModelCta, unlinkMislabelledMerchantLinks } from '@/lib/recommendation/ctaValidation'
import { attachCommerceLinks, dropInactiveMerchantRows } from './commerce'

// Owner decision 2026-09-20: DMX DISABLED entirely, through the runtime registry (A3.1) — the AI-layer
// half: the model's own buttons / links to it are removed, and the rows it sells or IS (a physical
// store) leave the result before ranking and again at the seam, so a former-DMX query resolves to the
// next provider instead of an empty gap. Flipping the row back restores everything: a data change.
const row = (over: Partial<ProviderOverride> & { providerId: string }): ProviderOverride => ({ active: true, deeplinkEnabled: false, tier: 2, network: null, campaignId: null, wrapperTemplate: null, updatedAt: null, ...over })
const use = async (rows: ProviderOverride[]) => { setProviderConfigSource({ async load() { return rows } }); await refreshProviderConfig({ now: 0, force: true }) }
const resolveNone = () => ({ requestId: 'r', request: { domain: 'shopping', intentType: 'buy_product', subject: 'x' }, links: [], offers: [], providersQueried: [], providersFailed: [], rankingVersion: 'test', generatedAt: '2026-09-20T00:00:00Z' }) as never

describe('DMX off (runtime row): buttons, links and rows', () => {
  beforeEach(() => __resetProviderConfig())
  afterEach(() => setProviderConfigSource(null))

  it("the model's button and prose link to the merchant are removed while the row is off, kept when it is on", async () => {
    await use([row({ providerId: 'dmx', active: false })])
    expect(isMisleadingModelCta({ label: '🛒 Mua ngay', type: 'purchase', url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb' })).toBe(true)
    expect(unlinkMislabelledMerchantLinks('Xem [Điện Máy Xanh](https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb).')).toBe('Xem Điện Máy Xanh.')
    await use([row({ providerId: 'dmx', active: true })])
    expect(isMisleadingModelCta({ label: '🛒 Mua ngay', type: 'purchase', url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb' })).toBe(false)
  })

  it('shopping rows it sells and place rows that ARE its stores leave the result — the other rows stay (no empty gap)', async () => {
    await use([row({ providerId: 'dmx', active: false })])
    const shopping: Record<string, unknown> = { search_results: [
      { title: 'Loa karaoke Zypher 5W', price: 990000, link: 'https://www.dienmayxanh.com/loa-karaoke/zypher-5w', source: 'Điện máy XANH' },
      { title: 'Loa karaoke JBL', price: 2900000, link: 'https://shopee.vn/Loa-JBL-i.1.2', source: 'Shopee' },
    ] }
    await dropInactiveMerchantRows(shopping, 'search_results')
    expect((shopping.search_results as Array<{ source: string }>).map(r => r.source)).toEqual(['Shopee'])
    const places: Record<string, unknown> = { count: 2, results: [
      { name: 'Siêu thị Điện Máy XANH', address: 'Phú Nhuận', website_uri: 'https://www.dienmayxanh.com/sieu-thi/phu-nhuan' },
      { name: 'Trung tâm Mua sắm Nguyễn Kim - Phú Nhuận', address: 'Phú Nhuận' },
    ] }
    await dropInactiveMerchantRows(places, 'results')
    expect((places.results as Array<{ name: string }>).map(r => r.name)).toEqual(['Trung tâm Mua sắm Nguyễn Kim - Phú Nhuận'])
    expect(places.count).toBe(1)
    // the seam applies the same net on a result that skipped the pre-rank drop
    const late: Record<string, unknown> = { search_results: [{ title: 'Tủ lạnh', price: 5000000, link: 'https://www.dienmayxanh.com/tu-lanh/x', source: 'Điện máy XANH' }, { title: 'Tủ lạnh', price: 5100000, link: 'https://www.lazada.vn/products/x-i1.html', source: 'Lazada' }] }
    await attachCommerceLinks('search_products', late, { resolve: resolveNone, userText: 'tủ lạnh' })
    expect((late.search_results as Array<{ source: string }>).map(r => r.source)).toEqual(['Lazada'])
  })
})
