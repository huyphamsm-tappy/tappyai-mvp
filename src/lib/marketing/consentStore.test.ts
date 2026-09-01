import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  readConsent,
  readConsentForUsers,
  setChannelConsent,
  setGlobalUnsubscribe,
  toConsentView,
} from './consentStore'

// V2.2-2 — the consent store.
//
// The rules under test are the ones whose inversion is invisible: an empty read
// must stay empty rather than becoming a default, a failed read must not
// masquerade as "never consented", and no code path may invent a row.

type Row = Record<string, unknown>

/** A Supabase double that records writes and replays a fixed read. */
function fakeAdmin(opts: { rows?: Row[]; error?: string } = {}) {
  const writes: Row[] = []
  const filters: [string, unknown][] = []
  const client = {
    from: () => client,
    select: () => client,
    eq: (c: string, v: unknown) => {
      filters.push([c, v])
      return Promise.resolve(
        opts.error ? { data: null, error: { message: opts.error } } : { data: opts.rows ?? [], error: null },
      )
    },
    in: (c: string, v: unknown) => {
      filters.push([c, v])
      return Promise.resolve(
        opts.error ? { data: null, error: { message: opts.error } } : { data: opts.rows ?? [], error: null },
      )
    },
    upsert: (row: Row) => {
      writes.push(row)
      return Promise.resolve({ error: opts.error ? { message: opts.error } : null })
    },
  }
  return { admin: client as unknown as SupabaseClient, writes, filters }
}

// ═════════════════════════════════════════════════════════════════════════════
describe('readConsent', () => {
  it('🚨 an empty result is a VALID answer, not an error', async () => {
    // "Has never opted in" is what an empty array means, and the dispatcher
    // reads it as a refusal.
    const { admin } = fakeAdmin({ rows: [] })
    await expect(readConsent(admin, 'u1')).resolves.toEqual([])
  })

  it('returns the stored rows — positive control', async () => {
    const { admin } = fakeAdmin({ rows: [{ channel: 'push', opted_in: true }] })
    await expect(readConsent(admin, 'u1')).resolves.toEqual([{ channel: 'push', opted_in: true }])
  })

  it('🚨 THROWS on a query failure rather than returning []', async () => {
    // A failed read that returned an empty array would look exactly like a user
    // who never consented: everyone would be silently skipped, the campaign
    // would report success, and a broken database would be invisible.
    const { admin } = fakeAdmin({ error: 'connection reset' })
    await expect(readConsent(admin, 'u1')).rejects.toThrow(/read failed/)
  })

  it('scopes the read to the requested user', async () => {
    const { admin, filters } = fakeAdmin({ rows: [] })
    await readConsent(admin, 'u1')
    expect(filters).toContainEqual(['user_id', 'u1'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('readConsentForUsers', () => {
  it('🔑 a user with no rows is ABSENT from the map, not defaulted into it', async () => {
    // A pre-filled default is the exact shape an "everyone consented" bug takes.
    const { admin } = fakeAdmin({ rows: [{ user_id: 'a', channel: 'push', opted_in: true }] })
    const map = await readConsentForUsers(admin, ['a', 'b'])
    expect(map.get('a')).toEqual([{ channel: 'push', opted_in: true }])
    expect(map.has('b')).toBe(false)
  })

  it('groups multiple rows under one user', async () => {
    const { admin } = fakeAdmin({
      rows: [
        { user_id: 'a', channel: 'push', opted_in: true },
        { user_id: 'a', channel: 'global', opted_in: false },
      ],
    })
    const map = await readConsentForUsers(admin, ['a'])
    expect(map.get('a')).toHaveLength(2)
  })

  it('does not query at all for an empty audience', async () => {
    const { admin, filters } = fakeAdmin({ rows: [] })
    const map = await readConsentForUsers(admin, [])
    expect(map.size).toBe(0)
    expect(filters).toHaveLength(0)
  })

  it('throws on a query failure', async () => {
    const { admin } = fakeAdmin({ error: 'timeout' })
    await expect(readConsentForUsers(admin, ['a'])).rejects.toThrow(/bulk read failed/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('writes', () => {
  const now = new Date('2026-09-01T05:00:00.000Z')

  it('an opt-in stamps opted_in_at and clears opted_out_at', async () => {
    const { admin, writes } = fakeAdmin()
    await setChannelConsent(admin, 'u1', 'push', true, now)
    expect(writes[0]).toMatchObject({
      user_id: 'u1',
      channel: 'push',
      opted_in: true,
      opted_in_at: now.toISOString(),
      opted_out_at: null,
    })
  })

  it('🚨 an opt-out does NOT overwrite when consent was first given', async () => {
    // When they agreed and when they withdrew are separate facts. Overwriting
    // the first erases the only record that consent was ever given.
    const { admin, writes } = fakeAdmin()
    await setChannelConsent(admin, 'u1', 'push', false, now)
    expect(writes[0]).toMatchObject({ opted_in: false, opted_out_at: now.toISOString() })
    expect(writes[0]).not.toHaveProperty('opted_in_at')
  })

  it('the global unsubscribe writes the reserved channel with opted_in=false', async () => {
    const { admin, writes } = fakeAdmin()
    await setGlobalUnsubscribe(admin, 'u1', true, now)
    expect(writes[0]).toMatchObject({ channel: 'global', opted_in: false })
  })

  it('🔑 clearing the global unsubscribe touches ONLY the global row', async () => {
    // Anything else would silently re-grant per-channel consent the user never
    // re-gave.
    const { admin, writes } = fakeAdmin()
    await setGlobalUnsubscribe(admin, 'u1', false, now)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ channel: 'global', opted_in: true })
  })

  it('throws when the write fails, rather than reporting success', async () => {
    const { admin } = fakeAdmin({ error: 'permission denied' })
    await expect(setChannelConsent(admin, 'u1', 'push', true, now)).rejects.toThrow(/write failed/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('toConsentView', () => {
  it('🚨 every channel is present and false for a user with no rows', async () => {
    // A screen rendering only the channels that have rows would show a new user
    // nothing at all, which reads as "no choice available".
    expect(toConsentView([])).toEqual({
      channels: { push: false, email: false, in_app: false },
      globallyUnsubscribed: false,
    })
  })

  it('reports a stored opt-in per channel', () => {
    const v = toConsentView([
      { channel: 'push', opted_in: true },
      { channel: 'email', opted_in: false },
    ])
    expect(v.channels).toEqual({ push: true, email: false, in_app: false })
  })

  it('reports the global unsubscribe without rewriting the channel values', () => {
    const v = toConsentView([
      { channel: 'push', opted_in: true },
      { channel: 'global', opted_in: false },
    ])
    expect(v.globallyUnsubscribed).toBe(true)
    // The OVERRIDE happens at dispatch; what the person chose is reported as-is.
    expect(v.channels.push).toBe(true)
  })

  it('a global row with opted_in=true is not an unsubscribe', () => {
    expect(toConsentView([{ channel: 'global', opted_in: true }]).globallyUnsubscribed).toBe(false)
  })

  it('the `global` row never appears as a channel', () => {
    const v = toConsentView([{ channel: 'global', opted_in: false }])
    expect(Object.keys(v.channels).sort()).toEqual(['email', 'in_app', 'push'])
  })
})
