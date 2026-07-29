'use client'

import LandingSection from './LandingSection'
import LandingProse from './LandingProse'

export default function LandingVision() {
  return (
    <LandingSection id="vision" titleKey="landing.vision.title" tone="raised" width="content">
      <LandingProse paragraphKeys={['landing.vision.p1', 'landing.vision.p2']} />
    </LandingSection>
  )
}
