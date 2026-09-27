import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'
import { SUPPORT_DOC } from './supportDoc'

// Public Support page — the Support URL published in App Store Connect, so it must stay
// reachable without auth and must show real contact details. Same pattern as /privacy: a
// server component that keeps route metadata, with the localized body rendered by
// LegalDocument (which follows the site-wide LanguagePicker).

const PAGE_URL = `${SITE_URL}/support`
const TITLE = 'Support — TappyAI'
const DESCRIPTION =
  'Contact TappyAI support, answers to common questions about signing in, the 18+ age check, AI answers, memory and reporting, and links to the Privacy Policy, Terms of Service and account deletion.'

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
  robots: { index: true, follow: true },
}

export default function SupportPage() {
  return <LegalDocument doc={SUPPORT_DOC} />
}
