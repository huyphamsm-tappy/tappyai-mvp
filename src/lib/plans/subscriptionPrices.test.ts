import { describe, expect, it } from 'vitest'
import { PLAN_CONFIG, PAID_PLAN_IDS } from './planConfig'
import { SUBSCRIPTION_PRICES, monthlyApproxVnd, niceVnd, priceTable } from './subscriptionPrices'

// SUBSCRIPTIONS - prices live in subscriptionPrices.json; VND is shown everywhere, USD nowhere.
const days = Object.fromEntries(PAID_PLAN_IDS.map((id) => [id, PLAN_CONFIG[id].durationDays!])) as Record<(typeof PAID_PLAN_IDS)[number], number>

describe('subscription prices (configuration)', () => {
  it('PLAN_CONFIG takes its prices from the config file', () => {
    for (const id of PAID_PLAN_IDS) expect(PLAN_CONFIG[id].priceVnd).toBe(SUBSCRIPTION_PRICES.plans[id].vnd)
  })

  it('niceVnd: nearest ...9.000d, a tie goes to the lower price', () => {
    expect(niceVnd(26_000)).toBe(29_000)
    expect(niceVnd(182_000)).toBe(179_000)
    expect(niceVnd(494_000)).toBe(489_000)
    expect(niceVnd(936_000)).toBe(939_000)
    expect(niceVnd(1_716_000)).toBe(1_719_000)
    expect(niceVnd(29_000)).toBe(29_000)
  })

  it('the configured VND prices are the proposal computed from USD x the configured rate', () => {
    for (const r of priceTable(days)) expect(r.vnd).toBe(r.proposedVnd)
  })

  it('price table carries no per-day figure; Sunny about-per-month = price / 12, nearest 1.000d', () => {
    for (const r of priceTable(days)) expect(Object.keys(r).sort()).toEqual(['days', 'id', 'proposedVnd', 'usd', 'vnd'])
    expect(monthlyApproxVnd(1_719_000, 365)).toBe(143_000)
    expect(monthlyApproxVnd(SUBSCRIPTION_PRICES.plans.sunny.vnd, 365)).toBe(Math.round(SUBSCRIPTION_PRICES.plans.sunny.vnd / 12 / 1000) * 1000)
  })
})
