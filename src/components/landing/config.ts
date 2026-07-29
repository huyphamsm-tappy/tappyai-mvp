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

// Real production captures (www.tappyai.com, 390x844 viewport @2x, WebP q82).
export const HERO_SCREENSHOT = { src: '/landing/screen-home.webp', width: 780, height: 1498 }

export const GALLERY_SCREENSHOTS: Array<{ key: string; src: string; width: number; height: number }> = [
  { key: 'chat', src: '/landing/screen-chat.webp', width: 780, height: 1688 },
  { key: 'reviews', src: '/landing/screen-reviews.webp', width: 780, height: 1688 },
  { key: 'music', src: '/landing/screen-music.webp', width: 780, height: 1688 },
  { key: 'deals', src: '/landing/screen-deals.webp', width: 780, height: 1688 },
]
