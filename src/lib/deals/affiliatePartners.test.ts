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
    // Agoda is tracked by its own partner id (cid), so it may still be listed; nothing that needs ACCESSTRADE may be
    const ids = affiliatePartnerCards().map((c) => c.providerId)
    expect(ids).not.toContain('vexere')
    expect(ids).not.toContain('traveloka')
  })

  it('never lists a provider outside the implemented ones (no Shopee / Booking.com / pending partners)', () => {
    vi.stubEnv('ACCESSTRADE_PUBLISHER_ID', '6277265300509373567')
    for (const c of affiliatePartnerCards()) expect(['traveloka', 'vexere', 'agoda', 'lazada']).toContain(c.providerId)
  })

  it('Agoda and Lazada are candidates too (owner 20/11: the page shows Accesstrade, Lazada, Agoda, Vexere) and every listed card carries a tracked link', () => {
    vi.stubEnv('ACCESSTRADE_PUBLISHER_ID', '6277265300509373567')
    const cards = affiliatePartnerCards({ locale: 'vi' })
    const agoda = cards.find((c) => c.providerId === 'agoda')
    const lazada = cards.find((c) => c.providerId === 'lazada')
    expect(agoda).toBeTruthy()
    expect(lazada).toBeTruthy()
    expect(agoda!.url).toContain('cid=')
    expect(lazada!.url).toMatch(/^https:\/\//)
  })

  it('a resolver that throws or returns nothing yields no cards', () => {
    expect(affiliatePartnerCards({}, (() => { throw new Error('x') }) as never)).toEqual([])
    expect(affiliatePartnerCards({}, (() => ({ ok: false, issues: [] })) as never)).toEqual([])
  })
})
