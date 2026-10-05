import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetAppleCapabilityCache } from '@/lib/auth/appleCapability'
import { __resetDeletionReadyCache } from '@/lib/account/deletionReady'
import {
  FREE_DAILY_LIMIT, ANON_DAILY_LIMIT, SHOW_PRO_UPGRADE, SHOW_APP_CONNECTIONS, SHOW_SCAM_SHIELD,
  SCAM_SHIELD_DAILY_LIMIT_AUTH, SCAM_SHIELD_DAILY_LIMIT_ANON, MAX_PHOTOS_PER_REVIEW, MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_DURATION_SEC, MAX_VIDEO_DURATION_ACCEPT_SEC, LINK_VIDEO_PROVIDERS, AUTH_PROVIDERS,
  ONBOARDING_INTERESTS, ONBOARDING_CITIES,
} from '@/lib/config/product'
import { GET } from './route'

// GET /api/config -> flags.appleSignIn and flags.accountSelfDelete, through the REAL capability sources:
//   Apple   : Supabase GET /auth/v1/settings            -> external.apple
//   Deletion: ACCOUNT_SELF_DELETE_ENABLED AND the database's RPC account_deletion_ready() (the clean-up migration is installed)
// with the network stubbed by URL.
const ANON = 'public-anon-key-sentinel-0123456789'
const SUPABASE = 'https://proj-sentinel.supabase.co'
const settings = (apple: unknown) => new Response(JSON.stringify({ external: { google: true, email: true, apple } }), { status: 200 })

