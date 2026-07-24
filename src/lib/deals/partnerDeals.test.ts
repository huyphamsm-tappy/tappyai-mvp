import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateDealSchema, UpdateDealSchema, toDbColumns } from './schema'

// ── supabase server client mock (chainable, thenable) ──
let mockResult: { data: unknown; error: unknown } = { data: [], error: null }
function chain() {
  const c: any = {}
  for (const m of ['from', 'select', 'eq', 'order']) c[m] = vi.fn(() => c)
  c.then = (res: any) => Promise.resolve(mockResult).then(res)
  return c
}
vi.mock('@/lib/supabase/server', () => ({ createClient: () => chain() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => chain() }))

import { getActiveDeals } from './partnerDeals'

beforeEach(() => { mockResult = { data: [], error: null } })

describe('deals schema — official_url must be HTTPS', () => {
  const base = { partnerName: 'Shopee', category: 'Mua sắm', title: 'Shopee' }

  it('accepts an https official_url', () => {
    const r = CreateDealSchema.safeParse({ ...base, officialUrl: 'https://shopee.vn' })
    expect(r.success).toBe(true)
  })

  it('rejects an http:// official_url', () => {
    const r = CreateDealSchema.safeParse({ ...base, officialUrl: 'http://shopee.vn' })
    expect(r.success).toBe(false)
  })

  it('rejects a non-URL official_url', () => {
    const r = CreateDealSchema.safeParse({ ...base, officialUrl: 'shopee' })
    expect(r.success).toBe(false)
  })

  it('rejects an empty update (no fields)', () => {
    expect(UpdateDealSchema.safeParse({}).success).toBe(false)
  })

  it('maps camelCase input to snake_case columns, omitting undefined', () => {
    const cols = toDbColumns({ partnerName: 'Be', officialUrl: 'https://be.com.vn', isActive: false })
    expect(cols).toEqual({ partner_name: 'Be', official_url: 'https://be.com.vn', is_active: false })
    expect('display_order' in cols).toBe(false)
  })
})

describe('getActiveDeals', () => {
  it('maps DB rows to the public PartnerDeal shape', async () => {
    mockResult = {
      data: [{
        id: 'd1', partner_name: 'Shopee', category: 'Mua sắm', title: 'Shopee',
        description: 'Sàn mua sắm', official_url: 'https://shopee.vn', banner_image: null, logo_image: null,
      }],
      error: null,
    }
    const deals = await getActiveDeals('VN')
    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({ id: 'd1', partnerName: 'Shopee', officialUrl: 'https://shopee.vn', logoImage: null })
  })

  it('returns [] gracefully on a query error (never throws)', async () => {
    mockResult = { data: null, error: { message: 'boom' } }
    await expect(getActiveDeals()).resolves.toEqual([])
  })
})
