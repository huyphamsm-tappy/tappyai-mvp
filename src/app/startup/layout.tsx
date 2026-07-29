import type { Metadata } from 'next'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'

// Startup landing page shell: SEO metadata for the route plus the dark surface
// the landing sections render on. Isolated from the application shell — no app
// navigation, no auth, no data fetching.
const PAGE_URL = `${SITE_URL}/startup`
const TITLE = 'TappyAI — AI Lifestyle Assistant for Vietnam'
const DESCRIPTION =
  'TappyAI combines a conversational AI assistant, a short-video review community, and everyday utilities in one bilingual product built for daily life in Vietnam.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    siteName: 'TappyAI',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}${OG_IMAGE}` }],
    locale: 'en_US',
    alternateLocale: ['vi_VN'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}${OG_IMAGE}`],
  },
}

export default function StartupLayout({ children }: { children: React.ReactNode }) {
  // Fixed-dark surface: this page is always dark regardless of the app theme.
  // The `dark` class marks it as a dark context (Tailwind darkMode: 'class'), so
  // the semantic design-system tokens (text-content-secondary, text-link, …)
  // resolve to their dark-mode values here instead of their light defaults.
  // This is the design-system mechanism for fixed-dark surfaces — no per-page
  // color exceptions. Landing sections use no `dark:` variants, so nothing else changes.
  return <div className="dark min-h-dvh bg-gray-950 text-white">{children}</div>
}
