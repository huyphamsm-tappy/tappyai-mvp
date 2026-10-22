import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    authResult: null as any,
    orders: [] as any[],
  }
  return { state }
})

vi.mock('@/lib/payments/authGuard', () => ({
  requirePayer: () => Promise.resolve(h.state.authResult),
}))

import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  h.state.orders = []
  h.state.authResult = {
    user: { id: 'u-history-1' },
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({ data: h.state.orders, error: null }),
              }),
            }),
          }),
        }),
      }),
    },
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/payments/history — Payments History', () => {
  it('returns 404 when SUBSCRIPTIONS_ENABLED is off', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    const res = await GET(new Request('https://t.test/api/payments/history'))
    expect(res.status).toBe(404)
  })

  it('returns auth error response when requirePayer rejects', async () => {
    const { NextResponse } = await import('next/server')
    h.state.authResult = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const res = await GET(new Request('https://t.test/api/payments/history'))
    expect(res.status).toBe(401)
  })

  it('returns formatted history items for paid and mismatch orders', async () => {
    h.state.orders = [
      {
        plan: 'momo',
        amount_vnd: 179000,
        received_vnd: 179000,
        status: 'paid',
        paid_at: '2026-10-15T12:00:00Z',
        created_at: '2026-10-15T11:50:00Z',
      },
      {
        plan: 'sunny',
        amount_vnd: 1719000,
        received_vnd: 500000,
        status: 'mismatch',
        paid_at: null,
        created_at: '2026-10-10T09:00:00Z',
      },
    ]

    const res = await GET(new Request('https://t.test/api/payments/history'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toEqual({
      date: '2026-10-15T12:00:00Z',
      plan: { id: 'momo', name: 'Momo' },
      amountVnd: 179000,
      status: 'paid',
    })
    expect(body.items[1]).toEqual({
      date: '2026-10-10T09:00:00Z',
      plan: { id: 'sunny', name: 'Sunny' },
      amountVnd: 500000,
      status: 'mismatch',
    })
  })
})
