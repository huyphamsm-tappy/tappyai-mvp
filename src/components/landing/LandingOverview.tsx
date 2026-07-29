'use client'

import type { LucideIcon } from 'lucide-react'
import { Bot, Clapperboard, Wrench } from 'lucide-react'
import LandingSection from './LandingSection'
import LandingIconCard from './LandingIconCard'

const LAYERS: Array<{ icon: LucideIcon; key: string }> = [
  { icon: Bot, key: 'assistant' },
  { icon: Clapperboard, key: 'community' },
  { icon: Wrench, key: 'tools' },
]

export default function LandingOverview() {
  return (
    <LandingSection id="product" titleKey="landing.product.title" introKey="landing.product.intro">
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {LAYERS.map(({ icon, key }) => (
          <LandingIconCard
            key={key}
            as="article"
            layout="stack"
            icon={icon}
            titleKey={`landing.product.${key}.title`}
            descKey={`landing.product.${key}.desc`}
          />
        ))}
      </div>
    </LandingSection>
  )
}
