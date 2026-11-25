import { describe, it, expect } from 'vitest'
import { mySubscription, canBuyPlan } from './subscriptionState'

// Owner 20/11: a plan that is still running can be topped up: buying again ADDS the days to the end date (10 days left + one more month = 40 days). The database already adds the time
// (p8_apply_entitlement 'stack'); this is the rule for WHO may buy WHAT while a plan runs: the same kind of plan only, never a store plan (it would be billed twice), never the one-time trial.
const NOW = new Date('2026-11-20T00:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()
const row = (plan: string, source: string, days = 10) => ({ plan, status: 'active', current_period_end: inDays(days), source })

describe('mySubscription: buying while a plan runs', () => {
  it('a running WEB plan can be bought again; a store plan or a staff grant cannot; an ended plan can', () => {
    expect(mySubscription(row('coco', 'web_sepay'), { now: NOW }).canBuy).toBe(true)
    expect(mySubscription(row('coco', 'google_play'), { now: NOW }).canBuy).toBe(false)
    expect(mySubscription(row('coco', 'apple_iap'), { now: NOW }).canBuy).toBe(false)
    expect(mySubscription(row('coco', 'manual'), { now: NOW }).canBuy).toBe(false)
    expect(mySubscription(row('coco', 'web_sepay', -1), { now: NOW }).canBuy).toBe(true)
  })
})

describe('canBuyPlan: which plan may be bought while one runs', () => {
  const web = (plan: string) => mySubscription(row(plan, 'web_sepay'), { now: NOW })
  it('the same kind: Coco (momo, coco) tops up Coco, Tappy (promax1m, promax3m) tops up Tappy, a longer or shorter period of the same kind included', () => {
    expect(canBuyPlan(web('coco'), 'coco')).toBe(true)
    expect(canBuyPlan(web('coco'), 'momo')).toBe(true)
    expect(canBuyPlan(web('momo'), 'coco')).toBe(true)
    expect(canBuyPlan(web('promax1m'), 'promax3m')).toBe(true)
    expect(canBuyPlan(web('promax3m'), 'promax1m')).toBe(true)
  })
  // owner 20/11 (second ruling): an UPGRADE is allowed (Coco -> Tappy: the account moves to Tappy and the Coco days left are added to the end date), a downgrade never
  it('an upgrade is allowed: Coco (or the trial) can buy Tappy', () => {
    expect(canBuyPlan(web('coco'), 'promax1m')).toBe(true)
    expect(canBuyPlan(web('momo'), 'promax3m')).toBe(true)
    expect(canBuyPlan(web('pip'), 'promax1m')).toBe(true)
  })
  it('a downgrade is refused: Tappy can not buy Coco, MoMo or the trial', () => {
    expect(canBuyPlan(web('promax1m'), 'coco')).toBe(false)
    expect(canBuyPlan(web('promax3m'), 'momo')).toBe(false)
    expect(canBuyPlan(web('promax1m'), 'pip')).toBe(false)
  })
  it('the one-time trial (pip) is never bought on top of a running plan, but a running trial can be topped up with Coco', () => {
    expect(canBuyPlan(web('coco'), 'pip')).toBe(false)
    expect(canBuyPlan(web('pip'), 'pip')).toBe(false)
    expect(canBuyPlan(web('pip'), 'coco')).toBe(true)
  })
  it('a store plan accepts nothing; no plan or an ended one accepts anything on sale', () => {
    expect(canBuyPlan(mySubscription(row('coco', 'google_play'), { now: NOW }), 'coco')).toBe(false)
    expect(canBuyPlan(mySubscription(null, { now: NOW }), 'promax1m')).toBe(true)
    expect(canBuyPlan(mySubscription(row('coco', 'web_sepay', -1), { now: NOW }), 'pip')).toBe(true)
  })
})
