import { afterEach, describe, expect, it, vi } from 'vitest'
import { affiliatePartnerCards } from './affiliatePartners'

// Deals page fallback: only providers with a really tracked affiliate link are listed.
afterEach(() => vi.unstubAllEnvs())

describe('affiliatePartnerCards', () => {
  it('with the ACCESSTRADE publisher id set, Vexere resolves to a tracked ACCESSTRADE deep link on the real campaign', () => {
    vi.stubEnv('ACCESSTRADE_PUBLISHER_ID', '6277265300509373567')
    const cards = affiliatePartnerCards({ locale: 'vi' })
    const vexere = cards.find((c) => c.providerId === 'vexere')!
    expect(vexere).toBeTruthy()
    expect(vexere.url).toMatch(/^https:\/\/go\.isclix\.com\/deep_link\/6277265300509373567\/5222734619328835827\?url=/)
    expect(decodeURIComponent(vexere.url)).toContain('url=https://vexere.com/vi-VN')
  })

  it('an identified visitor goes through Tappy\'s own /go/at click route (attribution is recorded there)', async () => {
    vi.stubEnv('ACCESSTRADE_PUBLISHER_ID', '6277265300509373567')
    vi.stubEnv('CCP_ATTRIBUTION_SECRET', 'x'.repeat(40))
    const { sealIdentity } = await import('@/lib/ccp/tracking/clickLink')
    const seal = sealIdentity('11111111-1111-4111-8111-111111111111')
    const vexere = affiliatePartnerCards({ actorSeal: seal }).find((c) => c.providerId === 'vexere')!
    expect(new URL(vexere.url).pathname).toBe('/go/at')
  })

  it('without the publisher id nothing is tracked, so no partner card is listed (never an untracked outbound link)', () => {
    vi.stubEnv('ACCESSTRADE_PUBLISHER_ID', '')
    expect(affiliatePartnerCards()).toEqual([])
  })

  it('never lists a provider outside the two implemented ones (no Agoda / Shopee / Booking.com / pending partners)', () => {
    vi.stubEnv('ACCESSTRADE_PUBLISHER_ID', '6277265300509373567')
    for (const c of affiliatePartnerCards()) expect(['traveloka', 'vexere']).toContain(c.providerId)
  })

  it('a resolver that throws or returns nothing yields no cards', () => {
    expect(affiliatePartnerCards({}, (() => { throw new Error('x') }) as never)).toEqual([])
    expect(affiliatePartnerCards({}, (() => ({ ok: false, issues: [] })) as never)).toEqual([])
  })
})
