import { describe, it, expect } from 'vitest'
import { adviceBlock, adviceEnabled, TRIP_PLAN_ADVICE } from './adviceBlock'
import { ensureAdviceFloor, tipUnits } from './adviceFloor'
import { applyTripBudgetEstimate, tripBudgetRows } from '../tripBudgetEstimate'

describe('adviceBlock', () => {
  it('is off for ask / chat and for a non-travel plan', () => {
    expect(adviceBlock({ turn: 'ask', domain: 'food' })).toBe('')
    expect(adviceBlock({ turn: 'chat', domain: 'food' })).toBe('')
    expect(adviceBlock({ turn: 'plan', domain: 'food' })).toBe('')
    expect(adviceBlock({ turn: undefined, domain: 'food' })).toBe('')
  })
  it('a travel plan gets the full plan advice', () => {
    expect(adviceBlock({ turn: 'plan', domain: 'travel' })).toBe(TRIP_PLAN_ADVICE)
    expect(TRIP_PLAN_ADVICE).toContain('ước tính tham khảo')
    expect(TRIP_PLAN_ADVICE).toContain('category "free"')
  })
  it('a pick asks for tips and a next step, and keeps the fact rule', () => {
    const b = adviceBlock({ turn: 'pick', domain: 'spa' })
    expect(b).toContain('MẸO')
    expect(b).toContain('BƯỚC TIẾP')
    expect(b).toContain('CHỈ khi có trong dữ liệu công cụ')
  })
  it('a trip pick with a length asks for exactly that many day lines; a flight forbids fares and times', () => {
    expect(adviceBlock({ turn: 'pick', domain: 'travel', days: 3 })).toContain('đúng 3 dòng')
    const f = adviceBlock({ turn: 'pick', domain: 'travel', flight: true })
    expect(f).toContain('KHÔNG viết giá vé, giờ bay')
    expect(f).not.toContain('LỊCH NGẮN')
  })
  it('follow-up / compare get the short form', () => {
    expect(adviceBlock({ turn: 'compare', domain: 'shopping' }).length).toBeLessThan(adviceBlock({ turn: 'pick', domain: 'shopping' }).length)
  })
  it('CONSULT_ADVICE=0 turns it off', () => {
    expect(adviceEnabled({})).toBe(true)
    expect(adviceEnabled({ CONSULT_ADVICE: '0' })).toBe(false)
    expect(adviceEnabled({ CONSULT_ADVICE: 'off' })).toBe(false)
  })
})