type Backends = { apple?: boolean | 'error'; ready?: boolean | 'missing' | 'error' }
function backends(o: Backends = {}) {
  const f = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.endsWith('/auth/v1/settings')) {
      if (o.apple === 'error') throw new Error('down')
      return settings(o.apple ?? false)
    }
    if (u.endsWith('/rest/v1/rpc/account_deletion_ready')) {
      if (o.ready === 'error') throw new Error('down')
      if (o.ready === 'missing') return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 })
      return new Response(JSON.stringify(o.ready ?? false), { status: 200 })
    }
    throw new Error(`unexpected url ${u}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}
const reset = () => { __resetAppleCapabilityCache(); __resetDeletionReadyCache() }

async function config() {
  const r = await GET()
  const text = await r.text()
  return { r, body: JSON.parse(text) as Record<string, any>, raw: text }
}

/** The response this route produced BEFORE this branch, rebuilt from main's own constants (deletion off: no flag, no clean-up). */
const BEFORE = () => JSON.parse(JSON.stringify({
  freemium: { freeDailyLimit: FREE_DAILY_LIMIT, anonDailyLimit: ANON_DAILY_LIMIT },
  flags: { showProUpgrade: SHOW_PRO_UPGRADE, showAppConnections: SHOW_APP_CONNECTIONS, showScamShield: SHOW_SCAM_SHIELD },
  upload: { maxPhotosPerReview: MAX_PHOTOS_PER_REVIEW, maxVideoSizeMb: MAX_VIDEO_SIZE_MB, maxVideoDurationSec: MAX_VIDEO_DURATION_SEC, maxVideoDurationAcceptSec: MAX_VIDEO_DURATION_ACCEPT_SEC },
  scamShield: { dailyLimitAuth: SCAM_SHIELD_DAILY_LIMIT_AUTH, dailyLimitAnon: SCAM_SHIELD_DAILY_LIMIT_ANON },
  video: { linkProviders: LINK_VIDEO_PROVIDERS },
  auth: { providers: AUTH_PROVIDERS },
  onboarding: { interests: ONBOARDING_INTERESTS, cities: ONBOARDING_CITIES },
}))

beforeEach(() => {
  reset()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON)
  vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('GET /api/config flags.appleSignIn', () => {
  it('Supabase Apple provider ENABLED -> true', async () => {
    backends({ apple: true })
    expect((await config()).body.flags.appleSignIn).toBe(true)
  })
  it('Supabase Apple provider DISABLED -> false (present, not omitted: iOS reads a Bool)', async () => {
    backends({ apple: false })
    expect((await config()).body.flags.appleSignIn).toBe(false)
  })
  it('Apple auth NOT configured / unreachable -> false, whatever the cause', async () => {
    for (const f of [vi.fn().mockRejectedValue(new Error('down')), vi.fn().mockResolvedValue(new Response('oops', { status: 500 })), vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))]) {
      reset()
      vi.stubGlobal('fetch', f)
      expect((await config()).body.flags.appleSignIn).toBe(false)
    }
    reset()
    vi.unstubAllEnvs()
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect((await config()).body.flags.appleSignIn).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('takes no client-controlled input', () => {
    expect(GET.length).toBe(0)
  })
})

describe('GET /api/config differs from main ONLY by the two new flags', () => {
  it('with deletion off, removing flags.appleSignIn and flags.accountSelfDelete gives exactly the pre-change response', async () => {
    for (const apple of [true, false]) {
      reset()
      backends({ apple })
      const { body } = await config()
      expect(typeof body.flags.appleSignIn).toBe('boolean')
      expect(body.flags.accountSelfDelete).toBe(false)
      const { appleSignIn: _a, accountSelfDelete: _d, ...flags } = body.flags
      expect({ ...body, flags }).toEqual(BEFORE())
    }
  })
  it('Google / Zalo / email providers are exactly what they were; Apple is NOT added to the provider list', async () => {
    backends({ apple: true })
    const { body } = await config()
    expect(body.auth.providers).toEqual([{ id: 'google', enabled: true }, { id: 'zalo', enabled: true }, { id: 'email', enabled: true }])
  })
  it('keeps its CDN cache header', async () => {
    backends({ apple: false })
    expect((await config()).r.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=3600')
  })
  it('no secret or Supabase endpoint detail ever appears in the response', async () => {
    vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', 'true')
    for (const apple of [true, false]) {
      reset()
      backends({ apple, ready: true })
      const { raw } = await config()
      expect(raw).not.toContain(ANON)
      expect(raw).not.toContain('proj-sentinel')
      expect(raw).not.toMatch(/apikey|secret|private|\.p8|client_secret|eyJ[A-Za-z0-9_-]{10,}/i)
    }
  })
  it('one Apple probe serves repeated calls inside the cache window, and a flag that is off never touches the database', async () => {
    const f = backends({ apple: true })
    await GET()
    await GET()
    await GET()
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls.map(c => String(c[0])).some(u => u.includes('account_deletion_ready'))).toBe(false)
  })
})

describe('GET /api/config flags.accountSelfDelete (the interlock: flag AND installed clean-up)', () => {
  it('the env flag follows ACCOUNT_SELF_DELETE_ENABLED exactly - only the literal "true" counts - even when the clean-up is installed', async () => {
    for (const [value, expected] of [['', false], ['false', false], ['1', false], ['TRUE', false], ['true', true]] as const) {
      reset()
      backends({ ready: true })
      vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', value)
      const { body } = await config()
      expect(body.flags.accountSelfDelete, value).toBe(expected)
      expect(typeof body.flags.accountSelfDelete).toBe('boolean')
    }
  })
  it('🚨 the flag is ON but the clean-up migration is NOT installed (function missing, false, or the database errors) -> false', async () => {
    vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', 'true')
    for (const ready of ['missing', false, 'error'] as const) {
      reset()
      backends({ ready })
      expect((await config()).body.flags.accountSelfDelete, String(ready)).toBe(false)
    }
  })
  it('without Supabase env the flag is false and nothing is called', async () => {
    vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect((await config()).body.flags.accountSelfDelete).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('is independent of the Apple signal', async () => {
    vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', 'true')
    backends({ apple: false, ready: true })
    const off = (await config()).body.flags
    reset()
    backends({ apple: true, ready: true })
    const on = (await config()).body.flags
    expect(off).toMatchObject({ accountSelfDelete: true, appleSignIn: false })
    expect(on).toMatchObject({ accountSelfDelete: true, appleSignIn: true })
  })
})
