// @vitest-environment jsdom
// /plan/<shareId> — what a recipient gets, through the real page.
//
// The RPC is the only mock: it answers with a stored snapshot (or nothing).
// Everything from there — id validation, re-validation of the row, the
// brochure mapping, the metadata, the markup — is the page's own code.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync } from 'node:fs'
import type { ReactElement } from 'react'
import { toPlanShareSnapshot } from '@/lib/plans/share/planShare'
import type { TappyPlan } from '@/components/TripPlanCard'

const h = vi.hoisted(() => ({
  row: null as { id: string; plan: unknown; created_at: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  acceptLanguage: 'vi-VN,vi;q=0.9',
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    rpc: (fn: string, args: unknown) => { h.rpcCalls.push({ fn, args }); return Promise.resolve({ data: h.row ? [h.row] : [], error: null }) },
  }),
}))
vi.mock('next/headers', () => ({ headers: () => ({ get: (k: string) => (k === 'accept-language' ? h.acceptLanguage : null) }) }))
vi.mock('./PlanBrochureShare', () => ({ default: ({ url, label }: { url: string; label: string }) => <button data-pb-share data-url={url}>{label}</button> }))

import PlanSharePage, { generateMetadata } from './page'
import { getPlanShare } from './getPlanShare'

const PHOTO_A = 'https://lh3.googleusercontent.com/p/AF1QipM-a=s1360'
const PHOTO_B = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-b'
const ID = 'AbCdEfGhIjK1'

function quyNhon(): TappyPlan {
  return {
    type: 'trip', title: 'Quy Nhơn 3 ngày 2 đêm', people: 2, budget_total: '5.000.000đ', share_text: 'Biển xanh, ẩm thực ngon, nhịp sống bình yên.',
    days: [
      { label: 'Ngày 1: Khám phá thành phố biển', items: [
        { time: '09:00', emoji: '🏖️', category: 'entertainment', name: 'Bãi Kỳ Co', description: 'Thiên đường biển hoang sơ', address: 'Xã Nhơn Lý, Quy Nhơn', photo_url: PHOTO_A, maps_link: 'https://maps.google.com/?cid=1' },
        { time: '12:30', emoji: '🦐', category: 'food', name: 'Hải sản Nhơn Lý', address: 'Làng chài Nhơn Lý', price: '250.000đ/người', photo_url: PHOTO_B },
        { time: '18:30', emoji: '🌆', category: 'entertainment', name: 'Quảng trường Quy Nhơn' },
      ] },
      { label: 'Ngày 2: Thiên nhiên và văn hóa', items: [
        { time: '08:00', emoji: '🏛️', category: 'entertainment', name: 'Tháp Đôi', address: 'Đường Trần Hưng Đạo', booking_link: 'https://www.klook.com/x' },
      ] },
    ],
  }
}

const stored = (plan: TappyPlan) => ({ id: ID, plan: JSON.parse(JSON.stringify(toPlanShareSnapshot(plan))), created_at: '2026-09-13T00:00:00Z' })

async function refuses(run: () => Promise<unknown>): Promise<boolean> {
  try { await run(); return false } catch (e: any) { return /NEXT_NOT_FOUND/.test(e?.digest ?? e?.message ?? '') }
}

async function html(params = { shareId: ID }): Promise<string> {
  const el = (await PlanSharePage({ params })) as ReactElement
  return renderToStaticMarkup(el)
}

