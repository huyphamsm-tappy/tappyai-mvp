// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// 29/10 (localhost 3039, Agoda Lite ON, "khách sạn Đà Nẵng 5/12–7/12 cho 2 người"): the realtime layer fetched ten Agoda rates, the links
// showed them, and the travel guard emptied the reply's price table ("Giá phòng theo ngày mình chưa xác nhận được…"). A FETCHED nightly rate
// (`realtime_results[].price`) and the stay's total (× `stay_nights`) are now evidence; an invented rate is still cut; with no realtime row
// (every flag OFF by default) nothing changes.
const USER = 'Tìm khách sạn Đà Nẵng từ 5/12 đến 7/12/2026 cho 2 người, giá bao nhiêu'

async function run(reply: string, result: Record<string, unknown>): Promise<string> {
  const collector = createEnrichmentCollector(USER)
  const frames = [
    '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'get_hotel_prices', args: { location: 'Đà Nẵng' } }),
    'a:' + JSON.stringify({ toolCallId: 't1', result }),
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const orig = console.log
  console.log = () => {}
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, true, USER, false)
    const body = await new Response(res.body).text()
    return body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  } finally { console.log = orig }
}

const row = (name: string, price: number) => ({ provider: 'Agoda', name, price, currency: 'VND', price_text: `${price.toLocaleString('vi-VN')}đ`, stay_nights: 2, availability_status: 'available', checked_at: '13:00', booking_url: `https://www.agoda.com/vi-vn/partners/partnersearch.aspx?cid=1974819&hid=1` })
const WITH_RATES = { search_results: [], realtime_results: [row('Khách sạn Ocean Haven', 718_581), row('Khách sạn Sea Front', 867_084)] }

describe('a nightly rate the realtime layer fetched is evidence for the travel guard', () => {
  it('the fetched rate and the 2-night total stay; an invented rate is cut', async () => {
    const reply = 'Mình tìm được giá trên Agoda cho 2 đêm.\n\nKhách sạn Ocean Haven giá 718.581đ/đêm, tổng 2 đêm khoảng 1.437.162đ.\n\nKhách sạn Sea Front giá 867.084đ/đêm.\n\nKhách sạn Bịa giá 555.000đ/đêm.'
    const out = await run(reply, WITH_RATES)
    expect(out).toContain('718.581đ/đêm')
    expect(out).toContain('1.437.162đ')
    expect(out).toContain('867.084đ/đêm')
    expect(out).not.toContain('555.000')
  })
  it('without realtime rows (flags OFF), the same rates are unsupported and cut, as before', async () => {
    const out = await run('Mình tìm được vài lựa chọn.\n\nKhách sạn Ocean Haven giá 718.581đ/đêm.', { search_results: [] })
    expect(out).not.toContain('718.581')
  })
  it('a row without a fresh price adds nothing', async () => {
    const stale = { search_results: [], realtime_results: [{ provider: 'Agoda', name: 'Khách sạn Ocean Haven', price: null, availability_status: 'unknown', booking_url: null }] }
    const out = await run('Mình tìm được vài lựa chọn.\n\nKhách sạn Ocean Haven giá 718.581đ/đêm.\n\nKhách sạn Sea Front giá 555.000đ/đêm.', stale)
    expect(out).not.toContain('718.581')
    expect(out).not.toContain('555.000')
  })
})
