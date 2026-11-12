// Independent claim/citation verifier (R13 §4.2.1-4.2.2 "Independent Claim/Citation Verification"). Pure, deterministic, no model: the model that WROTE a report never certifies it.
//
// It reads the finished report against the sources the report cites and checks only what code can check for certain:
//   · every [n] points at a source the report lists;
//   · a figure written in a sentence that cites a source appears in THAT source's own text (title, snippet, page read) — not merely somewhere in the pool of findings;
//   · a figure written with no citation at all is reported as uncited.
// A source with no readable text cannot confirm or refute a figure: such sentences are `source_unreadable`, never "supported" and never "wrong".
// It does not judge meaning (that a sentence's words are what the page says): the result says so in `scope`, so no one reads "verified" as more than it is.

import { numberInText } from './deepResearch'

export type ClaimStatus = 'supported' | 'number_not_in_source' | 'bad_citation' | 'uncited_number' | 'source_unreadable' | 'unframed_forecast'

export interface VerifierSource { id: number; title: string; snippet: string; text: string }

export interface ClaimCheck {
  /** 1-based index of the sentence in the report (the sentence itself is NOT kept: reports are not logged) */
  sentence: number
  status: ClaimStatus
  /** the figures that failed the check (as written), at most a few */
  figures: string[]
  cited: number[]
}

export interface VerificationResult {
  /** what was checked and what was not */
  scope: 'numbers_and_citation_ids_only'
  sentences: number
  checked: number
  counts: Record<ClaimStatus, number>
  flagged: ClaimCheck[]
}

const CITE = /\[(\d{1,3})\]/g
const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/

/** The figures of a sentence that are worth checking: the same rule the report-level check uses (not a bare year, not a small integer). */
function figuresOf(sentence: string): string[] {
  const bare = sentence.replace(/\[\d+\](\[\d+\])*/g, ' ')
  const out: string[] = []
  for (const m of bare.matchAll(/\d[\d.,]*\d%?|\d%/g)) {
    const raw = m[0].replace(/%$/, '')
    if (/^(19|20)\d{2}$/.test(raw)) continue
    if (!(raw.length >= 3 || /[.,]/.test(raw) || m[0].endsWith('%'))) continue
    out.push(m[0])
  }
  return out
}

/** A figure as written in a sentence ("12.500", "9,3%") is present in a text: as the same number, in either decimal convention, or as the same characters. */
export const written = (figure: string, corpus: string): boolean => {
  const raw = figure.replace(/%$/, '')
  return numberInText(Number(raw.replace(/,/g, '')), corpus) || numberInText(Number(raw.replace(/\./g, '').replace(',', '.')), corpus) || corpus.includes(raw)
}

const FUTURE_YEAR = /\b(20\d{2})\b/g
const HEDGE = /(du bao|uoc tinh|kich ban|gia dinh|du kien|co the dat|forecast|estimate|scenario|assum|expected|projected|projection)/
const foldLite = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

// Framing words of other scripts. They are matched on the text as written (never folded: folding strips Thai vowel marks). Words that SAY "forecast / estimate / scenario / assumption / expected / may":
//   zh (simplified + traditional) 预测 预计 预估 估计 估算 预期 预料 预判 展望 情景 假设 设想 推算 推测 测算 有望 或将 或许 也许 可能 趋势;  ja 予測 予想 見込 見通 推計 推定 想定 仮定 試算 見積 シナリオ 可能性;
//   ko 예상 전망 예측 추정 추산 가정 시나리오 가능성 예견;  th คาดการณ์ คาดว่า คาดหมาย ประมาณการ พยากรณ์ สมมติ แนวโน้ม สถานการณ์จำลอง อาจ.
// "不可能 / 不太可能 / 没有可能" is the opposite of a hedge (a flat denial) and does not count. 目标 / target is a goal, not a forecast, and is not a hedge (as in English).
const HEDGE_CJKT = new RegExp([
  '预测|预计|预估|估计|估算|预期|预料|预判|展望|情景|假设|设想|推算|推测|测算|有望|或将|或许|也许|(?<![不没无未太])可能|趋势',
  '預測|預計|預估|估計|預期|預料|預判|設想|測算|或將|也許|趨勢|假設',
  '予測|予想|見込|見通|推計|推定|想定|仮定|試算|見積|シナリオ|可能性',
  '예상|전망|예측|추정|추산|가정|시나리오|가능성|예견',
  'คาดการณ์|คาดว่า|คาดหมาย|ประมาณการ|พยากรณ์|สมมติ|แนวโน้ม|สถานการณ์จำลอง|อาจ(?!าร)',
].join('|'))
// A bare "approximately" frames an estimate only inside the clause that holds the future year ("2027年规模约800亿元"); in "2023年销售额约300亿元，2027年将达到800亿元" the 约 belongs to a past figure.
// 约 counts only as the word "approximately" (followed by a number or 为/合/占/达/有...: not 公约, 条约, 制约, 预约); 左右 only after a number or unit (not 左右为难).
const APPROX_CJKT = /大约|大約|大概|大致|约(?=[\d０-９一二三四五六七八九十百千万亿零几为合占达有在增降计共等])|約(?=[\d０-９一二三四五六七八九十百千万萬億零幾為合占佔達有在增降計共等])|(?<=[\d０-９万萬亿億千百元美％%年月日人倍])左右|(?<=[\d０-９万萬亿億千百元円%％年月日人倍])ほど|およそ|대략|가량|ประมาณ/
const CLAUSE_SPLIT = /[，、；;：。！？]|,(?=\s)/

