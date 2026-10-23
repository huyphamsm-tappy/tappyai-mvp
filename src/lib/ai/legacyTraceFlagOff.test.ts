// @vitest-environment node
/**
 * Flag-OFF identity pin for LEGACY_STREAM_TRACE (Wave 1 Step A).
 *
 * Three Gate-3 fixtures (A, B, C) run through the real stream filter with LEGACY_STREAM_TRACE unset.
 * The expected texts are the outputs observed at HEAD 48cb3dc, before Wave 1. Collector flags for the
 * consultative stage (budgetGap) are INFERRED from Gate 3, not taken from a live request.
 * Fixture D (lowercase line) is NOT pinned here: in the third run it returned an empty string, not the
 * observed output. Source analysis: its first sentence "Tôi đã tìm được…" matches the search-claim
 * rule (consultative/searchClaimGuard.ts:14-15, applied at streamEnrichment.ts:3249 with no tool call),
 * so the sentence is removed and the lowercase line is removed by fragmentLine (:3296). The Gate-3
 * context that kept it is not reproduced here (INFERRED).
 * Production-default consultative env is set inside the test and restored afterwards, because the
 * repo setup pins CONSULTATIVE_V1 and CONSULT_V2 to '0'.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

const SAVED: Record<string, string | undefined> = {}
const KEYS = ['LEGACY_STREAM_TRACE', 'CONSULTATIVE_V1', 'CONSULT_V2']

beforeAll(() => {
  for (const k of KEYS) SAVED[k] = process.env[k]
  delete process.env.LEGACY_STREAM_TRACE
  process.env.CONSULTATIVE_V1 = '1'
  process.env.CONSULT_V2 = '1'
})
afterAll(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k]
    else process.env[k] = SAVED[k]
  }
})

interface Opts { userText: string; travelIntent?: boolean; placeIntent?: boolean; budgetGap?: boolean }

async function run(reply: string, o: Opts): Promise<string> {
  const collector = createEnrichmentCollector(o.userText)
  if (o.budgetGap !== undefined) {
    // INFERRED: Gate-3 scenario C context (pick turn, shopping, no card rendered).
    collector.setConsultativeV1({ on: true, rendersCard: false, namedRefetch: [], referenced: [], carried: [], hardGaps: [], budgetGap: o.budgetGap })
  }
  const frames = ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
  const orig = console.log
  console.log = () => {}
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, o.travelIntent === true, o.userText, o.placeIntent === true)
    const body = await new Response(res.body).text()
    return body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  } finally { console.log = orig }
}

describe('LEGACY_STREAM_TRACE flag OFF — Gate-3 fixtures keep their observed output', () => {
  it('A (travelIntent): the unverified fare sentence is replaced by the no-price note', async () => {
    const out = await run('Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 giá 8.000.000đ.', { userText: 'Tai nghe Sony WH-1000XM5 giá bao nhiêu', travelIntent: true })
    expect(out).toBe('Tôi đã tìm được một lựa chọn phù hợp.\n\nGiá, giờ và tình trạng chỗ cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt chỗ.')
  })

  it('B (placeIntent, quality clause): the whole sentence with its price is removed', async () => {
    const out = await run('Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền.', { userText: 'Tai nghe Sony WH-1000XM5 có đáng mua không', placeIntent: true })
    expect(out).toBe('Tôi đã tìm được một lựa chọn phù hợp.')
  })

  it('C (budgetGap): the price is removed and the budget note is added', async () => {
    const out = await run('Sony WH-1000XM5 là lựa chọn chính. Bản này trong tầm giá của bạn, 8.000.000đ.', { userText: 'Tai nghe Sony WH-1000XM5 có vừa ngân sách không', budgetGap: true })
    expect(out).toBe('Sony WH-1000XM5 là lựa chọn chính.\n\nKết quả chưa có mức giá, nên mình chưa khẳng định được có vừa ngân sách của bạn không.')
  })
})
