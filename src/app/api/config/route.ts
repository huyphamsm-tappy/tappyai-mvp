import { NextResponse } from 'next/server'
import {
  FREE_DAILY_LIMIT,
  ANON_DAILY_LIMIT,
  SHOW_PRO_UPGRADE,
  SHOW_APP_CONNECTIONS,
  SHOW_SCAM_SHIELD,
  SCAM_SHIELD_DAILY_LIMIT_AUTH,
  SCAM_SHIELD_DAILY_LIMIT_ANON,
  MAX_PHOTOS_PER_REVIEW,
  MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_DURATION_ACCEPT_SEC,
  LINK_VIDEO_PROVIDERS,
  AUTH_PROVIDERS,
  ONBOARDING_INTERESTS,
  ONBOARDING_CITIES,
} from '@/lib/config/product'
import { appleSignInAvailable } from '@/lib/auth/appleCapability'
import { selfDeleteAvailable } from '@/lib/account/deletionReady'

// `flags.appleSignIn` is read at request time from the Supabase project's own provider state (appleCapability.ts), so the route is
// dynamic; the Cache-Control below still lets the CDN serve it for 5 minutes.
export const dynamic = 'force-dynamic'

// GET /api/config — the backend-owned product configuration, as a stable
// contract for ALL clients (Web, Android, iOS). Native clients read quotas,
// flags, and upload limits from here instead of hardcoding them, so a product
// change (e.g. enabling Pro, raising the free tier) ships without an app
// release. Values live in @/lib/config/product — the single source of truth.
//
// Display values only: enforcement stays server-side (/api/chat quotas,
// /api/upload/video size token, /api/reviews caps). A tampered client changes
// what it SHOWS, never what it CAN DO.
export async function GET() {
  const appleSignIn = await appleSignInAvailable()
  const accountSelfDelete = await selfDeleteAvailable()
  return NextResponse.json(
    {
      freemium: {
        freeDailyLimit: FREE_DAILY_LIMIT,
        anonDailyLimit: ANON_DAILY_LIMIT,
      },
      flags: {
        showProUpgrade: SHOW_PRO_UPGRADE,
        showAppConnections: SHOW_APP_CONNECTIONS,
        showScamShield: SHOW_SCAM_SHIELD,
        // In-app account deletion (POST /api/account/delete). Native clients offer it only where the server can keep the promise
        // (ACCOUNT_SELF_DELETE_ENABLED AND the clean-up migration installed - lib/account/deletionReady.ts); off = the request-by-email
        // flow. The route is dynamic, so the value follows the running environment. A missing field (older server) means off.
        accountSelfDelete,
        // Sign in with Apple (iOS native: Apple identity token -> Supabase signInWithIdToken). TRUE only while the Supabase project reports
        // its Apple provider as enabled (GET /auth/v1/settings, see lib/auth/appleCapability.ts); false on any doubt (unconfigured, error,
        // timeout). iOS shows the button only on true. Web has no Apple button: this flag does not change the Web login page.
        appleSignIn,
      },
      upload: {
        maxPhotosPerReview: MAX_PHOTOS_PER_REVIEW,
        maxVideoSizeMb: MAX_VIDEO_SIZE_MB,
        maxVideoDurationSec: MAX_VIDEO_DURATION_SEC,
        // The validation ceiling, so a client pre-checking for UX uses the same boundary the
        // server does instead of mirroring a hardcoded copy that can drift.
        maxVideoDurationAcceptSec: MAX_VIDEO_DURATION_ACCEPT_SEC,
      },
      scamShield: {
        dailyLimitAuth: SCAM_SHIELD_DAILY_LIMIT_AUTH,
        dailyLimitAnon: SCAM_SHIELD_DAILY_LIMIT_ANON,
      },
      video: {
        linkProviders: LINK_VIDEO_PROVIDERS,
      },
      auth: {
        providers: AUTH_PROVIDERS,
      },
      onboarding: {
        interests: ONBOARDING_INTERESTS,
        cities: ONBOARDING_CITIES,
      },
    },
    // Cacheable: values change only on deploy. Short TTL + SWR keeps clients
    // fresh without hammering the function (Cost Optimization).
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
  )
}
