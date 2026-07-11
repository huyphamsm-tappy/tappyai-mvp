import { NextResponse } from 'next/server'
import {
  FREE_DAILY_LIMIT,
  ANON_DAILY_LIMIT,
  SHOW_PRO_UPGRADE,
  MAX_PHOTOS_PER_REVIEW,
  MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_DURATION_SEC,
  AUTH_PROVIDERS,
  ONBOARDING_INTERESTS,
  ONBOARDING_CITIES,
} from '@/lib/config/product'

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
  return NextResponse.json(
    {
      freemium: {
        freeDailyLimit: FREE_DAILY_LIMIT,
        anonDailyLimit: ANON_DAILY_LIMIT,
      },
      flags: {
        showProUpgrade: SHOW_PRO_UPGRADE,
      },
      upload: {
        maxPhotosPerReview: MAX_PHOTOS_PER_REVIEW,
        maxVideoSizeMb: MAX_VIDEO_SIZE_MB,
        maxVideoDurationSec: MAX_VIDEO_DURATION_SEC,
      },
      // Which sign-in methods the product offers (HOW each works stays
      // backend-internal) + the onboarding catalog — identical on every platform.
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
