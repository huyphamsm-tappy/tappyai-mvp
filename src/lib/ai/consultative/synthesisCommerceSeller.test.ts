// Owner UAT 02/11 (approved): "tra cứu link mua sắm trên shopee bị sai thông tin và giá tiền". Reproduced on localhost (SSD ADATA SU650
// 256GB): the card showed 990.000₫ - Tin Học Ngôi Sao's price - with "Mua trên Shopee" leading to a 512GB listing; the next card, a Shopee
// listing, led to a Lazada page of another product. A row's marketplace links are looked up by the product's title; they were taken as
// that row's purchase button whatever shop the row was. A card's purchase links now come only from the shop that sells that offer.
import { describe, it, expect } from 'vitest'
import { buildShoppingSynthesis } from './synthesis'
import { buildSynthesisView } from './synthesisView'
import type { Candidate } from './candidate'
import type { Pick } from './pick'
import { COMMERCE_LINKS_KEY } from '@/lib/ccp/row'

const link = (providerId: string, merchantName: string, url: string) => ({
  linkId: `${providerId}-1`, requestId: 'r1', url, destinationUrl: url, kind: 'DETAIL_HANDOFF', providerId, merchantName,
  domain: 'shopping', intentType: 'purchase', capability: 'product_purchase', primary: true, depth: 3, guestDepth: 2,
  authenticatedDepth: 5, authRequiredAt: 'before_selection', freshness: { freshnessType: 'static' },
})
const cand = (name: string, seller: string, priceVnd: number | null, links: unknown[]): Candidate => ({
  id: `${seller}:${name}`, name, domain: 'shopping',
  attrs: { ...(priceVnd ? { priceVnd } : {}) },
  link: `https://shop.example/${encodeURIComponent(seller)}`,
  raw: { title: name, source: seller, ...(priceVnd ? { price_vnd: priceVnd } : {}), link: `https://shop.example/${encodeURIComponent(seller)}`, [COMMERCE_LINKS_KEY]: links },
})
const SHOPEE_512 = link('shopee', 'Shopee', 'https://shopee.vn/SSD-ADATA-SU650-512GB-i.755210908.50707091217')
const SHOPEE_256 = link('shopee', 'Shopee', 'https://shopee.vn/SSD-Adata-SU650-256GB-i.97485054.25785172218')
const LAZADA_OTHER = link('lazada', 'Lazada', 'https://www.lazada.vn/products/ssd-adata-su650-512gb-i2765078342.html')
const LAZADA_SAME = link('lazada', 'Lazada', 'https://www.lazada.vn/products/ssd-adata-su650-256gb-i2765070000.html')
const pickOf = (c: Candidate): Pick => ({ candidate: c, reasons: [], runnerUp: null, conditional: false, unverified: [], cannotVerify: [] })

function viewOf(cands: Candidate[]) {
  return buildSynthesisView(buildShoppingSynthesis(cands, pickOf(cands[0]), 'SSD ADATA SU650 256GB'))
}

describe("a card's purchase links come from the shop that sells that offer", () => {
  it('a store\'s offer (Tin Học Ngôi Sao, 990.000₫) gets no Shopee button found by its title', () => {
    const v = viewOf([cand('Ổ cứng gắn trong/ SSD ADATA SU650 SATA', 'Tinhocngoisao.com', 990_000, [SHOPEE_512])])
    const e = v.entities[0]
    expect(e.offers[0].seller).toBe('Tinhocngoisao.com')
    expect(e.commerce).toBeUndefined()
    expect(e.commerceLinks).toBeUndefined()
  })
  it('a Shopee offer keeps its Shopee link and drops another marketplace\'s', () => {
    const v = viewOf([cand('Ổ cứng SSD Adata SU650 256GB SATA III 2.5"', 'Shopee', null, [LAZADA_OTHER, SHOPEE_256])])
    const e = v.entities[0]
    expect(e.commerce?.providerId).toBe('shopee')
    expect(e.commerceLinks?.map(l => l.providerId)).toEqual(['shopee'])
  })
  it('another shop\'s page of the SAME variant stays beside the card, never leading it', () => {
    const v = viewOf([cand('Ổ cứng SSD Adata SU650 256GB SATA III 2.5"', 'Shopee', null, [LAZADA_SAME, SHOPEE_256])])
    const e = v.entities[0]
    expect(e.commerce?.providerId).toBe('shopee')
    expect(e.commerceLinks?.map(l => l.providerId).sort()).toEqual(['lazada', 'shopee'])
  })
  it('a shop named with its marketplace ("Shopee Mall - ADATA") is that marketplace', () => {
    const v = viewOf([cand('SSD ADATA SU650 256GB', 'Shopee Mall - ADATA Official', 1_050_000, [SHOPEE_256])])
    expect(v.entities[0].commerce?.providerId).toBe('shopee')
  })
})
