import type { Metadata } from 'next'
import LandingPage from './LandingPage'

// Corporate startup landing page (Google for Startups review, investors,
// business partners). Server component: SEO metadata + Organization structured
// data. All visible content is rendered client-side from the landing i18n
// module so it follows the app-wide language switch (EN/VI).
const SITE_URL = 'https://www.tappyai.com'
const PAGE_URL = `${SITE_URL}/about`
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

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'TappyAI',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  email: 'huypham.sm@gmail.com',
  founder: { '@type': 'Person', name: 'Huy Pham' },
}

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <LandingPage />
    </>
  )
}
