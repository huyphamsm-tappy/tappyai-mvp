/**
 * G1 ACCEPTANCE REPLAY (audit tooling, not a product test).
 *
 * Reads the pre-guard captures from the AUDIT worktree (`preguard-v3-run1.jsonl`,
 * `preguard-v3.jsonl` = run 2; written by the uncommitted hook in `emitReconstructed`)
 * and replays the place-claim guard on the exact text and evidence it saw, once with
 * the old attribution (v1, flag OFF — what the server shipped during the run) and once
 * with G1 (v2). Writes `docs/audit/g1-replay.json` + `g1-replay-metrics.json` in the
 * AUDIT worktree.
 *
 * Run 1 was captured before 009faff (rating evidence empty on every turn); its
 * `ratingsByEntity` is rebuilt here from the SAME tool rows the runner recorded in
 * `run1.json` (`rating_value` per row) — flagged `ratings_rebuilt: true`.
 *
 * Acceptance (owner): (b) 0 fragments; no reply ≤ 35% of the model text; fabricated
 * claims still removed. The G1b fallback sentence is mirrored here from
 * `streamEnrichment.ts` so the v2 column is what the user would have received.
 *
 * Also answers the report-only question "does V3 insert images/links mid-sentence?"
 * by re-running `injectPlaceEnrichment` on run 2's captured rows (mobile path — the
 * web run itself skips injection when the decision card owns enrichment).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { guardPlaceClaimsInText, type PlaceClaimEvidence } from '@/lib/ai/placeClaimGuard'
import { injectPlaceEnrichment } from '@/lib/ai/streamEnrichment'

const AUDIT = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/docs/audit'
const CAPTURES = [
  { run: 1, file: `${AUDIT}/capture-v3/preguard-v3-run1.jsonl`, runJson: `${AUDIT}/capture-v3/run1.json`, rebuildRatings: true },
  { run: 2, file: `${AUDIT}/capture-v3/preguard-v3.jsonl`, runJson: `${AUDIT}/capture-v3/run2.json`, rebuildRatings: false },
]

type Rec = {
  ts: number; userText: string; lang: string; placeIntent: boolean; travelIntent: boolean; ticketIntent: boolean
  hadPlaceSearch: boolean; placeSearchStatus: string; guardV2: boolean; pickName: string | null; scope: 'all' | 'tickets'
  flushedText: string; places: string[]; placesFull?: Array<Record<string, unknown>>; heldCandidates: string[]
  evidence: {
    ratings: number[]; distancesKm: number[]; texts: string[]; entityTexts: Record<string, string[]>; placeNames: string[]
    orderablePlaces: string[]; ratingsByEntity: Record<string, number[]>; reviewCountsByEntity: Record<string, number[]>
    phonesByEntity: Record<string, string[]>; ticketablePlaces: string[]; hoursByEntity: Record<string, string>
  }
  stages: Record<string, string | null>
  stats: unknown
}
type RunEntry = { user_message: string; setup_run: boolean; tool_results?: Array<{ result?: { results?: Array<Record<string, unknown>> } }> }

const toMap = <T,>(o: Record<string, T>): Map<string, T> => new Map(Object.entries(o ?? {}))
const evidenceOf = (r: Rec): PlaceClaimEvidence => ({
  ratings: r.evidence.ratings, distancesKm: r.evidence.distancesKm, texts: r.evidence.texts,
  entityTexts: toMap(r.evidence.entityTexts), placeNames: r.evidence.placeNames,
  orderablePlaces: new Set(r.evidence.orderablePlaces), ratingsByEntity: toMap(r.evidence.ratingsByEntity),
  reviewCountsByEntity: toMap(r.evidence.reviewCountsByEntity), phonesByEntity: toMap(r.evidence.phonesByEntity),
  ticketablePlaces: new Set(r.evidence.ticketablePlaces),
})

/** Run 1 only: the collector bug left `ratingsByEntity` empty; rebuild it from the runner's recorded tool rows. */
function rebuildRatings(recs: Rec[], runs: RunEntry[]): number {
  let cursor = 0, rebuilt = 0
  for (const rec of recs) {
    let idx = -1
    for (let j = cursor; j < runs.length; j++) if (runs[j].user_message === rec.userText) { idx = j; break }
    if (idx === -1) continue
    cursor = idx + 1
    const byName: Record<string, number[]> = {}
    for (const tr of runs[idx].tool_results ?? []) for (const row of tr.result?.results ?? []) {
      if (typeof row.name === 'string' && typeof row.rating_value === 'number') byName[row.name] = [...(byName[row.name] ?? []), row.rating_value]
    }
    if (Object.keys(byName).length > 0) {
      rec.evidence.ratingsByEntity = byName
      rec.evidence.ratings = Object.values(byName).flat()
      rebuilt++
    }
  }
  return rebuilt
}

