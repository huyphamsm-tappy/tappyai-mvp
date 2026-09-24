import { NextResponse } from 'next/server'
import {
  FREE_DAILY_LIMIT,
  ANON_LIFETIME_LIMIT,
  SHOW_PRO_UPGRADE,
  SHOW_APP_CONNECTIONS,
  SHOW_SCAM_SHIELD,
  SCAM_SHIELD_DAILY_LIMIT_AUTH,
  SCAM_SHIELD_DAILY_LIMIT_ANON,
  MAX_PHOTOS_PER_REVIEW,
  MAX_PHOTO_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_DURATION_ACCEPT_SEC,
  LINK_VIDEO_PROVIDERS,
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
        // ONE shared AI question pool for every AI feature (chat in all areas, Scam Alerts).
        /** Registered account: AI questions per VN day. */
        freeDailyLimit: FREE_DAILY_LIMIT,
        /**
         * Anonymous identity: AI questions for its LIFETIME — one trial, once. Not per day.
         * 🚨 Renamed from `anonDailyLimit` (2026-09-15): the old name said "daily" for a value
         * that is not, and a client rendering "5/day" from it would be lying. No web code read
         * the old field; the iOS `AppConfig.Freemium` model is renamed in the same change and
         * Android ignores this block entirely.
         */
        anonLifetimeLimit: ANON_LIFETIME_LIMIT,
      },
      flags: {
        showProUpgrade: SHOW_PRO_UPGRADE,
        showAppConnections: SHOW_APP_CONNECTIONS,
        showScamShield: SHOW_SCAM_SHIELD,
      },
      upload: {
        maxPhotosPerReview: MAX_PHOTOS_PER_REVIEW,
        // The per-photo ceiling POST /api/reviews/upload actually applies. It was the one upload
        // rule the clients could not read, so iOS carried its own 5 * 1024 * 1024 literal and would
        // have kept rejecting at 5MB after a server change.
        maxPhotoSizeMb: MAX_PHOTO_SIZE_MB,
        maxVideoSizeMb: MAX_VIDEO_SIZE_MB,
        maxVideoDurationSec: MAX_VIDEO_DURATION_SEC,
        // The validation ceiling, so a client pre-checking for UX uses the same boundary the
        // server does instead of mirroring a hardcoded copy that can drift.
        maxVideoDurationAcceptSec: MAX_VIDEO_DURATION_ACCEPT_SEC,
      },
      scamShield: {
        dailyLimitAuth: SCAM_SHIELD_DAILY_LIMIT_AUTH,
        dailyLimitAnon: SCAM_SHIELD_DAILY_LIMIT_ANON,
        // Analyze Message has NO allowance of its own: it spends from `freemium` above.
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
