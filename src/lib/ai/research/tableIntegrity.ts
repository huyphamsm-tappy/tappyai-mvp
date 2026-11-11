// Table integrity of a written report (owner 11/11: a price table row read "Ding Tea | 35.000–55. | Gong Cha": the price cell stopped after "55." and the next row's name sat in the notes column).
// The stripper and the numberer were tested on such rows and do not cut them, so the break came from the written text itself. This pure check finds it by code:
//   · a row whose cell count differs from its header's;
//   · a cell that ends in a half-written number ("55.", "35.000–55,").
// It only REPORTS (counts and line numbers, never the cell text): a repair is a separate, bounded step (conflictMetadata.nextRepairAction).

export type TableProblem = { line: number; kind: 'cell_count' | 'truncated_number' }

const SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

/** Problems in the markdown tables of a report. Lines are 1-based. Pure. */
export function tableProblems(report: string): TableProblem[] {
  const lines = String(report ?? '').split('\n')
  const out: TableProblem[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/\|/.test(lines[i]) || !SEP.test(lines[i + 1])) continue
    const width = cells(lines[i]).length
    let j = i + 2
    for (; j < lines.length && /\|/.test(lines[j]) && lines[j].trim() !== ''; j++) {
      const row = cells(lines[j])
      if (row.length !== width) out.push({ line: j + 1, kind: 'cell_count' })
      if (row.some(c => /\d[.,]$/.test(c.replace(/\s*\[\d+\]$/, '')))) out.push({ line: j + 1, kind: 'truncated_number' })
    }
    i = j - 1
  }
  return out
}
