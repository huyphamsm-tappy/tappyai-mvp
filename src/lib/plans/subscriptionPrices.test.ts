import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PLAN_CONFIG, PAID_PLAN_IDS, SALE_PLAN_IDS } from './planConfig'
import { SUBSCRIPTION_PRICES, monthlyApproxVnd } from './subscriptionPrices'

// SUBSCRIPTIONS - prices live in subscriptionPrices.json. VND is a FIXED catalog value; USD is only a label.

describe('subscription prices (fixed catalog)', () => {
  it('the approved VND amounts and USD labels, exactly', () => {
    expect(PAID_PLAN_IDS.map((id) => [id, PLAN_CONFIG[id].priceUsd, PLAN_CONFIG[id].priceVnd, PLAN_CONFIG[id].durationDays])).toEqual([
      // Owner 01/11/2026: new plan catalog (VND = USD x 25.000; milo/sunny keep their old values, not sold)
      ['pip', 1, 25_000, 7], ['momo', 7, 175_000, 30], ['coco', 18.9, 472_500, 90], ['promax1m', 9, 225_000, 30], ['promax3m', 24.3, 607_500, 90],
      ['milo', 36, 939_000, 180], ['sunny', 66, 1_719_000, 365],
    ])
    // Owner 01/11/2026: new plan catalog - the plans on sale, exactly
    expect(SALE_PLAN_IDS).toEqual(['pip', 'momo', 'coco', 'promax1m', 'promax3m'])
    expect(PLAN_CONFIG.promax1m.storeProductId).toBe('tappy_promax_1m')
    expect(PLAN_CONFIG.promax3m.storeProductId).toBe('tappy_promax_3m')
  })

  it('PLAN_CONFIG takes its prices from the config file', () => {
    for (const id of PAID_PLAN_IDS) expect(PLAN_CONFIG[id].priceVnd).toBe(SUBSCRIPTION_PRICES.plans[id].vnd)
  })

  it('there is no exchange rate anywhere in the payment path', () => {
    expect(Object.keys(SUBSCRIPTION_PRICES).filter((k) => k !== '_comment')).toEqual(['plans'])
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && files.push(p) } }
    for (const d of ['src/lib/payments', 'src/lib/plans', 'src/app/api/payments', 'src/components/subscription', 'src/components/payments']) walk(d)
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/fxVndPerUsd|exchange|26[_.,]?000\s*\*|\*\s*26[_.,]?000|usd\s*\*/i)
  })

  it('Sunny about-per-month = price / 12, nearest 1.000d', () => {
    expect(monthlyApproxVnd(1_719_000, 365)).toBe(143_000)
  })
})