beforeEach(() => { h.row = null; h.rpcCalls = []; h.acceptLanguage = 'vi-VN,vi;q=0.9'; vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com') })

describe('the public lookup', () => {
  it('reads ONLY through plan_share_public, by exact id, and re-validates the row', async () => {
    h.row = stored(quyNhon())
    const b = await getPlanShare(ID)
    expect(h.rpcCalls).toEqual([{ fn: 'plan_share_public', args: { p_id: ID } }])
    expect(b?.snapshot.title).toBe('Quy Nhơn 3 ngày 2 đêm')
    expect(b?.hero).toBe(PHOTO_A)
  })

  it('never queries for a malformed id', async () => {
    for (const bad of ['', 'x', 'AbCdEfGhIjK!', '../../etc/passwd', 'AbCdEfGhIjK12']) {
      expect(await getPlanShare(bad)).toBeNull()
    }
    expect(h.rpcCalls).toEqual([])
  })

  it('a row that no longer decodes as a plan is null, not a half-page', async () => {
    h.row = { id: ID, plan: { v: 1, title: 'x', days: [] }, created_at: '' }
    expect(await getPlanShare(ID)).toBeNull()
  })
})

describe('the page', () => {
  it('🚨 an unknown or malformed id triggers notFound() — a real 404, and no loading.tsx at the app root to soften it', async () => {
    expect(await refuses(() => PlanSharePage({ params: { shareId: 'NoSuchPlan00' } }))).toBe(true)
    expect(await refuses(() => PlanSharePage({ params: { shareId: 'bad id' } }))).toBe(true)
    expect(existsSync('src/app/loading.tsx')).toBe(false)
  })

  it('renders the approved brochure from the snapshot: hero photo, eyebrow, title, real meta, editorial timeline, overview, highlights, CTA, attribution', async () => {
    h.row = stored(quyNhon())
    const out = await html()
    // Hero: the plan's own first photo, the eyebrow, the title.
    expect(out).toMatch(/data-pb-hero[^>]*data-has-photo="true"/)
    expect(out).toContain(`class="v3-pb-hero-img"`)
    expect(out).toContain(PHOTO_A)
    expect(out).toContain('Tappy Plan')
    expect(out).toMatch(/<h1 class="v3-pb-title" data-pb-title[^>]*>Quy Nhơn 3 ngày 2 đêm<\/h1>/)
    // Meta: counts are counts, people and budget are the plan's own; nothing invented.
    expect(out).toContain('2 ngày')
    expect(out).toContain('4 điểm dừng')
    expect(out).toMatch(/data-pb-people[^>]*>.*2 người/)
    expect(out).toMatch(/data-pb-budget[^>]*>.*5\.000\.000đ/)
    expect(out).toMatch(/data-pb-summary[^>]*>Biển xanh, ẩm thực ngon, nhịp sống bình yên\.</)
    expect(out).not.toMatch(/đêm<\/li>|nights|Điểm đến|destination/i)
    // Timeline: numbered days with their real labels, stops in order with time, name, address, price, links.
    expect(out).toMatch(/data-pb-day="1"[\s\S]*Ngày 1: Khám phá thành phố biển[\s\S]*data-pb-day="2"[\s\S]*Ngày 2: Thiên nhiên và văn hóa/)
    expect(out.match(/data-pb-stop/g)).toHaveLength(4)
    expect(out).toMatch(/data-pb-time[^>]*>09:00<[\s\S]*Bãi Kỳ Co[\s\S]*Thiên đường biển hoang sơ[\s\S]*Xã Nhơn Lý, Quy Nhơn/)
    expect(out).toContain('250.000đ/người')
    expect(out).toContain('href="https://maps.google.com/?cid=1"')
    expect(out).toContain('href="https://www.klook.com/x"')
    // 🚨 IMAGE RULE: a stop WITH a canonical photo draws it; a stop WITHOUT one is a
    // text card — no image frame, no emoji tile, no placeholder, no stand-in picture.
    expect(out).toMatch(new RegExp(`class="v3-pb-stop"[^>]*data-has-photo="true"[^>]*>[\\s\\S]*?<img src="${PHOTO_B.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*class="v3-pb-card-img"`))
    const textStop = out.match(/<li class="v3-pb-stop"[^>]*data-has-photo="false"[^>]*>[\s\S]*?<\/li>/)?.[0] ?? ''
    expect(textStop).toContain('Quảng trường Quy Nhơn')
    expect(textStop).not.toContain('<img')
    expect(textStop).not.toContain('v3-pb-card-img')
    expect(out).not.toContain('v3-pb-card-fallback')
    // Overview + highlights (the two distinct photos, named by their stop).
    expect(out).toContain('data-pb-overview')
    expect(out).toMatch(/data-pb-highlights[\s\S]*Bãi Kỳ Co[\s\S]*Hải sản Nhơn Lý/)
    expect((out.match(/class="v3-pb-hl-item"/g) ?? []).length).toBe(2)
    // CTA to THIS plan's canonical url, and the attribution.
    expect(out).toMatch(new RegExp(`<a href="https://www\\.tappyai\\.com/plan/${ID}" class="v3-pb-cta" data-pb-cta[^>]*>Xem kế hoạch đầy đủ trên Tappy`))
    expect(out).not.toMatch(/data-pb-cta[^>]*href="[^"]*\/(planner|chat|explore)/)
    expect(out).toMatch(/data-pb-foot[\s\S]*Được tạo bởi <span[^>]*data-tappy-wordmark[^>]*>Tappy<span[^>]*>AI<\/span><\/span>/)
    // 🚨 BRANDING: the shipped lockup — the app icon (otter-logo.png, 22% radius, cover) with
    // "Tappy" white and "AI" blue — in the bar; never "TAPPY" as text, never /logo.svg.
    expect(out).toMatch(/data-pb-bar[\s\S]*?<a href="\/" class="v3-pb-brand"[^>]*>[\s\S]*?data-tappy-lockup/)
    expect(out).toMatch(/<img src="\/branding\/otter-logo\.png"[^>]*data-tappy-mark/)
    expect(out).toMatch(/border-radius:22%;object-fit:cover/)
    expect(out).toMatch(/<span[^>]*style="[^"]*color:#FFFFFF[^"]*"[^>]*data-tappy-wordmark[^>]*>Tappy</)
    expect(out).toMatch(/<span[^>]*style="[^"]*color:#3391FF[^"]*"[^>]*data-tappy-wordmark-ai[^>]*>AI</)
    expect(out).not.toContain('/logo.svg')
    expect(out.replace(/<[^>]+>/g, ' ')).not.toMatch(/\bTAPPY\b/)
    // Share reuses the same canonical url.
    expect(out).toContain(`data-url="https://www.tappyai.com/plan/${ID}"`)
    // Always the dark treatment.
    expect(out).toContain('class="v3-theme dark v3-pb"')
  })

  it('🚨 IMAGE RULE: a sparse plan draws only what it has: no canonical photo → text hero with no background image and no frame, no highlights; no people, no budget, no summary → no rows', async () => {
    h.row = stored({ type: 'evening', title: 'Tối nay ăn gì', days: [{ label: 'Tối nay', items: [{ time: '19:00', emoji: '🍜', category: 'food', name: 'Phở Lệ' }] }] })
    const out = await html()
    expect(out).toMatch(/data-pb-hero[^>]*data-has-photo="false"/)
    // The hero is copy only: title straight inside the section, nothing drawn behind it.
    const hero = out.match(/<section class="v3-pb-hero"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(hero).toContain('Tối nay ăn gì')
    expect(hero).not.toContain('<img')
    expect(hero).not.toContain('v3-pb-hero-img')
    expect(hero).not.toContain('v3-pb-hero-shade')
    expect(out).not.toContain('v3-pb-hero-fallback')
    expect(out).not.toContain('v3-pb-card-fallback')
    expect(out).not.toContain('data-pb-highlights')
    expect(out).not.toContain('data-pb-people')
    expect(out).not.toContain('data-pb-budget')
    expect(out).not.toContain('data-pb-summary')
    expect(out).not.toContain('data-pb-quote')
    expect(out).toContain('1 ngày')
    expect(out).toContain('1 điểm dừng')
    expect(out).toContain('Phở Lệ')
    // No stand-in photo anywhere.
    expect(out).not.toMatch(/<img[^>]*src="https?:\/\/(?!www\.tappyai\.com)/)
  })

  it('🚨 IMAGE RULE: a clip/review thumbnail on photo_url is NOT rendered — even from a stored row that still carries it', async () => {
    const clipThumb = 'https://storage.googleapis.com/tappyai-media-prod/thumbnails/f9077a52-b0f3-453a-a497-97da115ae386/Dmj1gsRANM7jZDyBIkcXiOKa.jpg'
    const plan = quyNhon()
    for (const d of plan.days) for (const it of d.items) it.photo_url = clipThumb
    // Bypass the writer's whitelist: the row as a hand-edited or pre-rule writer might have left it.
    h.row = { id: ID, plan: { v: 1, type: 'trip', title: plan.title, days: plan.days.map(d => ({ label: d.label, items: d.items.map(it => ({ ...it })) })) }, created_at: '2026-09-13T00:00:00Z' }
    const out = await html()
    expect(out).not.toContain('storage.googleapis.com')
    expect(out).not.toContain(clipThumb)
    expect(out).toMatch(/data-pb-hero[^>]*data-has-photo="false"/)
    expect(out).not.toContain('v3-pb-hero-img')
    expect(out).not.toContain('v3-pb-card-img')
    expect(out).not.toContain('data-pb-highlights')
    expect(out.match(/data-pb-stop/g)).toHaveLength(4)
    for (const m of out.matchAll(/class="v3-pb-stop"[^>]*data-has-photo="([a-z]+)"/g)) expect(m[1]).toBe('false')
    // No external image of any kind — nothing substituted, nothing fetched.
    expect(out).not.toMatch(/<img[^>]*src="https?:\/\/(?!www\.tappyai\.com)/)
  })

  it('renders in English for an English recipient', async () => {
    h.row = stored(quyNhon())
    h.acceptLanguage = 'en-US,en;q=0.9'
    const out = await html()
    expect(out).toContain('Itinerary')
    expect(out).toContain('See the full plan on Tappy')
    expect(out).toContain('2 days')
    expect(out).toMatch(/Created by <span[^>]*data-tappy-wordmark/)
  })

  it('exposes nothing but the snapshot: no owner, no conversation, no place ids', async () => {
    h.row = stored({ ...quyNhon(), days: [{ label: 'Ngày 1', items: [{ time: '', emoji: '', category: '', name: 'A', place_id: 'ChIJsecret' }] }] })
    const out = await html()
    expect(out).not.toContain('ChIJsecret')
    expect(out).not.toMatch(/owner|conversation|user_id|fingerprint/)
  })
})

describe('metadata + social image', () => {
  it('title, description, canonical and OG describe THIS plan; the image is the route’s own composition', async () => {
    h.row = stored(quyNhon())
    const m = await generateMetadata({ params: { shareId: ID } })
    expect(m.title).toBe('Quy Nhơn 3 ngày 2 đêm | Tappy Plan')
    expect(m.description).toBe('Biển xanh, ẩm thực ngon, nhịp sống bình yên.')
    expect(m.alternates?.canonical).toBe(`https://www.tappyai.com/plan/${ID}`)
    expect(m.openGraph).toMatchObject({ title: 'Quy Nhơn 3 ngày 2 đêm | Tappy Plan', url: `https://www.tappyai.com/plan/${ID}`, siteName: 'TappyAI', type: 'article', locale: 'vi_VN' })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'Quy Nhơn 3 ngày 2 đêm | Tappy Plan' })
    // 🚨 The description is THE PLAN'S summary — the exact share_text line, not the brand tagline.
    expect(m.description).toBe('Biển xanh, ẩm thực ngon, nhịp sống bình yên.')
    expect(m.openGraph).toMatchObject({ description: 'Biển xanh, ẩm thực ngon, nhịp sống bình yên.' })
    expect(m.twitter).toMatchObject({ description: 'Biển xanh, ẩm thực ngon, nhịp sống bình yên.' })
    // No app-root or generic metadata: the url is the plan, the site card is not declared.
    expect(m.openGraph && 'images' in m.openGraph ? m.openGraph.images : undefined).toBeUndefined()
    expect(JSON.stringify(m)).not.toContain('https://www.tappyai.com"')
    // The generic site card is NOT declared here: the file-based opengraph-image / twitter-image win.
    expect(JSON.stringify(m)).not.toContain('tappyai-v2.png')
    expect(existsSync('src/app/plan/[shareId]/opengraph-image.tsx')).toBe(true)
    expect(existsSync('src/app/plan/[shareId]/twitter-image.tsx')).toBe(true)
    expect(readFileSync('src/app/plan/[shareId]/twitter-image.tsx', 'utf8')).toContain("from './opengraph-image'")
  })

  it('a missing plan gets a non-indexed not-found title', async () => {
    const m = await generateMetadata({ params: { shareId: 'NoSuchPlan00' } })
    expect(m.title).toBe('Không tìm thấy kế hoạch này | TappyAI')
    expect(m.robots).toEqual({ index: false, follow: false })
  })

  it('a plan without a summary describes itself by its day count', async () => {
    const p = quyNhon(); delete p.share_text
    h.row = stored(p)
    expect((await generateMetadata({ params: { shareId: ID } })).description).toBe('2 ngày · Kế hoạch từ TappyAI')
  })

  // The rendered PNG itself is asserted in planOgImage.test.ts (node environment —
  // @vercel/og resolves its bundled font through import.meta.url, which jsdom breaks).
})
