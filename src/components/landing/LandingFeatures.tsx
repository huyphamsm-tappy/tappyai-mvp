'use client'

import type { LucideIcon } from 'lucide-react'
import { BadgePercent, Languages, MessageSquare, Music2, PlayCircle, ScanLine } from 'lucide-react'
import LandingSection from './LandingSection'
import LandingIconCard from './LandingIconCard'

const FEATURES: Array<{ icon: LucideIcon; key: string; accent?: 'accent' }> = [
  { icon: MessageSquare, key: 'chat' },
  { icon: PlayCircle, key: 'reviews' },
  { icon: Music2, key: 'sounds' },
  { icon: BadgePercent, key: 'deals', accent: 'accent' },
  { icon: ScanLine, key: 'tools' },
  { icon: Languages, key: 'bilingual' },
]

export default function LandingFeatures() {
  return (
    <LandingSection id="features" titleKey="landing.features.title" tone="raised">
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon, key, accent }) => (
          <LandingIconCard
            key={key}
            icon={icon}
            accent={accent}
            titleKey={`landing.features.${key}.title`}
            descKey={`landing.features.${key}.desc`}
          />
        ))}
      </ul>
    </LandingSection>
  )
}
