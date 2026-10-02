import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { guardMoneyClaimsInText, type EvidenceRecord } from './moneyGuard'

/**
 * Owner UAT 2026-09-28 (live348 shop.t1, deploy e05de06 a1-shop-t1): "mua tai nghe bluetooth dưới
 * 1 triệu" answered "…từ **Phong Vũ** Rẻ nhất…" and "Nếu bạn muốn chất lượng âm thanh cao hơn Nếu
 * cần chống ồn tốt, nhưng gần chạm ngang ngan sách."
 *
 * Root cause: the money guard's clause cut (`removeClauseAround`, moneyGuard.ts). When the amount's
 * clause ran to the END of the sentence there was no delimiter after it, so the cut took the
 * sentence's own "." with it and the kept head glued onto the next sentence ("cao hơn Nếu…").
 * And when the cut clause was the MAIN clause of a conditional ("Nếu cần chống ồn tốt, **X** 990k,
 * nhưng…"), the subordinate clause survived with no consequence.
 *
 * The `a:` frame is the real tool result from that live turn; the prose is the model's shape.
 */
const frames = readFileSync(join(__dirname, '__fixtures__', 'shopTaiNgheUnder1M.live.txt'), 'utf8')
  .split(/\r?\n/).filter(Boolean)
const USER = 'mua tai nghe bluetooth dưới 1 triệu'

async function run(prose: string): Promise<string> {
  const input = [...frames, '0:' + JSON.stringify(prose), 'd:{"finishReason":"stop"}'].join('\n') + '\n'
  const filtered = applyPlaceEnrichmentStreamFilter(new Response(input), 'vi', undefined, undefined, undefined, undefined, false, USER)
  const raw = await new Response(filtered.body).text()
  return raw.split('\n').filter(l => l.startsWith('0:'))
    .map(l => JSON.parse(l.slice(2)) as string).filter(s => !s.startsWith('[TAPPY')).join('')
}

/** A lower-case word (or a closing bold) glued to the next sentence's capital with no stop between. */
const GLUE = /(?:\p{Ll}|\*\*) (?:Nếu|Rẻ|Mình|Ngoài|Pin)(?!\p{L})/u
/** A conditional / subordinate clause left without its consequence. */
const DANGLING_IF = /(?:^|[.!?]\s+|\n)(?:Ngoài ra, )?[Nn]ếu [^.!?\n]*?(?:[.!?]|, nhưng|$)/u

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

describe('money guard clause cut never leaves a fragment (UAT shop.t1 2026-09-28)', () => {
  it('live shape A: "…**Phong Vũ**, giá X. Rẻ nhất…" and a conditional whose consequence was cut', async () => {
    const out = await run([
      'Mình chọn **Tai nghe không dây TWS Baseus Bass EP10 NC** từ **Phong Vũ**, giá 305.000đ. Rẻ nhất trong danh sách và được nhiều người tin tưởng.',
      '',
      'Ngoài ra, nếu bạn muốn chất lượng âm thanh cao hơn, **UGREEN ClipBuds Pro** (872.000đ) có ANC và Hi-Res. Nếu cần chống ồn tốt, **Tai nghe DareU EH925s Pro** 990.000đ, nhưng gần chạm ngân sách.',
      '',
      'Mình giả sử bạn cần tai nghe dùng hàng ngày với giá tốt — **Baseus EP10 NC** là lựa chọn cân bằng nhất. 👍',
    ].join('\n'))
    expect(out).not.toMatch(GLUE)
    expect(out).not.toContain('Nếu cần chống ồn tốt, nhưng')
    expect(out).not.toMatch(/Nếu cần chống ồn tốt/)
    // What the guard protects still goes.
    expect(out).not.toContain('990.000')
    // The sentence boundary survives the cut.
    expect(out).toContain('từ **Phong Vũ**. Rẻ nhất trong danh sách')
    expect(out).toContain('**Baseus EP10 NC** là lựa chọn cân bằng nhất')
  })

  it('live shape B: "…cao hơn, **X** giá Y. Nếu cần chống ồn tốt, **Z** là Y." — no "cao hơn Nếu cần"', async () => {
    const out = await run([
      'Mình chọn **Tai nghe không dây TWS Baseus Bass EP10 NC**, rẻ và bền.',
      '',
      'Ngoài ra, nếu bạn muốn chất lượng âm thanh cao hơn, **Tai nghe DareU EH925s Pro** giá 990.000đ. Nếu cần chống ồn tốt, **DareU EH925s Pro** là 990.000đ.',
      '',
      'Mình giả sử bạn cần tai nghe dùng hàng ngày.',
    ].join('\n'))
    expect(out).not.toMatch(/cao hơn Nếu/)
    expect(out).not.toMatch(GLUE)
    for (const s of sentencesOf(out)) expect(s, s).not.toMatch(DANGLING_IF)
    expect(out).not.toContain('990.000')
    expect(out).toContain('Mình chọn **Tai nghe không dây TWS Baseus Bass EP10 NC**, rẻ và bền.')
    expect(out).toContain('Mình giả sử bạn cần tai nghe dùng hàng ngày.')
  })
})