/** A sentence that gives a figure for a FUTURE year (later than `year`) without saying it is an estimate, forecast, scenario or assumption: a forecast written as a fact. Pure. */
export function unframedForecast(sentence: string, year: number): boolean {
  const bare = sentence.replace(/\[\d+\](\[\d+\])*/g, ' ')
  const isFuture = (m: RegExpMatchArray) => Number(m[1]) > year && Number(m[1]) <= year + 10
  const future = [...bare.matchAll(FUTURE_YEAR)].some(isFuture)
  if (!future || figuresOf(bare).length === 0) return false
  if (HEDGE.test(foldLite(bare)) || HEDGE_CJKT.test(bare)) return false
  return !bare.split(CLAUSE_SPLIT).some(clause => [...clause.matchAll(FUTURE_YEAR)].some(isFuture) && APPROX_CJKT.test(clause))
}

/** Verify a written report. `sources` are the report's own numbered sources (1..n). `year` = the current year, for the forecast-as-fact check. Pure. */
export function verifyReport(report: string, sources: readonly VerifierSource[], year: number = new Date().getFullYear()): VerificationResult {
  const byId = new Map(sources.map(s => [s.id, s]))
  const counts: Record<ClaimStatus, number> = { supported: 0, number_not_in_source: 0, bad_citation: 0, uncited_number: 0, source_unreadable: 0, unframed_forecast: 0 }
  const flagged: ClaimCheck[] = []
  const sentences = String(report ?? '').split(SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean)
  let checked = 0
  sentences.forEach((sentence, i) => {
    const cited = [...new Set([...sentence.matchAll(CITE)].map(m => Number(m[1])))]
    const figures = figuresOf(sentence)
    if (!cited.length && !figures.length) return
    checked++
    let status: ClaimStatus = 'supported'
    let bad: string[] = []
    if (cited.some(id => !byId.has(id))) status = 'bad_citation'
    else if (!cited.length) { status = 'uncited_number'; bad = figures.slice(0, 4) }
    else if (figures.length) {
      const live = cited.map(id => byId.get(id)!)
      const readable = live.filter(s => s.text.trim() || s.snippet.trim())
      if (!readable.length) status = 'source_unreadable'
      else {
        const corpus = readable.map(s => `${s.title}\n${s.snippet}\n${s.text}`).join('\n')
        const missing = figures.filter(f => !written(f, corpus))
        if (missing.length) { status = 'number_not_in_source'; bad = missing.slice(0, 4) }
      }
    }
    // a figure for a future year with no word of estimate, forecast or assumption is a forecast written as a fact (it does not hide a worse status)
    if (status === 'supported' && unframedForecast(sentence, year)) { status = 'unframed_forecast'; bad = figuresOf(sentence).slice(0, 4) }
    counts[status]++
    if (status !== 'supported') flagged.push({ sentence: i + 1, status, figures: bad, cited })
  })
  return { scope: 'numbers_and_citation_ids_only', sentences: sentences.length, checked, counts, flagged }
}

/** True when nothing the verifier can check failed (unreadable sources do not fail a report, they are reported). */
export const verifierClean = (r: VerificationResult): boolean => r.counts.bad_citation + r.counts.number_not_in_source + r.counts.uncited_number + r.counts.unframed_forecast === 0
