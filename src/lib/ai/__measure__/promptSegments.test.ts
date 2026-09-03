import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI } from '@/lib/ai/llm'
import { buildSystem } from '@/lib/ai/promptBuilder'
import { deriveNeedProfile } from '@/lib/ai/consultative/needProfile'
import { renderNeedBrief } from '@/lib/ai/consultative/needBrief'
import { buildRankingInstructionBlock, buildShoppingGroundingBlock } from '@/lib/ai/consultative/pick'
import { buildSynthesisInstructionBlock } from '@/lib/ai/consultative/synthesis'

// ── V3 Phase 2 · what each prompt segment actually costs ─────────────────────
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/promptSegments.test.ts --disable-console-intercept
//
// Makes REAL, BILLED calls, and is skipped without the flag so `npm test` never
// spends money. Character counts are not a usable proxy: this prompt is
// unaccented Vietnamese mixed with JSON field names and URLs, which tokenize
// nothing like English prose. So each segment is tokenized BY THE PROVIDER —
// sent as a prompt with maxTokens:1, reading back promptTokens.
//
// Two questions it exists to answer, both of which Phase 2 had to answer with a
// number rather than an argument:
//
//   1. What did Phase 1's need brief add to a decision turn? It sits AFTER the
//      cache breakpoint by design, so it is billed at full rate every time.
//   2. How much byte-identical instruction text is sitting after the breakpoint
//      already? That is the size of the deferred `shared`-promotion decision,
//      and it should be measured before anyone argues about it.
//
// Subtract the ~10-token envelope every measurement carries (role + wrapper);
// the figures are reported raw so nobody has to trust an adjustment.

const MEASURE = process.env.TAPPY_MEASURE === '1'

if (MEASURE) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

async function tokens(text: string): Promise<number> {
  const r = await AI.generate({ role: 'smart', prompt: text, maxTokens: 1 })
  return r.usage?.promptTokens ?? 0
}

const row = (label: string, chars: number, tok: number) =>
  console.log(`${label.padEnd(38)} chars=${String(chars).padStart(6)}  tokens=${String(tok).padStart(6)}`)

const user = (...t: string[]) => t.map(content => ({ role: 'user', content }))

describe.skipIf(!MEASURE)('P2 — prompt segment cost', () => {
  it('the cached prefix, the request tail, and every consultative block', async () => {
    const base = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

    const segments: Array<[string, string]> = [
      ['shared (CACHED, read at 0.1x)', base.shared],
      ['dynamic bare (billed 1x)', base.dynamic],
      // Phase 1's addition. Request-shaped, so it can never be cached.
      ['needBrief minimal', renderNeedBrief(deriveNeedProfile(user('Quán phở nào ngon ở Quận 1?')))],
      ['needBrief full consultative', renderNeedBrief(deriveNeedProfile(
        user('Tôi cần tìm quán phở để tiếp khách, yên tĩnh, khoảng 500k/người ở Quận 1, đi 6 người.')))],
      ['needBrief shopping', renderNeedBrief(deriveNeedProfile(
        user('Mua laptop 30 triệu, ưu tiên pin trâu và nhẹ')))],
      // Byte-identical on every call — pure functions of nothing — yet sent in
      // `dynamic`, so re-billed at 1x on every decision turn. This is the
      // deferred promotion decision, measured.
      ['STATIC rankingInstruction', buildRankingInstructionBlock()],
      ['STATIC shoppingGrounding', buildShoppingGroundingBlock()],
      ['STATIC synthesisInstruction', buildSynthesisInstructionBlock()],
    ]

    const measured: Array<[string, number]> = []
    for (const [label, text] of segments) {
      const t = await tokens(text)
      row(label, text.length, t)
      measured.push([label, t])
    }

    const staticTotal = measured
      .filter(([l]) => l.startsWith('STATIC'))
      .reduce((n, [, t]) => n + t, 0)
    console.log(
      `\n  static instruction text billed at 1x on a shopping turn: ${staticTotal} tokens` +
      `\n  (all three are byte-identical every request; promoting them into the cached` +
      `\n   prefix would bill them at 0.1x instead — deferred, see the Phase 2 report)`,
    )
  }, 180_000)
})
