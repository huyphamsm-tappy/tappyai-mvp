/**
 * /api/profile — the ONE profile record, and the cover as a real capability.
 *
 *   · POST `cover`  → owner-only, magic-byte checked, 5MB, written under `covers/<uid>-…`
 *                     through the media bridge, then `profiles.cover_url` UPDATED (never
 *                     upserted: an anonymous session has no row and must not get one).
 *   · PATCH         → `bio` lands on `profiles` (the public row) AND in auth metadata;
 *                     `cover_url: null` clears; any other `cover_url` value is ignored —
 *                     the client never chooses a URL.
 *   · GET           → `bio` from the row first, metadata second; `cover_url` present only
 *                     when the column exists.
 *   · Schema bridge → before `20260915_profile_public_presentation.sql` PostgREST answers
 *                     42703; reads fall back, the bio write retries without the column.
 *
 * The fake records every table write, so "update not upsert" and "which columns" are measured.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as any,
    columns: new Set(['id', 'full_name', 'avatar_url', 'created_at', 'language', 'onboarded', 'bio', 'cover_url']),
    row: { full_name: 'Huy', avatar_url: null, created_at: '2026-01-01', language: 'vi', onboarded: true, bio: 'Row bio', cover_url: 'https://storage.googleapis.com/b/covers/u1-old.jpg' } as Record<string, unknown>,
    writes: [] as { op: 'update' | 'upsert'; table: string; values: Record<string, unknown>; eq?: [string, unknown] }[],
    meta: [] as Record<string, unknown>[],
    puts: [] as { key: string; contentType: string }[],
  }
  const undefinedColumn = (cols: string[]) => cols.find(c => !state.columns.has(c))
  const builder = (table: string) => {
    let pending: (typeof state.writes)[number] | null = null
    let selected: string[] = []
    const b: any = {
      select: (c: string) => { selected = c.split(',').map(s => s.trim()); return b },
      eq: (col: string, val: unknown) => { if (pending) pending.eq = [col, val]; return b },
      single: () => {
        const bad = undefinedColumn(selected)
        if (bad) return Promise.resolve({ data: null, error: { code: '42703', message: `column profiles.${bad} does not exist` } })
        return Promise.resolve({ data: Object.fromEntries(selected.map(c => [c, state.row[c] ?? null])), error: null })
      },
      update: (values: Record<string, unknown>) => { pending = { op: 'update', table, values }; return b },
      upsert: (values: Record<string, unknown>) => { pending = { op: 'upsert', table, values }; return b },
      then: (res: any) => {
        if (!pending) return Promise.resolve({ data: null, error: null }).then(res)
        const bad = undefinedColumn(Object.keys(pending.values))
        state.writes.push({ ...pending, values: { ...pending.values } })
        const out = bad ? { error: { code: '42703', message: `column profiles.${bad} does not exist` } } : { error: null }
        pending = null
        return Promise.resolve(out).then(res)
      },
    }
    return b
  }
  const client = { from: (t: string) => builder(t), auth: { updateUser: async (arg: { data: Record<string, unknown> }) => { state.meta.push(arg.data); return { error: null } } } }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }) }))
vi.mock('@/lib/media', () => ({
  getMediaProvider: () => ({}),
  randomMediaSuffix: () => 'sfx',
  putMedia: async (key: string, _body: unknown, opts: { contentType: string }) => { h.state.puts.push({ key, contentType: opts.contentType }); return { url: `https://storage.googleapis.com/b/${key}` } },
}))

import { GET, PATCH, POST } from './route'

// A REAL, DECODABLE 1x1 JPEG. R-2: the route strips EXIF before storing, so it decodes the
// image — a bare magic-byte header is no longer an image this route will accept.
const JPEG = new Uint8Array(Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJUAB//Z',
  'base64',
))
const req = (init: { method?: string; body?: unknown; form?: FormData } = {}) => {
  const headers = new Headers({ 'accept-language': 'vi' })
  if (init.form) return new Request('http://t/api/profile', { method: init.method ?? 'POST', body: init.form, headers }) as any
  if (init.body !== undefined) { headers.set('content-type', 'application/json'); return new Request('http://t/api/profile', { method: init.method ?? 'PATCH', body: JSON.stringify(init.body), headers }) as any }
  return new Request('http://t/api/profile', { method: init.method ?? 'GET', headers }) as any
}
const form = (field: string, bytes: Uint8Array | number, type = 'image/jpeg') => {
  const fd = new FormData()
  const data = typeof bytes === 'number' ? new Uint8Array(bytes) : bytes
  if (typeof bytes === 'number') data.set(JPEG)
  fd.append(field, new File([data as unknown as BlobPart], 'x.jpg', { type }))
  return fd
}

beforeEach(() => {
  h.state.user = { id: 'u1', email: 'u1@x', user_metadata: { bio: 'Meta bio' }, is_anonymous: false }
  h.state.columns = new Set(['id', 'full_name', 'avatar_url', 'created_at', 'language', 'onboarded', 'bio', 'cover_url'])
  h.state.writes.length = 0; h.state.meta.length = 0; h.state.puts.length = 0
})

describe('POST cover — owner-only, validated, stored through the media bridge', () => {
  it('401 without a session; 403 for an anonymous session (a public cover is a social write)', async () => {
    h.state.user = null
    expect((await POST(req({ form: form('cover', JPEG) }))).status).toBe(401)
    h.state.user = { id: 'anon', is_anonymous: true, user_metadata: {} }
    expect((await POST(req({ form: form('cover', JPEG) }))).status).toBe(403)
    expect(h.state.puts).toHaveLength(0)
    expect(h.state.writes).toHaveLength(0)
  })

  it('rejects a file that is not an image by its bytes, whatever the client says it is', async () => {
    const res = await POST(req({ form: form('cover', new TextEncoder().encode('<svg onload=alert(1)>'), 'image/jpeg') }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('bad_image_type')
    expect(h.state.puts).toHaveLength(0)
  })

  it('rejects a cover over the photo limit (5MB) before reading it', async () => {
    const res = await POST(req({ form: form('cover', 5 * 1024 * 1024 + 1) }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('image_too_large')
    expect(h.state.puts).toHaveLength(0)
  })

  it('stores a valid cover under covers/<uid>-…, UPDATES the owner row (no upsert) and returns the URL', async () => {
    const res = await POST(req({ form: form('cover', JPEG) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.state.puts).toEqual([{ key: 'covers/u1-sfx.jpg', contentType: 'image/jpeg' }])
    expect(body.cover_url).toBe('https://storage.googleapis.com/b/covers/u1-sfx.jpg')
    expect(h.state.writes).toEqual([{ op: 'update', table: 'profiles', values: { cover_url: body.cover_url }, eq: ['id', 'u1'] }])
  })

  it('the avatar path is untouched: `avatar` still upserts avatar_url under avatars/', async () => {
    const res = await POST(req({ form: form('avatar', JPEG) }))
    expect(res.status).toBe(200)
    expect(h.state.puts[0].key).toMatch(/^avatars\/u1-sfx\.jpg$/)
    expect(h.state.writes[0].op).toBe('upsert')
    expect(h.state.writes[0].values).toMatchObject({ avatar_url: expect.stringContaining('avatars/') })
  })

  it('before the migration, a cover cannot be recorded — a clean save_failed, nothing half-written', async () => {
    h.state.columns.delete('cover_url')
    const res = await POST(req({ form: form('cover', JPEG) }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('save_failed')
  })
})

describe('PATCH — bio on the public row, cover only clearable', () => {
  it('writes bio (and name) to profiles AND to auth metadata', async () => {
    const res = await PATCH(req({ body: { full_name: ' Huy Phạm ', bio: ' Ăn để sống. ' } }))
    expect(res.status).toBe(200)
    expect(h.state.writes).toEqual([{ op: 'update', table: 'profiles', values: { full_name: 'Huy Phạm', bio: 'Ăn để sống.' }, eq: ['id', 'u1'] }])
    expect(h.state.meta).toEqual([{ full_name: 'Huy Phạm', bio: 'Ăn để sống.' }])
  })

  it('cover_url: null clears the cover; a client-supplied URL is ignored', async () => {
    expect((await PATCH(req({ body: { cover_url: null } }))).status).toBe(200)
    expect(h.state.writes).toEqual([{ op: 'update', table: 'profiles', values: { cover_url: null }, eq: ['id', 'u1'] }])
    h.state.writes.length = 0
    expect((await PATCH(req({ body: { cover_url: 'https://evil.example/x.jpg', full_name: 'A' } }))).status).toBe(200)
    expect(h.state.writes).toEqual([{ op: 'update', table: 'profiles', values: { full_name: 'A' }, eq: ['id', 'u1'] }])
  })

  it('schema bridge: without the bio column the write retries without it and still succeeds; metadata keeps the value', async () => {
    h.state.columns.delete('bio'); h.state.columns.delete('cover_url')
    const res = await PATCH(req({ body: { full_name: 'B', bio: 'still saved' } }))
    expect(res.status).toBe(200)
    expect(h.state.writes.map(w => w.values)).toEqual([{ full_name: 'B', bio: 'still saved' }, { full_name: 'B' }])
    expect(h.state.meta).toEqual([{ full_name: 'B', bio: 'still saved' }])
    // Bio alone: nothing left for the row, no second write, still OK.
    h.state.writes.length = 0
    expect((await PATCH(req({ body: { bio: 'only' } }))).status).toBe(200)
    expect(h.state.writes.map(w => w.values)).toEqual([{ bio: 'only' }])
  })

  it('a real write failure is a clean save_failed', async () => {
    h.state.columns.delete('full_name')
    const res = await PATCH(req({ body: { full_name: 'C' } }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('save_failed')
  })
})

describe('GET — one record, read the same way every surface reads it', () => {
  it('returns the row bio and the cover when the columns exist', async () => {
    const body = await (await GET(req())).json()
    expect(body.bio).toBe('Row bio')
    expect(body.cover_url).toBe('https://storage.googleapis.com/b/covers/u1-old.jpg')
    expect(body.email).toBe('u1@x')
  })

  it('schema bridge: falls back to the previous columns, the metadata bio, and no cover_url key', async () => {
    h.state.columns.delete('bio'); h.state.columns.delete('cover_url')
    const body = await (await GET(req())).json()
    expect(body.bio).toBe('Meta bio')
    expect('cover_url' in body).toBe(false)
    expect(body.full_name).toBe('Huy')
  })

  it('a row with no cover reports null, not a missing key — the client may offer the control', async () => {
    h.state.row = { ...h.state.row, cover_url: null, bio: null }
    const body = await (await GET(req())).json()
    expect(body.cover_url).toBeNull()
    expect(body.bio).toBe('Meta bio')
  })
})
