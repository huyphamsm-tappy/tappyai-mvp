'use client'

import LandingSection from './LandingSection'
import LandingProse from './LandingProse'

export default function LandingAbout() {
  return (
    <LandingSection id="about" titleKey="landing.about.title" width="content">
      <LandingProse paragraphKeys={['landing.about.p1', 'landing.about.p2']} />
    </LandingSection>
  )
}
