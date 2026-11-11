// What the chat shows of a finished research report (owner 11/11: the whole report landed in the chat as the answer, 14-19 pages; "bullet the main points, the details are in the report, and say only how many
// sources"). Pure. Behind the build flag NEXT_PUBLIC_REPORT_SUMMARY_VIEW (off by default: without it the chat shows the whole report as before).
//   The chat shows the title and scope line, the report's own first section (its "Tóm tắt": the numbered main findings), and a bar: "based on N sources" and a button for the full report.
//   The saved message is NOT changed: it still holds the whole report, so the exports (Markdown, Word, PDF), the reload and the follow-up digest all work as before; this only chooses what is drawn.

import { looksLikeReport } from '@/lib/chat/requestHistory'
import { sourceCountOf } from '@/lib/answerDoc/reportExport'

export const REPORT_SUMMARY_VIEW = process.env.NEXT_PUBLIC_REPORT_SUMMARY_VIEW === '1'

export interface ReportSplit { head: string; summary: string; rest: string; hasRest: boolean }

/**
 * head = everything before the first level-2 heading (the title and the scope line); summary = the first level-2 section; rest = from the second level-2 heading on (the details and the sources list).
 * With fewer than two level-2 headings (a report still being written, or no report at all) there is no rest. head + summary + rest is always the text. Pure.
 */
export function splitReport(text: string): ReportSplit {
  const starts = [...String(text ?? '').matchAll(/^ {0,3}##(?!#)[ \t]+\S/gm)].map(m => m.index ?? 0)
  if (starts.length < 2) return { head: '', summary: text, rest: '', hasRest: false }
  return { head: text.slice(0, starts[0]), summary: text.slice(starts[0], starts[1]), rest: text.slice(starts[1]), hasRest: true }
}

export interface ReportView { shown: string; collapsed: boolean; bar: null | { sources: number; expanded: boolean } }

/**
 * What to draw for one message. `research` = the live research card is on this message; otherwise a report is recognised by its text (a reloaded one). `links` = the cited sources of the live card.
 * Not a report, flag off, or a report with only its first section written so far: the text as it is and no bar.
 */
export function reportViewOf(o: { text: string; research: boolean; expanded: boolean; links: number; enabled?: boolean }): ReportView {
  const plain: ReportView = { shown: o.text, collapsed: false, bar: null }
  if (!(o.enabled ?? REPORT_SUMMARY_VIEW) || !(o.research || looksLikeReport(o.text))) return plain
  const s = splitReport(o.text)
  if (!s.hasRest) return plain
  const bar = { sources: Math.max(o.links, sourceCountOf(o.text, [])), expanded: o.expanded }
  return o.expanded ? { shown: o.text, collapsed: false, bar } : { shown: `${s.head}${s.summary}`.trimEnd(), collapsed: true, bar }
}
