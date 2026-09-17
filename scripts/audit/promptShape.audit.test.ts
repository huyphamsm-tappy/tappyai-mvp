/**
 * PHASE 1 AUDIT — system-prompt shape probe. Read-only, no LLM.
 * Builds the prompt exactly as route.ts does for a representative places turn
 * and records: segment sizes, block headers in order, and rule-level counts of
 * instruction verbs that bear on "consultative vs summarizer". Records only.
 * Output: docs/audit/prompt-shape.json
 */
import { describe, it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildSystem, buildSystemSimple, buildRenderedDecisionBlock } from '@/lib/ai/promptBuilder'
import { buildRankingInstructionBlock, buildShoppingGroundingBlock } from '@/lib/ai/consultative/pick'
import { buildSynthesisInstructionBlock } from '@/lib/ai/consultative/synthesis'

function headers(s: string): string[] {
  return [...s.matchAll(/^=====+\s*([^=\n][^\n]*?)\s*=*\s*$/gm)].map(m => m[1].trim()).filter(Boolean)
}
function count(s: string, re: RegExp): number { return (s.match(re) ?? []).length }

describe('PHASE 1 AUDIT — prompt shape (records only)', () => {
  it('records shared/dynamic sizes and block order for a places turn', () => {
    const placesTurn = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, null,
      buildRankingInstructionBlock() + buildRenderedDecisionBlock())
    const shoppingTurn = buildSystem({ min: 0, max: 2_000_000, raw: '' } as never, 'unknown', true, '', 'vi', '', null, null, false, null,
      buildRankingInstructionBlock() + buildShoppingGroundingBlock() + buildSynthesisInstructionBlock())
    const simple = buildSystemSimple('vi', '')
    const shared = placesTurn.shared
    const out = {
      generatedAt: new Date().toISOString(),
      sizes_chars: {
        shared: shared.length,
        dynamic_places_first_reply_web: placesTurn.dynamic.length,
        dynamic_shopping_first_reply_web: shoppingTurn.dynamic.length,
        simple_chitchat_prompt: simple.length,
      },
      shared_block_headers_in_order: headers(shared),
      dynamic_places_block_headers_in_order: headers(placesTurn.dynamic),
      shared_rule_ids: [...shared.matchAll(/^(R\d+[a-z]?|\d{1,2}[a-z]?)\)?[:)]/gm)].map(m => m[1]),
      instruction_counts_in_shared: {
        'TUYET DOI KHONG (absolute prohibitions)': count(shared, /TUYET DOI KHONG/g),
        'PHAI / BAT BUOC (mandates)': count(shared, /\bPHAI\b|BAT BUOC/g),
        'LUON (always)': count(shared, /\bLUON\b/g),
        'liet ke / tom tat (list/summarise verbs)': count(shared, /liet ke|tom tat/gi),
        'nghieng ve / vi sao / ly do (lean/why/reason)': count(shared, /nghieng ve|vi sao|ly do/gi),
        'hoi (ask) mentions': count(shared, /\bhoi\b/gi),
      },
    }
    const dir = join(process.cwd(), 'docs', 'audit')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'prompt-shape.json'), JSON.stringify(out, null, 2) + '\n')
    console.log(JSON.stringify(out.sizes_chars), out.shared_block_headers_in_order.length, 'shared blocks;', out.dynamic_places_block_headers_in_order.length, 'dynamic blocks')
  })
})
