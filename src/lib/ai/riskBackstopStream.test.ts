// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { RISK_BLOCK } from './riskBackstop'

// F-043 — the backstop on the wire. A second-hand purchase turn runs no tool, so it streams live;
// the block must arrive as one last `0:` frame before `d:` (live mode) or sit before the markers
// with the threshold parenthetical removed (buffer mode).

const THREAD = ['muốn mua máy macbook pro m1', 'mua máy cũ thì cần check cái gì']
const REPLY = 'Khi mua máy cũ, check màn hình và bàn phím trước. Giá rẻ bất thường (dưới 70% giá mới) thì nghi.\n\n[FOLLOWUPS]Shop uy tín|Kiểm tra pin[/FOLLOWUPS]'

async function run(mode: string) {
  const saved = process.env.RISK_BACKSTOP
  process.env.RISK_BACKSTOP = mode
  try {
    const lines = ['0:' + JSON.stringify(REPLY.slice(0, 40)), '0:' + JSON.stringify(REPLY.slice(40)), 'd:{"finishReason":"stop"}']
    const collector = createEnrichmentCollector(THREAD[1], [THREAD[0]])
    const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, THREAD[1], false)
    const raw = await new Response(res.body).text()
    const frames = raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string)
    return { raw, frames, text: frames.join('') }
  } finally {
    if (saved === undefined) delete process.env.RISK_BACKSTOP; else process.env.RISK_BACKSTOP = saved
  }
}

describe('risk backstop on the stream', () => {
  it('off: byte-identical', async () => {
    const { text } = await run('0')
    expect(text).toBe(REPLY)
  })
  it('live: the model text streams untouched, the block + hedge arrive as the last frame, before d:', async () => {
    const { raw, frames, text } = await run('1')
    expect(text.startsWith(REPLY)).toBe(true)
    expect(frames[frames.length - 1]).toContain(RISK_BLOCK.vi.pointer)
    expect(text).toContain(RISK_BLOCK.vi.lines.ownership)
    expect(text).toContain(RISK_BLOCK.vi.thresholdHedge)
    expect(text).toContain('(dưới 70% giá mới)') // nothing already sent is removed
    expect(raw.lastIndexOf('0:')).toBeLessThan(raw.lastIndexOf('d:'))
  })
  it('buffer: the parenthetical is removed and the block sits before the markers', async () => {
    const { text } = await run('buffer')
    expect(text).not.toContain('(dưới 70% giá mới)')
    expect(text).toContain('Giá rẻ bất thường thì nghi.')
    expect(text.indexOf(RISK_BLOCK.vi.pointer)).toBeLessThan(text.indexOf('[FOLLOWUPS]'))
    expect(text).not.toContain(RISK_BLOCK.vi.thresholdHedge)
  })
  it('inert on a place thread even when enabled', async () => {
    const saved = process.env.RISK_BACKSTOP
    process.env.RISK_BACKSTOP = '1'
    try {
      const lines = ['0:' + JSON.stringify('Quán này ngon (dưới 50% khách chê).'), 'd:{"finishReason":"stop"}']
      const collector = createEnrichmentCollector('trưa nay ăn gì', [])
      const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'trưa nay ăn gì', false)
      const raw = await new Response(res.body).text()
      expect(raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).join('')).toBe('Quán này ngon (dưới 50% khách chê).')
    } finally {
      if (saved === undefined) delete process.env.RISK_BACKSTOP; else process.env.RISK_BACKSTOP = saved
    }
  })
})
