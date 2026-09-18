/**
 * PHASE 1B — reproduce the #15-r1 truncation offline (no LLM, no network).
 *
 * Uses the REAL tool rows recorded in docs/audit/baseline-before.json for P15-r1
 * and P15-r2, and the real guard functions, to test the hypothesis:
 *   "the pick's name has no distinctive token in that result set, so every
 *    entity claim about it is unattributable and the guards strip it."
 * Records only; never fails. Output: docs/audit/p15-truncation-repro.json
 */
import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { placeTokensFor, textNamesPlace } from '@/lib/links/placeAttribution'
import { guardPlaceClaimsInText } from '@/lib/ai/placeClaimGuard'
import { suppressUngroundedVenues } from '@/lib/ai/groundingGate'

type Run = { run_id: string; tool_results: Array<{ result: { results: Array<Record<string, unknown>>; _tappy_ranking?: { pick: string }; place_search_status: string } }>; final_response: string }

describe('PHASE 1B — #15-r1 truncation reproduction (records only)', () => {
  it('measures distinctive tokens of each pick and runs the guards on a synthetic r2-shaped sentence', () => {
    const base = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'audit', 'baseline-before.json'), 'utf8'))
    const out: Record<string, unknown> = { generatedAt: new Date().toISOString() }
    for (const id of ['P15-r1', 'P15-r2', 'P2-r1', 'P2-r2', 'P6-r1', 'P8-r1', 'P11-r1']) {
      const run: Run = base.runs.find((r: Run) => r.run_id === id)
      const res = run.tool_results[0]?.result
      if (!res) continue
      const rows = res.results ?? []
      const names = rows.map(r => String(r.name ?? ''))
      const tokens = placeTokensFor(names)
      const pick = res._tappy_ranking?.pick ?? names[0]
      const pickTok = tokens.find(t => t.name === pick)
      const row = rows.find(r => r.name === pick) ?? {}
      const rating = typeof row.rating_value === 'number' ? row.rating_value : 4.8
      const count = typeof row.rating_count === 'number' ? row.rating_count : 1000
      // r2-shaped sentence about the pick (the shape the model actually produced in P15-r2)
      const sentence = `Mình chọn **${pick}** cho bạn 👌 Spa này có **${rating}⭐ (${count.toLocaleString('vi-VN')} đánh giá Google Maps)** — số lượng đánh giá lớn là bằng chứng mạnh. Nằm ở ${row.address ?? 'trung tâm'}, không gian yên tĩnh. Mở từ 10:00–22:00.`
      const ratingsByEntity = new Map<string, number[]>()
      const reviewCountsByEntity = new Map<string, number[]>()
      for (const r of rows) {
        if (typeof r.rating_value === 'number') ratingsByEntity.set(String(r.name), [r.rating_value as number])
        if (typeof r.rating_count === 'number') reviewCountsByEntity.set(String(r.name), [r.rating_count as number])
      }
      const guarded = guardPlaceClaimsInText(sentence, {
        ratings: rows.map(r => r.rating_value).filter((x): x is number => typeof x === 'number'),
        distancesKm: [], texts: [], entityTexts: new Map(), placeNames: names, orderablePlaces: [],
        ratingsByEntity, reviewCountsByEntity, phonesByEntity: new Map(), ticketablePlaces: [],
      } as never, { scope: 'all' })
      const gated = suppressUngroundedVenues(guarded.text, names, 'vi', { placeSearch: res.place_search_status as never })
      out[id] = {
        pick, pick_distinctive_tokens: pickTok?.distinctive ?? null,
        pick_nameable_by_textNamesPlace: pickTok ? textNamesPlace(sentence, '', pickTok) : null,
        names_with_zero_distinctive_tokens: tokens.filter(t => t.distinctive.length === 0).map(t => t.name),
        synthetic_sentence_len: sentence.length,
        after_placeClaimGuard_len: guarded.text.length,
        after_groundingGate_len: gated.text.length,
        after_placeClaimGuard: guarded.text.slice(0, 300),
        recorded_final_len: run.final_response.length,
      }
      console.log(id, '| pick:', pick, '| distinctive:', JSON.stringify(pickTok?.distinctive ?? null), '| synthetic', sentence.length, '→ claimGuard', guarded.text.length, '→ gate', gated.text.length, '| recorded final', run.final_response.length)
    }
    writeFileSync(join(process.cwd(), 'docs', 'audit', 'p15-truncation-repro.json'), JSON.stringify(out, null, 2) + '\n')
  })
})
