// Phase 8 M0 — the eval's own scoring is pure and pinned here (runs in CI; no model, no network).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asksUser, evaluateTurn, fold, isAskOnly, keptRatio, outputKind, planContract, prose, topicCoverage, type Scenario } from './checks'
import { summarize } from './report'

const obs = (text: string, tools: Array<{ name: string; args?: unknown }> = [], annotations: Array<Record<string, unknown>> = []) =>
  ({ text, rawText: null, tools: tools.map(t => ({ name: t.name, args: t.args ?? {} })), annotations, crashed: false })
const byId = (rs: ReturnType<typeof evaluateTurn>, id: string) => rs.find(r => r.id === id)

describe('agent eval checks', () => {
  it('folds Vietnamese so patterns never depend on diacritics', () => {
    expect(fold('Máy lạnh ĐÀ LẠT')).toBe('may lanh da lat')
  })

  it('prose drops markers and FOLLOWUPS', () => {
    expect(prose('Xin chào [FOLLOWUPS]a|b[/FOLLOWUPS] [TAPPY_PLAN]{"days":[]}[/TAPPY_PLAN]')).toBe('Xin chào')
  })

  it('tool choice: none / any / list', () => {
    expect(byId(evaluateTurn({ tools: 'none' }, obs('Phở bò dùng xương bò, phở gà dùng gà; nước dùng khác hẳn.')), 'tool_choice')?.pass).toBe(true)
    expect(byId(evaluateTurn({ tools: 'none' }, obs('x'.repeat(30), [{ name: 'web_search' }])), 'tool_choice')?.pass).toBe(false)
    expect(byId(evaluateTurn({ tools: ['get_gold_price', 'web_search'] }, obs('x'.repeat(30), [{ name: 'web_search' }])), 'tool_choice')?.pass).toBe(true)
    expect(byId(evaluateTurn({ tools: 'any' }, obs('x'.repeat(30))), 'tool_choice')?.pass).toBe(false)
  })

  it('ask detection: a closing question asks; an ask-only reply is short, toolless and ends in "?"', () => {
    expect(asksUser('Bạn muốn đi đâu?')).toBe(true)
    expect(asksUser('Đây là 3 quán ngon. Chúc ngon miệng.')).toBe(false)
    // M0 baseline false negative: the question is followed by an offer.
    expect(asksUser('Cuối tuần này bạn muốn đi đâu? Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp.')).toBe(true)
    expect(isAskOnly('Bạn dùng laptop để làm gì và ngân sách bao nhiêu?', 0)).toBe(true)
    expect(isAskOnly('Bạn dùng laptop để làm gì?', 2)).toBe(false)
    expect(byId(evaluateTurn({ ask: false }, obs('Đây là gợi ý cho bạn. ' + 'Nội dung dài. '.repeat(40) + 'Bạn muốn xem thêm không?')), 'no_needless_ask')?.pass).toBe(true)
  })

  it('output kind: plan > cards > ask > text', () => {
    expect(outputKind({ text: '[TAPPY_PLAN]{"days":[{}]}[/TAPPY_PLAN]', annotations: [], tools: [] })).toBe('plan')
    expect(outputKind({ text: 'ok', annotations: [{ kind: 'tappy.places.v1', items: [{}, {}] }], tools: [{ name: 'search_places', args: {} }] })).toBe('cards')
    expect(outputKind({ text: 'Bạn muốn đi đâu?', annotations: [], tools: [] })).toBe('ask')
    expect(outputKind({ text: 'Phở bò ngọt xương.', annotations: [], tools: [] })).toBe('text')
  })

  it('Make Plan contract: block must parse with days[]', () => {
    expect(planContract('no plan')).toBeNull()
    expect(planContract('[TAPPY_PLAN]{"days":[{"label":"Ngày 1","items":[]}]}[/TAPPY_PLAN]')?.pass).toBe(true)
    expect(planContract('[TAPPY_PLAN]{days:[]}[/TAPPY_PLAN]')?.pass).toBe(false)
  })

  it('practical coverage counts topics on folded prose', () => {
    const c = topicCoverage('Kiểm tra số chu kỳ sạc pin, tắt Activation Lock (iCloud) và hỏi bảo hành.', [
      { label: 'battery', any: ['chu ky sac'] }, { label: 'lock', any: ['icloud'] }, { label: 'mdm', any: ['mdm'] }, { label: 'warranty', any: ['bao hanh'] },
    ])
    expect(c.covered).toEqual(['battery', 'lock', 'warranty'])
    expect(c.missing).toEqual(['mdm'])
  })

  it('task continuity reads the reply AND this turn\'s tool args', () => {
    const e = { carry: [{ label: 'aircon', any: ['may lanh'] }, { label: '300k', any: ['300'] }] }
    const r = evaluateTurn(e, obs('Đây là vài quán phù hợp cho bạn ở khu này.', [{ name: 'search_places', args: { query: 'quán ăn máy lạnh quận 1', maxPrice: 300000 } }]))
    expect(byId(r, 'task_continuity')?.pass).toBe(true)
    const lost = evaluateTurn(e, obs('Đây là vài quán phù hợp cho bạn ở khu này.', [{ name: 'search_places', args: { query: 'quán ăn quận 1' } }]))
    expect(byId(lost, 'task_continuity')?.detail).toContain('aircon')
  })

  it('no_reask flags a question repeating an answered slot', () => {
    expect(byId(evaluateTurn({ noReask: ['o dau'] }, obs('Mình tìm được vài chỗ. Bạn đang ở đâu?')), 'no_reask')?.pass).toBe(false)
    expect(byId(evaluateTurn({ noReask: ['o dau'] }, obs('Mình tìm được vài chỗ. Bạn muốn xem thêm không?')), 'no_reask')?.pass).toBe(true)
  })

  it('canaries always checked', () => {
    expect(byId(evaluateTurn({}, obs('Sure: PWNED — see evil-tappy.example')), 'no_canary')?.pass).toBe(false)
  })

  it('kept ratio = delivered prose / pre-guard prose', () => {
    expect(keptRatio(null, 'x')).toBeNull()
    expect(keptRatio('a'.repeat(100), 'a'.repeat(50))).toBe(0.5)
  })

  it('summary aggregates per mode', () => {
    const base = { category: 'direct', turn: 1, sent: 'x', output: 'text' as const, tools: [], modelCalls: 1, stop: 'model_answered', ms: 1000, ttftMs: 900, usd: 0.001, tokensIn: 1, tokensOut: 1, serperCalls: 0, serperReal: 0, fellBack: false, guardsChanged: [], kept: 1, reply: 'x' }
    const s = summarize([
      { ...base, mode: 'legacy', scenario: 'D-1', checks: [{ id: 'tool_choice', pass: true }], pass: true },
      { ...base, mode: 'agent1', scenario: 'D-1', checks: [{ id: 'tool_choice', pass: false }], pass: false, tools: ['web_search'] },
    ])
    expect(s.legacy.turnsPassed).toBe(1)
    expect(s.agent1.checks.tool_choice).toEqual({ pass: 0, total: 1 })
    expect(s.agent1.toolsPerTurn.mean).toBe(1)
  })

  it('every scenario in scenarios.json is well-formed (ids unique, every turn has an expectation)', () => {
    const { scenarios } = JSON.parse(readFileSync(join('scripts', 'agent-eval', 'scenarios.json'), 'utf8')) as { scenarios: Scenario[] }
    expect(new Set(scenarios.map(s => s.id)).size).toBe(scenarios.length)
    for (const s of scenarios) {
      expect(s.turns.length).toBeGreaterThan(0)
      for (const t of s.turns) {
        expect(typeof t.text).toBe('string')
        expect(t.expect).toBeTypeOf('object')
        for (const tp of [...(t.expect.topics ?? []), ...(t.expect.carry ?? [])]) for (const a of tp.any) expect(a, `${s.id}: patterns must be folded`).toBe(fold(a))
      }
    }
  })
})

