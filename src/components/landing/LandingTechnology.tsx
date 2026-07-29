'use client'

import type { LucideIcon } from 'lucide-react'
import { BarChart3, Database, Globe, Smartphone, Sparkles } from 'lucide-react'
import LandingSection from './LandingSection'
import LandingIconCard from './LandingIconCard'

// Every entry below is verified against the repository: Next.js/React/TypeScript
// + Tailwind on Vercel, the Kotlin/Compose Android app, Anthropic Claude behind
// the AI provider layer, Supabase + Vercel Blob, PostHog and Stripe.
const STACK: Array<{ icon: LucideIcon; key: string }> = [
  { icon: Globe, key: 'web' },
  { icon: Smartphone, key: 'mobile' },
  { icon: Sparkles, key: 'ai' },
  { icon: Database, key: 'data' },
  { icon: BarChart3, key: 'ops' },
]

export default function LandingTechnology() {
  return (
    <LandingSection
      id="technology"
      titleKey="landing.tech.title"
      introKey="landing.tech.intro"
      tone="raised"
    >
      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {STACK.map(({ icon, key }) => (
          <LandingIconCard
            key={key}
            icon={icon}
            titleKey={`landing.tech.${key}.title`}
            descKey={`landing.tech.${key}.desc`}
          />
        ))}
      </ul>
    </LandingSection>
  )
}
