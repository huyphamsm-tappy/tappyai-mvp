import { describe, it, expect } from 'vitest'
import { deriveLocalShopSearch } from './localShop'
import { assistantAskedBack, isEchoQuestion, dropEchoQuestions, wantsWiderArea } from './echoQuestion'
import { emptyResultStream } from './emptyResultStream'
import { statedDistrict, centralAreaDistrict } from '../districts'
import { planPresearch } from './presearch'
import { deriveSearchNow } from './searchNow'
import { deriveSituation } from './situationFrame'
import { deriveDecisionFrame } from './decisionFrame'
import { deriveNeedProfile } from './needProfile'
import { parseCTA } from '@/lib/structuredContent/parseCta'

describe('A2 — "Quận trung tâm" is a real area', () => {
  it('resolves the ask-card option to Quận 1 (HCMC) / Hoàn Kiếm (Hà Nội)', () => {
    expect(statedDistrict('Quận trung tâm · Món Việt · Trên 300k')?.label).toBe('Quận 1')
    expect(statedDistrict('Khu trung tâm')?.label).toBe('Quận 1')
    expect(statedDistrict('trung tâm thành phố')?.label).toBe('Quận 1')
    expect(statedDistrict('quận trung tâm Hà Nội')?.label).toBe('Hoàn Kiếm')
    expect(centralAreaDistrict('downtown')?.key).toBe('hcm:q1')
  })
  it('does not fire on a bare "gần trung tâm" or a shopping-centre name', () => {
    expect(statedDistrict('khách sạn gần trung tâm')).toBeNull()
    expect(statedDistrict('trung tâm thương mại Vincom')).toBeNull()
  })
  it('keeps the explicit districts working', () => {
    expect(statedDistrict('quán ở phú nhuận')?.label).toBe('Phú Nhuận')
    expect(statedDistrict('Quận 3')?.label).toBe('Quận 3')
  })
})

describe('A2 — a local shop / repair request is a map search, never a question', () => {
  const cases: Array<[string, string]> = [
    ['muốn tìm cửa hàng dán tại chỗ ở phú nhuận', 'cửa hàng dán màn hình điện thoại'],
    ['chỗ dán màn hình điện thoại ở quận 1', 'cửa hàng dán màn hình điện thoại'],
    ['sửa điện thoại ở quận 3', 'tiệm sửa chữa điện thoại'],
    ['thay pin iphone gần đây', 'tiệm thay pin điện thoại'],
    ['tiệm sửa laptop bình thạnh', 'tiệm sửa chữa laptop'],
  ]
  for (const [text, query] of cases) it(`"${text}"`, () => expect(deriveLocalShopSearch(text)?.query).toBe(query))

  it('a purchase or an online request is not a shop search', () => {
    expect(deriveLocalShopSearch('Muốn mua kính cường lực cho iphone')).toBeNull()
    expect(deriveLocalShopSearch('mua kính cường lực iphone 17 trên shopee')).toBeNull()
    expect(deriveLocalShopSearch('quán phở ngon quận 3')).toBeNull()
  })

  it('deriveSearchNow names the shop call on the first turn AND when the user repeats after the assistant asked back', () => {
    const text = 'muốn tìm cửa hàng dán tại chỗ ở phú nhuận'
    const messages = [{ role: 'user', content: text }]
    const need = deriveNeedProfile(messages)
    const situation = deriveSituation([text], need, { hasGps: false })
    const frame = deriveDecisionFrame({ messages, need, planningIntent: null, forcedTool: null, hasGps: false, storedPreferences: null, now: new Date() } as never)
    const base = { text, situation, frame, need, forcedTool: null, movieRecommend: false, consultationText: text }
    const first = deriveSearchNow({ ...base, isFirstReply: true })
    expect(first).toMatchObject({ type: 'shop', exact: true, query: 'cửa hàng dán màn hình điện thoại' })
    // the user repeats (not the first reply any more) after the assistant asked back: still searched
    expect(deriveSearchNow({ ...base, isFirstReply: false, askedBack: true })).toMatchObject({ type: 'shop' })
    // an unrelated later turn does not re-search
    expect(deriveSearchNow({ ...base, isFirstReply: false })).toBeNull()
    // pre-search runs it with the area as the location and NO place type
    const plan = planPresearch(first, situation, { statedArea: 'Phú Nhuận', userText: text })
    expect(plan?.args).toEqual({ query: 'cửa hàng dán màn hình điện thoại', location: 'Phú Nhuận' })
  })
})

