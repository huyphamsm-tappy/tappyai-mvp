// How much of a report repeats itself, as a number (11/11, after reading twelve real reports: the same figures turn up in the summary, in the section and again in the caveats). Pure.
// Behind RESEARCH_TIGHT_WRITE (deepResearchState.ts) the writer is given TIGHT_WRITE_RULE; the measure is what tells whether it helps.

/**
 * The figures of a report (four characters or more, citation marks and years left out, the sources list left out) and how many of them are written on three or more different lines.
 * `share` is a percentage with one decimal. A report with no figures is all zeros.
 */
export function repeatedFigures(text: string): { distinct: number; repeated: number; share: number } {
  const body = String(text ?? '').split(/\n#{1,3} (?:Nguồn|Sources)\b/)[0]
  const lines = new Map<string, Set<number>>()
  body.split('\n').forEach((line, i) => {
    for (const m of line.replace(/\[\d+\]/g, ' ').matchAll(/\d[\d.,]*\d/g)) {
      const n = m[0]
      if (n.length < 4 || /^(19|20)\d{2}$/.test(n)) continue
      lines.set(n, (lines.get(n) ?? new Set<number>()).add(i))
    }
  })
  const distinct = lines.size
  const repeated = [...lines.values()].filter(s => s.size >= 3).length
  return { distinct, repeated, share: distinct ? Math.round((repeated / distinct) * 1000) / 10 : 0 }
}

/** The writing rule given to the writer with RESEARCH_TIGHT_WRITE: each figure once, a short summary, caveats that point instead of restating. */
export const TIGHT_WRITE_RULE = 'Writing rule: state each figure once, in the section where it matters. The summary carries at most five headline figures and does not repeat the caveats. The data-caveats section points to the section where the values of a disagreement are shown ("see section N") instead of restating them. Never repeat a sentence, and never repeat a figure in a later section unless that section compares it with a different value.'
