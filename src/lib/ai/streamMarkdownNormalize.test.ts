import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

// Owner UAT blocker 2026-09-28: literal "**" in answers. The server's final text drops unmatched
// bold per line and strips markdown inside marker JSON strings — buffered and live finish paths.

const line0 = (s: string) => '0:' + JSON.stringify(s)

async function run(lines: string[]): Promise<string> {
  const filtered = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'))
  const out = await new Response(filtered.body).text()
  return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('streamEnrichment final markdown normaliser', () => {
  it('buffered path: orphan bold dropped, plan JSON strings stripped, markers intact', async () => {
    const plan = JSON.stringify({ type: 'trip', title: '**Đà Nẵng**', days: [{ label: 'Ngày 1', items: [
      { time: '14:00', name: 'San San Hotel', category: 'hotel', description: 'Đánh giá **4.7⭐' },
    ] }] })
    const text = await run([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":{"results":[{"name":"San San Hotel"}]}}`,
      line0(`Mình gợi ý **San San Hotel** nhé **\n[TAPPY_PLAN]${plan}[/TAPPY_PLAN]\n[FOLLOWUPS]**Giá phòng**?|Gần biển?[/FOLLOWUPS]`),
      'd:{"finishReason":"stop"}',
    ])
    expect(text).toContain('**San San Hotel**')
    expect(text).not.toMatch(/nhé \*\*/)
    const body = JSON.parse(text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)![1])
    expect(body.title).toBe('Đà Nẵng')
    expect(body.days[0].items[0].description).toBe('Đánh giá 4.7⭐')
    expect(text).toContain('[FOLLOWUPS]Giá phòng?|Gần biển?[/FOLLOWUPS]')
  })

  it('live path (no tool): an orphan in the still-withheld tail is dropped at finish', async () => {
    // "[" holds the tail back as a possibly-forming link, so it is released only at finish.
    const text = await run([line0('Chào bạn! Theo [nguồn **'), 'd:{"finishReason":"stop"}'])
    expect(text).toContain('Chào bạn!')
    expect(text).not.toContain('**')
  })

  it('live path: an orphan ALREADY streamed is left to the client (the prefix cannot be rewritten)', async () => {
    const text = await run([line0('Chào bạn! Đây là **mẹo'), 'd:{"finishReason":"stop"}'])
    expect(text).toBe('Chào bạn! Đây là **mẹo')
  })

  it('live path: text already on the client is never rewritten (no duplicate, no loss)', async () => {
    const text = await run([line0('Một **câu dài đã gửi. '), line0('Thêm nữa.'), 'd:{"finishReason":"stop"}'])
    // Whatever went out, it went out once and in order.
    expect(text.match(/Thêm nữa\./g)?.length).toBe(1)
    expect(text.match(/Một/g)?.length).toBe(1)
  })
})