describe('A2 — loop guard', () => {
  const user = ['muốn tìm cửa hàng dán tại chỗ ở phú nhuận']
  it('recognises an assistant turn that asked back with no venue', () => {
    expect(assistantAskedBack('Mình hiểu bạn cần dán ở Phú Nhuận. Bạn muốn dán màn hình hay mặt lưng?', false)).toBe(true)
    expect(assistantAskedBack('Mình chọn Giahuymobile. Bạn muốn xem thêm không?', true)).toBe(false)
    expect(assistantAskedBack('Đây là gợi ý của mình.', false)).toBe(false)
  })
  it('an echo question restates the user; a clarification with a new word does not', () => {
    expect(isEchoQuestion('Bạn muốn tìm cửa hàng dán tại chỗ ở Phú Nhuận phải không?', user)).toBe(true)
    expect(isEchoQuestion('Bạn muốn dán màn hình hay mặt lưng?', user)).toBe(false)
    expect(isEchoQuestion('Phải không?', user)).toBe(false)
  })
  it('drops trailing echo questions only; keeps a genuine one and the machine blocks', () => {
    const t = 'Mình sẽ tìm cho bạn. Bạn muốn tìm cửa hàng dán tại chỗ ở Phú Nhuận đúng không?'
    expect(dropEchoQuestions(t, user)).toEqual({ text: 'Mình sẽ tìm cho bạn.', removed: 1 })
    const real = 'Mình sẽ tìm. Bạn dán cho iPhone đời nào?'
    expect(dropEchoQuestions(real, user).removed).toBe(0)
    const withBlock = 'Ok. Bạn muốn tìm cửa hàng dán tại chỗ ở Phú Nhuận đúng không?\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]'
    expect(dropEchoQuestions(withBlock, user).text).toContain('[FOLLOWUPS]a|b[/FOLLOWUPS]')
  })
  it('"tìm cả TP.HCM" / "khu vực lân cận" lift the district', () => {
    expect(wantsWiderArea('Tìm trên cả TP.HCM')).toBe(true)
    expect(wantsWiderArea('sang khu vực lân cận đi')).toBe(true)
    expect(wantsWiderArea('quán phở quận 3')).toBe(false)
  })
})

const run = async (frames: string[], opts: Parameters<typeof emptyResultStream>[1]) => {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f + '\n')); c.close() } })
  const out = await new Response(emptyResultStream(body, { log: () => {}, ...opts })).text()
  return out.split('\n').filter(Boolean)
}

describe('A2 — emptyResultStream', () => {
  const frames = ['9:{"toolCallId":"1"}', 'a:{"toolCallId":"1","result":{}}', '0:' + JSON.stringify('Chưa có quán Việt nào trong kết quả. '), '0:' + JSON.stringify('Bạn muốn nói sang khu vực lân cận không?'), 'd:{"finishReason":"stop"}']
  it('replaces the model prose with the honest block + Maps button when the search came back empty', async () => {
    const lines = await run(frames, { getEmpty: () => ({ query: 'nhà hàng Việt', area: 'Quận 1' }), bufferText: false, userTexts: [], lang: 'vi' })
    const text = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).join('')
    expect(text).not.toContain('lân cận')
    const { text: prose, buttons } = parseCTA(text)
    expect(prose).toContain('chưa thấy kết quả đủ tin cậy')
    expect(buttons[0].type).toBe('maps')
    expect(lines[lines.length - 1]).toBe('d:{"finishReason":"stop"}')
  })
  it('passes a normal turn through untouched', async () => {
    const lines = await run(frames, { getEmpty: () => null, bufferText: false, userTexts: [], lang: 'vi' })
    expect(lines).toEqual(frames)
  })
  it('loop turn: buffers, drops a trailing echo question, keeps the rest', async () => {
    const f = ['0:' + JSON.stringify('Mình sẽ tìm giúp bạn. '), '0:' + JSON.stringify('Bạn muốn tìm cửa hàng dán tại chỗ ở Phú Nhuận đúng không?'), 'd:{"finishReason":"stop"}']
    const lines = await run(f, { getEmpty: () => null, bufferText: true, userTexts: ['muốn tìm cửa hàng dán tại chỗ ở phú nhuận'], lang: 'vi' })
    expect(lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).join('')).toBe('Mình sẽ tìm giúp bạn.')
  })
})

