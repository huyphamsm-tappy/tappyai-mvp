// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateDealSchema, UpdateDealSchema, toDbColumns, PARTNER_TYPES } from './schema'
import { promoCountdown } from './countdown'

// ── supabase client mock (chainable + thenable, with a controllable rpc) ──
let mockResult: { data: unknown; error: unknown } = { data: [], error: null }
let rpcThrows = false
const rpc = vi.fn(() => (rpcThrows ? Promise.reject(new Error('rpc failed')) : Promise.resolve({ data: null, error: null })))
function chain() {
  const c: any = { rpc }
  for (const m of ['from', 'select', 'eq', 'order']) c[m] = vi.fn(() => c)
  c.then = (res: any) => Promise.resolve(mockResult).then(res)
  return c
}
vi.mock('@/lib/supabase/server', () => ({ createClient: () => chain() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => chain() }))

import { getActiveDeals } from './partnerDeals'
import { POST as clickPost } from '@/app/api/deals/[id]/click/route'

beforeEach(() => { mockResult = { data: [], error: null }; rpcThrows = false; rpc.mockClear() })

const base = {
  partnerSlug: 'shopee', partnerName: 'Shopee', partnerType: 'ecommerce' as const,
  category: 'Mua sắm', title: 'Shopee', officialUrl: 'https://shopee.vn',
}

describe('deals schema', () => {
  it('official_url must be HTTPS (rejects http:// and non-URLs)', () => {
    expect(CreateDealSchema.safeParse({ ...base, officialUrl: 'https://shopee.vn' }).success).toBe(true)
    expect(CreateDealSchema.safeParse({ ...base, officialUrl: 'http://shopee.vn' }).success).toBe(false)
    expect(CreateDealSchema.safeParse({ ...base, officialUrl: 'shopee' }).success).toBe(false)
  })

  it('partner_slug must be lowercase / url-safe', () => {
    expect(CreateDealSchema.safeParse({ ...base, partnerSlug: 'shopee-food' }).success).toBe(true)
    expect(CreateDealSchema.safeParse({ ...base, partnerSlug: 'Shopee' }).success).toBe(false)
    expect(CreateDealSchema.safeParse({ ...base, partnerSlug: 'shopee food' }).success).toBe(false)
    expect(CreateDealSchema.safeParse({ ...base, partnerSlug: '' }).success).toBe(false)
  })

  it('partner_slug is immutable: not accepted on update', () => {
    // Uniqueness is a DB UNIQUE index; immutability is a DB trigger AND the
    // update schema omitting the field — a slug-only update has nothing to update.
    expect(UpdateDealSchema.safeParse({ partnerSlug: 'newslug' } as any).success).toBe(false)
    const parsed = UpdateDealSchema.parse({ title: 'x', partnerSlug: 'ignored' } as any)
    expect('partner_slug' in toDbColumns(parsed)).toBe(false)
  })

  it('partner_type is a lowercase string — any value (future types need no code change)', () => {
    for (const t of PARTNER_TYPES) expect(CreateDealSchema.safeParse({ ...base, partnerType: t }).success).toBe(true)
    expect(CreateDealSchema.safeParse({ ...base, partnerType: 'gaming' }).success).toBe(true) // a future type is accepted
    expect(CreateDealSchema.parse({ ...base, partnerType: 'ECOMMERCE' }).partnerType).toBe('ecommerce') // normalized lowercase
    expect(CreateDealSchema.safeParse({ ...base, partnerType: '' }).success).toBe(false) // required
    expect(CreateDealSchema.safeParse({ ...base, partnerType: 'x'.repeat(33) }).success).toBe(false) // max 32
  })

  it('is_featured optional (DB default false); affiliate_code never accepted via API', () => {
    expect(CreateDealSchema.safeParse(base).success).toBe(true) // no isFeatured
    expect('affiliateCode' in toDbColumns({ ...base, ...({ affiliateCode: 'X' } as any) })).toBe(false)
  })

  it('maps camelCase → snake_case, omitting undefined', () => {
    const cols = toDbColumns({ partnerSlug: 'be', partnerType: 'ride', isFeatured: true, officialUrl: 'https://be.com.vn' })
    expect(cols).toEqual({ partner_slug: 'be', partner_type: 'ride', is_featured: true, official_url: 'https://be.com.vn' })
  })

  it('discountLabel/voucherCode are optional with max lengths', () => {
    expect(CreateDealSchema.safeParse({ ...base, discountLabel: 'Giảm 50%', voucherCode: 'FREESHIP50' }).success).toBe(true)
    expect(CreateDealSchema.safeParse(base).success).toBe(true) // both optional
    expect(CreateDealSchema.safeParse({ ...base, discountLabel: 'x'.repeat(25) }).success).toBe(false) // max 24
    expect(CreateDealSchema.safeParse({ ...base, voucherCode: 'y'.repeat(41) }).success).toBe(false) // max 40
  })

  it('promotion fields nest under metadata.promotion; untouched when neither is provided', () => {
    expect(toDbColumns({ discountLabel: 'Giảm 50%', voucherCode: 'FREESHIP' }).metadata)
      .toEqual({ promotion: { discountLabel: 'Giảm 50%', voucherCode: 'FREESHIP' } })
    expect(toDbColumns({ discountLabel: '-30%' }).metadata).toEqual({ promotion: { discountLabel: '-30%' } })
    // a reorder/toggle PATCH sends neither → metadata is NOT written (never clobbered)
    expect('metadata' in toDbColumns({ displayOrder: 2, isActive: false })).toBe(false)
    // explicit null clears the value but still writes a promotion object
    expect(toDbColumns({ discountLabel: null, voucherCode: null }).metadata).toEqual({ promotion: {} })
  })
})

