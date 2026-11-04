import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    signed: [] as Array<{ path: string | null; signedUrl: string | null; error: string | null }>,
    signedError: null as { message: string } | null,
    calls: [] as Array<{ paths: string[]; ttl: number; bucket: string }>,
  }
  const admin = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], ttl: number) => {
          state.calls.push({ paths, ttl, bucket })
          return { data: state.signedError ? null : state.signed, error: state.signedError }
        },
      }),
    },
  }
  return { state, admin }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import { CHAT_MEDIA_BUCKET, CHAT_MEDIA_MAX_BYTES, CHAT_MEDIA_URL_TTL_SECONDS, chatMediaPath, isOwnChatMediaPath, signChatMedia } from '../media'

const T = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'

beforeEach(() => { h.state.signed = []; h.state.signedError = null; h.state.calls = [] })

describe('the constants the migration and the routes agree on', () => {
  it('a private bucket named chat-media, 5 MB, a one-hour link', () => {
    expect(CHAT_MEDIA_BUCKET).toBe('chat-media')
    expect(CHAT_MEDIA_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(CHAT_MEDIA_URL_TTL_SECONDS).toBe(3600)
  })
})

describe('chatMediaPath · "<thread>/<sender>/<file>", the shape the database CHECK demands', () => {
  it('is under the thread and the sender, unguessable, with the extension of the real type', () => {
    const a = chatMediaPath(T, U, 'jpeg')
    const b = chatMediaPath(T, U, 'jpeg')
    expect(a.startsWith(`${T}/${U}/`)).toBe(true)
    expect(a.endsWith('.jpg')).toBe(true)
    expect(a).not.toBe(b) // a random suffix, never a counter or only a clock
    expect(chatMediaPath(T, U, 'webp').endsWith('.webp')).toBe(true)
    expect(chatMediaPath(T, U, 'png').endsWith('.png')).toBe(true)
  })

  it('what it makes passes the ownership check', () => {
    expect(isOwnChatMediaPath(chatMediaPath(T, U, 'png'), T, U)).toBe(true)
  })
})

describe('isOwnChatMediaPath · a path the caller may attach to a message in this thread', () => {
  const ok = `${T}/${U}/1730000000000-abcDEF123456.webp`

  it('accepts the exact shape', () => {
    expect(isOwnChatMediaPath(ok, T, U)).toBe(true)
  })

  it.each([
    ['another thread', `99999999-9999-4999-8999-999999999999/${U}/x.jpg`],
    ['another person\'s folder', `${T}/99999999-9999-4999-8999-999999999999/x.jpg`],
    ['a path that climbs out', `${T}/${U}/../${U}/x.jpg`],
    ['a nested folder', `${T}/${U}/a/b.jpg`],
    ['a leading slash', `/${T}/${U}/x.jpg`],
    ['a missing file name', `${T}/${U}/`],
    ['an empty path', ''],
    ['a file name with a space', `${T}/${U}/a b.jpg`],
    ['a query string', `${T}/${U}/x.jpg?token=1`],
    ['a backslash', `${T}/${U}/a\\b.jpg`],
    ['an over-long file name', `${T}/${U}/${'a'.repeat(200)}.jpg`],
  ])('refuses %s', (_name, p) => {
    expect(isOwnChatMediaPath(p, T, U)).toBe(false)
  })

  it.each([null, undefined, 5, {}, []])('refuses a non-string: %j', (p) => {
    expect(isOwnChatMediaPath(p as never, T, U)).toBe(false)
  })
})

describe('signChatMedia · short-lived links, only for the paths asked', () => {
  it('asks the private bucket for one-hour links and returns them by path', async () => {
    h.state.signed = [{ path: 'a', signedUrl: 'https://s/a?t=1', error: null }, { path: 'b', signedUrl: 'https://s/b?t=2', error: null }]
    const m = await signChatMedia(['a', 'b'])
    expect(h.state.calls).toEqual([{ paths: ['a', 'b'], ttl: 3600, bucket: 'chat-media' }])
    expect(m.get('a')).toBe('https://s/a?t=1')
    expect(m.get('b')).toBe('https://s/b?t=2')
  })

  it('makes no call at all for an empty list', async () => {
    expect((await signChatMedia([])).size).toBe(0)
    expect(h.state.calls).toEqual([])
  })

  it('an object that does not exist (an error on that entry) has NO link — never a made-up one', async () => {
    h.state.signed = [{ path: 'a', signedUrl: 'https://s/a', error: null }, { path: 'gone', signedUrl: null, error: 'Object not found' }]
    const m = await signChatMedia(['a', 'gone'])
    expect(m.has('a')).toBe(true)
    expect(m.has('gone')).toBe(false)
  })

  it('a storage outage yields an empty map (the message still shows, without its picture), not an exception', async () => {
    h.state.signedError = { message: 'storage down' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await signChatMedia(['a'])).size).toBe(0)
  })

  it('repeated paths are signed once', async () => {
    h.state.signed = [{ path: 'a', signedUrl: 'https://s/a', error: null }]
    await signChatMedia(['a', 'a', 'a'])
    expect(h.state.calls[0]!.paths).toEqual(['a'])
  })
})
