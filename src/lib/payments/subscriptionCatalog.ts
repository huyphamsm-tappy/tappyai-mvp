// SUBSCRIPTIONS — the plan list every client draws (docs/payments/PLAN.md). Written by the security
// session (p8/subscriptions).
//
// One shape for web, Android and iOS; the server is the source of truth. Cards are ordered by
// duration (PAID_PLAN_IDS). One badge (Sunny "Phổ biến nhất", Huy 2026-10-01). No price per day, no %:
// the only derived price is Sunny's "about …/month" (configured price / 12, nearest 1.000đ).
// Characters come from this server manifest — `imageUrl` is null until Huy's character art exists
// (the clients then draw the initial on the plan colour). Character names are never translated.
// Internal notes, previous prices, targets: never here.

import { PAID_PLAN_IDS, PLAN_CONFIG, aiQuotaFor, type PaidPlanId } from '@/lib/plans/planConfig'
import { monthlyApproxVnd } from '@/lib/plans/subscriptionPrices'
import type { TappyPose } from '@/components/TappyMascot'

/** Plan colour = the placeholder background until the character image exists. Design tokens, not hex. */
// Plan colours follow Huy's mockup: Pip pink, Momo green, Coco blue, Milo violet, Sunny orange.
// `pose` = the existing Tappy pose shown until Huy's character art for the plan exists.
const CHARACTER: Readonly<Record<PaidPlanId, { color: string; pose: TappyPose; imageEnv: string }>> = Object.freeze({
  pip: { color: 'pink', pose: 'searching', imageEnv: 'SUBSCRIPTION_IMAGE_PIP' },
  momo: { color: 'green', pose: 'wave', imageEnv: 'SUBSCRIPTION_IMAGE_MOMO' },
  coco: { color: 'blue', pose: 'travel', imageEnv: 'SUBSCRIPTION_IMAGE_COCO' },
  milo: { color: 'violet', pose: 'reading', imageEnv: 'SUBSCRIPTION_IMAGE_MILO' },
  sunny: { color: 'orange', pose: 'welcome', imageEnv: 'SUBSCRIPTION_IMAGE_SUNNY' },
})

export interface SubscriptionPlanCard {
  id: PaidPlanId
  /** Character name — same in every language. */
  name: string
  durationDays: number
  dailyAiQuestions: number
  /** Google Play / App Store product id (apps buy this; the store shows its own price). */
  storeProductId: string
  /** The store sells it as auto-renewing. Web never auto-renews. */
  storeAutoRenew: boolean
  character: { color: string; pose: TappyPose; imageUrl: string }
  /** Sunny only: "Phổ biến nhất". */
  badge: 'popular' | null
  /** USD list price shown as the label ("$1 · 7 ngày"); the charge itself is `priceVnd`. */
  priceUsd: number
  /** Pip only: a one-time trial per account (enforced by the database; the UI draws it). */
  trialOnce: boolean
  /** Web only: what the bank transfer is for. */
  priceVnd?: number
  /** Web only, Sunny only: "Chỉ khoảng …/tháng" (configured price / months, nearest 1.000đ). */
  monthlyApproxVnd?: number
}

export interface SubscriptionCatalog {
  plans: SubscriptionPlanCard[]
  /** What signed-in accounts without a plan get, from the live config (not a target, not a promise). */
  free: { dailyAiQuestions: number }
  /** Guests: lifetime questions before signing in. */
  guest: { aiQuestions: number }
}

/** The character art: the owner-supplied images shipped in /public/subscription; an https env override wins (CDN swap, no redeploy of art). */
function imageUrl(env: NodeJS.ProcessEnv, key: string, id: PaidPlanId): string {
  const v = env[key]?.trim()
  return v && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : `/subscription/${id}.webp`
}

export function subscriptionCatalog(opts: { forApp?: boolean; env?: NodeJS.ProcessEnv } = {}): SubscriptionCatalog {
  const env = opts.env ?? process.env
  const plans = PAID_PLAN_IDS.map((id): SubscriptionPlanCard => {
    const p = PLAN_CONFIG[id]
    const card: SubscriptionPlanCard = {
      id,
      name: p.label,
      durationDays: p.durationDays!,
      dailyAiQuestions: aiQuotaFor(id).limit,
      storeProductId: p.storeProductId!,
      storeAutoRenew: p.storeAutoRenew !== false,
      character: { color: CHARACTER[id].color, pose: CHARACTER[id].pose, imageUrl: imageUrl(env, CHARACTER[id].imageEnv, id) },
      badge: p.subscriptionBadge ?? null,
      priceUsd: p.priceUsd!,
      trialOnce: id === 'pip',
    }
    if (!opts.forApp) {
      card.priceVnd = p.priceVnd!
      if (p.showMonthlyApprox) card.monthlyApproxVnd = monthlyApproxVnd(p.priceVnd!, p.durationDays!)
    }
    return card
  }).sort((a, b) => a.durationDays - b.durationDays)
  return {
    plans,
    free: { dailyAiQuestions: aiQuotaFor('free').limit },
    guest: { aiQuestions: aiQuotaFor('guest').limit },
  }
}