describe('getActiveDeals', () => {
  it('maps rows to the public shape incl. slug/type/featured (never click_count/affiliate)', async () => {
    mockResult = { data: [{
      id: 'd1', partner_slug: 'shopee', partner_name: 'Shopee', partner_type: 'ecommerce',
      category: 'Mua sắm', title: 'Shopee', description: null, official_url: 'https://shopee.vn',
      banner_image: null, logo_image: null, is_featured: true,
    }], error: null }
    const deals = await getActiveDeals('VN')
    expect(deals[0]).toMatchObject({ partnerSlug: 'shopee', partnerType: 'ecommerce', isFeatured: true })
    expect('clickCount' in deals[0]).toBe(false)
    expect('affiliateCode' in deals[0]).toBe(false)
  })

  it('returns [] gracefully on error', async () => {
    mockResult = { data: null, error: { message: 'boom' } }
    await expect(getActiveDeals()).resolves.toEqual([])
  })

  it('extracts discountLabel/voucherCode from metadata.promotion + exposes endAt; never raw metadata', async () => {
    mockResult = { data: [{
      id: 'd1', partner_slug: 'shopee', partner_name: 'Shopee', partner_type: 'ecommerce',
      category: 'Mua sắm', title: 'Shopee', description: null, official_url: 'https://shopee.vn',
      banner_image: null, logo_image: null, is_featured: true, end_at: '2099-01-01T00:00:00Z',
      metadata: { promotion: { discountLabel: 'Giảm 50%', voucherCode: 'FREESHIP50' }, affiliate: { secret: 'x' } },
    }], error: null }
    const d = (await getActiveDeals('VN'))[0]
    expect(d.discountLabel).toBe('Giảm 50%')
    expect(d.voucherCode).toBe('FREESHIP50')
    expect(d.endAt).toBe('2099-01-01T00:00:00Z')
    expect('metadata' in d).toBe(false) // raw metadata (incl. affiliate namespace) NEVER exposed
  })

  it('promo fields are null when metadata has no promotion', async () => {
    mockResult = { data: [{
      id: 'd2', partner_slug: 'grab', partner_name: 'Grab', partner_type: 'ride',
      category: 'Vận chuyển', title: 'Grab', description: null, official_url: 'https://grab.com',
      banner_image: null, logo_image: null, is_featured: false, end_at: null, metadata: {},
    }], error: null }
    const d = (await getActiveDeals('VN'))[0]
    expect(d.discountLabel).toBeNull()
    expect(d.voucherCode).toBeNull()
    expect(d.endAt).toBeNull()
  })
})

describe('promoCountdown', () => {
  const now = Date.parse('2026-01-01T00:00:00Z')
  it('no endAt / expired / invalid → none', () => {
    expect(promoCountdown(null, now).kind).toBe('none')
    expect(promoCountdown('2025-12-31T00:00:00Z', now).kind).toBe('none') // already past
    expect(promoCountdown('not-a-date', now).kind).toBe('none')
  })
  it('<= 24h left → soon', () => {
    expect(promoCountdown('2026-01-01T12:00:00Z', now).kind).toBe('soon') // 12h
    expect(promoCountdown('2026-01-02T00:00:00Z', now).kind).toBe('soon') // exactly 24h
  })
  it('> 24h left → days', () => {
    expect(promoCountdown('2026-01-02T01:00:00Z', now)).toEqual({ kind: 'days', days: 1 }) // 25h
    expect(promoCountdown('2026-01-03T00:00:00Z', now)).toEqual({ kind: 'days', days: 2 }) // 48h
    expect(promoCountdown('2026-01-04T12:00:00Z', now)).toEqual({ kind: 'days', days: 4 }) // 84h → round(3.5)
  })
})

describe('click counter endpoint', () => {
  it('calls the increment RPC and returns success', async () => {
    const res = await clickPost(new Request('http://x'), { params: { id: 'd1' } })
    expect(rpc).toHaveBeenCalledWith('increment_deal_click', { p_deal_id: 'd1' })
    expect(await res.json()).toEqual({ success: true })
  })

  it('never blocks link opening — still 200 when the RPC throws', async () => {
    rpcThrows = true
    const res = await clickPost(new Request('http://x'), { params: { id: 'd1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