describe('removeClauseAround — unit shapes (deterministic verdicts)', () => {
  const rec = (title: string, price: string): EvidenceRecord => ({ title, price, source: 'shop' })
  const SONY = [rec('Sony WH-1000XM5', '8.000.000 ₫')]
  const guard = (t: string) => guardMoneyClaimsInText(t, SONY, ['Sony WH-1000XM5']).text

  it('a tail clause cut keeps the sentence stop', () => {
    expect(guard('Sony WH-1000XM5 chống ồn rất tốt, giá 5.000.000đ. Pin dùng cả ngày.'))
      .toBe('Sony WH-1000XM5 chống ồn rất tốt. Pin dùng cả ngày.')
    expect(guard('Sony WH-1000XM5 chống ồn rất tốt, giá 5.000.000đ! Pin dùng cả ngày.'))
      .toBe('Sony WH-1000XM5 chống ồn rất tốt! Pin dùng cả ngày.')
  })

  it('a conditional whose main clause carried the amount goes whole', () => {
    expect(guard('Nếu bạn cần chống ồn, Sony WH-1000XM5 giá 5.000.000đ. Pin dùng cả ngày.'))
      .toBe('Pin dùng cả ngày.')
    expect(guard('Nếu cần chống ồn tốt, Sony WH-1000XM5 5.000.000đ, nhưng gần chạm ngân sách. Pin dùng cả ngày.'))
      .toBe('Pin dùng cả ngày.')
    expect(guard('Ngoài ra, khi cần chống ồn, Sony WH-1000XM5 giá 5.000.000đ. Pin dùng cả ngày.'))
      .toBe('Pin dùng cả ngày.')
    expect(guard('If you need ANC, the Sony WH-1000XM5 costs 5.000.000đ. Battery lasts all day.'))
      .toBe('Battery lasts all day.')
  })

  it('a conditional keeps its sentence when the amount was not its main clause', () => {
    expect(guard('Nếu bạn cần chống ồn, Sony WH-1000XM5 rất đáng tiền, giá 5.000.000đ. Pin dùng cả ngày.'))
      .toBe('Nếu bạn cần chống ồn, Sony WH-1000XM5 rất đáng tiền. Pin dùng cả ngày.')
  })
})

describe('price identity (UAT 2026-09-28): a real price is not removed for a wireless product under a budget query', () => {
  it('"không dây" is not a strap; the budget is not part of the product', async () => {
    const { requestedEntity } = await import('./moneyGuard')
    expect(requestedEntity('tai nghe bluetooth dưới 1 triệu')).toBe('tai nghe bluetooth')
    expect(requestedEntity('laptop dưới 15tr')).toBe('laptop')
  })
})

describe('dangling conditional when the kept head ends in its own comma (uat @ 1e11b32)', () => {
  it('lastClauseOf skips the empty tail after a trailing delimiter', async () => {
    const { lastClauseOf } = await import('./moneyGuard')
    expect(lastClauseOf('Nếu bạn muốn chất lượng âm thanh cao hơn, ')).toBe('Nếu bạn muốn chất lượng âm thanh cao hơn')
    expect(lastClauseOf('Ngoài ra, nếu cần chống ồn tốt, ')).toBe('nếu cần chống ồn tốt')
    expect(lastClauseOf('Mình chọn A, giá ')).toBe('giá')
  })
})
