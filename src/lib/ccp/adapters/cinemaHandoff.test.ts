import { describe, it, expect } from 'vitest'
import type { CommerceRequest } from '../domain/types'
import { PASSTHROUGH_ADAPTERS } from './handoff'

// A cinema chain's film page is a FILM handoff: it must never carry restaurant copy or metadata.
const req: CommerceRequest = { domain: 'entertainment', intentType: 'buy_ticket', subject: 'Trại Buôn Người', configuration: { kind: 'cinema', filmRef: 'trai-buon-nguoi', date: '2026-10-20' } }
const FILM_PAGES: Array<[string, string]> = [
  ['galaxy', 'https://www.galaxycine.vn/dat-ve/trai-buon-nguoi/'],
  ['lotte', 'https://www.lottecinemavn.com/LCHS/Contents/Movie/Movie-List.aspx'],
]
const RESTAURANT = /món|nhà hàng|restaurant/i

describe('cinema passthrough handoff', () => {
  for (const [id, url] of FILM_PAGES) {
    it(`${id}: film page → film metadata and cinema copy, no restaurant copy`, () => {
      const a = PASSTHROUGH_ADAPTERS.find(x => x.providerId === id)!
      const offer = a.toOffer(req, { url }, new Date('2026-10-06T10:00:00+07:00'))!
      expect(offer).toBeTruthy()
      const link = a.buildDirectLink(offer, req.configuration)!
      expect(link.paramsPreserved).toEqual(['filmRef'])
      expect(link.paramsPageOnly).toEqual(expect.arrayContaining(['cinemaRef', 'date', 'showtime']))
      const all = JSON.stringify([link.paramsPreserved, link.paramsPageOnly, link.limitations])
      expect(all).not.toMatch(RESTAURANT)
      expect(all).not.toMatch(/restaurantRef|items|address/)
      expect(link.limitations[0]).toMatch(/rạp|suất chiếu/)
    })
  }
  it('food and retail passthroughs keep their own copy', () => {
    const shopee = PASSTHROUGH_ADAPTERS.find(x => x.providerId === 'shopeefood')!
    const o = shopee.toOffer({ domain: 'food_drink', intentType: 'order_delivery', subject: 'x' }, { url: 'https://shopeefood.vn/ho-chi-minh/quan-a' }, new Date())!
    expect(shopee.buildDirectLink(o, undefined)!.paramsPreserved).toEqual(['restaurantRef'])
    const cp = PASSTHROUGH_ADAPTERS.find(x => x.providerId === 'cellphones')!
    const p = cp.toOffer({ domain: 'shopping', intentType: 'buy_product', subject: 'x' }, { url: 'https://cellphones.com.vn/iphone-15.html' }, new Date())!
    expect(cp.buildDirectLink(p, undefined)!.paramsPreserved).toEqual(['productRef'])
  })
})
