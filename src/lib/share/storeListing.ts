// Owner SL2 (29/09): Android is approved on Google Play → a Google Play badge with the REAL listing link.
//
// The URL is the listing of the release applicationId (`android/app/build.gradle` applicationId
// "com.tappyai.app"; docs/uat/DEPLOY-CHECKLIST.md §4e). Checked 29/09 11:15 (GMT+7): the public page answered
// 404 in the VN and US storefronts and a Play search for "TappyAI" listed nothing — the approved build is not
// public yet. So the badge shows on non-production (UAT review) and on production only once
// NEXT_PUBLIC_PLAY_LISTING_LIVE=1 is set after the public page loads in a private window.
// App Store: not yet (owner) — no Apple badge anywhere.

export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.tappyai.app'

export function playBadgeEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_PLAY_LISTING_LIVE: process.env.NEXT_PUBLIC_PLAY_LISTING_LIVE, NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV }): boolean {
  if (env.NEXT_PUBLIC_PLAY_LISTING_LIVE === '1') return true
  return env.NEXT_PUBLIC_VERCEL_ENV !== 'production'
}
