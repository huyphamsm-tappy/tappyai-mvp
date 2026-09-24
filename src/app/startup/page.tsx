import { organizationJsonLd } from '@/lib/discovery/siteJsonLd'
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
// executing scripts. The ONE Organization node the home page and /about also
// emit (src/lib/discovery/siteJsonLd.ts) — same @id, same facts, so an answer
// engine meets one entity, not three. Contacts still come from landing/config.
const organization = organizationJsonLd()

export default function StartupPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
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
