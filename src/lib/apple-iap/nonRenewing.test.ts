import { describe, it, expect } from 'vitest'
import { isNonRenewingProduct, nonRenewingPeriod, NON_RENEWING_PRODUCT_IDS } from './nonRenewing'

// A non-renewing App Store product (the 7-day Pip pack) has NO expiresDate. The server computes the end itself:
// the verified transaction's purchase date plus the plan's length. Never "now plus 7 days".

const DAY = 86_400_000

describe('isNonRenewingProduct', () => {
  it('the Pip pack is non-renewing; the auto-renewing products are not; unknown ids and empty input are not', () => {
    expect(NON_RENEWING_PRODUCT_IDS).toEqual(['tappy_pip_1w'])
    expect(isNonRenewingProduct('tappy_pip_1w')).toBe(true)
    for (const p of ['com.tappyai.ios.pro.monthly', 'tappy_coco_1m', 'tappy_pip_2w', '', null, undefined]) expect(isNonRenewingProduct(p as never)).toBe(false)
  })
})

describe('nonRenewingPeriod', () => {
  it('ends exactly 7 days after the purchase date, whenever the server happens to look', () => {
    const purchaseDate = Date.UTC(2026, 10, 20, 8, 30, 0)
    const p = nonRenewingPeriod({ purchaseDate }, 7)
    expect(p.startsAt.getTime()).toBe(purchaseDate)
    expect(p.expiresAt.getTime()).toBe(purchaseDate + 7 * DAY)
  })
  it('ignores any expiresDate the transaction might carry: the plan length is the only authority', () => {
    const purchaseDate = Date.UTC(2026, 10, 20)
    expect(nonRenewingPeriod({ purchaseDate, expiresDate: purchaseDate + 365 * DAY } as never, 7).expiresAt.getTime()).toBe(purchaseDate + 7 * DAY)
  })
  it('refuses a transaction without a usable purchase date or a plan without a length', () => {
    expect(() => nonRenewingPeriod({ purchaseDate: Number.NaN }, 7)).toThrow()
    expect(() => nonRenewingPeriod({ purchaseDate: 0 }, 7)).toThrow()
    expect(() => nonRenewingPeriod({ purchaseDate: Date.UTC(2026, 10, 20) }, 0)).toThrow()
  })
})
