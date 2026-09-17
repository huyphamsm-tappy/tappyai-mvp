/**
 * G2 ACCEPTANCE REPLAY (audit tooling, not a product test).
 *
 * Replays the snippet-price guard, old (v1) vs new (v2), on the guard's exact
 * input from the AUDIT capture (`stages.travelGuarded`) with the evidence rebuilt
 * from the SAME tool results the runner recorded for each turn (`run{1,2}.json`):
 * `snippetPrices` / `snippetPricesByEntity` from `price_search_results` exactly as
 * `streamEnrichment.ts` builds them, `priceBandsByEntity` from the rows'
 * `price_range_text` via `bandFromRow`. No new LLM runs.
 *
 * Gates (owner, G2): 0 fabricated prices surviving; 0 true ratings/counts removed
 * together with a price; 0 sentences removed for a metre distance; 0 fragments;
 * 0 replies ≤ 35 %; v2 ≥ v1 kept-ratio on every turn.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { guardSnippetPricesInText, pricesFromSnippets, type SnippetPriceScope } from '@/lib/ai/snippetPriceGuard'
import { extractMoneyClaims } from '@/lib/ai/moneyGuard'
import { bandFromRow, amountWithinBand, type PriceBand } from '@/lib/recommendation/priceBand'

const AUDIT = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/docs/audit'
const CAPTURES = [
  { run: 1, file: `${AUDIT}/capture-v3/preguard-v3-run1.jsonl`, runJson: `${AUDIT}/capture-v3/run1.json` },
  { run: 2, file: `${AUDIT}/capture-v3/preguard-v3.jsonl`, runJson: `${AUDIT}/capture-v3/run2.json` },
]

type Rec = { userText: string; lang: string; pickName: string | null; evidence: { placeNames: string[]; ratingsByEntity: Record<string, number[]>; reviewCountsByEntity: Record<string, number[]> }; stages: Record<string, string | null>; stats: unknown }
type Snip = { title?: string; snippet?: string; evidence_scope?: string; evidence_about?: string }
type RunEntry = { user_message: string; tool_results?: Array<{ result?: { results?: Array<Record<string, unknown>>; price_search_results?: Snip[] } }> }

const stripMarkers = (t: string): string => t.replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, '').replace(/\[FOLLOWUPS\][^\n]*/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/https?:\/\/\S+/g, '')
const letters = (t: string): number => (t.match(/\p{L}/gu) ?? []).length
const sentences = (t: string): string[] => stripMarkers(t).split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(s => /\p{L}/u.test(s))
const CONNECTIVE_RE = /^[\s*_>-]*(?:ngoài ra|tuy nhiên|còn\b|bên cạnh đó|quán này|nơi này|chỗ này|đây là|nó\b|also\b|besides\b|however\b|it\b)/iu

