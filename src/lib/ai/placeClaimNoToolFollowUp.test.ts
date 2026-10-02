// @vitest-environment node
/**
 * c40 P7b (UAT @ 2bd5c59, 2026-09-28) — a venue in NO row of the thread, stated with a rating,
 * a review count and a distance, on a clarify-answer turn that ran no tool.
 *
 * The turn ("1–2 người") has no need-profile domain, so `placeIntent` was false and the place-claim
 * guard never ran; the carried facts of the previous reply (Serene 5⭐/198/0.4 km, SIZ SPA
 * 4.9⭐/1.074/1.7 km) were collected and then never read. Driven through the real stream filter
 * with the Consultative V1 context built exactly as the route builds it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { carriedFacts, priorVenuesIn } from './consultative/referenceResolver'

const FIX = JSON.parse(readFileSync('src/lib/ai/__fixtures__/c40P7bUnretrievedVenue.live.json', 'utf8')) as {
  priorReply: string; userText: string; reply: string
}

async function run(reply: string, prior = FIX.priorReply) {
  const collector = createEnrichmentCollector(FIX.userText)
  collector.setConsultativeV1({
    on: true, rendersCard: true, namedRefetch: [], referenced: [],
    carried: carriedFacts(prior, priorVenuesIn(prior)), hardGaps: [], budgetGap: false,
  })
  const frames = ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
  const orig = console.log
  console.log = () => {}
  try {
    // placeIntent = false: what the route passed for this turn (needProfile.domain === null).
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, FIX.userText, false)
    const out = await new Response(res.body).text()
    return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  } finally { console.log = orig }
}

describe('c40 P7b — no-tool follow-up about carried places', () => {
  it('removes the sentence that invents a venue with a rating, review count and distance', async () => {
    const out = await run(FIX.reply)
    expect(out).not.toContain('Spa Thiên Hương')
    expect(out).not.toContain('156 đánh giá')
    expect(out).not.toContain('1.1km')
  })

  it('keeps the carried venue with the numbers the previous reply stated', async () => {
    const out = await run(FIX.reply)
    expect(out).toContain('**Serene Head Spa & Massage** vẫn là lựa chọn tốt nhất cho bạn — gần nhất (0.4km), 5⭐ (198 đánh giá)')
    expect(out).toContain('[FOLLOWUPS]')
  })

  it('keeps the other carried venue restated with its own carried numbers', async () => {
    const reply = 'Nếu muốn lựa chọn khác, **SIZ SPA** (4.9⭐, 1.074 đánh giá, 1.7km) cũng hợp cho 2 người.'
    const out = await run(reply)
    expect(out).toBe(reply)
  })

  it('a follow-up to a reply that named no place (no distance / hours) keeps the old path', async () => {
    const prior = 'Mình chọn **Sony WH-1000XM5** cho bạn — 4.8⭐ (2.106 đánh giá).'
    const reply = 'Ngoài ra **Bose QC45** (4.7⭐, 900 đánh giá) cũng đáng cân nhắc.'
    const out = await run(reply, prior)
    expect(out).toBe(reply)
  })
})