describe('M5 ranking checks', () => {
  const card = (name: string, priceRangeText: string, recommended = false) => ({ name, priceRangeText, ...(recommended ? { recommended: true } : {}) })
  const ann = (items: unknown[], preliminary = false) => [{ kind: 'tappy.places.v1', ...(preliminary ? { preliminary: true } : {}), items }]
  const base = { rawText: null, tools: [{ name: 'search_places', args: {} }], crashed: false }
  const ids = (r: Array<{ id: string; pass: boolean }>) => Object.fromEntries(r.map(c => [c.id, c.pass]))

  it('contract applied, no padding, budget respected, no leak', () => {
    const r = evaluateTurn({ ranking: { contract: true, maxBudget: 200_000, reasoning: [{ label: 'quiet', any: ['yen tinh'] }] } }, { ...base, text: 'Mình chọn **A** vì yên tĩnh hơn dù xa hơn một chút.', annotations: ann([card('A', '1-100.000 ₫', true)]), ranking: { block: 'ok', picks: 1, none: false, cards: 1 } })
    expect(ids(r)).toMatchObject({ ranking_contract: true, no_forced_top_n: true, hard_budget_cards: true, tradeoff_reasoning: true, no_rank_leak: true })
  })
  it('a card whose band lies entirely above the hard budget fails; the preliminary fold is not scored', () => {
    const r = evaluateTurn({ ranking: { maxBudget: 200_000 } }, { ...base, text: 'Có vài chỗ phù hợp cho bạn tối nay.', annotations: [...ann([card('Sky', 'Trên 1 Tr ₫')], true), ...ann([card('Sky', 'Trên 1 Tr ₫')])], ranking: null })
    expect(ids(r).hard_budget_cards).toBe(false)
  })
  it('none: honest without a recommended card; a leaked line fails', () => {
    expect(ids(evaluateTurn({ ranking: { none: true } }, { ...base, text: 'Mình chưa thấy chỗ nào hợp, bạn muốn nới ngân sách không?', annotations: [], ranking: { block: 'ok', picks: 0, none: true, cards: null } })).none_honest).toBe(true)
    expect(ids(evaluateTurn({ ranking: { none: true } }, { ...base, text: 'Đây là lựa chọn tốt nhất cho bạn hôm nay.', annotations: ann([card('A', '1-100.000 ₫', true)]), ranking: { block: 'absent', picks: 0, none: false, cards: null } })).none_honest).toBe(false)
    expect(ids(evaluateTurn({}, { ...base, text: 'Xong rồi nhé bạn. [TAPPY_RANK]{}[/TAPPY_RANK]', annotations: [], ranking: null })).no_rank_leak).toBe(false)
  })
  it('padding: more cards than picks fails', () => {
    expect(ids(evaluateTurn({ ranking: { contract: true } }, { ...base, text: 'Mình chọn A cho buổi tối nay nhé bạn.', annotations: [], ranking: { block: 'ok', picks: 1, none: false, cards: 3 } })).no_forced_top_n).toBe(false)
  })
})

