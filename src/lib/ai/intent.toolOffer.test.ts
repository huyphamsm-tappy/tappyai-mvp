// @vitest-environment node
// Round 3h · Việc 4-5: ROUTE_TOOL_OFFER_GUARD (intent.ts). A bare buy verb "mua" OFFERS shopping and no longer FORCES search_products when the
// flag is ON. OFF (the default) is the old behaviour, locked. Pure function, no network: detectForcedTool only reads the text.
// D8 and D2 below are the dev-probe sentences copied verbatim (consultative-round3d/dev-probe.txt); they are regression cases, not the rule.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectForcedTool, routeToolOfferOn } from './intent'

const FLAG = 'ROUTE_TOOL_OFFER_GUARD'
// The bench prerequisites (round 3h-3 lock): the flag is effective only with the spend gate and its confirmation set.
const BENCH = { BENCH_SPEND_GATE: '1', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.10' } as const
// VERCEL_ENV and NODE_ENV are NOT touched here: the production-lock cases pass them to routeToolOfferOn(env) explicitly, so process.env keeps its own NODE_ENV.
const KEYS = [FLAG, 'BENCH_SPEND_GATE', 'BENCH_SPEND_RUN_CAP_USD', 'BENCH_CONFIRM_SPEND']
beforeEach(() => { for (const k of KEYS) delete process.env[k] })
afterEach(() => { for (const k of KEYS) delete process.env[k] })
const on = () => { process.env[FLAG] = '1'; Object.assign(process.env, BENCH) }

const D8 = 'Hiện nay giá vàng SJC mua vào, bán ra khoảng bao nhiêu? Nêu thời điểm của số liệu và nguồn.'
const D2 = 'Giải thích ngắn gọn khác biệt giữa pin lithium-ion và pin LiFePO4 cho xe máy điện.'

describe('the flag is read at call time; 1/on/true turn it on ONLY inside a bench run (round 3h-3 lock)', () => {
  it('value parsing: 1/on/true are "set"; 0/off/empty/unset are not (bench prerequisites present)', () => {
    const bench = { ...BENCH }
    expect(routeToolOfferOn({ ...bench, [FLAG]: '1' })).toBe(true)
    expect(routeToolOfferOn({ ...bench, [FLAG]: 'on' })).toBe(true)
    expect(routeToolOfferOn({ ...bench, [FLAG]: 'TRUE' })).toBe(true)
    expect(routeToolOfferOn({ ...bench, [FLAG]: '0' })).toBe(false)
    expect(routeToolOfferOn({ ...bench, [FLAG]: 'off' })).toBe(false)
    expect(routeToolOfferOn({ ...bench, [FLAG]: '' })).toBe(false)
    expect(routeToolOfferOn({ ...bench })).toBe(false)
  })
  it('(i) the flag alone, with no bench run: NOT effective (behaviour = baseline)', () => {
    expect(routeToolOfferOn({ [FLAG]: '1' })).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: '1', BENCH_SPEND_GATE: '1' })).toBe(false) // no confirmation
    expect(routeToolOfferOn({ [FLAG]: '1', BENCH_CONFIRM_SPEND: '0.10', BENCH_SPEND_RUN_CAP_USD: '0.10' })).toBe(false) // no gate
    expect(routeToolOfferOn({ ...BENCH, [FLAG]: '1', BENCH_SPEND_GATE: '0' })).toBe(false)
  })
  it('(i-b) the confirmation must equal the run cap: a stray value does not enable the flag (review 3H-3 finding 3)', () => {
    expect(routeToolOfferOn({ [FLAG]: '1', BENCH_SPEND_GATE: '1', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.05' })).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: '1', BENCH_SPEND_GATE: '1', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: 'yes' })).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: '1', BENCH_SPEND_GATE: '1', BENCH_CONFIRM_SPEND: '0.10' })).toBe(false) // no run cap
  })
  it('(ii) bench gate + confirmation equal to the run cap + flag: effective', () => {
    expect(routeToolOfferOn({ [FLAG]: '1', ...BENCH })).toBe(true)
  })
  it('(iii) no flag: not effective, even inside a bench run', () => {
    expect(routeToolOfferOn({ ...BENCH })).toBe(false)
  })
  it('production host: never effective, even with the flag and the bench variables', () => {
    expect(routeToolOfferOn({ [FLAG]: '1', ...BENCH, VERCEL_ENV: 'production' })).toBe(false)
    expect(routeToolOfferOn({ [FLAG]: '1', ...BENCH, NODE_ENV: 'production' })).toBe(false)
  })
  it('the lock is read at call time through process.env (flag alone = OFF behaviour in detectForcedTool)', () => {
    process.env[FLAG] = '1'
    expect(detectForcedTool(D8)).toBe('search_products') // flag alone: baseline
    Object.assign(process.env, BENCH)
    expect(detectForcedTool(D8)).toBe('get_gold_price') // with the bench gate: effective
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

// Round 3h-2 (fix 2): a buy-verb QUESTION is not forced to web_search by the bare "?" when ON. OFF keeps the old forced web_search.
describe('buy-verb questions: the bare "?" no longer forces web_search when ON (variants, not the acceptance set)', () => {
  const buyQuestions = [
    'nên mua laptop nào cho sinh viên?',
    'NÊN MUA LAPTOP NÀO CHO SINH VIÊN?',
    'nen mua laptop nao cho sinh vien?',
    'nên mua máy sấy tóc nào cho tóc dày?',
    'mua tai nghe nào tốt nhất cho tập luyện?',
    'MUA TAI NGHE NÀO TỐT NHẤT CHO TẬP LUYỆN?',
  ]
  for (const text of buyQuestions) {
    it(`OFF: the old bare "mua" forces search_products first: ${text}`, () => {
      expect(detectForcedTool(text)).toBe('search_products')
    })
    it(`ON: not forced to web_search: ${text}`, () => {
      on()
      expect(detectForcedTool(text)).not.toBe('web_search')
      expect(detectForcedTool(text)).not.toBe('search_products')
    })
  }
  it('ON: a lookup word still forces web_search on a buy-verb turn (the specific rule is kept)', () => {
    on()
    expect(detectForcedTool('mua USD tỷ giá hôm nay bao nhiêu')).toBe('web_search')
  })
})

describe('ON and OFF: the dance "nhảy múa" is still not a buy verb', () => {
  it('"nhảy múa" never forces products', () => {
    expect(detectForcedTool('tối nay đi nhảy múa không')).not.toBe('search_products')
    on()
    expect(detectForcedTool('tối nay đi nhảy múa không')).not.toBe('search_products')
  })
})
