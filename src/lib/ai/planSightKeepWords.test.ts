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
})

describe('an unmatched sight on the one-brain route', () => {
  it('keeps the words around a figure and says once that hours and fees were left out', () => {
    const d = run('Đi sớm để ngắm bình minh, chụp ảnh đẹp nhất ở bậc thang phía Đông. Mở cửa 05:00–22:00, vé 20.000đ')
    expect(d).toContain('Đi sớm để ngắm bình minh, chụp ảnh đẹp nhất ở bậc thang phía Đông.')
    expect(d).toContain('kiểm tra lại')
    expect(d).not.toMatch(/\d/)
  })
  it('a description that is only figures is still the plain check line', () => {
    const d = run('Mở cửa 05:00–22:00, vé 20.000đ')
    expect(d).toBe('Giờ mở cửa và giá vé cần kiểm tra lại trước khi đi.')
  })
})
