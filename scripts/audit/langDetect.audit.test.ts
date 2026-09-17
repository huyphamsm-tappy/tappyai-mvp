/**
 * PHASE 1 AUDIT — language-detection direct-function probe.
 *
 * Read-only. Calls `detectLang` / `detectExplicitLangRequest` from
 * `src/lib/ai/intent.ts` exactly as `src/app/api/chat/route.ts` does
 * (`detectExplicitLangRequest(lastText) ?? detectLang(lastText)`).
 * No LLM, no search, no network. Not counted against the 36-run cap.
 *
 * This file RECORDS; it never fails the suite. The verdict table is written to
 * docs/audit/lang-detect-results.json and printed to stdout.
 */
import { describe, it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { detectLang, detectExplicitLangRequest } from '@/lib/ai/intent'

type Expected = 'vi' | 'en' | 'AMBIGUOUS'

const CASES: Array<{ id: number; label: string; input: string; expected: Expected }> = [
  { id: 1, label: 'Vietnamese + English brand', input: 'Tìm quán cafe Highlands Coffee gần đây', expected: 'vi' },
  { id: 2, label: 'Vietnamese + English place', input: 'Có quán ăn nào ngon gần Landmark 81 không?', expected: 'vi' },
  { id: 3, label: 'Vietnamese + English restaurant term', input: 'Tìm nhà hàng buffet seafood ở Quận 1', expected: 'vi' },
  { id: 4, label: 'Vietnamese + URL', input: 'Quán này có ngon không https://shopeefood.vn/ho-chi-minh/quan-abc', expected: 'vi' },
  { id: 5, label: 'Vietnamese + product name', input: 'Tìm cho tôi tai nghe Sony WH-1000XM5 giá tốt', expected: 'vi' },
  { id: 6, label: 'short Vietnamese 1-3 words', input: 'quán cafe đẹp', expected: 'vi' },
  { id: 7, label: 'normal Vietnamese', input: 'Cuối tuần này đi đâu chơi được nhỉ?', expected: 'vi' },
  { id: 8, label: 'clearly English', input: 'Find me a quiet Japanese restaurant nearby.', expected: 'en' },
  { id: 9, label: 'mixed Vietnamese/English', input: 'Find giúp tôi một quán cafe chill gần đây.', expected: 'vi' },
  { id: 10, label: 'Vietnamese + English proper noun', input: 'Tối nay đi Bitexco Sky Deck có gì vui không?', expected: 'vi' },
  { id: 11, label: 'no-diacritic Vietnamese', input: 'tim quan cafe gan day', expected: 'vi' },
  { id: 12, label: 'no-diacritic Vietnamese + brand', input: 'quan an gan Vincom', expected: 'vi' },
  { id: 13, label: 'single loanword: menu', input: 'menu', expected: 'AMBIGUOUS' },
  { id: 14, label: 'single loanword: spa', input: 'spa', expected: 'AMBIGUOUS' },
]

describe('PHASE 1 AUDIT — detectLang direct probe (records only, never fails)', () => {
  it('records detected vs expected language for the 14 spec cases', () => {
    const rows = CASES.map(c => {
      const explicit = detectExplicitLangRequest(c.input)
      const detected = explicit ?? detectLang(c.input)
      // The implementation has no AMBIGUOUS output; a spec expectation of
      // AMBIGUOUS can therefore never PASS — it is recorded as AMBIGUOUS
      // (expected) with the concrete value the code actually returned.
      const verdict = c.expected === 'AMBIGUOUS'
        ? 'AMBIGUOUS-EXPECTED / IMPL-RETURNS-' + detected.toUpperCase()
        : detected === c.expected ? 'PASS' : 'FAIL'
      return {
        id: c.id, label: c.label, input: c.input,
        detected, explicitRequest: explicit, expected: c.expected, verdict,
        path: 'route.ts: detectExplicitLangRequest(lastText) ?? detectLang(lastText)  [src/lib/ai/intent.ts]',
      }
    })
    const out = {
      generatedAt: new Date().toISOString(),
      note: 'Direct function tests; no LLM/search; excluded from the 36-run cap. detectLang has no AMBIGUOUS return value.',
      rows,
    }
    const dir = join(process.cwd(), 'docs', 'audit')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'lang-detect-results.json'), JSON.stringify(out, null, 2) + '\n')
    for (const r of rows) console.log(`#${r.id} ${r.verdict.padEnd(8)} detected=${r.detected} expected=${r.expected} :: ${r.input}`)
  })
})
