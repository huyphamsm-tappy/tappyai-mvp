// ── Wave 3-FIX (R3-03) — does the answer the model actually wrote HAVE a structure? ────────────────────────────────────────────────────────────────────────
//
// CONSULT_STRUCTURED_SYNTHESIS asks the model for a sectioned answer for a request with several parts. The post-processing that turns a consult answer into "a short pick" (sentence cap, hedge merge, line tidy)
// must step aside only for an answer that really IS sectioned - not for every consult turn that happens to run with the flag on. The test is on the text and nothing else: a markdown table (a header row, a
// rule row of dashes, and at least one data row) or at least two markdown headings. No word is looked for. Pure.

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const HEADING = /^\s{0,3}#{1,6}\s+\S/

export function hasMarkdownStructure(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false
  const lines = text.split('\n')
  let headings = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (HEADING.test(l)) headings++
    // a table: a row, then a rule row of dashes, then a data row (all pipe-delimited)
    if (i + 2 < lines.length && TABLE_ROW.test(l) && TABLE_RULE.test(lines[i + 1]!) && lines[i + 1]!.includes('|') && TABLE_ROW.test(lines[i + 2]!)) return true
  }
  return headings >= 2
}
