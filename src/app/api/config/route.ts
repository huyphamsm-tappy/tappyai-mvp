import { subscriptionsEnabled } from '@/lib/payments/flags'
import { NextResponse } from 'next/server'
import {
  FREE_DAILY_LIMIT,
  ANON_LIFETIME_LIMIT,
  SHOW_PRO_UPGRADE,
  SHOW_APP_CONNECTIONS,
  SHOW_SCAM_SHIELD,
  SHOW_MUSIC,
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
  publicShareEnabled,
} from '@/lib/config/product'
import { userBlocksEnabled, reportsEnabled, moderationAdminEnabled } from '@/lib/safety/userBlocks'
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
        // SUBSCRIPTIONS_ENABLED: the five plans, the payment routes and the 30/day allowance. Web reads it through
        // useSubscriptionsFlag; this route is static, so the value is the build's env (redeploy after flipping).
        subscriptions: subscriptionsEnabled(),
        showAppConnections: SHOW_APP_CONNECTIONS,
        showScamShield: SHOW_SCAM_SHIELD,
        // Music is hidden on every platform while the catalogue licensing is undecided.
        // Native reads this; the underlying routes and catalogue are untouched.
        showMusic: SHOW_MUSIC,
        // In-app account deletion (POST /api/account/delete). Native clients offer it only where the server can keep the promise
        // (ACCOUNT_SELF_DELETE_ENABLED AND the clean-up migration installed - lib/account/deletionReady.ts); off = the request-by-email
        // flow. The route is dynamic, so the value follows the running environment. A missing field (older server) means off.
        accountSelfDelete,
        // A5 privacy kill switch for the G1 public share (/r/<slug>). Default true; env
        // SHOW_PUBLIC_SHARE=false|0 turns it off (build env — redeploy after flipping). Clients hide
        // the "public link" action on false; a missing field (older server) means true.
        publicShare: publicShareEnabled(),
        // Sign in with Apple (iOS native: Apple identity token -> Supabase signInWithIdToken). TRUE only while the Supabase project reports
        // its Apple provider as enabled (GET /auth/v1/settings, see lib/auth/appleCapability.ts); false on any doubt (unconfigured, error,
        // timeout). iOS shows the button only on true. Web has no Apple button: this flag does not change the Web login page.
        appleSignIn,
      },
      // User-safety surfaces a client may SHOW (Android SafetyApi / iOS AppConfig.P8 already read this block). The server
      // enforces each on its own (a guarded route answers 404 while its flag is off); this only decides whether the buttons
      // are drawn. `userBlocks` = USER_BLOCKS_ENABLED (build env — redeploy after flipping). `commentModeration` rides the same
      // switch (the post's creator may delete comments on it). `reports` = REPORTS_ENABLED (POST /api/comments/{id}/report and /api/users/{id}/report; post/clip reports
      // are POST /api/reviews/{id}/report, always on). A client that finds no `p8` block means all off.
      p8: {
        reports: reportsEnabled(),
        userBlocks: userBlocksEnabled(),
        commentModeration: userBlocksEnabled(),
        accountDeletion: false,
        // Violation notices + appeals (GET /api/moderation/decisions, POST …/appeal) and the report-status list: MODERATION_ADMIN_ENABLED.
        moderationNotices: moderationAdminEnabled(),
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
