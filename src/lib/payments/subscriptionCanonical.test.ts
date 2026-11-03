// @vitest-environment node
// Phase 7 closeout CP5 — ONE canonical subscription catalog drives the page; the old pricing is gone everywhere.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { FREE_DAILY_LIMIT, ANON_LIFETIME_LIMIT, PAID_DAILY_CEILING, ACCOUNT_QUESTIONS_UNLIMITED } from '@/lib/config/product'
import { subscriptionCatalog } from './subscriptionCatalog'

describe('canonical catalog', () => {
  it('Guest 10 lifetime · accounts unlimited (hidden ceiling Free 300/day, every sale plan 1000/day) at $1/$7/$9/$18.9/$24.3 for 7/30/30/90/90 days', () => {
    // owner 01/11/2026: guest 5 -> 10, Free 10 -> 300, paid 30 -> 1000 (accounts have no visible limit; hidden anti-abuse ceiling)
    expect(ANON_LIFETIME_LIMIT).toBe(10)
    expect(FREE_DAILY_LIMIT).toBe(300)
    expect(PAID_DAILY_CEILING).toBe(1000)
    expect(ACCOUNT_QUESTIONS_UNLIMITED).toBe(true)
    const c = subscriptionCatalog({ env: { SUBSCRIPTIONS_ENABLED: '1' } as unknown as NodeJS.ProcessEnv })
    expect(c.guest.aiQuestions).toBe(ANON_LIFETIME_LIMIT)
    expect(c.free.dailyAiQuestions).toBe(FREE_DAILY_LIMIT)
    // Owner 01/11/2026: new plan catalog
    expect(c.plans.map(p => p.id)).toEqual(['pip', 'momo', 'promax1m', 'coco', 'promax3m'])
    for (const p of c.plans) expect(p.dailyAiQuestions).toBe(PAID_DAILY_CEILING)
    expect(c.plans.map(p => [p.priceUsd, p.durationDays])).toEqual([[1, 7], [7, 30], [9, 30], [18.9, 90], [24.3, 90]])
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
