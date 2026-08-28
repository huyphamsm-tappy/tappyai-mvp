// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

// ── A5-P1 at the stream level ───────────────────────────────────────────────
//
// The unit proof lives in progressiveFlush.test.ts. This checks the wiring: that the early
// release actually reaches the client, that it is never sent twice, and — the part that must
// never regress — that the P0 price still cannot escape.
//
// Production numbers that motivated it (63313d5): shopping TTUA 2.2s, food TTUA 15.4s, same
// pipeline, same total.

const line0 = (s: string) => '0:' + JSON.stringify(s)

/** Feed deltas through the filter as a places turn, and return every text frame it emitted. */
async function run(deltas: string[], opts: { placeIntent: boolean; travelIntent?: boolean }) {
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(deltas.map(line0).join('\n') + '\n'),
    'vi',
    undefined,
    undefined,
    undefined,
    undefined,
    opts.travelIntent ?? false,
    '',
    opts.placeIntent,
  )
  const raw = await new Response(res.body).text()
  const frames = raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string)
  return { raw, frames, joined: frames.join('') }
}

describe('a places turn releases its money-free opening early', () => {
  it('emits the opening sentence before the reply is finished', async () => {
    const { frames } = await run(
      ['Mình tìm quán bún bò ở Quận 3 nhé. ', 'Quán mở cửa từ 6h sáng.'],
      { placeIntent: true },
    )
    // More than one frame means something went out before the final reconstruction.
    expect(frames.length).toBeGreaterThan(1)
    expect(frames[0]).toContain('Quận 3')
  })

  it('never sends the released prefix twice', async () => {
    const { joined } = await run(
      ['Mình tìm quán bún bò ở Quận 3 nhé. ', 'Quán mở cửa từ 6h sáng.'],
      { placeIntent: true },
    )
    expect(joined.split('Mình tìm quán bún bò ở Quận 3 nhé.').length - 1).toBe(1)
    expect(joined.split('Quán mở cửa từ 6h sáng.').length - 1).toBe(1)
  })

  it('delivers the whole reply, losing nothing', async () => {
    const { joined } = await run(
      ['Mình tìm quán bún bò ở Quận 3 nhé. ', 'Quán mở cửa từ 6h sáng.'],
      { placeIntent: true },
    )
    expect(joined).toContain('Mình tìm quán bún bò ở Quận 3 nhé.')
    expect(joined).toContain('Quán mở cửa từ 6h sáng.')
  })
})

describe('THE P0 MUST STILL HOLD — no unsupported price reaches the client', () => {
  it('the historical fabricated price never appears, in any frame', async () => {
    const { raw, joined } = await run(
      [
        'Mình vừa tìm nhưng chưa có giá cụ thể. ',
        'Thường hủ tiếu Nam Vang ở Phú Nhuận có giá khoảng 30.000 - 50.000đ/tô.',
      ],
      { placeIntent: true },
    )
    expect(joined).not.toContain('30.000')
    expect(joined).not.toContain('50.000')
    expect(raw).not.toContain('30.000')
    // The honest sentence survives — the guard removes claims, it does not silence the reply.
    expect(joined).toContain('chưa có giá cụ thể')
  })

  it('a price is not released even when it arrives in the very first delta', async () => {
    const { joined } = await run(
      ['Tô hủ tiếu khoảng 50.000đ. ', 'Quán khá đông.'],
      { placeIntent: true },
    )
    expect(joined).not.toContain('50.000')
  })
})

describe('scope — nothing else changes', () => {
  it('a travel turn is untouched by the early release (it stays fully buffered)', async () => {
    const { frames } = await run(
      ['Chuyến bay này thường khoảng 1.500.000đ. ', 'Bạn nên đặt sớm.'],
      { placeIntent: true, travelIntent: true },
    )
    // travelGuard owns this turn; nothing may be released before it has run.
    expect(frames.join('')).not.toContain('1.500.000')
  })

  it('a non-places turn still streams live exactly as before', async () => {
    const { joined } = await run(['Giá vàng hôm nay khoảng 75.000.000đ một lượng.'], { placeIntent: false })
    expect(joined).toContain('75.000.000')
  })
})