describe('ensureAdviceFloor', () => {
  const bare = '**Mình chọn: Quán A**. Vì bạn đi 4 người.\n\n- **Quán B**: rẻ hơn.\n\nMình còn 5 lựa chọn nữa — bạn muốn xem thêm không?\n\n[FOLLOWUPS]Xem thêm|Lên kế hoạch chi tiết[/FOLLOWUPS]'
  it('adds tips, a missing-info note and a next step to a bare list, before the remaining line', () => {
    const r = ensureAdviceFloor(bare, { domain: 'food', turn: 'pick' })
    expect(r.added).toEqual(['tips', 'missing', 'next'])
    const i = r.text.indexOf('Mẹo (theo kinh nghiệm chung)')
    expect(i).toBeGreaterThan(r.text.indexOf('Quán B'))
    expect(i).toBeLessThan(r.text.indexOf('Mình còn 5 lựa chọn'))
    expect(r.text.endsWith('[/FOLLOWUPS]')).toBe(true)
  })
  it('also finds the system "Còn N lựa chọn" line', () => {
    const r = ensureAdviceFloor('**Mình chọn: A**. Vì …\n\nCòn 2 lựa chọn nữa — bạn muốn xem thêm không?\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]', { domain: 'spa', turn: 'pick' })
    expect(r.text.indexOf('Mẹo')).toBeLessThan(r.text.indexOf('Còn 2 lựa chọn'))
  })
  it('leaves a reply that already advises untouched', () => {
    const rich = '**Mình chọn: A** — vì bạn đi 2 người.\n\nTheo kinh nghiệm chung:\n- Đặt bàn trước vào cuối tuần để khỏi chờ.\n- Nên đến sớm, tránh giờ cao điểm.\nGiá chưa có thông tin, bạn xem ở thẻ bên dưới.\nBước tiếp: gọi đặt bàn.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]'
    expect(ensureAdviceFloor(rich, { domain: 'food', turn: 'pick' })).toEqual({ text: rich, added: [] })
  })
  it('never touches ask / follow-up / plan / English / unknown areas', () => {
    for (const turn of ['ask', 'followup', 'compare', 'plan', 'chat']) expect(ensureAdviceFloor(bare, { domain: 'food', turn }).added).toEqual([])
    expect(ensureAdviceFloor(bare, { domain: 'food', turn: 'pick', lang: 'en' }).added).toEqual([])
    expect(ensureAdviceFloor(bare, { domain: 'main', turn: 'pick' }).added).toEqual([])
  })
  it('a trip pick with a length gets generic day lines; style picks the tips', () => {
    const r = ensureAdviceFloor('**Mình chọn: Núi Dinh**. Vì bạn thích núi.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]', { domain: 'travel', turn: 'pick', known: { so_ngay: '3 ngày 2 đêm', phong_cach: 'núi', xuat_phat: 'TP.HCM' } })
    expect(r.added).toContain('days')
    expect(r.text).toContain('Ngày 3:')
    expect(r.text).toContain('giày bám tốt')
    expect(r.text).not.toMatch(/\d+\s*(?:đ|k\b|tr\b|km|phút)/)
  })
  it('a flight pick: tips talk about booking early / baggage and invent no fare or time', () => {
    const r = ensureAdviceFloor('**Mình chọn: chuyến bay SGN-DAD trên Traveloka**. Vì bạn đi một mình.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]', { domain: 'flight', turn: 'pick' })
    expect(r.text).toContain('đặt sớm')
    expect(r.text).toContain('hành lý ký gửi')
    expect(r.text).not.toMatch(/\d{1,2}[:h]\d{2}|\d+\.\d{3}\s*đ/)
  })
  it('counts card bullets as alternatives, not tips', () => {
    expect(tipUnits('**Mình chọn: A**.\n- **B**: rẻ hơn nhưng xa hơn nhiều so với A.\n- **C**: ồn hơn nhiều so với A.')).toBe(0)
  })
  it('carries no price, hour, distance or name in any curated line', () => {
    for (const domain of ['travel', 'flight', 'shopping', 'food', 'spa', 'entertainment']) {
      const r = ensureAdviceFloor('**Mình chọn: A**. Vì …', { domain, turn: 'pick', known: { so_ngay: '3 ngày', phong_cach: 'biển' } })
      expect(r.text.replace(/2–3 nơi|1–2 điểm|Ngày \d/g, '')).not.toMatch(/\d/)
    }
  })
})