const CONNECTIVE_RE = /^[\s*_>-]*(?:ngoài ra|ngoai ra|tuy nhiên|tuy nhien|còn\b|con\b|nếu (?:bạn )?muốn thêm|bên cạnh đó|ben canh do|quán này|quan nay|nơi này|noi nay|chỗ này|cho nay|đây là|day la|nó\b|also\b|besides\b|however\b|it\b|this (?:place|spot|one)|the (?:place|spot))/iu
const stripMarkers = (t: string): string => t
  .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, '').replace(/\[FOLLOWUPS\][^\n]*/g, '')
  .replace(/\[TAPPY_PLACES\][\s\S]*?\[\/TAPPY_PLACES\]/g, '').replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/g, '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/https?:\/\/\S+/g, '')
const letters = (t: string): number => (t.match(/\p{L}/gu) ?? []).length

/**
 * Fragment = a paragraph that cannot stand on its own AFTER A DELETION. A paragraph the
 * model itself opened with "Ngoài ra" is coherent as long as the paragraph before it is
 * the same one it followed in the input; it becomes a fragment only when that
 * antecedent was removed or cut.
 */
function fragmentsIn(text: string, input: string): string[] {
  const out: string[] = []
  const paras = stripMarkers(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const inParas = stripMarkers(input).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  paras.forEach((p, k) => {
    const body = p.replace(/^[\s*_>#-]+/, '').trim()
    if (!body) return
    const isList = /^(?:[-*•]|\d+[.)])\s/.test(p)
    if (!/\p{L}/u.test(body)) { out.push(p); return }                  // emoji / punctuation only
    if (/^[.,;:!?…)]/.test(body)) { out.push(p); return }               // starts with punctuation
    if (!isList && /^\p{Ll}/u.test(body)) { out.push(p); return }       // starts lowercase (not a list item)
    if (letters(body) < 4) { out.push(p); return }                      // stub
    if (/(?:\b(?:và|nhưng|hoặc|vì|nên|and|but|or|because)|[,;—–-])\s*$/iu.test(body)) { out.push(p); return } // ends mid-thought
    if (!isList && CONNECTIVE_RE.test(body)) {
      // Antecedent check: the paragraph before this one must be the same paragraph that
      // preceded it in the input (unchanged). Otherwise the connective dangles.
      // A trimmed antecedent (one sentence removed, the paragraph still standing) still
      // anchors the connective: its first surviving sentence must come from that paragraph.
      const idxIn = inParas.indexOf(p)
      const prevOut = k > 0 ? paras[k - 1] : null
      const prevIn = idxIn > 0 ? inParas[idxIn - 1] : null
      const firstSentence = (prevOut ?? '').split(/(?<=[.!?…])\s/)[0]
      const antecedentIntact = idxIn !== -1 && prevIn !== null && prevOut !== null && letters(firstSentence) >= 4 && prevIn.includes(firstSentence)
      if (!antecedentIntact) out.push(p)
    }
  })
  return out
}

/** Mirror of the G1b fallback in streamEnrichment.ts (v2 only). */
function fallbackFor(r: Rec, gatedText: string): string | null {
  const pick = r.pickName
  if (!pick) return null
  const rating = r.evidence.ratingsByEntity[pick]?.[0]
  if (typeof rating !== 'number') return null
  const count = r.evidence.reviewCountsByEntity[pick]?.[0]
  const hours = r.evidence.hoursByEntity[pick]
  const released = r.flushedText ?? ''
  const body = gatedText.startsWith(released) ? gatedText.slice(released.length) : gatedText
  if (letters(stripMarkers(body)) >= 40) return null
  const confidentlyEnglish = r.lang === 'en'
    && /\b(find|me|the|near|nearby|quiet|restaurant|please|want|looking|recommend|show|best|good|where|for|with)\b/i.test(r.userText)
    && !/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(r.userText)
  const ratingText = `${rating}⭐${typeof count === 'number' ? (confidentlyEnglish ? ` (${count.toLocaleString('en-US')} Google Maps reviews)` : ` (${count.toLocaleString('vi-VN')} đánh giá Google Maps)`) : ''}`
  const hoursText = hours ? (confidentlyEnglish ? `; opening hours per Google Maps: ${hours}` : `; giờ mở cửa theo Google Maps: ${hours}`) : ''
  return confidentlyEnglish ? `I'd go with **${pick}** — ${ratingText}${hoursText}.` : `Mình chọn **${pick}** — ${ratingText}${hoursText}.`
}

/** Numbers stated in the guard input (prose only) that match NO evidence of ANY venue — must not survive. */
function fabricatedNumbers(r: Rec, input: string): string[] {
  const prose = stripMarkers(input)
  const allRatings = new Set(Object.values(r.evidence.ratingsByEntity).flat().map(String))
  const allCounts = new Set(Object.values(r.evidence.reviewCountsByEntity).flat())
  const allPhones = new Set(Object.values(r.evidence.phonesByEntity).flat().map(p => p.replace(/\D/g, '').replace(/^84/, '0')))
  const out: string[] = []
  for (const m of prose.matchAll(/\b(\d(?:[.,]\d)?)\s*(?:⭐|★|sao\b|\/\s*5|stars?\b)/giu)) { if (!allRatings.has(m[1].replace(',', '.'))) out.push(m[0]) }
  for (const m of prose.matchAll(/(\d[\d.,]*)\s*\+?\s*(?:đánh giá|danh gia|nhận xét|reviews?|ratings?)(?!\p{L})/giu)) { const n = parseInt(m[1].replace(/[.,]/g, ''), 10); if (Number.isFinite(n) && !allCounts.has(n)) out.push(m[0]) }
  for (const m of prose.matchAll(/(?:\+84|0)(?:[\s.-]?\d){8,10}/g)) { if (!allPhones.has(m[0].replace(/\D/g, '').replace(/^84/, '0'))) out.push(m[0]) }
  return out
}

/** Re-run the mobile-path injector and report where each inserted block landed relative to the sentence it follows. */
function midSentenceInsertions(r: Rec): { inserted: number; mid_sentence: number; samples: string[] } {
  if (!r.placesFull || !r.stages.mainText) return { inserted: 0, mid_sentence: 0, samples: [] }
  const main = r.stages.mainText
  const enriched = injectPlaceEnrichment(r.placesFull as never[], main, r.lang)
  const mainLines = new Set(main.split('\n'))
  let inserted = 0, mid = 0
  const samples: string[] = []
  const lines = enriched.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim() || mainLines.has(l)) continue
    if (!/^!\[|^\[[^\]]+\]\(|^https?:\/\//.test(l.trim())) continue
    inserted++
    // The prose that precedes the block: the nearest non-blank line above.
    let j = i - 1; while (j >= 0 && !lines[j].trim()) j--
    const prev = (lines[j] ?? '').trimEnd()
    // Was that prose line cut? It is if the original text continued on the same line after it.
    const at = main.indexOf(prev)
    const cut = at !== -1 && at + prev.length < main.length && main[at + prev.length] !== '\n'
    if (cut) { mid++; if (samples.length < 3) samples.push(`…${prev.slice(-50)} ⟨${l.slice(0, 30)}…⟩ ${main.slice(at + prev.length, at + prev.length + 40).replace(/\n/g, '⏎')}…`) }
  }
  return { inserted, mid_sentence: mid, samples }
}

describe('G1 acceptance replay', () => {
  it('replays the captured pre-guard text through v1 and v2 and writes the metrics', () => {
    const rows: Array<Record<string, unknown> & { run: number; ran_guard: boolean; v1: { chars: number; removed?: number; ratio: number; fragments: string[]; fabricated_surviving: string[] }; v2: { chars: number; removed?: number; ratio: number; fragments: string[]; fabricated_surviving: string[]; unattributable?: number; fallback_used: boolean; pick_attributable: boolean | null; attribution?: Record<string, number>; reasons?: Record<string, number>; cta_kept: boolean }; pick: string | null; fabricated_in_input: string[]; cta_in_input: boolean; cta_kept_v1: boolean; injection: { inserted: number; mid_sentence: number; samples: string[] } }> = []
    const notes: string[] = []
    for (const cap of CAPTURES) {
      if (!existsSync(cap.file)) { notes.push(`missing capture: ${cap.file}`); continue }
      const recs = readFileSync(cap.file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as Rec)
      let rebuilt = 0
      if (cap.rebuildRatings && existsSync(cap.runJson)) {
        const runs = (JSON.parse(readFileSync(cap.runJson, 'utf8')) as { runs: RunEntry[] }).runs
        rebuilt = rebuildRatings(recs, runs)
        notes.push(`run ${cap.run}: ratingsByEntity rebuilt from recorded tool rows on ${rebuilt}/${recs.length} records`)
      }
      recs.forEach((r, i) => {
        const input = r.stages.snippetGuarded ?? ''
        const ev = evidenceOf(r)
        const v1 = guardPlaceClaimsInText(input, ev, { scope: r.scope })
        const v2 = guardPlaceClaimsInText(input, ev, { scope: r.scope, attributionV2: true, pickName: r.pickName })
        const v2fb = fallbackFor(r, v2.text)
        const v2final = v2fb ? `${v2.text.trimEnd()}\n\n${v2fb}` : v2.text
        const fab = fabricatedNumbers(r, input)
        const inLetters = letters(stripMarkers(input))
        const ratio = (t: string) => inLetters ? +(letters(stripMarkers(t)) / inLetters).toFixed(3) : 1
        rows.push({
          run: cap.run, i, userText: r.userText.slice(0, 80), lang: r.lang, scope: r.scope, hadPlaceSearch: r.hadPlaceSearch, placeSearchStatus: r.placeSearchStatus,
          pick: r.pickName, places: r.places.length, ran_guard: r.stats !== null, ratings_rebuilt: cap.rebuildRatings,
          server_output_equals_v1_replay: (r.stages.placeGuarded ?? input) === v1.text,
          input_chars: input.length, input_letters: inLetters,
          cta_in_input: input.includes('[CTA_BUTTONS]'), cta_kept_v1: v1.text.includes('[CTA_BUTTONS]'),
          v1: { chars: v1.text.length, ratio: ratio(v1.text), removed: v1.stats?.sentences_removed, fragments: fragmentsIn(v1.text, input), fabricated_surviving: fab.filter(f => v1.text.includes(f)) },
          v2: { chars: v2final.length, ratio: ratio(v2final), removed: v2.stats?.sentences_removed, reasons: v2.stats?.reasons, attribution: v2.stats?.attribution, unattributable: v2.stats?.unattributable_claims, pick_attributable: v2.stats?.pick_attributable ?? null, fallback_used: !!v2fb, fragments: fragmentsIn(v2final, input), fabricated_surviving: fab.filter(f => v2final.includes(f)), cta_kept: v2final.includes('[CTA_BUTTONS]') },
          fabricated_in_input: fab,
          injection: midSentenceInsertions(r),
          texts: { input, v1: v1.text, v2: v2final, server_v1: r.stages.placeGuarded },
        })
      })
    }
    const guarded = rows.filter(r => r.ran_guard)
    const sum = (f: (r: typeof rows[number]) => number) => guarded.reduce((n, r) => n + f(r), 0)
    const totals = (key: 'attribution' | 'reasons') => guarded.reduce((acc, r) => { for (const [k, v] of Object.entries(r.v2[key] ?? {})) acc[k] = (acc[k] ?? 0) + v; return acc }, {} as Record<string, number>)
    const metrics = {
      notes,
      captured: rows.length, guard_ran: guarded.length, by_run: { run1: rows.filter(r => r.run === 1).length, run2: rows.filter(r => r.run === 2).length },
      server_output_equals_v1_replay: guarded.filter(r => r.server_output_equals_v1_replay).length,
      cta: { in_input: guarded.filter(r => r.cta_in_input).length, kept_v1_replay: guarded.filter(r => r.cta_kept_v1).length, kept_v2_replay: guarded.filter(r => r.v2.cta_kept).length, kept_by_server_during_run: guarded.filter(r => String((r.texts as { server_v1: string | null }).server_v1 ?? '').includes('[CTA_BUTTONS]')).length },
      v1: {
        turns_with_removals: guarded.filter(r => (r.v1.removed ?? 0) > 0).length,
        turns_with_fragments: guarded.filter(r => r.v1.fragments.length > 0).length,
        turns_le_35pct: guarded.filter(r => r.v1.ratio <= 0.35).length,
        fabricated_surviving: sum(r => r.v1.fabricated_surviving.length),
        median_ratio: median(guarded.map(r => r.v1.ratio)), min_ratio: Math.min(...guarded.map(r => r.v1.ratio)),
      },
      v2: {
        turns_with_removals: guarded.filter(r => (r.v2.removed ?? 0) > 0).length,
        turns_with_fragments: guarded.filter(r => r.v2.fragments.length > 0).length,
        turns_le_35pct: guarded.filter(r => r.v2.ratio <= 0.35).length,
        fabricated_surviving: sum(r => r.v2.fabricated_surviving.length),
        fallback_used: guarded.filter(r => r.v2.fallback_used).length,
        pick_attributable: guarded.filter(r => r.v2.pick_attributable === true).length,
        pick_present: guarded.filter(r => r.pick).length,
        median_ratio: median(guarded.map(r => r.v2.ratio)), min_ratio: Math.min(...guarded.map(r => r.v2.ratio)),
        attribution_totals: totals('attribution'), reason_totals: totals('reasons'),
      },
      fabricated_numbers_in_inputs: sum(r => r.fabricated_in_input.length),
      injection_mobile_path_replay: {
        records_with_rows: rows.filter(r => r.injection.inserted > 0 || (r as { placesFull?: unknown }).placesFull).length,
        blocks_inserted: rows.reduce((n, r) => n + r.injection.inserted, 0),
        blocks_mid_sentence: rows.reduce((n, r) => n + r.injection.mid_sentence, 0),
        turns_with_mid_sentence: rows.filter(r => r.injection.mid_sentence > 0).length,
        samples: rows.flatMap(r => r.injection.samples).slice(0, 6),
      },
    }
    writeFileSync(`${AUDIT}/g1-replay.json`, JSON.stringify(rows, null, 2))
    writeFileSync(`${AUDIT}/g1-replay-metrics.json`, JSON.stringify(metrics, null, 2))
    expect(rows.length).toBeGreaterThan(0)
  })
})

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(3)
}