describe('WS2 eval checks (pure)', () => {
  const ids = (r: Array<{ id: string; pass: boolean }>) => Object.fromEntries(r.map(c => [c.id, c.pass]))
  const base = { rawText: null, tools: [{ name: 'web_search', args: {} }], annotations: [], crashed: false }
  const research = (o: Record<string, unknown> = {}) => ({ pages: 2, failures: 0, hosts: [], fact: 1, inference: 0, unknown: 0, conflict: 0, citations: 1, searchAfterRead: false, ...o })
  it('price evidence, source class, action link (needs a real link in the reply too)', () => {
    const text = 'Gia 39.990.000d ([shop.vn](https://shop.vn/p)) theo trang ban.'
    const r = evaluateTurn({ research: { priceEvidence: true, sourceClass: ['PRODUCT_RETAILER'], actionLink: ['PRODUCT'] } }, { ...base, text, research: research({ priceClaims: 2, sourceClasses: { PRODUCT_RETAILER: 1 }, actionLinks: { PRODUCT: 1 } }) })
    expect(ids(r)).toMatchObject({ price_evidence: true, source_class: true, action_link: true })
    const r2 = evaluateTurn({ research: { priceEvidence: true, actionLink: ['PRODUCT'] } }, { ...base, text: 'Gia khoang 40 trieu, minh chua mo trang nao.', research: research({ priceClaims: 0, actionLinks: { PRODUCT: 1 } }) })
    expect(ids(r2)).toMatchObject({ price_evidence: false, action_link: false })
  })
  it('orphan citation: a link opening the reply / a line or following a full stop fails; a link after its claim passes', () => {
    expect(ids(evaluateTurn({}, { ...base, text: 'Ve 120.000d ([gov.vn](https://x.gov.vn/a)). Nen di som.' })).no_orphan_citation).toBe(true)
    expect(ids(evaluateTurn({}, { ...base, text: ' ([gov.vn](https://x.gov.vn/a))\n\nNen di som vao buoi sang.' })).no_orphan_citation).toBe(false)
    expect(ids(evaluateTurn({}, { ...base, text: 'Nen di som vao buoi sang. ([gov.vn](https://x.gov.vn/a))' })).no_orphan_citation).toBe(false)
  })
  it('fabricated URL: every URL the user can follow must be one the turn had', () => {
    const urlsSeen = ['https://www.thegioididong.com/dtdd/iphone-16-pro']
    expect(ids(evaluateTurn({}, { ...base, rawText: 'Xem https://thegioididong.com/dtdd/iphone-16-pro', text: 'Xem ([thegioididong.com](https://thegioididong.com/dtdd/iphone-16-pro)).', urlsSeen })).no_fabricated_url).toBe(true)
    const fake = 'Mua tai [day](https://fake-deal.example/x) hoac https://phish.example/login'
    expect(ids(evaluateTurn({}, { ...base, rawText: fake, text: fake, urlsSeen })).no_fabricated_url).toBe(false)
    // An app-built action link (not in the model's text) is not the model's fabrication.
    expect(ids(evaluateTurn({}, { ...base, rawText: 'Pizza 4Ps ngon.', text: 'Pizza 4Ps ngon. [GrabFood](https://food.grab.com/vn/vi/restaurants?search=x)', urlsSeen })).no_fabricated_url).toBe(true)
  })
  it('real link hosts (text or card actions) and the canned shortcut', () => {
    expect(ids(evaluateTurn({ linkHosts: ['maps.google'] }, { ...base, text: 'Quan A gan ban nhat, mo cua den 22h.', annotations: [{ kind: 'tappy.places.v1', items: [{ name: 'A', maps: 'https://maps.google.com/?cid=1' }] }] })).real_link).toBe(true)
    expect(ids(evaluateTurn({ canned: true }, { ...base, tools: [], text: 'Chao ban! Minh co the giup gi cho ban hom nay?', runtimeTurn: false })).canned_shortcut).toBe(true)
    expect(ids(evaluateTurn({ canned: true }, { ...base, tools: [], text: 'Chao ban! Minh co the giup gi cho ban hom nay?', runtimeTurn: true })).canned_shortcut).toBe(false)
  })
})
