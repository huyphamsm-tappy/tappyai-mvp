import { describe, it, expect } from 'vitest'
import { guardTravelClaimsInText } from './travelGuard'

// ── Travel guard on the one-brain route (owner 30/10: "giữ con số kèm nhãn") ──────────────────────────────────────────────────────
//
// Checked 30/10 with eight typical sentences (KIEM-BO-LOC-DU-LICH-20261030.md): a departure time with no evidence deleted the whole
// sentence (also "các chuyến bay sáng thường cất cánh khoảng 6h–8h", general advice), an unbacked fare became "khoang 4 chưa xác minh/người"
// (unreadable), and a code-written notice was appended. On one brain now:
//   · an unbacked amount stays, followed by "(ước tính, chưa xác minh)";
//   · a departure / arrival time no evidence states stays, its sentence followed by "(giờ tham khảo, chưa xác minh)";
//   · a stated number of seats left ("còn 3 chỗ") is still removed (owner 30/10, a) - the model cannot know it;
//   · no code-written notice.
// Every other route keeps its behaviour (asserted below).

const ONE = { lang: 'vi', availability: 'counted' as const, money: 'annotate' as const, schedule: 'label' as const, notice: false }
const run = (s: string, o: Record<string, unknown> = ONE, ev: string[] = []) => guardTravelClaimsInText(`Mở đầu.\n\n${s}\n\nKết.`, [], 'vé tàu Hà Nội Huế 18/12 cho 2 người', { ...o, evidenceTimes: ev }).text
const NOTICE = /mình chưa xác nhận được từ nguồn đã tìm/

describe('travel guard · one brain', () => {
  it('an unbacked fare keeps its figure, labelled; the sentence reads', () => {
    const out = run('Giường nằm khoang 4 khoảng 900.000–1.200.000đ/người một chiều.')
    expect(out).toContain('900.000–1.200.000đ (ước tính, chưa xác minh)/người một chiều.')
    expect(out).not.toMatch(NOTICE)
  })
  it('a departure time no evidence states: the sentence stays, labelled once', () => {
    const out = run('Tàu SE1 khởi hành từ ga Hà Nội lúc 19:25 và đến Huế khoảng 9:00 sáng hôm sau.')
    expect(out).toContain('Tàu SE1 khởi hành từ ga Hà Nội lúc 19:25 và đến Huế khoảng 9:00 sáng hôm sau (giờ tham khảo, chưa xác minh).')
    expect(out.split('giờ tham khảo').length - 1).toBe(1)
    expect(out).not.toMatch(NOTICE)
  })
  it('general advice with hours is kept, labelled, not deleted', () => {
    const out = run('Các chuyến bay sáng thường cất cánh khoảng 6h–8h, giá rẻ hơn chuyến tối.')
    expect(out).toContain('Các chuyến bay sáng thường cất cánh khoảng 6h–8h, giá rẻ hơn chuyến tối')
  })
  it('a stated number of seats left is still removed, with no notice', () => {
    const out = run('Hiện tàu SE1 còn 3 chỗ giường nằm cho ngày 18/12.')
    expect(out).not.toContain('còn 3 chỗ')
    expect(out).toContain('Mở đầu.')
    expect(out).not.toMatch(NOTICE)
  })
  it('run twice (the settle path can re-judge a text) the labels are not doubled', () => {
    const once = guardTravelClaimsInText('Tàu SE1 khởi hành lúc 19:25, vé khoảng 500.000đ.', [], '', { ...ONE, evidenceTimes: [] }).text
    const twice = guardTravelClaimsInText(once, [], '', { ...ONE, evidenceTimes: [] }).text
    expect(twice.split('giờ tham khảo').length - 1).toBe(1)
    expect(twice.split('ước tính, chưa xác minh').length - 1).toBe(1)
  })
  it('a time the evidence states is untouched', () => {
    expect(run('Tàu SE19 khởi hành 20:10 theo trang đặt vé.', ONE, ['20:10'])).toContain('Tàu SE19 khởi hành 20:10 theo trang đặt vé.\n')
  })
  it('other routes: unchanged - the sentence goes and the notice is added', () => {
    const out = run('Tàu SE1 khởi hành từ ga Hà Nội lúc 19:25.', { lang: 'vi' })
    expect(out).not.toContain('19:25')
    expect(out).toMatch(NOTICE)
  })
})
