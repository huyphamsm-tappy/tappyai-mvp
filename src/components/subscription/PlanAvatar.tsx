'use client'

// SUBSCRIPTIONS — the plan's otter character. Huy's per-plan art comes from the server manifest
// (`character.imageUrl`); until it exists, an existing Tappy pose stands in (same family, no new art,
// no text or price in the image). Written by the security session.

import { TappyMascot } from '@/components/TappyMascot'
import type { SubscriptionPlanCard } from '@/lib/payments/subscriptionCatalog'

export function PlanAvatar({ plan, size, className = '' }: {
  plan: Pick<SubscriptionPlanCard, 'name' | 'character'>
  size: number
  className?: string
}) {
  const { imageUrl, pose } = plan.character
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- server-manifest art, any https host
    return <img src={imageUrl} alt="" width={size} height={size} className={`rounded-2xl object-cover ${className}`} style={{ width: size, height: size }} />
  }
  return <TappyMascot pose={pose} size={size} className={className} />
}
