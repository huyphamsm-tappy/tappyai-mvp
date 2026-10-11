// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { safeFlushPoint } from './progressiveFlush'

// Live 2026-10-11 (passport answer, B6): sentences carrying a [S#] source marker were streamed early as raw text; the settled text turns the
// marker into a markdown link, so the released bytes were no longer its prefix and the final send repeated the reply. Flag on: a sentence with a
// marker is held until the settled text. Flag off: unchanged.

const U1 = 'https://dichvucong.bocongan.gov.vn/bocongan/bothutuc/tthc?matt=29497'
const U2 = 'https://vpcp.dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-nganh-doc.html?ma_thu_tuc=1.001456'
const Q = 'Thủ tục làm hộ chiếu phổ thông lần đầu cho người lớn thế nào? Cần giấy tờ gì, nộp ở đâu, mất bao lâu?'
const P1 = 'Làm hộ chiếu phổ thông lần đầu khá gọn: chuẩn bị giấy tờ, nộp hồ sơ trực tiếp hoặc trực tuyến, rồi nhận hộ chiếu.\n\nThời gian: thường không quá 8 ngày làm việc kể từ khi hồ sơ hợp lệ.'
const P2 = 'Theo hướng dẫn trên Cổng Dịch vụ công Bộ Công an, người làm hộ chiếu lần đầu nộp tại Cơ quan Quản lý xuất nhập cảnh Công an cấp tỉnh [S1].\n\nHồ sơ có tờ khai đề nghị cấp hộ chiếu mẫu TK01 dành cho người từ đủ 14 tuổi [S2].\n\nThời hạn giải quyết là 8 ngày làm việc; hồ sơ hợp lệ sẽ được cấp giấy hẹn [S2].'

async function run(flag: boolean) {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  if (flag) collector.consultative = true
  collector.citationSources = [{ id: 'S1', host: 'dichvucong.bocongan.gov.vn', url: U1 }, { id: 'S2', host: 'vpcp.dichvucong.gov.vn', url: U2 }]
  const frames = [
    '9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["x"]}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [{ title: 'a', link: U1 }, { title: 'b', link: U2 }] } }),
    '0:' + JSON.stringify(`${P1}\n\n${P2}`),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, Q, true, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('progressive flush never releases a sentence carrying a [S#] marker (flag on)', () => {
  it('safeFlushPoint: stops before the first sentence with a marker only when asked to', () => {
    const t = `${P1}\n\n${P2}`
    const cut = t.indexOf('Theo hướng dẫn')
    expect(safeFlushPoint(t, true, true)).toBeLessThanOrEqual(cut)
    expect(safeFlushPoint(t, true)).toBeGreaterThan(cut) // default: unchanged
  })

  it('flag ON: every paragraph once, no raw marker, the last link complete', async () => {
    const out = await run(true)
    expect(out.match(/Làm hộ chiếu phổ thông lần đầu khá gọn/g)).toHaveLength(1)
    expect(out.match(/Theo hướng dẫn trên Cổng/g)).toHaveLength(1)
    expect(out).not.toMatch(/\[S\d/)
    expect(out.trimEnd().endsWith(`(${U2})).`) || out.trimEnd().endsWith(`(${U2}))`)).toBe(true)
  })

  it('CONTROL — flag OFF: unchanged (the early release of a marker sentence still happens)', async () => {
    const out = await run(false)
    expect(out.match(/Làm hộ chiếu phổ thông lần đầu khá gọn/g)!.length).toBeGreaterThan(1)
  })
})
