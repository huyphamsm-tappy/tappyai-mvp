import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Browsing by category — the OTHER half of the empty-tabs bug.
//
// UAT found every Music Library tab empty except "Tất cả". The cause was the
// catalog (ingested with `category_id` NULL — see
// `scripts/musicGenreCategory.test.mjs`), NOT this query. These tests pin the
// query so the diagnosis stays true: a category browse must filter on
// `category_id`, an "all" browse must not filter at all, and neither may drop
// the `is_active` licensing kill-switch.
//
// Written against the real builder chain rather than a stub result, because the
// bug class here is a filter that is silently not applied.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const state = {
    rows: [] as any[],
    error: null as any,
    /** Every `.eq(column, value)` the call chain applied, in order. */
    eq: [] as Array<[string, unknown]>,
    calls: [] as string[],
    range: null as [number, number] | null,
  }

  const builder: any = {}
  for (const m of ['from', 'select', 'order', 'or', 'not', 'gt', 'in', 'limit', 'update']) {
    builder[m] = (...args: any[]) => { state.calls.push(`${m}:${String(args[0] ?? '')}`); return builder }
  }
  builder.eq = (column: string, value: unknown) => { state.eq.push([column, value]); return builder }
  builder.range = (from: number, to: number) => { state.range = [from, to]; return builder }
  builder.then = (res: any, rej: any) =>
    Promise.resolve({ data: state.error ? null : state.rows, error: state.error }).then(res, rej)

  return { state, createClient: () => builder }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: h.createClient }))

const CHILL = '65900b7a-bc46-4c0d-b02a-71d1564d35da'

function row(id: string, categoryId: string | null) {
  return {
    id,
    title: 'Chiều Lười',
    artist: 'SoundHelix',
    duration_sec: 240,
    audio_url: '/music/soundhelix-song-2.mp3',
    preview_url: null,
    cover_url: null,
    category_id: categoryId,
    provider_id: 'a5f2b7f1-1d1e-4a6b-9a3a-3a2f1c9a7e11',
  }
}

beforeEach(() => {
  h.state.rows = []
  h.state.error = null
  h.state.eq = []
  h.state.calls = []
  h.state.range = null
})

describe('getTracks — category filtering', () => {
  it('filters on category_id when a category is selected', async () => {
    const { getTracks } = await import('./musicRepository')
    h.state.rows = [row('1', CHILL), row('2', CHILL)]

    const page = await getTracks({ categoryId: CHILL })

    expect(h.state.eq).toContainEqual(['category_id', CHILL])
    expect(page.tracks).toHaveLength(2)
    expect(page.tracks.map((t) => t.categoryId)).toEqual([CHILL, CHILL])
  })

  it('🚨 applies NO category filter for the "all" tab', async () => {
    // `activeCategoryId` is null on "Tất cả" and the page passes `undefined`.
    // A filter applied here would silently narrow the full catalog.
    const { getTracks } = await import('./musicRepository')
    h.state.rows = [row('1', null), row('2', CHILL)]

    const page = await getTracks({})

    expect(h.state.eq.map(([column]) => column)).not.toContain('category_id')
    expect(page.tracks).toHaveLength(2)
  })

  it('keeps the is_active kill-switch on both paths', async () => {
    const { getTracks } = await import('./musicRepository')
    await getTracks({ categoryId: CHILL })
    expect(h.state.eq).toContainEqual(['is_active', true])

    h.state.eq = []
    await getTracks({})
    expect(h.state.eq).toContainEqual(['is_active', true])
  })

  it('reports an empty category honestly rather than falling back to everything', async () => {
    // This is what the UAT actually saw, and it must stay possible: an empty
    // category renders the existing empty state, it does not quietly show
    // unrelated tracks.
    const { getTracks } = await import('./musicRepository')
    h.state.rows = []

    const page = await getTracks({ categoryId: CHILL })

    expect(page.tracks).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it('does not repeat a track across pages of one category', async () => {
    const { getTracks } = await import('./musicRepository')
    h.state.rows = Array.from({ length: 21 }, (_, i) => row(String(i), CHILL))

    const page = await getTracks({ categoryId: CHILL, limit: 20 })

    // 21 rows for a limit of 20: one extra row is fetched to detect hasMore and
    // must be trimmed, or it reappears as the first row of the next page.
    expect(page.tracks).toHaveLength(20)
    expect(page.hasMore).toBe(true)
    expect(new Set(page.tracks.map((t) => t.id)).size).toBe(20)
  })
})
