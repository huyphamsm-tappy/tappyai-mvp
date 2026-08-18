import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// getTrackById — a zero-row lookup must be an ordinary empty answer.
//
// Production incident, 2026-08-18. `maybeSingle()` asks PostgREST for a
// singular object, so once the publication boundary hid a held track's row the
// request flipped from `200 {row}` to `406 PGRST116`. An error response does
// not replace a stored success, and the endpoint kept serving the held clip's
// media URL long after the database had stopped returning the row — four
// distinct anon query shapes came back empty while this one call still
// answered with the row.
//
// These tests pin the two things that matter: the request is a LIST request,
// and zero rows resolve to `null` rather than to an error path.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const state = {
    /** Rows the fake PostgREST returns for the next call. */
    rows: [] as any[],
    error: null as any,
    /** Every builder method the call chain touched, in order. */
    calls: [] as string[],
    /** Arguments of the terminal shaping method. */
    limitArg: null as number | null,
  }

  const builder: any = {}
  for (const m of ['from', 'select', 'eq', 'order', 'range', 'or', 'not', 'gt', 'in']) {
    builder[m] = (...args: any[]) => { state.calls.push(m); return builder }
  }
  builder.limit = (n: number) => { state.calls.push('limit'); state.limitArg = n; return builder }
  // 🚨 Present on the fake ON PURPOSE. If the implementation ever reaches for it
  // again the call is recorded and the test below fails, instead of the fake
  // throwing an unrelated TypeError that could be mistaken for a broken test.
  builder.maybeSingle = async () => {
    state.calls.push('maybeSingle')
    return { data: state.rows[0] ?? null, error: state.error }
  }
  builder.single = async () => {
    state.calls.push('single')
    return { data: state.rows[0] ?? null, error: state.error }
  }
  builder.then = (res: any, rej: any) =>
    Promise.resolve({ data: state.error ? null : state.rows, error: state.error }).then(res, rej)

  return { state, createClient: () => builder }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: h.createClient }))

const ROW = {
  id: 'e182484c-6155-4f17-b045-72ead9faf1e4',
  title: 'Âm thanh gốc',
  artist: 'PHẠM ĐOÀN HUY',
  duration_sec: 270,
  audio_url: 'https://cdn/held.mp4',
  preview_url: 'https://cdn/held-preview.mp4',
  cover_url: 'https://cdn/held.jpg',
  category_id: null,
  provider_id: 'cbc95364-d058-4527-bd99-35f89099dd1e',
}

let getTrackById: (id: string) => Promise<any>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon-key'
  h.state.rows = []
  h.state.error = null
  h.state.calls = []
  h.state.limitArg = null
  ;({ getTrackById } = await import('./musicRepository'))
})

describe('getTrackById', () => {
  it('returns the track when the row is readable', async () => {
    h.state.rows = [ROW]
    expect(await getTrackById(ROW.id)).toEqual({
      id: ROW.id,
      title: 'Âm thanh gốc',
      artist: 'PHẠM ĐOÀN HUY',
      durationSec: 270,
      audioUrl: 'https://cdn/held.mp4',
      previewUrl: 'https://cdn/held-preview.mp4',
      coverUrl: 'https://cdn/held.jpg',
      categoryId: null,
      providerId: ROW.provider_id,
    })
  })

  it('returns null when the row is not readable — the held-track case', async () => {
    h.state.rows = [] // what RLS produces once the track is held
    expect(await getTrackById(ROW.id)).toBeNull()
  })

  it('🚨 asks for a LIST, never a singular object', async () => {
    // The whole incident in one assertion. A singular request turns "no rows"
    // into HTTP 406, which is an error response and does not replace a cached
    // success. A list request makes it a plain `200 []`.
    h.state.rows = []
    await getTrackById(ROW.id)
    expect(h.state.calls, 'maybeSingle() must not be used for an id lookup').not.toContain('maybeSingle')
    expect(h.state.calls, 'single() must not be used either').not.toContain('single')
    expect(h.state.calls).toContain('limit')
  })

  it('bounds the list to one row', async () => {
    h.state.rows = [ROW]
    await getTrackById(ROW.id)
    expect(h.state.limitArg).toBe(1)
  })

  it('takes the first row when the driver returns more than one', async () => {
    const other = { ...ROW, id: 'other', title: 'Other' }
    h.state.rows = [ROW, other]
    expect((await getTrackById(ROW.id)).id).toBe(ROW.id)
  })

  it('returns null on a query error rather than throwing', async () => {
    h.state.error = { message: 'boom' }
    expect(await getTrackById(ROW.id)).toBeNull()
  })

  it('still filters on id and is_active', async () => {
    h.state.rows = [ROW]
    await getTrackById(ROW.id)
    expect(h.state.calls.filter((c) => c === 'eq')).toHaveLength(2)
  })
})
