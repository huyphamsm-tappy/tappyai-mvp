// @vitest-environment node
// Round 3h · Việc 5: ROUTE_TOOL_OFFER_GUARD across the consultative layers. MOCK-ONLY and pure: no network, no model. Each layer below is
// a deterministic function of the text. What a real Luna call would choose is NOT tested here (UNVERIFIED until a paid run).
// The D8 and D2 sentences are the dev-probe sentences verbatim (consultative-round3d/dev-probe.txt): regression cases, not the rule.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveSearchNow } from './searchNow'
import { deriveSituation } from './situationFrame'
import { deriveNeedProfile } from './needProfile'
import { deriveDecisionFrame } from './decisionFrame'
import { consultTools } from './leanConsultPrompt'
import { detectForcedTool, detectMovieRecommendationIntent } from '../intent'

const FLAG = 'ROUTE_TOOL_OFFER_GUARD'
const GPS = { lat: 10.7769, lng: 106.7009 }
const D8 = 'Hiện nay giá vàng SJC mua vào, bán ra khoảng bao nhiêu? Nêu thời điểm của số liệu và nguồn.'
const D2 = 'Giải thích ngắn gọn khác biệt giữa pin lithium-ion và pin LiFePO4 cho xe máy điện.'

// The flag is effective only inside a bench run (round 3h-3 lock): the spend gate and its confirmation are set with it.
const LOCK_KEYS = [FLAG, 'BENCH_SPEND_GATE', 'BENCH_SPEND_RUN_CAP_USD', 'BENCH_CONFIRM_SPEND']
beforeEach(() => { for (const k of LOCK_KEYS) delete process.env[k] })
afterEach(() => { for (const k of LOCK_KEYS) delete process.env[k] })

