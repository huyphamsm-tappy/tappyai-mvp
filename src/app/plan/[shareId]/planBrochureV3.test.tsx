// @vitest-environment jsdom
// CONSULT_V3 Đợt 2 review (owner 17/10: "brochure chia sẻ phải giữ"): a plan written the V3 way — the reply text as the server settles it
// (budget table appended, `budget_lines` removed from the JSON, a well-known sight kept by name only) — goes through the SAME path the share
// button uses (parsePlan → toPlanShareSnapshot → stored row → /plan/<id> page) and renders a complete brochure. Mocks: the RPC only.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { toPlanShareSnapshot } from '@/lib/plans/share/planShare'
import { parsePlan } from '@/lib/structuredContent/parsePlan'
import { appendPlanBudget } from '@/lib/ai/planBudget'

const h = vi.hoisted(() => ({ row: null as { id: string; plan: unknown; created_at: string } | null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ rpc: () => Promise.resolve({ data: h.row ? [h.row] : [], error: null }) }) }))
vi.mock('next/headers', () => ({ headers: () => ({ get: (k: string) => (k === 'accept-language' ? 'vi-VN,vi;q=0.9' : null) }) }))
vi.mock('./PlanBrochureShare', () => ({ default: ({ url, label }: { url: string; label: string }) => <button data-pb-share data-url={url}>{label}</button> }))

import PlanSharePage from './page'

const ID = 'V3PlanShare1'
const PHOTO = 'https://lh3.googleusercontent.com/p/AF1QipV3-a=s1360'
const V3_PLAN = {
  type: 'trip', title: 'Quy Nhơn 3N2Đ — biển và hẹn hò', people: 2, budget_total: '30.000.000 VND', share_text: 'Biển, hải sản và hoàng hôn. #TappyAI',
  days: [
    { label: 'Ngày 1 — Biển & đảo', items: [
      { time: '12:00', emoji: '🏨', category: 'hotel', name: 'Khách sạn Sala Quy Nhon Beach', description: 'Nhận phòng, nghỉ trưa', address: '124 Phan Chu Trinh, Quy Nhơn', photo_url: PHOTO, maps_link: 'https://maps.google.com/?cid=7' },
      { time: '15:30', emoji: '🏖️', category: 'attraction', name: 'Kỳ Co', description: 'Điểm nổi tiếng (gợi ý chưa kiểm chứng).' },
    ] },
    { label: 'Ngày 2 — Văn hoá', items: [{ time: '08:00', emoji: '🏛️', category: 'attraction', name: 'Tháp Đôi', description: 'Tháp Chăm' }] },
    { label: 'Ngày 3 — Về', items: [{ time: '09:00', emoji: '☕', category: 'food', name: 'Cà phê sáng', description: 'Trước khi ra sân bay' }] },
  ],
  budget_lines: [{ item: 'Vé máy bay khứ hồi', unit_amount: 2500000, per: 'person_leg', legs: 2, label: 'estimate', basis: 'ước tính' }],
}

async function brochureOf(replyText: string): Promise<string> {
  const { plan } = parsePlan(replyText)
  expect(plan).not.toBeNull()
  h.row = { id: ID, plan: JSON.parse(JSON.stringify(toPlanShareSnapshot(plan))), created_at: '2026-10-17T00:00:00Z' }
  return renderToStaticMarkup((await PlanSharePage({ params: { shareId: ID } })) as ReactElement)
}

beforeEach(() => { h.row = null; vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com') })

describe('CONSULT_V3 plan → share brochure', () => {
  it('the settled V3 reply still parses to a plan and publishes a full brochure: title, budget, every day, every stop, the place photo', async () => {
    const settled = appendPlanBudget(`Mình hiểu là 30 triệu cho cả chuyến nha.\n[TAPPY_PLAN]${JSON.stringify(V3_PLAN)}[/TAPPY_PLAN]\n**Hai bạn đi từ đâu?**`, [], { day: 17, month: 10 }, 'vi', { allowEstimates: true, userTotal: 30_000_000 }).text
    expect(settled).toContain('| Tổng | 30.000.000đ |') // the V3 budget table is in the reply…
    const html = await brochureOf(settled)
    expect(html).toContain('Quy Nhơn 3N2Đ — biển và hẹn hò')
    expect(html).toContain('30.000.000 VND') // …and the brochure keeps the plan's own budget line
    for (const s of ['Ngày 1 — Biển &amp; đảo', 'Ngày 2 — Văn hoá', 'Ngày 3 — Về', 'Khách sạn Sala Quy Nhon Beach', 'Kỳ Co', 'Tháp Đôi', 'Cà phê sáng']) expect(html).toContain(s)
    expect(html).toContain(PHOTO)
    expect(html).not.toContain('budget_lines')
    expect(html).not.toContain('| Khoản |') // the chat's table is not leaked into the brochure as raw pipes
  })
  it('a well-known sight kept by name only (no photo, no link) is a stop without an image — never a borrowed photo', async () => {
    const html = await brochureOf(`[TAPPY_PLAN]${JSON.stringify({ ...V3_PLAN, budget_lines: undefined })}[/TAPPY_PLAN]`)
    const kyCo = html.slice(html.indexOf('Kỳ Co') - 600, html.indexOf('Kỳ Co'))
    expect(kyCo.lastIndexOf('data-has-photo="false"')).toBeGreaterThan(kyCo.lastIndexOf('data-has-photo="true"'))
  })
})
