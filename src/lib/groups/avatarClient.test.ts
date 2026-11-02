import { describe, it, expect } from 'vitest'
import { groupAvatarPrecheck, uploadGroupAvatar, GROUP_AVATAR_MAX_BYTES } from './avatarClient'

const file = new File([new Uint8Array(4)], 'a.jpg', { type: 'image/jpeg' })
const res = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('group avatar client', () => {
  it('accepts jpeg/png/webp up to 3MB; refuses other types and oversize', () => {
    expect(groupAvatarPrecheck({ type: 'image/png', size: 1 })).toBeNull()
    expect(groupAvatarPrecheck({ type: 'image/svg+xml', size: 1 })).toBe('groupNew.avatarErr.type')
    expect(groupAvatarPrecheck({ type: 'image/gif', size: 1 })).toBe('groupNew.avatarErr.type')
    expect(groupAvatarPrecheck({ type: 'image/jpeg', size: GROUP_AVATAR_MAX_BYTES + 1 })).toBe('groupNew.avatarErr.size')
  })
  it('success only when the server returns the stored URL', async () => {
    expect(await uploadGroupAvatar('g1', file, 'fb', res(200, { avatar_url: 'https://x/y.jpg' }))).toEqual({ ok: true, url: 'https://x/y.jpg' })
    expect((await uploadGroupAvatar('g1', file, 'fb', res(200, {}))).ok).toBe(false)
  })
  it('surfaces the server message (503 unavailable) or the fallback; network error is a failure', async () => {
    expect(await uploadGroupAvatar('g1', file, 'fb', res(503, { message: 'unavailable' }))).toEqual({ ok: false, message: 'unavailable' })
    expect(await uploadGroupAvatar('g1', file, 'fb', res(500, {}))).toEqual({ ok: false, message: 'fb' })
    expect(await uploadGroupAvatar('g1', file, 'fb', (async () => { throw new Error('net') }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'fb' })
  })
})
