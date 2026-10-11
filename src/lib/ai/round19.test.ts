// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dedupeCaveats } from './caveatDedupe'
import { detectPlanningIntent } from './intent'
import { askVerdict } from './agent/runtime/askGate'
import { guardPlanItems } from './planItemGuard'
import { guardPlanTripFacts } from './planTripFactsGuard'
import { composeFinal, withoutQuestions, withoutParaphrasedPrefaceParagraphs } from './agent/runtime/answerFirst'
import { agentSystemV2For, CONSULT_PRINCIPLES_R19 } from './agent/runtime/consultativeVoice'
import { AGENT_SYSTEM_V2 } from './agent/runtime/prompt'

describe('dedupeCaveats (flight turn: two identical "not verified" sentences)', () => {
  const twice = 'Mình chưa xác minh được giá vé chặng này.\n\nMình chưa xác minh được giá vé chặng này.\n\nBạn nên đặt sớm.'
  it('keeps the first, drops the repeat, keeps other prose', () => {
    const out = dedupeCaveats(twice)
    expect(out.match(/chưa xác minh/g)?.length).toBe(1)
    expect(out).toContain('Bạn nên đặt sớm.')
  })
  it('drops a reworded repeat in the same paragraph', () => {
    const out = dedupeCaveats('Giá vé thì mình chưa xác minh được. Mình chưa xác minh được giá vé nhé.')
    expect(out.match(/chưa xác minh/g)?.length).toBe(1)
  })
  it('never touches a caveat that carries a figure, a link or a machine block', () => {
    const t = 'Mình chưa xác minh được số này.\n\nGiá 28.250 đ/lít chưa xác minh được nguồn thứ hai.\n[TAPPY_PLAN]{"a":"chưa xác minh được số này."}[/TAPPY_PLAN]'
    expect(dedupeCaveats(t)).toBe(t)
  })
  it('a different caveat stays', () => {
    const t = 'Mình chưa xác minh được giờ bay.\n\nMình chưa tra được giờ mở cửa của quán này.'
    expect(dedupeCaveats(t)).toContain('giờ mở cửa')
  })
})

describe('Tesla opener: a dropped question takes its continuation along', () => {
  const pre = 'Tesla có bao nhiêu sáng kiến nhỉ? Còn "hiện ứng dụng được bao nhiêu" thì chưa ai đếm.'
  it('flag on: no dangling "Còn…"', () => {
    expect(withoutQuestions(pre, { keepWhole: true })).toBe('')
  })
  it('flag off (control): old behaviour keeps the dangling sentence', () => {
    expect(withoutQuestions(pre)).toMatch(/^Còn/)
    expect(composeFinal([pre], 'Tesla được ghi nhận 311 bằng sáng chế.')).toMatch(/Còn/)
    expect(composeFinal([pre], 'Tesla được ghi nhận 311 bằng sáng chế.', { dedupeParaphrase: true })).not.toMatch(/Còn/)
  })
  it('a statement that starts with Còn after a KEPT sentence stays', () => {
    expect(withoutQuestions('Đây là kết quả. Còn giá thì mình chưa rõ.', { keepWhole: true })).toContain('Còn giá')
  })
})

describe('preface paragraph restated by an uncited final paragraph', () => {
  const p = 'Cuốn Snow Crash của Neal Stephenson là tiểu thuyết khoa học viễn tưởng năm 1992 mô tả metaverse và avatar, và chưa có bằng chứng nào nói hai người đó cùng đọc nó vào một dịp cụ thể.'
  const f = 'Cuốn Snow Crash của Neal Stephenson là tiểu thuyết khoa học viễn tưởng năm 1992 mô tả metaverse và avatar, và chưa có bằng chứng nào nói hai người đó cùng đọc nó vào một dịp cụ thể nào.'
  it('near-restatement is dropped (flag path)', () => {
    expect(withoutParaphrasedPrefaceParagraphs([p], f)).toEqual([])
  })
  it('an unrelated final paragraph keeps the preface', () => {
    expect(withoutParaphrasedPrefaceParagraphs([p], 'Hôm nay trời Nha Trang nắng đẹp, nhiệt độ khoảng ba mươi độ, thích hợp đi biển vào buổi sáng sớm và chiều muộn.')).toEqual([p])
  })
})

describe('trip named over two turns (live 2026-10-11: plan cut to its first sentence, venue cards instead)', () => {
  const a = 'cuối tuần sau tui muốn đi du lịch có gợi ý gì ko'
  const b = 'chưa biết đi đâu, dẫn con ghệ đi theo tầm 3 ngày'
  it('neither text alone reads as a trip, the two together do', () => {
    expect(detectPlanningIntent(b)).toBeNull()
    expect(detectPlanningIntent(`${a} \n ${b}`)).toBe('trip')
  })
})