import { refineAsk } from './echoQuestion'
import type { ConsultDecision } from './consultBrain'

describe('A2 — the ask card never asks what the request already says', () => {
  const ask = (qs: Array<[string, string[]]>): ConsultDecision => ({
    domains: ['shopping'], turn: 'ask', known: {}, assumptions: [],
    ask: { lead: 'Để mình chọn đúng:', questions: qs.map(([q, options], i) => ({ id: `q${i}`, q, options })) },
  })
  const user = ['muốn tìm cửa hàng dán tại chỗ ở phú nhuận']

  it('a local shop / repair request is never an ask card (the search runs)', () => {
    const d = refineAsk(ask([['Bạn muốn dán gì và dán ở đâu?', ['Màn hình', 'Mặt lưng']], ['Tầm giá?', ['Rẻ', 'Vừa']]]), user, { localShop: true })
    expect(d?.turn).toBe('pick')
    expect(d?.ask).toBeUndefined()
  })
  it('drops an AREA question when a district is already named; fewer than two questions left → pick', () => {
    const d = refineAsk(ask([['Bạn muốn tìm quán ở đâu?', ['Quận 1', 'Quận 3']], ['Món gì?', ['Món Việt', 'Món Nhật']]]), ['tìm quán ăn ở quận 1'], { localShop: false })
    expect(d?.turn).toBe('pick')
  })
  it('keeps the genuinely missing questions when two or more remain', () => {
    const d = refineAsk(ask([['Bạn muốn tìm quán ở đâu?', ['Quận 1', 'Quận 3']], ['Món gì?', ['Món Việt', 'Món Nhật']], ['Đi mấy người?', ['2', '4']]]), ['tìm quán ăn ở quận 1'], { localShop: false })
    expect(d?.turn).toBe('ask')
    expect(d?.ask?.questions.map(q => q.q)).toEqual(['Món gì?', 'Đi mấy người?'])
  })
  it('asks the area when none was given (case b: "Tìm quán ngon…")', () => {
    const d = refineAsk(ask([['Bạn muốn tìm quán ở đâu?', ['Quận trung tâm', 'Gần mình']], ['Món gì?', ['Món Việt', 'Món Á']]]), ['Tìm quán ngon không cần hỏi cả group chat nữa'], { localShop: false })
    expect(d?.turn).toBe('ask')
    expect(d?.ask?.questions).toHaveLength(2)
  })
  it('non-ask decisions pass through', () => {
    const d: ConsultDecision = { domains: ['food'], turn: 'pick', known: {}, assumptions: [] }
    expect(refineAsk(d, user, { localShop: true })).toBe(d)
    expect(refineAsk(null, user, { localShop: true })).toBeNull()
  })
})

describe('A2 — the ask card does not re-ask a budget or a head-count already given', () => {
  const ask = (qs: Array<[string, string[]]>): ConsultDecision => ({
    domains: ['food'], turn: 'ask', known: {}, assumptions: [],
    ask: { lead: 'Để chọn đúng quán:', questions: qs.map(([q, options], i) => ({ id: `q${i}`, q, options })) },
  })
  it('c4 from the battery: "quán nhậu ở quận 3 giá 300-500k" then "4 người · Món Việt" must not ask the budget / people again', () => {
    const d = refineAsk(
      ask([['Tầm bao nhiêu mỗi người?', ['Dưới 100k', '100-300k']], ['Đi mấy người?', ['2', '4']], ['Ăn tại quán hay giao?', ['Ăn tại quán', 'Giao tận nơi']]]),
      ['quán nhậu ở quận 3 giá 300-500k', '4 người · Món Việt'], { localShop: false })
    expect(d?.turn).toBe('pick')
  })
  it('still asks the budget when none was given', () => {
    const d = refineAsk(ask([['Tầm bao nhiêu mỗi người?', ['Dưới 100k', '100-300k']], ['Ăn tại quán hay giao?', ['Ăn tại quán', 'Giao tận nơi']]]), ['tìm quán ăn ở quận 1'], { localShop: false })
    expect(d?.turn).toBe('ask')
  })
})
