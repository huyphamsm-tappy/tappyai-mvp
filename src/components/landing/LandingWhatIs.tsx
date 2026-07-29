'use client'

import LandingSection from './LandingSection'
import LandingProse from './LandingProse'

export default function LandingWhatIs() {
  return (
    <LandingSection id="what-is-tappyai" titleKey="landing.what.title" width="content">
      <LandingProse paragraphKeys={['landing.what.p1', 'landing.what.p2']} />
    </LandingSection>
  )
}
