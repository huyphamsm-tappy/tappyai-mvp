import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetAppleCapabilityCache } from '@/lib/auth/appleCapability'
import {
  FREE_DAILY_LIMIT, ANON_DAILY_LIMIT, SHOW_PRO_UPGRADE, SHOW_APP_CONNECTIONS, SHOW_SCAM_SHIELD,
  SCAM_SHIELD_DAILY_LIMIT_AUTH, SCAM_SHIELD_DAILY_LIMIT_ANON, MAX_PHOTOS_PER_REVIEW, MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_DURATION_SEC, MAX_VIDEO_DURATION_ACCEPT_SEC, LINK_VIDEO_PROVIDERS, AUTH_PROVIDERS,
  ONBOARDING_INTERESTS, ONBOARDING_CITIES,
} from '@/lib/config/product'
import { GET } from './route'

// GET /api/config -> flags.appleSignIn, through the REAL capability source (Supabase /auth/v1/settings) with fetch stubbed.
const ANON = 'public-anon-key-sentinel-0123456789'
const SUPABASE = 'https://proj-sentinel.supabase.co'
const settings = (apple: unknown) => new Response(JSON.stringify({ external: { google: true, email: true, apple } }), { status: 200 })

async function config() {
  const r = await GET()
  const text = await r.text()
  return { r, body: JSON.parse(text) as Record<string, any>, raw: text }
}

/** The response this route produced BEFORE the Apple change, rebuilt from main's own constants. */
const BEFORE_APPLE = () => JSON.parse(JSON.stringify({
  freemium: { freeDailyLimit: FREE_DAILY_LIMIT, anonDailyLimit: ANON_DAILY_LIMIT },
  flags: { showProUpgrade: SHOW_PRO_UPGRADE, showAppConnections: SHOW_APP_CONNECTIONS, showScamShield: SHOW_SCAM_SHIELD },
  upload: { maxPhotosPerReview: MAX_PHOTOS_PER_REVIEW, maxVideoSizeMb: MAX_VIDEO_SIZE_MB, maxVideoDurationSec: MAX_VIDEO_DURATION_SEC, maxVideoDurationAcceptSec: MAX_VIDEO_DURATION_ACCEPT_SEC },
  scamShield: { dailyLimitAuth: SCAM_SHIELD_DAILY_LIMIT_AUTH, dailyLimitAnon: SCAM_SHIELD_DAILY_LIMIT_ANON },
  video: { linkProviders: LINK_VIDEO_PROVIDERS },
  auth: { providers: AUTH_PROVIDERS },
  onboarding: { interests: ONBOARDING_INTERESTS, cities: ONBOARDING_CITIES },
}))

beforeEach(() => {
  __resetAppleCapabilityCache()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('GET /api/config flags.appleSignIn', () => {
  it('Supabase Apple provider ENABLED -> true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(settings(true)))
    expect((await config()).body.flags.appleSignIn).toBe(true)
  })
  it('Supabase Apple provider DISABLED -> false (present, not omitted: iOS reads a Bool)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(settings(false)))
    expect((await config()).body.flags.appleSignIn).toBe(false)
  })
  it('Apple auth NOT configured / unreachable -> false, whatever the cause', async () => {
    for (const f of [vi.fn().mockRejectedValue(new Error('down')), vi.fn().mockResolvedValue(new Response('oops', { status: 500 })), vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))]) {
      __resetAppleCapabilityCache()
      vi.stubGlobal('fetch', f)
      expect((await config()).body.flags.appleSignIn).toBe(false)
    }
    __resetAppleCapabilityCache()
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

describe('GET /api/config differs from main ONLY by flags.appleSignIn', () => {
  it('with Apple enabled or disabled, removing flags.appleSignIn gives exactly the pre-change response', async () => {
    for (const apple of [true, false]) {
      __resetAppleCapabilityCache()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(settings(apple)))
      const { body } = await config()
      expect(typeof body.flags.appleSignIn).toBe('boolean')
      const { appleSignIn: _removed, ...flags } = body.flags
      expect({ ...body, flags }).toEqual(BEFORE_APPLE())
    }
  })
  it('Google / Zalo / email providers are exactly what they were; Apple is NOT added to the provider list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(settings(true)))
    const { body } = await config()
    expect(body.auth.providers).toEqual([{ id: 'google', enabled: true }, { id: 'zalo', enabled: true }, { id: 'email', enabled: true }])
  })
  it('keeps its CDN cache header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(settings(false)))
    expect((await config()).r.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=3600')
  })
  it('no secret or Supabase endpoint detail ever appears in the response', async () => {
    for (const apple of [true, false]) {
      __resetAppleCapabilityCache()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(settings(apple)))
      const { raw } = await config()
      expect(raw).not.toContain(ANON)
      expect(raw).not.toContain('proj-sentinel')
      expect(raw).not.toMatch(/apikey|secret|private|\.p8|client_secret|eyJ[A-Za-z0-9_-]{10,}/i)
    }
  })
  it('one probe serves repeated calls inside the cache window (the route does not hammer Supabase)', async () => {
    const f = vi.fn().mockResolvedValue(settings(true))
    vi.stubGlobal('fetch', f)
    await GET()
    await GET()
    await GET()
    expect(f).toHaveBeenCalledTimes(1)
  })
})
