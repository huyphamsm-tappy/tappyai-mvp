import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gate 2 G3 — read time: the public loader (G-T1, G-T12) and the hub listing, the one public read that bypasses the loader (G-T6).
// The admin client is mocked to return rows exactly as the table holds them.

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const HERO = 'https://cdn.example/hero.jpg'
const payload = (images: string[]) => ({
  v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images, suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
  plan: { type: 'trip', title: 'Đà Lạt 2 ngày', days: [{ label: 'Ngày 1', items: [{ time: '08:00', category: 'food', name: 'Quán A', photo_url: EXFIL }, { time: '10:00', category: 'attraction', name: 'Hồ', photo_url: TBN }] }] },
})
const rowOf = (images: string[]) => ({ id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 1, view_count: 0, ask_count: 0, created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false, payload: payload(images) })

const db = { single: null as unknown, list: [] as unknown[] }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'range']) chain[m] = () => chain
    chain.maybeSingle = async () => ({ data: JSON.parse(JSON.stringify(db.single)), error: null })
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: JSON.parse(JSON.stringify(db.list)), error: null })
    return { from: () => chain }
  },
}))

import { getPublicSharedResult, listPublicSharedResults } from './sharedResultStore'

beforeEach(() => { db.single = null; db.list = [] })

describe('G3 · public loader (read time)', () => {
  it('G-T1 · an old snapshot comes back without the rejected plan photo in images; the rest in order', async () => {
    db.single = rowOf([EXFIL, HERO, TBN])
    const row = await getPublicSharedResult('AbCdEfGh12')
    expect(JSON.stringify(row)).not.toContain('attacker.example')
    expect(row!.payload.images).toEqual([HERO, TBN])
  })
  it('G-T12 · a stored row whose images hold a non-https URL is still refused whole by the validator (unchanged)', async () => {
    db.single = rowOf(['http://cdn.example/a.jpg'])
    expect(await getPublicSharedResult('AbCdEfGh12')).toBeNull()
  })
})

describe('G3 · hub listing (read time, outside the loader)', () => {
  it('G-T6 · the card image is the first image the public policy allows, never the rejected plan photo', async () => {
    db.list = [
      { slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', created_at: '2026-10-01T00:00:00.000Z', title: 'T', images: [EXFIL, HERO], plan: payload([]).plan },
      { slug: 'ZyXwVuTs98', query: 'q2', domain: 'travel', locale: 'vi', created_at: '2026-10-01T00:00:00.000Z', title: 'T2', images: [EXFIL], plan: payload([]).plan },
      { slug: 'QwErTyUi34', query: 'q3', domain: 'travel', locale: 'vi', created_at: '2026-10-01T00:00:00.000Z', title: 'T3', images: [TBN] },
    ]
    const rows = await listPublicSharedResults({ domain: 'travel' })
    expect(rows.map(r => r.image)).toEqual([HERO, null, TBN])
    expect(JSON.stringify(rows)).not.toContain('attacker.example')
  })
})
