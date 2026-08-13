import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI } from '@/lib/ai/llm'
import { extractMemoryFromConversation } from '@/lib/memory/memoryService'
import { classifyIntent, detectForcedTool } from '@/lib/ai/intent'
import { shouldExtractMemory } from '@/lib/ai/memoryGate'

// ── B6 memory-extraction gate measurement ────────────────────────────────────
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/memoryGate.test.ts --disable-console-intercept
//
// Two things are measured, both against the real API:
//   1. what the extraction call actually COSTS (input/output tokens), and
//   2. for turns that SHOULD be remembered, whether extraction returns anything.
//
// (2) matters more than (1): a gate that saves money by dropping real memories
// is a regression, not an optimization.
//
// Authenticated end-to-end turns are deliberately NOT exercised — that would mean
// writing a test user into the production Supabase auth project. Extraction is
// called directly instead, which measures the same call the route makes.

const MEASURE = process.env.TAPPY_MEASURE === '1'

if (MEASURE) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

/** The gate as it ships today: authenticated AND last message over 20 chars. */
const currentGate = (text: string) => text.trim().length > 20

type Turn = { id: string; lang: string; text: string; want: 'skip' | 'extract' }

const TURNS: Turn[] = [
  // ephemeral lookups — nothing durable to store
  { id: 't01', lang: 'vi', text: 'Hôm nay thời tiết Hà Nội thế nào?', want: 'skip' },
  { id: 't02', lang: 'vi', text: 'Giá vàng hôm nay bao nhiêu?', want: 'skip' },
  { id: 't03', lang: 'vi', text: 'Tin tức mới nhất là gì?', want: 'skip' },
  { id: 't04', lang: 'en', text: 'What is the gold price today?', want: 'skip' },
  { id: 't05', lang: 'vi', text: 'Cảm ơn bạn.', want: 'skip' },
  { id: 't06', lang: 'en', text: 'thanks', want: 'skip' },

  // durable information — must survive the gate
  { id: 't07', lang: 'vi', text: 'Tôi thích món ăn ít cay.', want: 'extract' },
  { id: 't08', lang: 'vi', text: 'Tôi thường đi du lịch với hai con gái.', want: 'extract' },
  { id: 't09', lang: 'vi', text: 'Từ giờ ưu tiên khách sạn dưới 2 triệu.', want: 'extract' },
  { id: 't10', lang: 'vi', text: 'Nhớ giúp tôi là tôi thích ngồi ngoài trời.', want: 'extract' },
  { id: 't11', lang: 'vi', text: 'Tôi ăn chay.', want: 'extract' },
  { id: 't12', lang: 'vi', text: 'Mình thích cay', want: 'extract' },
  { id: 't13', lang: 'en', text: 'I am allergic to peanuts.', want: 'extract' },
  { id: 't14', lang: 'en', text: 'From now on prefer hotels under 2 million VND.', want: 'extract' },
  { id: 't15', lang: 'vi', text: 'Nhà mình ở Quận 3.', want: 'extract' },

  // ordinary requests — today's default is to extract, and they often do carry
  // durable signal (a district, a budget, a cuisine)
  { id: 't16', lang: 'vi', text: 'Gợi ý quán ăn ngon ở Quận 1 giá dưới 200k', want: 'extract' },
  { id: 't17', lang: 'en', text: 'Suggest a good seafood restaurant in Da Nang', want: 'extract' },
]

