// The report's language (12/11/2026 self-UAT): an English question must get an English report even when detectLangConfident (deliberately conservative) returns null.
// Labelled table: POSITIVES must come out 'en'; NEGATIVES must never come out 'en' (Vietnamese with and without tone marks, short mixed queries, product names, numbers, other scripts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Call = { opts: Record<string, unknown> }
const calls: Call[] = []
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    extract: async (o: Record<string, unknown>) => {
      calls.push({ opts: o })
      return { object: { title: 'T', sources_label: 'Sources', parts: [{ part: 'P', step: 1 }], steps: [{ title: 'P', queries: ['q'] }], specialist_steps: [] }, providerMetadata: undefined }
    },
    stream: () => ({ fullStream: (async function* () { /* none */ })(), providerMetadata: Promise.resolve(undefined) }),
  },
}))
vi.mock('@/lib/ai/llm/registry', () => ({ claudeWriterAvailable: () => false, getProvider: () => ({}) }))

import { englishForReport, reportQuestionLang } from './reportLang'
import { detectLangConfident } from '@/lib/ai/intent'
import { createDeepResearchDeps } from './deepResearchDeps'

beforeEach(() => { calls.length = 0; vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const POSITIVES: string[] = [
  // the four UAT sentences
  'Compare food delivery platforms in Vietnam: market share and commission',
  'Is it safe to eat street food in Ho Chi Minh City?',
  'Compare Hanoi and Bangkok for a 3-day city break',
  'What are the rules for opening a milk tea shop in Vietnam?',
  // travel
  'What is the best time to visit Da Nang and Hoi An?',
  'How much does a week in Phu Quoc cost for two people?',
  'Compare Da Lat and Sapa for a family trip in December',
  'Is it worth visiting the Mekong Delta on a 2-day tour?',
  'Which is better for a honeymoon, Nha Trang or Phu Quoc?',
  'What should I know before travelling to Vietnam in the rainy season?',
  'Where can I find a good hotel near the old quarter in Hanoi?',
  'Plan a 5-day itinerary for Central Vietnam with a small budget',
  // business
  'What are the requirements to register a company in Vietnam as a foreigner?',
  'How is VAT calculated for e-commerce sellers in Vietnam?',
  'Compare the cost of renting an office in Hanoi and Ho Chi Minh City',
  'What is the market size of the coffee industry in Vietnam?',
  'Should I open a cafe in District 1 or in Thao Dien?',
  'What are the main risks of importing electronics from China to Vietnam?',
  'Analyze the growth of online food delivery in Southeast Asia',
  'What taxes do freelancers have to pay in Vietnam?',
  'How do I start an online shop and ship across the country?',
  // food
  'What are the most popular street foods in Hanoi and where to eat them?',
  'Is it safe to drink tap water in Vietnam?',
  'What is the difference between pho and bun bo Hue?',
  'Which restaurants in Saigon are good for a business lunch?',
  'How much does a bowl of pho cost in Hanoi these days?',
  'Why is Vietnamese coffee so strong and what is egg coffee?',
  // tech
  'What are the differences between iPhone 16 and Samsung Galaxy S25?',
  'Compare React and Vue for a small team building a web app',
  'How does end to end encryption work in messaging apps?',
  'Which laptop is best for a student on a budget of 800 dollars?',
  'What is the difference between a VPN and a proxy for privacy?',
  'Should I learn Python or JavaScript first as a beginner?',
  'How can I protect my accounts from phishing and scams?',
  'Compare electric scooters and motorbikes for daily commuting in Saigon',
  'Is it a good time to buy a second hand car in Vietnam?',
  // health / life
  'What vaccines do I need before visiting Vietnam as a tourist?',
  'Can I use my foreign driving licence to rent a motorbike in Vietnam?',
  'How long does it take to get a tourist visa for Vietnam and how much is it?',
  'What are the best universities in Vietnam for studying computer science?',
  'Tell me about the history of the Cu Chi tunnels and how to visit them',
  'Do I need to tip in restaurants and taxis in Vietnam?',
  'Compare the cost of living in Hanoi and Da Nang for a remote worker',
]

const NEGATIVES: string[] = [
  // Vietnamese without tone marks
  'cho toi 3 quan bun bo ngon o q1',
  'Mai di Da Lat 3 ngay 2 dem 2 nguoi',
  'tim quan an ngon gan day',
  'so sanh gia ve may bay Ha Noi Sai Gon',
  'nen di Phu Quoc thang may',
  'toi muon mo quan tra sua o Ha Noi can bao nhieu von',
  'quan pho nao ngon nhat o Sai Gon',
  'ban co the goi y cho toi khach san re o Da Nang khong',
  'thu tuc dang ky cong ty o Viet Nam nhu the nao',
  'cho toi biet gia xe may Honda Vision hom nay',
  'lich trinh 4 ngay 3 dem o Hue cho gia dinh',
  'o Da Nang co gi choi vao mua mua',
  'chi phi nuoi con o thanh pho Ho Chi Minh la bao nhieu',
  'review quan ca phe view dep o Da Lat',
  'mua laptop nao tot cho sinh vien duoi 15 trieu',
  'thue nha o quan 7 gia bao nhieu mot thang',
  // Vietnamese with tone marks
  'Cho tôi 3 quán bún bò ngon ở Quận 1',
  'Mai đi Đà Lạt 3 ngày 2 đêm cho 2 người',
  'So sánh giá vé máy bay Hà Nội Sài Gòn',
  'Thủ tục đăng ký công ty ở Việt Nam như thế nào?',
  'Nên đi Phú Quốc vào tháng mấy?',
  'Chi phí sống ở Hà Nội một tháng là bao nhiêu',
  'Phân tích thị trường giao đồ ăn tại Việt Nam',
  'Ăn đồ ăn đường phố ở TP.HCM có an toàn không?',
  'Quy định mở quán trà sữa ở Việt Nam',
  // short mixed queries and diacritics: stays with detectLangConfident
  'Best bún chả in Hà Nội',
  'Cafe view đẹp Hà Nội',
  'Review quán phở Bát Đàn',
  'iPhone 16 giá bao nhiêu',
  // mixed with bare Vietnamese
  'toi can best hotel in da nang cho 2 nguoi',
  'cho toi top 5 quan cafe in Ha Noi',
  'tim best pho near me o Sai Gon',
  // product names, numbers, fragments
  'iPhone 16 Pro Max',
  'Samsung Galaxy S25 Ultra 256GB',
  '115 000 000',
  'Honda Vision 2024',
  'MacBook Air M3',
  '12/11/2026',
  'Da Lat',
  'ok',
  '',
  // other scripts
  '东京三天两夜旅行攻略',
  'ベトナムの人気観光地はどこですか',
  '하노이 3박 4일 여행 추천',
]

const rate = (xs: string[], pred: (x: string) => boolean) => xs.filter(pred).length / xs.length

describe('reportQuestionLang: the labelled table', () => {
  it('has enough labelled cases', () => {
    expect(POSITIVES.length).toBeGreaterThanOrEqual(40)
    expect(NEGATIVES.length).toBeGreaterThanOrEqual(40)
  })
  it('every English question comes out en', () => {
    const bad = POSITIVES.filter(p => reportQuestionLang(p) !== 'en')
    expect(bad).toEqual([])
  })
  it('no negative ever comes out en', () => {
    const bad = NEGATIVES.filter(n => reportQuestionLang(n) === 'en')
    expect(bad).toEqual([])
  })
  it('the four UAT sentences were null before (the defect) and are en now', () => {
    for (const q of POSITIVES.slice(0, 4)) { expect(detectLangConfident(q)).toBeNull(); expect(reportQuestionLang(q)).toBe('en') }
  })
  it('reports the measured rates', () => {
    const tp = rate(POSITIVES, p => reportQuestionLang(p) === 'en')
    const fp = rate(NEGATIVES, n => reportQuestionLang(n) === 'en')
    const wasNull = rate(POSITIVES, p => detectLangConfident(p) === null)
    console.warn(`[reportLang] positives ${POSITIVES.length}: en ${(tp * 100).toFixed(1)}% (detectLangConfident alone was null for ${(wasNull * 100).toFixed(1)}%); negatives ${NEGATIVES.length}: wrongly en ${(fp * 100).toFixed(1)}%`)
    expect(tp).toBe(1)
    expect(fp).toBe(0)
  })
})

describe('reportQuestionLang: the rules, one by one', () => {
  it('detectLangConfident always wins when it has an answer', () => {
    for (const q of [...POSITIVES, ...NEGATIVES]) {
      const d = detectLangConfident(q)
      if (d !== null) expect(reportQuestionLang(q)).toBe(d)
    }
  })
  it('fewer than four words is never promoted', () => {
    expect(englishForReport('Is it safe')).toBeNull()
    expect(englishForReport('best pho in')).toBeNull()
  })
  it('one English stop word is not enough, and neither is a quarter missing', () => {
    expect(englishForReport('Hanoi Bangkok Phuket Saigon Singapore Manila of')).toBeNull()
    expect(englishForReport('Hanoi Bangkok best trip')).toBeNull() // 1 of 4 = 25%, still only one stop word
    expect(englishForReport('Hanoi Bangkok Phuket Saigon Singapore Manila Hue Hoi the best')).toBeNull() // 2 of 10 = 20%
  })
  it('a tone mark or a non-Latin letter anywhere forbids the promotion', () => {
    expect(englishForReport('Is it safe to eat in Hà Nội')).toBeNull()
    expect(englishForReport('What are the rules for Đà Nẵng taxes')).toBeNull()
    expect(englishForReport('What are the rules for taxes in 日本')).toBeNull()
  })
  it('curly punctuation does not forbid it', () => {
    expect(englishForReport('What’s the best way to get from Hanoi to Sapa — by train?')).toBe('en')
  })
  it('English stop words must outnumber Vietnamese bare words', () => {
    expect(englishForReport('what is the best pho cho toi o Sai Gon nguoi')).toBeNull()
  })
  it('a name such as Ho Chi Minh does not tip an English sentence', () => {
    expect(englishForReport('Is it safe to eat street food in Ho Chi Minh City?')).toBe('en')
  })
  it('empty and punctuation-only text is null', () => {
    expect(reportQuestionLang('')).toBeNull()
    expect(englishForReport('?!?! ...')).toBeNull()
  })
})

describe('the route and the engine', () => {
  it('route.ts takes the report language from reportQuestionLang (guard test)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toMatch(/import \{ reportQuestionLang \} from '@\/lib\/ai\/research\/reportLang'/)
    expect(src).toContain('questionLang: reportQuestionLang(lastText)')
    expect(src).not.toContain('questionLang: detectLangConfident(lastText)')
  })
  it('a question that detectLangConfident leaves null now reaches the engine as questionLang en: the plan call is told to write in English', async () => {
    const q = 'Is it safe to eat street food in Ho Chi Minh City?'
    expect(detectLangConfident(q)).toBeNull()
    const deps = createDeepResearchDeps({ lang: 'vi', userTexts: [q], cost: { usd: 0, calls: 0 } as never, questionLang: reportQuestionLang(q) })
    const plan = await deps.plan(q, '')
    const content = String((calls[0].opts.messages as Array<{ content: string }>)[0].content)
    expect(content).toContain('written in English')
    // the engine is otherwise unchanged: same plan, same single call, UI language untouched
    expect(plan.title).toBe('T')
    expect(calls).toHaveLength(1)
  })
  it('a Vietnamese question still carries no extra line when nothing is settled, and its own language when it is', async () => {
    const none = createDeepResearchDeps({ lang: 'vi', userTexts: ['q'], cost: { usd: 0, calls: 0 } as never, questionLang: reportQuestionLang('cho toi 3 quan bun') })
    await none.plan('cho toi 3 quan bun', '')
    expect(String((calls[0].opts.messages as Array<{ content: string }>)[0].content)).not.toContain('written in English')
    calls.length = 0
    const vi_ = createDeepResearchDeps({ lang: 'vi', userTexts: ['q'], cost: { usd: 0, calls: 0 } as never, questionLang: reportQuestionLang('Cho tôi 3 quán bún bò ngon ở Quận 1') })
    await vi_.plan('Cho tôi 3 quán bún bò ngon ở Quận 1', '')
    expect(String((calls[0].opts.messages as Array<{ content: string }>)[0].content)).toContain('in Vietnamese')
  })
})
