import { describe, it, expect } from 'vitest'
import { unframedForecast, verifyReport } from './claimVerifier'

// 12/11 self-UAT: a correct Chinese forecast sentence was flagged `unframed_forecast` because the hedge list was Vietnamese/English only (11 flags on a Chinese Advanced report).
// Rule kept: a figure for a FUTURE year (current year < y <= current year + 10) with no word of estimate/forecast/scenario/assumption is a forecast written as a fact.
// Chinese / Japanese / Korean / Thai framing words now count. A bare "approximately" (约 / 大约 / 左右 / 約 / およそ / 대략 / ประมาณ) counts ONLY inside the clause that holds the future year,
// so "2023年销售额约300亿元，2027年将达到800亿元" (the 约 belongs to a past figure) is still flagged.
const YEAR = 2026

const FRAMED_ZH = [
  '据预测，2030年中国新能源汽车销量将达到1500万辆。',
  '预计2028年市场规模将突破3000亿元。',
  '2027年销售额预估为450亿元。',
  '估计到2029年用户数将超过12000万。',
  '按乐观情景，2030年产量可达800万吨。',
  '假设年增长率保持在8%，2032年规模为2400亿元。',
  '机构展望2027年出货量为5200万台。',
  '2028年市场规模有望达到9800亿元。',
  '2030年的收入或将达到2500亿元。',
  '2027年成本可能降至每吨3500元。',
  '2029年渗透率预期为45%。',
  '测算显示，2031年需求量为1200万吨。',
  '2030年规模约1800亿元。',
  '2028年左右销量达到3000万辆。',
  '大约到2027年，用户将达到5000万。',
  '2024年市场规模为300亿元，预计2028年达到900亿元。',
  '2024年约300亿元，2028年预估达到900亿元。',
  '預計2028年市場規模將達到3000億元。',
  '2030年市場趨勢顯示銷量為1500萬輛。',
  '2027年出货量按推算为5200万台。',
]
const FRAMED_OTHER = [
  '2030年の市場規模は5000億円と予測されている。',
  '2028年の売上は1200億円の見込みだ。',
  '2029年は3000万台と推計される。',
  '2030年の需要は1500万トンと想定する。',
  '2030년 시장 규모는 5,000억 원으로 전망된다.',
  '2028년 매출은 1,200억 원으로 예상된다.',
  '2029년 사용자는 12,000만 명으로 추정된다.',
  'คาดว่าปี 2030 ตลาดจะมีมูลค่า 5000 ล้านบาท',
  'ปี 2028 มีแนวโน้มว่ายอดขายจะอยู่ที่ 1200 ล้านบาท',
  'อาจมียอดขาย 3000 ล้านบาท ในปี 2029',
]
const UNFRAMED = [
  '2030年中国新能源汽车销量将达到1500万辆。',
  '2027年市场规模为3000亿元。',
  '到2029年，用户数将超过12000万。',
  '2028年公司营收达到800亿元。',
  '2023年销售额约300亿元，2027年将达到800亿元。',
  '2024年市场规模为300亿元，2028年将达到900亿元。',
  '2027年新公约将带来2500亿元收入。',
  '2028年销量绝对不可能少于3000万辆。',
  '2030年市場規模將達到5000億元。',
  '2030年の市場規模は5000億円に達する。',
  '2030년 시장 규모는 5,000억 원에 달한다.',
  'ปี 2030 ตลาดจะมีมูลค่า 5000 ล้านบาท',
]
const NOT_FUTURE_OR_NO_FIGURE = [
  '2023年销售额为300亿元。',
  '2024年市场规模约1200亿元，同比增长15%。',
  '2022年出货量达到5200万台，2023年为4800万台。',
  '2027年将举办行业大会。',
  '2026年销售额达到500亿元。',
  '2040年市场规模将达到5000亿元。',
]

describe('unframedForecast: Chinese, Japanese, Korean, Thai framing words', () => {
  it.each(FRAMED_ZH)('framed Chinese forecast is NOT flagged: %s', s => expect(unframedForecast(s, YEAR)).toBe(false))
  it.each(FRAMED_OTHER)('framed Japanese/Korean/Thai forecast is NOT flagged: %s', s => expect(unframedForecast(s, YEAR)).toBe(false))
  it.each(UNFRAMED)('unframed forecast IS flagged: %s', s => expect(unframedForecast(s, YEAR)).toBe(true))
  it.each(NOT_FUTURE_OR_NO_FIGURE)('past year, current year, far future or no figure is not a forecast claim: %s', s => expect(unframedForecast(s, YEAR)).toBe(false))
  it('the sample is large enough to trust (at least 30 Chinese sentences)', () => {
    expect(FRAMED_ZH.length + UNFRAMED.filter(s => /[一-鿿]/.test(s) && !/[぀-ヿ가-힯]/.test(s)).length + NOT_FUTURE_OR_NO_FIGURE.length).toBeGreaterThanOrEqual(30)
  })
  it('a Chinese report: the framed forecast is clean, the unframed one is the only flag', () => {
    const src = [{ id: 1, title: '报告', snippet: '', text: '预计2028年市场规模将达到3000亿元。 2028年市场规模将达到3000亿元。' }]
    const ok = verifyReport('预计2028年市场规模将达到3000亿元 [1]', src, YEAR)
    expect(ok.counts.unframed_forecast).toBe(0)
    const bad = verifyReport('2028年市场规模将达到3000亿元 [1]', src, YEAR)
    expect(bad.counts.unframed_forecast).toBe(1)
  })
})

describe('unframedForecast: English and Vietnamese behaviour is unchanged', () => {
  const cases: Array<[string, boolean]> = [
    ['In 2028 revenue reaches $500 million.', true],
    ['Projected 2028 revenue is $500 million.', false],
    ['Revenue is expected to reach $500 million in 2028.', false],
    ['Under the base scenario, 2029 sales are 1,200 units.', false],
    ['Approximately $500 million in 2028.', true],
    ['Năm 2028 doanh thu đạt 500 triệu đồng.', true],
    ['Dự báo năm 2028 doanh thu đạt 500 triệu đồng.', false],
    ['Ước tính doanh thu năm 2029 là 800 triệu đồng.', false],
    ['Doanh thu khoảng 500 triệu đồng năm 2028.', true],
    ['Revenue was $500 million in 2024.', false],
  ]
  it.each(cases)('%s', (s, want) => expect(unframedForecast(s, YEAR)).toBe(want))
})
