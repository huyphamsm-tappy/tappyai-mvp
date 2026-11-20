// @vitest-environment jsdom
// 20/11 (owner): the public plan page has its own "where to stay" and "what to try" panels, drawn from the stored snapshot only; a snapshot without them draws neither.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { toPlanShareSnapshot } from '@/lib/plans/share/planShare'

const h = vi.hoisted(() => ({ row: null as { id: string; plan: unknown; created_at: string } | null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ rpc: () => Promise.resolve({ data: h.row ? [h.row] : [], error: null }) }) }))
vi.mock('next/headers', () => ({ headers: () => ({ get: (k: string) => (k === 'accept-language' ? 'vi-VN,vi;q=0.9' : null) }) }))
vi.mock('./PlanBrochureShare', () => ({ default: () => null }))

import PlanSharePage from './page'

const ID = 'StaysDishes1'
const plan = (extra: Record<string, unknown>) => ({ type: 'trip', title: 'Ha Noi 2N1D', days: [{ label: 'Ngay 1', items: [{ time: '08:00', emoji: 'x', category: 'food', name: 'Pho co' }] }], ...extra })

async function html(extra: Record<string, unknown>): Promise<string> {
  h.row = { id: ID, plan: JSON.parse(JSON.stringify(toPlanShareSnapshot(plan(extra) as never))), created_at: '2026-11-20T00:00:00Z' }
  return renderToStaticMarkup((await PlanSharePage({ params: { shareId: ID } })) as ReactElement)
}

beforeEach(() => { h.row = null; vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com') })

describe('the public plan page: stays and dishes', () => {
  it('draws the stays with price and booking page, and the dishes with venue, address and price', async () => {
    const out = await html({
      stays: [{ name: 'Hotel A', why: 'Gan Ho Guom', price: '1.250.000d/dem', booking_link: 'https://www.agoda.com/p?x=1' }],
      dishes: [{ dish: 'Bun cha', venue: 'Huong Lien', address: '24 Le Van Huu', price: '60.000d' }],
    })
    expect(out).toContain('data-pb-stays')
    expect(out).toContain('Chỗ ở gợi ý')
    expect(out).toContain('Hotel A')
    expect(out).toContain('1.250.000d/dem')
    expect(out).toContain('href="https://www.agoda.com/p?x=1"')
    expect(out).toContain('data-pb-dishes')
    expect(out).toContain('Món nên thử')
    for (const w of ['Bun cha', 'Huong Lien', '24 Le Van Huu', '60.000d']) expect(out).toContain(w)
  })
  it('a snapshot without them draws neither panel', async () => {
    const out = await html({})
    expect(out).not.toContain('data-pb-stays')
    expect(out).not.toContain('data-pb-dishes')
  })
})
