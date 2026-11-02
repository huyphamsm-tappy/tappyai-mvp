// @vitest-environment node
// Phase 7 closeout CP5 — ONE canonical subscription catalog drives the page; the old pricing is gone everywhere.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { FREE_DAILY_LIMIT, ANON_LIFETIME_LIMIT } from '@/lib/config/product'
import { subscriptionCatalog } from './subscriptionCatalog'

describe('canonical catalog', () => {
  it('Guest 5 lifetime · Free 10/day · Pip/Momo/Coco/Milo/Sunny 30/day at $1/$7/$19/$36/$66 for 7/30/90/180/365 days', () => {
    expect(ANON_LIFETIME_LIMIT).toBe(5)
    expect(FREE_DAILY_LIMIT).toBe(10)
    const c = subscriptionCatalog({ env: { SUBSCRIPTIONS_ENABLED: '1' } as unknown as NodeJS.ProcessEnv })
    expect(c.guest.aiQuestions).toBe(5)
    expect(c.free.dailyAiQuestions).toBe(10)
    expect(c.plans.map(p => p.id)).toEqual(['pip', 'momo', 'coco', 'milo', 'sunny'])
    for (const p of c.plans) expect(p.dailyAiQuestions).toBe(30)
    expect(c.plans.map(p => [p.priceUsd, p.durationDays])).toEqual([[1, 7], [7, 30], [19, 90], [36, 180], [66, 365]])
  })
})

describe('the old pricing has disappeared', () => {
  it('no legacy Pro view, no Stripe 99K button', () => {
    expect(existsSync('src/app/(app)/subscription/SubscriptionView.tsx')).toBe(false)
    expect(existsSync('src/components/StripeCheckoutButton.tsx')).toBe(false)
    const page = readFileSync('src/app/(app)/subscription/page.tsx', 'utf8')
    expect(page).not.toMatch(/SubscriptionView\b/)
    expect(page).toMatch(/paymentsOpen=\{false\}/)
  })
  it('no "99K" price and no "unlimited" plan copy in any shipped source file', () => {
    const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src'], { encoding: 'utf8' }).split('\n')
      .filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\.|__tests__|__fixtures__/.test(f) && existsSync(f))
    const hits = files.filter(f => /99K\s*\/\s*(?:tháng|month)|Pro — 99K|99\.000\s*đ\s*\/\s*tháng/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
    const vi = readFileSync('src/lib/i18n/v3/web.ts', 'utf8') + readFileSync('src/lib/i18n/w2/profile.ts', 'utf8')
    expect(vi).not.toMatch(/Trải nghiệm không giới hạn|Không giới hạn tin nhắn|Tin nhắn không giới hạn/)
  })
})

describe('payments not open yet: plans visible, checkout not offered', () => {
  it('SubscriptionFlow blocks pay() and disables the button when paymentsOpen is false', () => {
    const flow = readFileSync('src/components/subscription/SubscriptionFlow.tsx', 'utf8')
    expect(flow).toMatch(/if \(!paymentsOpen\) \{ setError\(t\('sub\.paymentsSoon'\)\); return \}/)
    expect(flow).toMatch(/disabled=\{busy \|\| !paymentsOpen\}/)
  })
})
