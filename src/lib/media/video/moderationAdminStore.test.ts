import { describe, it, expect } from 'vitest'
import { supabaseVideoModerationAdminStore, publicEvidence } from './moderationAdminStore'

// A chainable fake of the Supabase client: every builder call returns itself, awaiting it yields the rows of the table (filters are not applied: the test feeds what the query would return).
function fake(tables: Record<string, unknown[]>, rpc?: (fn: string, args: Record<string, unknown>) => unknown) {
  const calls: string[] = []
  const builder = (name: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = (...a: unknown[]) => { calls.push(`${name}.${m}(${a.map(String).join(',')})`); return b }
    b.maybeSingle = async () => ({ data: (tables[name] ?? [])[0] ?? null, error: null })
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tables[name] ?? [], error: null }).then(res)
    return b
  }
  return { client: { from: builder, rpc: async (fn: string, args: Record<string, unknown>) => ({ data: rpc?.(fn, args), error: null }) } as never, calls }
}

describe('publicEvidence', () => {
  it('keeps statuses, reasons and scores and drops every object key', () => {
    expect(publicEvidence({ visual: { status: 'analysed', key: 'vstg/u/a/frames0000000000.jpeg', scores: { violence: 0.1 } }, speech: { status: 'empty', key: 'vstg/u/a/audio.mp4' }, odd: 'x' }))
      .toEqual({ visual: { status: 'analysed', scores: { violence: 0.1 } }, speech: { status: 'empty' }, odd: 'x' })
    expect(publicEvidence(null)).toEqual({})
  })
})

describe('listPending', () => {
  it('orders urgent first (a csam_suspected event makes it urgent), then high, then normal, oldest first within a level', async () => {
    const t = {
      video_assets: [
        { id: 'a-normal-old', has_audio: true, duration_ms: 1000, updated_at: '2026-11-01' },
        { id: 'b-high', has_audio: false, duration_ms: 2000, updated_at: '2026-11-02' },
        { id: 'c-severe', has_audio: true, duration_ms: 3000, updated_at: '2026-11-03' },
        { id: 'd-normal-new', has_audio: true, duration_ms: 4000, updated_at: '2026-11-04' },
      ],
      video_moderation_results: [
        { asset_id: 'b-high', kind: 'automated', category: 'violence', confidence: '0.91000', reason_code: 'category_high', priority: 'high' },
        { asset_id: 'c-severe', kind: 'automated', category: 'sexual/minors', confidence: 0.6, reason_code: 'severe_category', priority: 'urgent' },
        { asset_id: 'a-normal-old', kind: 'automated', category: null, confidence: 0, reason_code: 'evidence_missing:speech', priority: 'normal' },
      ],
      video_asset_events: [{ asset_id: 'c-severe' }],
    }
    const items = await supabaseVideoModerationAdminStore(fake(t).client).listPending(50)
    expect(items.map((i) => i.assetId)).toEqual(['c-severe', 'b-high', 'a-normal-old', 'd-normal-new'])
    expect(items[0]).toMatchObject({ severe: true, priority: 'urgent', category: 'sexual/minors' })
    expect(items[1]).toMatchObject({ confidence: 0.91, reasonCode: 'category_high' })
    expect(items[3]).toMatchObject({ priority: 'normal', reasonCode: null })
  })

  it('a video with a human result only (never) or no result at all is still listed as normal', async () => {
    const items = await supabaseVideoModerationAdminStore(fake({ video_assets: [{ id: 'x', has_audio: null, duration_ms: null, updated_at: 't' }] }).client).listPending(5)
    expect(items).toEqual([{ assetId: 'x', priority: 'normal', severe: false, category: null, confidence: null, reasonCode: null, hasAudio: null, durationMs: null, waitingSince: 't' }])
  })

  it('an empty queue reads nothing else', async () => {
    const f = fake({})
    expect(await supabaseVideoModerationAdminStore(f.client).listPending(5)).toEqual([])
    expect(f.calls.some((c) => c.startsWith('video_moderation_results'))).toBe(false)
  })
})

describe('detail and decide', () => {
  it('detail strips keys from the evidence and flags a csam_suspected history', async () => {
    const t = {
      video_assets: [{ id: 'a', owner_id: 'o', state: 'review_required', moderation_state: 'review_required', has_audio: true, duration_ms: 1, width: 1, height: 2, legal_hold_until: null, updated_at: 't' }],
      video_moderation_results: [{ id: 1, kind: 'automated', decision: 'review_required', category: 'violence', confidence: '0.70000', reason_code: 'x', priority: 'high', provider: 'openai', model: 'm', policy_version: 'v', evidence: { visual: { status: 'analysed', key: 'vstg/o/a/f.jpeg' } }, transcript: 'hi', actor: 'service:video-moderation', note: null, created_at: 't' }],
      video_asset_events: [{ id: 1, from_state: 'moderating', to_state: 'moderating', event_type: 'csam_suspected', actor: 'a', reason: 'r', created_at: 't' }],
    }
    const d = await supabaseVideoModerationAdminStore(fake(t).client).detail('a')
    expect(d?.severe).toBe(true)
    expect(d?.results[0].confidence).toBe(0.7)
    expect(JSON.stringify(d)).not.toContain('vstg/')
    expect(await supabaseVideoModerationAdminStore(fake({}).client).detail('zzz')).toBeNull()
  })

  it('decide calls the single database function and returns its state and changed', async () => {
    let seen: { fn: string; args: Record<string, unknown> } | null = null
    const f = fake({}, (fn, args) => { seen = { fn, args }; return [{ asset_id: 'a', state: 'ready', changed: true }] })
    expect(await supabaseVideoModerationAdminStore(f.client).decide('a', 'approve', 'note', 'user:1')).toEqual({ state: 'ready', changed: true })
    expect(seen).toEqual({ fn: 'video_moderation_review_decide', args: { p_asset: 'a', p_decision: 'approve', p_note: 'note', p_actor: 'user:1' } })
  })
})