describe('tripBudgetEstimate', () => {
  it('2 people, 3 days: arithmetic by category and a labelled total', () => {
    const { rows, total } = tripBudgetRows(2, 3)
    expect(rows.map(r => r.key)).toEqual(['stay', 'food', 'transport', 'tickets'])
    expect(rows[0]).toMatchObject({ lo: 1_000_000, hi: 2_400_000 })
    expect(rows[1]).toMatchObject({ lo: 1_200_000, hi: 2_700_000 })
    expect(total).toEqual([3_400_000, 8_400_000])
  })
  const plan = (extra: Record<string, unknown> = {}) => `Giả định.\n\n[TAPPY_PLAN]\n${JSON.stringify({ type: 'trip', people: [2], budget_total: 'Chưa thể ước tính', days: [{ label: 'Ngày 1', items: [] }, { label: 'Ngày 2', items: [] }, { label: 'Ngày 3', items: [] }], cost_breakdown: { 'Khách sạn': 'chưa có giá', 'Vé': '120.000đ (Google Maps)' }, ...extra })}\n[/TAPPY_PLAN]\n\n**Ngân sách**\n- Khách sạn: chưa có giá — hỏi quán.\n- Tổng: chưa tính được.\n\n**Việc cần làm trước khi đi**\nĐặt phòng.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]`
  it('fills placeholders in the card, keeps a sourced amount, appends the estimate without touching earlier lines', () => {
    const src = plan()
    const r = applyTripBudgetEstimate(src, { lang: 'vi' })
    expect(r.added).toBe(true)
    const json = JSON.parse(r.text.split('[TAPPY_PLAN]')[1].split('[/TAPPY_PLAN]')[0])
    expect(json.cost_breakdown['Vé']).toBe('120.000đ (Google Maps)')
    expect(json.cost_breakdown['Lưu trú']).toContain('ước tính tham khảo')
    expect(json.cost_breakdown['Khách sạn']).toBeUndefined()
    expect(json.budget_total).toContain('chưa gồm vé đi/về')
    expect(r.text).toContain('- Lưu trú: 1.000.000đ–2.400.000đ')
    expect(r.text).toContain('**Ước tính ngân sách (ước tính tham khảo)**')
    // append-only: everything after the plan block, up to the closing markers, is byte-identical
    const tail = (t: string) => t.split('[/TAPPY_PLAN]')[1]
    expect(tail(r.text).startsWith(tail(src).split('[FOLLOWUPS]')[0].replace(/s+$/, ''))).toBe(true)
    expect(r.text.endsWith('[/FOLLOWUPS]')).toBe(true)
  })
  it('keeps the user budget as the total when it is a number', () => {
    const r = applyTripBudgetEstimate(plan({ budget_total: '10.000.000 VND' }), { lang: 'vi' })
    expect(JSON.parse(r.text.split('[TAPPY_PLAN]')[1].split('[/TAPPY_PLAN]')[0]).budget_total).toBe('10.000.000 VND')
  })
  it('ignores non-trip plans and broken JSON', () => {
    expect(applyTripBudgetEstimate(plan({ type: 'evening' })).added).toBe(false)
    expect(applyTripBudgetEstimate('[TAPPY_PLAN]\n{oops\n[/TAPPY_PLAN]').added).toBe(false)
    expect(applyTripBudgetEstimate('no plan here').added).toBe(false)
  })
})

describe('dropEmptyModelBudget', () => {
  const trip = '[TAPPY_PLAN]\n{"type":"trip","days":[{}]}\n[/TAPPY_PLAN]\n\n**Khi trời mưa**\nTrong nhà.\n\n**Ngân sách**\n- Khách sạn: chưa có giá — hỏi quán.\n- Tổng: chưa tính được.\n\n**Việc cần làm trước khi đi**\nĐặt phòng.'
  it('drops a placeholder-only section, keeps the rest', async () => {
    const { dropEmptyModelBudget } = await import('../tripBudgetEstimate')
    const out = dropEmptyModelBudget(trip)
    expect(out).not.toContain('**Ngân sách**')
    expect(out).toContain('**Khi trời mưa**')
    expect(out).toContain('**Việc cần làm trước khi đi**')
  })
  it('keeps a section with a sourced figure, and non-trip text', async () => {
    const { dropEmptyModelBudget } = await import('../tripBudgetEstimate')
    const sourced = trip.replace('- Tổng: chưa tính được.', '- Vé: 120.000đ (Google Maps)')
    expect(dropEmptyModelBudget(sourced)).toBe(sourced)
    expect(dropEmptyModelBudget('**Ngân sách**\n- chưa có giá')).toBe('**Ngân sách**\n- chưa có giá')
  })
})