/** The pre-search a turn would make (searchNow), with the flag set as given. `afterClarify` = the text is "request — answer" after a clarify. */
function preSearch(text: string, flagOn: boolean, afterClarify = false) {
  if (flagOn) { process.env[FLAG] = '1'; process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.10'; process.env.BENCH_CONFIRM_SPEND = '0.10' } else delete process.env[FLAG]
  const messages = [{ role: 'user', content: text }]
  const need = deriveNeedProfile(messages, { gps: GPS as never })
  const situation = deriveSituation([text], need, { hasGps: true })
  const forced = detectForcedTool(text)
  const frame = deriveDecisionFrame({ messages, need, planningIntent: null, forcedTool: forced, hasGps: true, storedPreferences: null, now: new Date('2026-10-24T12:00:00+07:00') } as never)
  return {
    forced,
    shopping: frame.domains.includes('shopping'),
    need,
    searchNow: deriveSearchNow({ text, situation, frame, need, forcedTool: forced, isFirstReply: true, movieRecommend: detectMovieRecommendationIntent(text), afterClarify }),
  }
}

// Round 3h-2 (Owner decision A): a purchase whose product is NOT in the known family list (SUBJECTS) gets no forced product pre-search when ON.
// The model is offered search_products AND web_search and chooses. This is a measured risk for a later paid run (UNVERIFIED), not a proven regression.
describe('ON: a purchase outside the known families is offered both shopping tools, not forced (patch behaviour; not an Owner product decision)', () => {
  const OUTSIDE = 'mua máy sấy tóc Philips'
  it('the sentence really is outside the known families (precondition)', () => {
    expect(preSearch(OUTSIDE, true).need.subject).toBeNull()
  })
  it('ON: no product pre-search and no forced tool', () => {
    const r = preSearch(OUTSIDE, true)
    expect(r.forced).toBeNull()
    expect(r.searchNow).toBeNull()
  })
  it('ON: the tool list for the shopping domain holds BOTH search_products and web_search', () => {
    expect(consultTools(['shopping'], { shoppingWebSearch: true })).toEqual(expect.arrayContaining(['search_products', 'web_search']))
  })
  it('OFF (old): the same purchase is pre-searched as a product (the baseline this decision changes)', () => {
    expect(preSearch(OUTSIDE, false).searchNow?.type).toBe('product')
  })
})

describe('ON (fix 3): the clarify answer is searched before the model only for a KNOWN family', () => {
  const GOLD_ANSWER = 'quà sinh nhật cho bạn gái tầm 1tr — giá vàng SJC'
  const KNOWN_ANSWER = 'quà sinh nhật cho bạn gái tầm 1tr — nước hoa'
  it('ON: a free-text answer about gold is not a product query', () => {
    expect(preSearch(GOLD_ANSWER, true, true).searchNow).toBeNull()
  })
  it('OFF (old): the same answer is searched as a product (the baseline)', () => {
    expect(preSearch(GOLD_ANSWER, false, true).searchNow?.type).toBe('product')
  })
  it('ON: a known family after a clarify is still searched, exactly as before', () => {
    expect(preSearch(KNOWN_ANSWER, true, true).searchNow).toEqual({ query: 'nước hoa', type: 'product', exact: true })
    expect(preSearch(KNOWN_ANSWER, false, true).searchNow).toEqual({ query: 'nước hoa', type: 'product', exact: true })
  })
})

describe('regression D8 (gold price, "mua vào"): ON stops the product pre-search and keeps the tools to answer', () => {
  it('OFF (old): the bare buy verb forces search_products and pre-searches products', () => {
    const r = preSearch(D8, false)
    expect(r.forced).toBe('search_products')
    expect(r.searchNow?.type).toBe('product')
  })
  it('ON: no forced product tool, no product pre-search', () => {
    const r = preSearch(D8, true)
    expect(r.forced).toBe('get_gold_price')
    expect(r.searchNow).toBeNull()
  })
  it('ON: the shopping tool list also offers web_search (a price lookup can be answered from the web), and does not force it', () => {
    const tools = consultTools(['shopping'], { shoppingWebSearch: true })
    expect(tools).toEqual(expect.arrayContaining(['search_products', 'web_search']))
  })
})

describe('regression D2 (battery knowledge, "xe máy điện"): no product pre-search in either mode', () => {
  it('OFF and ON: no product pre-search and no forced tool', () => {
    for (const flag of [false, true]) {
      const r = preSearch(D2, flag)
      expect(r.forced).toBeNull()
      expect(r.searchNow).toBeNull()
    }
  })
  it('ON: the tool list offers web_search for a shopping turn, never forced', () => {
    expect(consultTools(['shopping'], { shoppingWebSearch: true })).toContain('web_search')
  })
})

describe('OFF is the old tool list (locked)', () => {
  it('consultTools without the option is unchanged: shopping = search_products only', () => {
    expect(consultTools(['shopping'])).toEqual(['search_products'])
    expect(consultTools(['shopping'], { shoppingWebSearch: false })).toEqual(['search_products'])
  })
  it('the web_search offer never appears for a non-shopping domain', () => {
    expect(consultTools(['food'], { shoppingWebSearch: true })).not.toContain('web_search')
  })
})

describe('ON keeps a real purchase of a KNOWN product family: the product pre-search still runs', () => {
  const buys = [
    'tôi muốn mua tai nghe dưới 1 triệu',
    'toi muon mua tai nghe duoi 1 trieu',
    'TÔI MUỐN MUA TAI NGHE DƯỚI 1 TRIỆU',
    'mình cần mua máy lọc không khí cho phòng ngủ 20m2',
    'nên mua laptop nào cho sinh viên',
  ]
  for (const text of buys) {
    it(`ON: product pre-search: ${text}`, () => {
      const r = preSearch(text, true)
      expect(r.searchNow?.type).toBe('product')
    })
  }
})

describe('request count: ON never makes more product pre-searches than OFF (mock, over the test sentences)', () => {
  const sentences = [D8, D2, ...buysAndOthers()]
  it('for every sentence the ON pre-search count is ≤ the OFF count', () => {
    for (const text of sentences) {
      const off = preSearch(text, false).searchNow ? 1 : 0
      const on = preSearch(text, true).searchNow ? 1 : 0
      expect(on, text).toBeLessThanOrEqual(off)
    }
  })
})

describe('no per-sentence rule in the new code (static scan of the files this round changed)', () => {
  it('searchNow.ts and leanConsultPrompt.ts do not hard-code the probe words', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = path.resolve(__dirname)
    for (const f of ['searchNow.ts', 'leanConsultPrompt.ts']) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      for (const word of ['SJC', 'LiFePO4', 'lithium', 'xe máy điện', 'xe may dien']) expect(src.includes(word), `${f} contains "${word}"`).toBe(false)
    }
  })
})

function buysAndOthers(): string[] {
  return [
    'tôi muốn mua tai nghe dưới 1 triệu',
    'giá iphone 15 hôm nay bao nhiêu',
    'quán bún chả nào gần Hoàn Kiếm',
    'gợi ý phim hài để xem tối nay',
    'giải thích vì sao bầu trời màu xanh',
  ]
}
