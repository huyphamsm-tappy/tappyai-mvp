// @vitest-environment node
// Round 3h · Việc 4-5: ROUTE_TOOL_OFFER_GUARD (intent.ts). A bare buy verb "mua" OFFERS shopping and no longer FORCES search_products when the
// flag is ON. OFF (the default) is the old behaviour, locked. Pure function, no network: detectForcedTool only reads the text.
// D8 and D2 below are the dev-probe sentences copied verbatim (consultative-round3d/dev-probe.txt); they are regression cases, not the rule.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectForcedTool, routeToolOfferOn } from './intent'

const FLAG = 'ROUTE_TOOL_OFFER_GUARD'
beforeEach(() => { delete process.env[FLAG] })
afterEach(() => { delete process.env[FLAG] })
const on = () => { process.env[FLAG] = '1' }

const D8 = 'Hiện nay giá vàng SJC mua vào, bán ra khoảng bao nhiêu? Nêu thời điểm của số liệu và nguồn.'
const D2 = 'Giải thích ngắn gọn khác biệt giữa pin lithium-ion và pin LiFePO4 cho xe máy điện.'

describe('the flag is read at call time and only 1/on/true turn it on', () => {
  it('routeToolOfferOn reads the current env', () => {
    expect(routeToolOfferOn({})).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: '1' })).toBe(true)
    expect(routeToolOfferOn({ [FLAG]: 'on' })).toBe(true)
    expect(routeToolOfferOn({ [FLAG]: 'TRUE' })).toBe(true)
    expect(routeToolOfferOn({ [FLAG]: '0' })).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: 'off' })).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: '' })).toBe(false)
  })
})

describe('OFF (default): the old behaviour, locked', () => {
  it('D8 is forced to search_products by the bare "mua" (the gold rule is shadowed)', () => {
    expect(detectForcedTool(D8)).toBe('search_products')
  })
  it('a bare buy verb forces search_products', () => {
    expect(detectForcedTool('tôi muốn mua áo khoác')).toBe('search_products')
  })
  it('D2 has no forced tool', () => {
    expect(detectForcedTool(D2)).toBeNull()
  })
})

describe('ON: regression D8 — the gold question is no longer forced to products', () => {
  it('D8 goes to the gold rule (get_gold_price), not search_products', () => {
    on()
    expect(detectForcedTool(D8)).toBe('get_gold_price')
  })
  it('D8 with the buy verb in other forms still reaches the gold rule', () => {
    on()
    expect(detectForcedTool('giá vàng SJC mua vào bao nhiêu')).toBe('get_gold_price')
    expect(detectForcedTool('GIA VANG SJC MUA VAO, BAN RA hom nay')).toBe('get_gold_price')
  })
})

describe('ON: regression D2 — a knowledge question stays unforced', () => {
  it('D2 is still not forced', () => {
    on()
    expect(detectForcedTool(D2)).toBeNull()
  })
})

describe('ON: a buy verb alone no longer forces (it offers, see the domain layers)', () => {
  const offersOnly = [
    'tôi muốn mua áo khoác',
    'toi muon mua ao khoac',
    'TÔI MUỐN MUA ÁO KHOÁC',
    'mua đôi giày chạy bộ',
  ]
  for (const text of offersOnly) {
    it(`ON: not forced to search_products: ${text}`, () => {
      on()
      expect(detectForcedTool(text)).not.toBe('search_products')
    })
  }
})

describe('ON: strong product signals still force search_products (unchanged)', () => {
  const strong = [
    'tìm sản phẩm tai nghe dưới 1 triệu',
    'tim san pham tai nghe duoi 1 trieu',
    'đặt hàng iPhone 15 cho mình nhé',
    'dat hang iphone 15 giup minh',
  ]
  for (const text of strong) {
    it(`ON: search_products: ${text}`, () => {
      on()
      expect(detectForcedTool(text)).toBe('search_products')
    })
  }
})

describe('ON and OFF: the dance "nhảy múa" is still not a buy verb', () => {
  it('"nhảy múa" never forces products', () => {
    expect(detectForcedTool('tối nay đi nhảy múa không')).not.toBe('search_products')
    on()
    expect(detectForcedTool('tối nay đi nhảy múa không')).not.toBe('search_products')
  })
})
