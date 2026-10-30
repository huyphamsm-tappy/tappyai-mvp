// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// ── N5 rest (30/10): on one brain the settle path adds no sentence of its own to the model's answer ────────────────────────────────
//
// Review 30/10 (read-only, two reviewers): on the one-brain route the settle path could still write into the reply - a server pick
// sentence when the body was short ("Mình chọn **X** — 4.5⭐ …"), and the coach-fare step's "Mình chưa xác minh được mức giá này có áp dụng
// cho ngày … hay không." The model wrote the answer and states what it could not confirm (oneBrain.ts). Other routes keep these.

const COACH_U = 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html'
const COACH_ROWS = [{ title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: COACH_U, snippet: 'Với giá vé chỉ từ 410000 đ. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' }]
const QV = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'

async function run(frames: string[], q: string, oneBrain: boolean, opts: { travel?: boolean; place?: boolean } = {}) {
  const collector = createEnrichmentCollector(q)
  if (oneBrain) collector.oneBrain = true
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, opts.travel === true, q, opts.place === true, (async () => ({ perPlace: new Map(), batch: null })) as never)
  return (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('N5 rest · one brain: no settle-path sentence', () => {
  const coach = (text: string) => [
    '9:{"toolCallId":"t1","toolName":"get_transport_options","args":{"origin":"TP.HCM","destination":"Quy Nhơn","mode":"intercity","date":"2026-10-24"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { type: 'intercity', origin: 'TP.HCM', destination: 'Quy Nhơn', bus_search_results: COACH_ROWS, train_search_results: [], note: 'x' } }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const fare = 'Vé xe khách TP.HCM–Quy Nhơn ngày 24/10/2026 đang được niêm yết từ 410.000đ/chiều trên Vexere.'
  it('coach fares: the model\'s sentence is not rewritten and no "chưa xác minh … cho ngày" sentence is added', async () => {
    const on = await run(coach(fare), QV, true, { travel: true })
    expect(on).toContain(fare)
    expect(on).not.toContain('Mình chưa xác minh được mức giá này có áp dụng')
  })
  it('the same coach turn on the old route keeps its date sentence (unchanged)', async () => {
    const off = await run(coach(fare), QV, false, { travel: true })
    expect(off).toContain('Mình chưa xác minh được mức giá này có áp dụng')
  })
})