describe('ask gate: an open travel ask is not answered with a question', () => {
  const q = 'Bạn muốn đi mấy ngày, hay để mình chọn một chuyến ngắn hợp cuối tuần?'
  const a = 'cuối tuần sau tui muốn đi du lịch có gợi ý gì ko'
  it('refused when the trip wording is in the recent texts', () => {
    expect(askVerdict(a, q, 'vi', a)?.kind).toBe('trip_open')
    expect(askVerdict('chưa biết đi đâu, dẫn con ghệ đi tầm 3 ngày', 'Bạn đi từ đâu?', 'vi', `${a} \n chưa biết đi đâu`)?.kind).toBe('trip_open')
  })
  it('without the extra argument (flag off / old callers) nothing changes', () => {
    expect(askVerdict(a, q, 'vi')).toBeNull()
  })
  it('a non-travel conversation is never gated by it', () => {
    expect(askVerdict('mua tai nghe', 'Ngân sách bao nhiêu?', 'vi', 'mua tai nghe')).toBeNull()
  })
})

describe('plan guards: a complete trip (flag on) vs the old rules (control)', () => {
  const plan = (items: unknown[]) => `x [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Đà Lạt 3 ngày (Thứ bảy 17/10)', days: [{ label: 'Ngày 1 (17/10)', items }] })}[/TAPPY_PLAN]`
  const items = [
    { time: '07:00', category: 'transport', name: 'Xe khách TP.HCM – Đà Lạt', description: 'Xe khách khởi hành từ TP.HCM, ước tính 7 giờ' },
    { time: '15:00', category: 'attraction', name: 'Hồ Xuân Hương', description: 'Dạo hồ, mở cửa 24/7', price: '50.000đ', maps_link: 'https://x', place_id: 'p1' },
    { time: '17:00', category: 'attraction', name: 'Quảng trường Lâm Viên', description: 'Ngắm hoàng hôn' },
  ]
  const places = [{ name: 'Quảng trường Lâm Viên', address: 'Xuân Hương - Đà Lạt', place_types: ['quảng trường'] }]

  it('flag on: a famous sight is kept by name only (no price, link, figure); duplicates of one venue go', () => {
    const r = guardPlanItems(plan([...items, { time: '19:00', category: 'attraction', name: 'Quảng trường Lâm Viên', description: 'Đi dạo tối' }]), places, { destination: 'Đà Lạt', keepSights: true })
    const p = JSON.parse(r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]')))
    const names = p.days[0].items.map((i: { name: string }) => i.name)
    expect(names).toEqual(['Xe khách TP.HCM – Đà Lạt', 'Hồ Xuân Hương', 'Quảng trường Lâm Viên'])
    const ho = p.days[0].items[1]
    expect(ho.price).toBe('')
    expect(ho.maps_link).toBeUndefined()
    expect(ho.place_id).toBeUndefined()
    expect(ho.description).not.toMatch(/\d/)
    expect(r.sightsKept).toBe(1)
  })
  it('flag off (control): an unmatched sight is dropped as before', () => {
    const r = guardPlanItems(plan(items), places, { destination: 'Đà Lạt' })
    expect(r.text).not.toContain('Hồ Xuân Hương')
  })
  it('flag on: the outbound leg, the date label and the departure city stay; flag off they are cut', () => {
    const t = plan(items)
    const on = guardPlanTripFacts(t, ['cuối tuần sau muốn đi du lịch'], { assumeLegs: true })
    expect(on.stopsDropped).toBe(0)
    expect(on.text).toContain('Xe khách TP.HCM')
    expect(on.text).toContain('17/10')
    const off = guardPlanTripFacts(t, ['cuối tuần sau muốn đi du lịch'])
    expect(off.stopsDropped).toBeGreaterThan(0)
  })
})

describe('prompt', () => {
  it('flag off: the base prompt is unchanged', () => {
    expect(agentSystemV2For(false)).toBe(AGENT_SYSTEM_V2)
    expect(agentSystemV2For(false)).not.toContain('GỢI Ý VÀ LỊCH TRÌNH TRỌN CHUYẾN')
  })
  it('flag on: knowledge tiers + complete-trip rules are present', () => {
    const s = agentSystemV2For(true)
    expect(s).toContain(CONSULT_PRINCIPLES_R19)
    expect(s).toContain('BẮT BUỘC web_search')
    expect(s).toContain('KHÔNG hỏi ngược')
  })
})
