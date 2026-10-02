import { describe, it, expect, vi, beforeEach } from 'vitest'

// PATCH /api/profile — the bio (and the metadata copy of the name) live in auth user_metadata,
// written with `supabase.auth.updateUser`. A NATIVE client authenticates with a bearer token and
// the request-scoped client built for it holds no session, so that call fails with
// "Auth session missing" — and the route ignored the result: Android's Edit Profile got a 200
// and the bio was never stored (found on Pixel_8, 2026-09-12). The route now falls back to the
// admin client for the SAME verified user id. These tests pin both paths.

const h = vi.hoisted(() => {
  const state = {
    updateUserError: null as { message: string } | null,
    adminError: null as { message: string } | null,
    adminCalls: [] as Array<{ id: string; data: Record<string, unknown> }>,
    profileUpdates: [] as Record<string, unknown>[],
  }
  const builder: Record<string, unknown> = {}
  builder.from = () => builder
  builder.update = (row: Record<string, unknown>) => { state.profileUpdates.push(row); return builder }
  builder.eq = () => Promise.resolve({ error: null })
  const supabase = {
    ...builder,
    auth: { updateUser: async () => ({ data: null, error: state.updateUserError }) },
  }
  return { state, supabase }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: { id: 'u-me', email: 'me@x', user_metadata: { full_name: 'Old', avatar_url: 'a.png' } },
    supabase: h.supabase,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: async (id: string, data: Record<string, unknown>) => {
          h.state.adminCalls.push({ id, data })
          return { data: null, error: h.state.adminError }
        },
      },
    },
  }),
}))
vi.mock('@/lib/i18n/requestLocale', () => ({ requestLocale: () => 'vi' }))
vi.mock('@/lib/i18n/serverMessages', () => ({ serverMessage: (k: string) => k }))
vi.mock('@/lib/media', () => ({ getMediaProvider: () => null, putMedia: async () => null, randomMediaSuffix: () => 'x' }))
vi.mock('@/lib/security/imageType', () => ({ sniffImageType: () => null, imageExt: () => 'png', imageMime: () => 'image/png' }))

import { PATCH } from './route'

function patch(body: Record<string, unknown>) {
  return PATCH(new Request('http://localhost/api/profile', {
    method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify(body),
  }) as never)
}

describe('PATCH /api/profile — bio persists for a bearer-token (native) client', () => {
  beforeEach(() => {
    h.state.updateUserError = null
    h.state.adminError = null
    h.state.adminCalls.length = 0
    h.state.profileUpdates.length = 0
  })

  it('a session-backed client writes metadata directly; the admin client is not touched', async () => {
    const res = await patch({ full_name: 'Huy', bio: 'Yêu du lịch' })
    expect(res.status).toBe(200)
    // The bio is a `profiles` column again (20260915_profile_public_presentation, restored in
    // Phase 7): the row every profile surface reads gets it, and the metadata keeps its copy.
    expect(h.state.profileUpdates).toEqual([{ full_name: 'Huy', bio: 'Yêu du lịch' }])
    expect(h.state.adminCalls).toEqual([])
  })

  it('when the request client has no session, the SAME user id is updated through the admin client, metadata merged', async () => {
    h.state.updateUserError = { message: 'Auth session missing!' }
    const res = await patch({ bio: 'Yêu du lịch - Thích khám phá' })
    expect(res.status).toBe(200)
    expect(h.state.adminCalls).toEqual([{
      id: 'u-me',
      data: { user_metadata: { full_name: 'Old', avatar_url: 'a.png', bio: 'Yêu du lịch - Thích khám phá' } },
    }])
  })

  it('a failed fallback is a 500 save_failed, never a silent 200', async () => {
    h.state.updateUserError = { message: 'Auth session missing!' }
    h.state.adminError = { message: 'nope' }
    const res = await patch({ bio: 'x' })
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'save_failed' })
  })

  it('bio is trimmed and capped at 200, name at 100 — as before', async () => {
    h.state.updateUserError = { message: 'Auth session missing!' }
    await patch({ full_name: ' ' + 'n'.repeat(150) + ' ', bio: ' ' + 'b'.repeat(250) })
    const meta = h.state.adminCalls[0].data.user_metadata as Record<string, string>
    expect(meta.full_name).toHaveLength(100)
    expect(meta.bio).toHaveLength(200)
  })
})
