// Owner SL2 (29/09): Android is approved on Google Play → a Google Play badge with the REAL listing link.
//
// The URL is the listing of the release applicationId (`android/app/build.gradle` applicationId
// "com.tappyai.app"; docs/uat/DEPLOY-CHECKLIST.md §4e). Checked 29/09 11:15 (GMT+7): the public page answered
// 404 in the VN and US storefronts and a Play search for "TappyAI" listed nothing — the approved build is not
// public yet. So the badge shows on non-production (UAT review) and on production only once
// NEXT_PUBLIC_PLAY_LISTING_LIVE=1 is set after the public page loads in a private window.
// App Store: not yet (owner) — no Apple badge anywhere.

export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.tappyai.app'

/** The public App Store listing, set (https://apps.apple.com/...) only once it loads publicly. Unset = "Sắp có", no link (no invented URL). */
const rawAppStore = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()
// 21/11/2026: verified live — the public iTunes search (vn storefront) lists "TappyAI" by HUY PHAM, bundle com.tappyai.ios, under this id.
const APP_STORE_LISTING = 'https://apps.apple.com/vn/app/tappyai/id6816654420'
export const APP_STORE_URL: string | null = rawAppStore === 'off' ? null : rawAppStore && /^https:\/\/apps\.apple\.com\//.test(rawAppStore) ? rawAppStore : APP_STORE_LISTING

// 21/11/2026: the Google Play listing is public (the real id answers 200, a made-up id 404), so the badge is ON by default.
// Set NEXT_PUBLIC_PLAY_LISTING_LIVE=0 to hide it (a listing taken down). (Owner 02/10 had it hidden until the page went public.)
/**
 * Official social accounts for the footer icons. Each is an https URL set in its own NEXT_PUBLIC_SOCIAL_* variable; unset = the icon is
 * drawn but is not a link (no account URL is invented). Literal `process.env.X` reads so Next inlines them in the browser bundle.
 */
const httpsOrNull = (v: string | undefined): string | null => (v && /^https:\/\//.test(v.trim()) ? v.trim() : null)
export const SOCIAL_LINKS = {
  youtube: httpsOrNull(process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE),
  tiktok: httpsOrNull(process.env.NEXT_PUBLIC_SOCIAL_TIKTOK),
  facebook: httpsOrNull(process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK),
  instagram: httpsOrNull(process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM),
  x: httpsOrNull(process.env.NEXT_PUBLIC_SOCIAL_X),
} as const

export function playBadgeEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_PLAY_LISTING_LIVE: process.env.NEXT_PUBLIC_PLAY_LISTING_LIVE }): boolean {
  return env.NEXT_PUBLIC_PLAY_LISTING_LIVE !== '0'
}
