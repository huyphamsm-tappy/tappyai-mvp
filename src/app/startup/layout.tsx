import type { Metadata } from 'next'
import { SITE_URL } from '@/components/landing/config'

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
    images: [{ url: `${SITE_URL}/feature-graphic.png` }],
    locale: 'en_US',
    alternateLocale: ['vi_VN'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/feature-graphic.png`],
  },
}

export default function StartupLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-gray-950 text-white">{children}</div>
}
