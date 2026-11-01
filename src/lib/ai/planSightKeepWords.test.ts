// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlanItems, withoutFigureClauses } from './planItemGuard'

// ── 01/11 (owner UAT: the plan card reads bland) ─────────────────────────────────────────────────────────────────────────────────────────
//
// A sight the tools did not return keeps no price, link or address, and a description holding a figure (hours, a fee) was replaced as a
// WHOLE by "Giờ mở cửa và giá vé cần kiểm tra lại trước khi đi." - so one digit in "ngắm hoàng hôn lúc 17:30, chụp góc bậc thang phía Đông"
// threw away the part that made the stop worth going to (UAT 01/11: Biển Mỹ Khê, Chùa Linh Ứng, Cầu Rồng all read the same line). Only the
// clauses that carry a figure go now; the words around them stay, and the same check line says the figures were left out.

const plan = (items: unknown[]) => `x [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Đà Nẵng', days: [{ label: 'Ngày 1', items }] })}[/TAPPY_PLAN]`
const items = (r: { text: string }) => JSON.parse(r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]'))).days[0].items
const OPTS = { destination: 'Đà Nẵng', keepSights: true, knownSightsUnlabelled: true }
const run = (description: string) => items(guardPlanItems(plan([{ time: '16:00', category: 'attraction', name: 'Chùa Linh Ứng', description }]), [], OPTS))[0].description as string

describe('withoutFigureClauses', () => {
  it('keeps the sentences and clauses with no figure, drops the ones that carry one', () => {
    expect(withoutFigureClauses('Đi sớm để ngắm bình minh, chụp ảnh đẹp nhất ở bậc thang phía Đông. Mở cửa 05:00–22:00, vé 20.000đ'))
      .toBe('Đi sớm để ngắm bình minh, chụp ảnh đẹp nhất ở bậc thang phía Đông.')
    expect(withoutFigureClauses('Ngắm hoàng hôn lúc 17:30, góc chụp đẹp ở bậc thang phía Đông')).toBe('Góc chụp đẹp ở bậc thang phía Đông')
  })
  it('is empty when every clause carries a figure, and unchanged when none does', () => {
    expect(withoutFigureClauses('Mở cửa 05:00–22:00, vé 20.000đ')).toBe('')
    expect(withoutFigureClauses('Đi dạo khi trời tạnh, để ý cờ cảnh báo')).toBe('Đi dạo khi trời tạnh, để ý cờ cảnh báo')
  })
  it('review 01/11: only hours and fees are figures - a duration or a digit inside a name stays', () => {
    const kept = 'Đi bộ khoảng 2 tiếng, ngắm Cầu Rồng 3D khi trời tối, chụp 20 tấm ảnh'
    expect(withoutFigureClauses(kept)).toBe(kept)
    expect(withoutFigureClauses('Ngắm cảnh, mở từ 7h30, vé 30$, giá €22, 50k một người, 2 triệu một đêm, ¥500')).toBe('Ngắm cảnh')
    expect(withoutFigureClauses('Mở 9am–5pm, đi 2 km từ bến')).toBe('Đi 2 km từ bến')
  })
})

const planOf = (r: { text: string }) => JSON.parse(r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]')))
const CHECK = 'Giờ mở cửa và giá vé cần kiểm tra lại trước khi đi.'
const sight = (description: string, name = 'Chùa Linh Ứng') => ({ time: '16:00', category: 'attraction', name, description })
const tipsWithCheck = (p: { local_tips?: Array<{ text: string }> }) => (p.local_tips ?? []).filter(t => t.text === CHECK)

describe('an unmatched sight on the one-brain route', () => {
  it('keeps the words around a figure, and the stop itself carries no check line', () => {
    const d = run('Đi sớm để ngắm bình minh, chụp ảnh đẹp nhất ở bậc thang phía Đông. Mở cửa 05:00–22:00, vé 20.000đ')
    expect(d).toBe('Đi sớm để ngắm bình minh, chụp ảnh đẹp nhất ở bậc thang phía Đông.')
  })
  it('a description that is only figures leaves the stop with no description', () => {
    expect(run('Mở cửa 05:00–22:00, vé 20.000đ')).toBe('')
  })
})

describe('the check line is written once per plan (UAT 01/11: it repeated on 19 stops of 10 plans)', () => {
  const run3 = () => planOf(guardPlanItems(plan([sight('Đi dạo, mở cửa 05:00', 'A'), sight('Ngắm cảnh, vé 20.000đ', 'B'), sight('Chụp ảnh đẹp, giá 50.000đ', 'C')]), [], OPTS))
  it('one tip for the whole plan, none on the stops', () => {
    const p = run3()
    expect(tipsWithCheck(p)).toHaveLength(1)
    expect(JSON.stringify(p.days)).not.toContain(CHECK)
  })
  it('added to the model\'s own tips, which stay', () => {
    const r = guardPlanItems(`x [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'T', local_tips: [{ text: 'Mang ô', basis: 'general' }], days: [{ label: 'Ngày 1', items: [sight('mở cửa 05:00')] }] })}[/TAPPY_PLAN]`, [], OPTS)
    const p = planOf(r)
    expect(p.local_tips.map((t: { text: string }) => t.text)).toEqual(['Mang ô', CHECK])
  })
  it('a description whose only digits are a duration is kept whole and adds no tip (reviewer 01/11)', () => {
    const r = guardPlanItems(plan([sight('Đi bộ khoảng 2 tiếng quanh khu phố cổ')]), [], OPTS)
    expect(items(r)[0].description).toBe('Đi bộ khoảng 2 tiếng quanh khu phố cổ')
    expect(tipsWithCheck(planOf(r))).toHaveLength(0)
  })
  it('not added when the model already wrote it, nor when no figure was left out', () => {
    const had = guardPlanItems(`x [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'T', local_tips: [{ text: CHECK, basis: 'general' }], days: [{ label: 'Ngày 1', items: [sight('mở cửa 05:00')] }] })}[/TAPPY_PLAN]`, [], OPTS)
    expect(tipsWithCheck(planOf(had))).toHaveLength(1)
    const none = planOf(guardPlanItems(plan([sight('Đi dạo khi trời tạnh')]), [], OPTS))
    expect(tipsWithCheck(none)).toHaveLength(0)
  })
})
