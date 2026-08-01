// Startup landing page data (not copy — all user-facing text lives in
// src/lib/i18n/landing.ts). Single source for contact endpoints and asset
// paths so components never hardcode them.
export const SITE_URL = 'https://www.tappyai.com'
export const SITE_HOST = 'www.tappyai.com'

// Proper noun — identical in every language, so it is a constant rather than a
// dictionary entry (translating it would be wrong).
export const BRAND_NAME = 'TappyAI'

// Existing project assets. Paths are root-relative; prefix with SITE_URL where
// an absolute URL is required (Open Graph, structured data).
export const LOGO = '/branding/otter-logo.png'
export const OG_IMAGE = '/feature-graphic.png'

// Public contact addresses for the landing page.
export const SUPPORT_EMAIL = 'founder@tappyai.com'
export const FOUNDER_EMAIL = 'founder@tappyai.com'
export const FOUNDER_LINKEDIN_URL = 'https://www.linkedin.com/in/ph%E1%BA%A1m-huy-313592253/'
export const FOUNDER_LINKEDIN_LABEL = 'linkedin.com/in/phạm-huy-313592253'

// Real production captures (390px viewport @2x, WebP q82). screen-home.webp is
// a genuine screenshot of the live Home screen (src/app/HomeView.tsx).
export const HERO_SCREENSHOT = { src: '/landing/screen-home.webp', width: 780, height: 1578 }

// Order tells the product story: ask → plan → community → commerce.
// Music was retired from the gallery (owner decision 2026-08-01): it is not a
// core Landing capability, its screen is Vietnamese-only regardless of locale,
// and Trip planning demonstrates far more of what TappyAI does.
export const GALLERY_SCREENSHOTS: Array<{ key: string; src: string; width: number; height: number }> = [
  { key: 'chat', src: '/landing/screen-chat.webp', width: 780, height: 1688 },
  { key: 'travel', src: '/landing/screen-travel.webp', width: 780, height: 1688 },
  { key: 'reviews', src: '/landing/screen-reviews.webp', width: 780, height: 1688 },
  { key: 'deals', src: '/landing/screen-deals.webp', width: 780, height: 1688 },
]