describe.skipIf(!MEASURE)('B6 — memory extraction gate', () => {
  it('before/after gate decisions, per turn', () => {
    let before = 0, after = 0, wrongBefore = 0, wrongAfter = 0
    for (const t of TURNS) {
      const old = currentGate(t.text)
      const now = shouldExtractMemory({ text: t.text, intent: classifyIntent(t.text), forcedTool: detectForcedTool(t.text) })
      if (old) before++
      if (now) after++
      if (old !== (t.want === 'extract')) wrongBefore++
      if (now !== (t.want === 'extract')) wrongAfter++
      const change = old === now ? '     ' : old ? ' -1  ' : ' +1  '
      console.log(
        `${t.id} ${t.lang} old=${old ? 'EXTRACT' : 'skip   '} new=${now ? 'EXTRACT' : 'skip   '}${change}` +
        `want=${t.want.padEnd(7)} ${now === (t.want === 'extract') ? '  ' : '!!'} "${t.text.slice(0, 44)}"`,
      )
    }
    console.log(`\n  extraction calls:  ${before} -> ${after}  (${(((after - before) / before) * 100).toFixed(1)}%)`)
    console.log(`  wrong decisions:   ${wrongBefore} -> ${wrongAfter}  (of ${TURNS.length} turns)`)
  })

  it('what one extraction call actually costs', async () => {
    let inTok = 0, outTok = 0, n = 0
    for (const t of TURNS.slice(0, 6)) {
      const r = await AI.generate({
        role: 'fast',
        maxTokens: 500,
        prompt: `Phan tich cuoc hoi thoai va trich xuat thong tin ve user. Tra ve JSON ngan gon.\n\nMemory hien tai: {}\n\nCac tin nhan cua user:\n${t.text}\n\nChi tra ve JSON, khong giai thich.`,
      })
      inTok += r.usage?.promptTokens ?? 0
      outTok += r.usage?.completionTokens ?? 0
      n++
    }
    const inAvg = Math.round(inTok / n), outAvg = Math.round(outTok / n)
    // The real prompt is ~600 tokens of template that this shortened probe omits;
    // reported separately so the figure is not mistaken for the full call.
    console.log(`\n  probe extraction call: in≈${inAvg} out≈${outAvg} tokens/call over ${n} samples`)
    console.log(`  cost/call ≈ $${((inAvg / 1e6) * 1 + (outAvg / 1e6) * 5).toFixed(6)}`)
    expect(n).toBe(6)
  }, 180_000)

  it('REAL extraction: does a turn that should be remembered actually yield memory?', async () => {
    const shouldExtract = TURNS.filter(t => t.want === 'extract')
    let captured = 0
    for (const t of shouldExtract) {
      const got = await extractMemoryFromConversation([{ role: 'user', content: t.text }], null)
      const keys = Object.keys(got).filter(k => {
        const v = (got as Record<string, unknown>)[k]
        if (v == null || v === '') return false
        if (Array.isArray(v)) return v.length > 0
        if (typeof v === 'object') return Object.keys(v as object).length > 0
        return true
      })
      if (keys.length > 0) captured++
      console.log(`  ${t.id} ${keys.length > 0 ? 'CAPTURED' : 'nothing '} [${keys.join(',')}]  "${t.text.slice(0, 40)}"`)
    }
    console.log(`\n  extraction captured something on ${captured}/${shouldExtract.length} durable turns`)
  }, 300_000)

  it('REAL extraction: do ephemeral turns yield anything worth storing?', async () => {
    const shouldSkip = TURNS.filter(t => t.want === 'skip')
    let wasted = 0
    for (const t of shouldSkip) {
      const got = await extractMemoryFromConversation([{ role: 'user', content: t.text }], null)
      const keys = Object.keys(got).filter(k => {
        const v = (got as Record<string, unknown>)[k]
        if (v == null || v === '') return false
        if (Array.isArray(v)) return v.length > 0
        if (typeof v === 'object') return Object.keys(v as object).length > 0
        return true
      })
      if (keys.length === 0) wasted++
      console.log(`  ${t.id} ${keys.length === 0 ? 'EMPTY (call wasted)' : 'returned          '} [${keys.join(',')}]  "${t.text.slice(0, 36)}"`)
    }
    console.log(`\n  ${wasted}/${shouldSkip.length} ephemeral turns produced NOTHING — those calls are pure waste`)
  }, 300_000)
})
