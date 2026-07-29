import { SITE_URL, SUPPORT_EMAIL } from '@/components/landing/config'
import LandingHeader from '@/components/landing/LandingHeader'
import LandingHero from '@/components/landing/LandingHero'
import LandingWhatIs from '@/components/landing/LandingWhatIs'
import LandingVision from '@/components/landing/LandingVision'
import LandingOverview from '@/components/landing/LandingOverview'
import LandingFeatures from '@/components/landing/LandingFeatures'
import LandingScreenshots from '@/components/landing/LandingScreenshots'
import LandingTechnology from '@/components/landing/LandingTechnology'
import LandingAbout from '@/components/landing/LandingAbout'
import LandingContact from '@/components/landing/LandingContact'
import LandingFooter from '@/components/landing/LandingFooter'

// Organization structured data. Server-rendered so crawlers get it without
// executing scripts. Values mirror the verified contacts in landing/config.
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'TappyAI',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  email: SUPPORT_EMAIL,
  founder: { '@type': 'Person', name: 'Huy Pham' },
}

export default function StartupPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />

      <LandingHeader />

      <main>
        <LandingHero />
        <LandingWhatIs />
        <LandingVision />
        <LandingOverview />
        <LandingFeatures />
        <LandingScreenshots />
        <LandingTechnology />
        <LandingAbout />
        <LandingContact />
      </main>

      <LandingFooter />
    </>
  )
}