function fragmentsIn(text: string, input: string): string[] {
  const out: string[] = []
  const paras = stripMarkers(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const inParas = stripMarkers(input).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  paras.forEach((p, k) => {
    const body = p.replace(/^[\s*_>#-]+/, '').trim()
    if (!body) return
    const isList = /^(?:[-*•]|\d+[.)])\s/.test(p)
    if (!/\p{L}/u.test(body) || /^[.,;:!?…)]/.test(body) || letters(body) < 4) { out.push(p); return }
    if (!isList && /^\p{Ll}/u.test(body)) { out.push(p); return }
    if (/(?:\b(?:và|nhưng|hoặc|vì|nên|với|giá|and|but|or|because|with)|[,;—–-])\s*[.!?…]?\s*$/iu.test(body)) { out.push(p); return }
    if (!isList && CONNECTIVE_RE.test(body)) {
      const idxIn = inParas.indexOf(p); const prevOut = k > 0 ? paras[k - 1] : null; const prevIn = idxIn > 0 ? inParas[idxIn - 1] : null
      const first = (prevOut ?? '').split(/(?<=[.!?…])\s/)[0]
      if (!(idxIn !== -1 && prevIn !== null && prevOut !== null && letters(first) >= 4 && prevIn.includes(first))) out.push(p)
    }
  })
  return out
}

/** Sentences of the input that carry a rating/count the rows vouch for — they must survive a price cut (owner gate). */
function trueFactSentences(input: string, r: Rec): string[] {
  const ratings = new Set(Object.values(r.evidence.ratingsByEntity).flat().map(String))
  const counts = new Set(Object.values(r.evidence.reviewCountsByEntity).flat())
  return sentences(input).filter(s => {
    const hasRating = [...s.matchAll(/\b(\d(?:[.,]\d)?)\s*(?:⭐|★)/gu)].some(m => ratings.has(m[1].replace(',', '.')))
    const hasCount = [...s.matchAll(/(\d[\d.,]*)\s*(?:đánh giá|reviews?)(?!\p{L})/giu)].some(m => counts.has(parseInt(m[1].replace(/[.,]/g, ''), 10)))
    return (hasRating || hasCount) && extractMoneyClaims(s).length > 0
  })
}
/** The rating/count tokens of a sentence, to check they survived (the sentence may legitimately lose its price clause). */
const factTokens = (s: string): string[] => [...s.matchAll(/\d(?:[.,]\d)?\s*(?:⭐|★)|\d[\d.,]*\s*(?:đánh giá|reviews?)(?!\p{L})/giu)].map(m => m[0])

describe('G2 acceptance replay', () => {
  it('replays the captured guard input through v1 and v2 with reconstructed evidence and writes the metrics', () => {
    const rows: Array<Record<string, unknown> & { ran: boolean; v1: { ratio: number; fragments: string[]; fabricated_surviving: string[]; metre_removed: number; true_fact_lost: string[] }; v2: { ratio: number; fragments: string[]; fabricated_surviving: string[]; metre_removed: number; true_fact_lost: string[]; stats: unknown } }> = []
    const notes: string[] = []
    for (const cap of CAPTURES) {
      if (!existsSync(cap.file) || !existsSync(cap.runJson)) { notes.push(`missing ${cap.file}`); continue }
      const recs = readFileSync(cap.file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as Rec)
      const runs = (JSON.parse(readFileSync(cap.runJson, 'utf8')) as { runs: RunEntry[] }).runs
      let cursor = 0
      recs.forEach((r, i) => {
        let idx = -1
        for (let j = cursor; j < runs.length; j++) if (runs[j].user_message === r.userText) { idx = j; break }
        if (idx === -1) { notes.push(`run ${cap.run} #${i}: no runner entry`); return }
        cursor = idx + 1
        // Rebuild the evidence exactly as streamEnrichment.ts does.
        const snippetPrices: number[] = []
        const byEntity = new Map<string, number[]>()
        const bands = new Map<string, PriceBand>()
        for (const tr of runs[idx].tool_results ?? []) {
          const snips = tr.result?.price_search_results
          if (Array.isArray(snips)) {
            snippetPrices.push(...pricesFromSnippets(snips.map(s => `${s.title ?? ''} ${s.snippet ?? ''}`)))
            for (const s of snips) {
              if (s.evidence_scope !== 'entity' || !s.evidence_about) continue
              const p = pricesFromSnippets([`${s.title ?? ''} ${s.snippet ?? ''}`])
              if (p.length) byEntity.set(s.evidence_about, [...(byEntity.get(s.evidence_about) ?? []), ...p])
            }
          }
          for (const row of tr.result?.results ?? []) {
            const name = typeof row.name === 'string' ? row.name : ''
            if (!name || bands.has(name)) continue
            const b = bandFromRow(row); if (b) bands.set(name, b)
          }
        }
        const input = r.stages.travelGuarded ?? ''
        const scope: SnippetPriceScope | undefined = r.evidence.placeNames.length ? { byEntity, placeNames: r.evidence.placeNames } : undefined
        const v1 = guardSnippetPricesInText(input, snippetPrices, r.userText, scope)
        const v2 = guardSnippetPricesInText(input, snippetPrices, r.userText, scope, { v2: true, priceBandsByEntity: bands })
        const inLetters = letters(stripMarkers(input))
        const ratio = (t: string) => inLetters ? +(letters(stripMarkers(t)) / inLetters).toFixed(3) : 1
        // Fabricated = a stated VND amount inside no venue band, near no snippet price, and not the user's own number.
        const userAmounts = extractMoneyClaims(r.userText).map(c => `${c.lo}-${c.hi}`)
        const fabricated = extractMoneyClaims(stripMarkers(input)).filter(c => c.currency === 'VND'
          && !userAmounts.includes(`${c.lo}-${c.hi}`)
          && ![...bands.values()].some(b => amountWithinBand(c.lo, c.hi, b))
          && !(snippetPrices.some(p => Math.abs(c.lo - p) <= Math.max(p * 0.05, 1000)) && snippetPrices.some(p => Math.abs(c.hi - p) <= Math.max(p * 0.05, 1000))))
          .map(c => c.raw)
        const metreSentences = sentences(input).filter(s => /\d\s?m(?![\p{L}])/iu.test(s))
        const facts = trueFactSentences(input, r)
        const lost = (out: string) => facts.filter(s => !factTokens(s).every(t => out.includes(t)))
        rows.push({
          run: cap.run, i, userText: r.userText.slice(0, 60), ran: true, bands: bands.size, snippet_prices: snippetPrices.length, claims_in_input: extractMoneyClaims(stripMarkers(input)).length,
          fabricated_in_input: fabricated, true_fact_sentences: facts.length,
          v1: { ratio: ratio(v1.text), fragments: fragmentsIn(v1.text, input), fabricated_surviving: fabricated.filter(f => v1.text.includes(f)), metre_removed: metreSentences.filter(s => !v1.text.includes(s)).length, true_fact_lost: lost(v1.text) },
          v2: { ratio: ratio(v2.text), fragments: fragmentsIn(v2.text, input), fabricated_surviving: fabricated.filter(f => v2.text.includes(f)), metre_removed: metreSentences.filter(s => !v2.text.includes(s)).length, true_fact_lost: lost(v2.text), stats: v2.stats },
          texts: { input, v1: v1.text, v2: v2.text, server_v1: r.stages.snippetGuarded },
        })
      })
    }
    const g = rows.filter(r => r.ran)
    const sum = (f: (r: typeof g[number]) => number) => g.reduce((n, r) => n + f(r), 0)
    const metrics = {
      notes, turns: g.length,
      turns_with_price_claims: g.filter(r => (r.claims_in_input as number) > 0).length,
      turns_with_bands: g.filter(r => (r.bands as number) > 0).length,
      fabricated_amounts_in_inputs: sum(r => (r.fabricated_in_input as string[]).length),
      true_fact_sentences_with_price: sum(r => r.true_fact_sentences as number),
      v1: { turns_le_35pct: g.filter(r => r.v1.ratio <= 0.35).length, turns_with_fragments: g.filter(r => r.v1.fragments.length > 0).length, fabricated_surviving: sum(r => r.v1.fabricated_surviving.length), metre_sentences_removed: sum(r => r.v1.metre_removed), true_fact_sentences_lost: sum(r => r.v1.true_fact_lost.length), median_ratio: median(g.map(r => r.v1.ratio)), min_ratio: Math.min(...g.map(r => r.v1.ratio)) },
      v2: { turns_le_35pct: g.filter(r => r.v2.ratio <= 0.35).length, turns_with_fragments: g.filter(r => r.v2.fragments.length > 0).length, fabricated_surviving: sum(r => r.v2.fabricated_surviving.length), metre_sentences_removed: sum(r => r.v2.metre_removed), true_fact_sentences_lost: sum(r => r.v2.true_fact_lost.length), median_ratio: median(g.map(r => r.v2.ratio)), min_ratio: Math.min(...g.map(r => r.v2.ratio)),
        totals: g.reduce((acc, r) => { for (const [k, v] of Object.entries((r.v2.stats ?? {}) as Record<string, number>)) acc[k] = (acc[k] ?? 0) + v; return acc }, {} as Record<string, number>) },
      v2_vs_v1: { better: g.filter(r => r.v2.ratio > r.v1.ratio).length, worse: g.filter(r => r.v2.ratio < r.v1.ratio).length, equal: g.filter(r => r.v2.ratio === r.v1.ratio).length },
    }
    writeFileSync(`${AUDIT}/g2-replay.json`, JSON.stringify(rows, null, 2))
    writeFileSync(`${AUDIT}/g2-replay-metrics.json`, JSON.stringify(metrics, null, 2))
    expect(g.length).toBeGreaterThan(0)
  })
})

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(3)
}
