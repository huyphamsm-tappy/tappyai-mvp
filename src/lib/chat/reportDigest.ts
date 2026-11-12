// What the CHAT shows of a deep research report (owner 11/11 and 12/11): while it is written, only the titles of its sections; when it is done, a card with the key points (the report's own
// first section, its "Tóm tắt"), the TOTAL number of sources and one button. Never a section's text beyond that first one, never the sources list, never a link. The full report (contents,
// footnotes, sources list) lives only in the opened view. VIEW ONLY: the saved message is the whole report, unchanged. Pure; used with NEXT_PUBLIC_RESPONSE_PRESENTATION=1.
import { sourceCountOf } from '@/lib/answerDoc/reportExport'
import { isSourcesSection, plainHeading, splitSections, stripTitleLine, arrivalOf } from '@/lib/chat/presentation'

/** The most characters of key points the card shows (cut at a line end). */
export const DIGEST_MAX_CHARS = 1600

/** Link markup becomes its label, bare addresses and footnote marks "[n]" disappear: the card carries no link and no citation. */
export function stripSourceMarks(md: string): string {
  return String(md ?? '')
    .replace(/\[([^\]\n]*)\]\((?:[^)\n]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[ \t]*\[\d{1,3}\](?!\()/g, '')
    .replace(/[ \t]+$/gm, '')
}

export interface ReportDigest {
  /** markdown of the key points (the first section's body without its heading), cleaned and capped */
  bullets: string
  /** how many sources the report rests on (a number only) */
  sources: number
  /** the report's section titles in order, without the sources list */
  titles: string[]
}

function capAtLine(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const at = cut.lastIndexOf('\n')
  return (at > max / 2 ? cut.slice(0, at) : cut).trimEnd()
}

/** `linkCount` = the sources the live research card already knows (the total is the larger of it and the numbered lines of the sources list). Pure. */
export function reportDigest(text: string, linkCount = 0): ReportDigest {
  const { head, sections } = splitSections(text)
  const content = sections.filter(s => !isSourcesSection(s.text))
  let body: string
  if (content.length) body = content[0].text.split('\n').slice(1).join('\n')
  else body = stripTitleLine(head)
  const bullets = capAtLine(stripSourceMarks(body).replace(/^\s*\n+/, '').trim(), DIGEST_MAX_CHARS)
  return { bullets, sources: Math.max(linkCount, sourceCountOf(String(text ?? ''), [])), titles: content.map(s => plainHeading(s.title)) }
}

export interface ReportProgress { done: string[]; writing: string | null }
/** While the reply streams: the titles of the sections that are complete and the one being written (its title only). */
export function reportProgress(text: string): ReportProgress {
  const a = arrivalOf(text, true)
  return { done: a.complete.map(s => plainHeading(s.title)).filter(Boolean), writing: a.pending?.title ? plainHeading(a.pending.title) : null }
}
