// 31/10: the finished deep research report as a Word file (.docx), built in the browser with the `docx` package (loaded only when the person
// asks for the file). Headings, paragraphs, lists, tables and quotes from the same blocks as the article layout; **bold**, *italic* and `code`
// inline; the sources list linked (reportMarkdown). The section pictures are not embedded (they are other sites' images: the PDF shows them
// from their own address; Word would need the app to download them).
import { parseDoc, type DocBlock } from '@/lib/answerDoc/parse'
import { reportMarkdown, type ReportLink } from '@/lib/answerDoc/reportExport'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

/** Inline markdown as runs: bold, italic, code, links (https only; any other link keeps its label). Pure. */
export function inlineRuns(s: string): Array<{ text: string; bold?: boolean; italics?: boolean; code?: boolean; link?: string }> {
  const out: Array<{ text: string; bold?: boolean; italics?: boolean; code?: boolean; link?: string }> = []
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g
  let at = 0
  for (const m of s.matchAll(re)) {
    if (m.index! > at) out.push({ text: s.slice(at, m.index) })
    if (m[1]) out.push({ text: m[1], bold: true })
    else if (m[2]) out.push({ text: m[2], italics: true })
    else if (m[3]) out.push({ text: m[3], code: true })
    else out.push(isSafeHttpsUrl(m[5]) ? { text: m[4], link: m[5] } : { text: m[4] })
    at = m.index! + m[0].length
  }
  if (at < s.length) out.push({ text: s.slice(at) })
  return out.map(r => ({ ...r, text: r.text.replace(/\n/g, ' ') })).filter(r => r.text)
}

/** The rows of a markdown table block (the separator row dropped), or null when the block is not a table. Pure. */
export function tableRows(raw: string): string[][] | null {
  const lines = raw.split('\n').filter(l => l.trim())
  if (lines.length < 2 || !/^\s*\|?\s*:?-{2,}/.test(lines[1])) return null
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  return [cells(lines[0]), ...lines.slice(2).map(cells)]
}

export async function reportDocx(text: string, links: readonly ReportLink[], title: string): Promise<Blob> {
  const d = await import('docx')
  const runs = (s: string) => inlineRuns(s).map(r => {
    const run = new d.TextRun({ text: r.text, bold: r.bold, italics: r.italics, font: r.code ? 'Consolas' : undefined, ...(r.link ? { style: 'Hyperlink' } : {}) })
    return r.link ? new d.ExternalHyperlink({ link: r.link, children: [run] }) : run
  })
  const HEADINGS = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3, d.HeadingLevel.HEADING_4]
  const body = (blocks: DocBlock[], level = 0): Array<InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>> => blocks.flatMap(b => {
    switch (b.t) {
      case 'heading': return [new d.Paragraph({ heading: HEADINGS[Math.min(Math.max(b.level, 1), 4) - 1], children: runs(b.text) })]
      case 'para': return b.text.split('\n').map(l => new d.Paragraph({ children: runs(l) }))
      case 'quote': return [new d.Paragraph({ indent: { left: 400 }, children: runs(b.text) })]
      case 'hr': return [new d.Paragraph({ thematicBreak: true, children: [] })]
      case 'raw': {
        const rows = tableRows(b.text)
        if (!rows) return b.text.split('\n').map(l => new d.Paragraph({ children: [new d.TextRun({ text: l, font: 'Consolas' })] }))
        const width = Math.max(...rows.map(r => r.length))
        return [new d.Table({
          width: { size: 100, type: d.WidthType.PERCENTAGE },
          rows: rows.map((r, i) => new d.TableRow({ tableHeader: i === 0, children: Array.from({ length: width }, (_, k) => new d.TableCell({ children: [new d.Paragraph({ children: inlineRuns(r[k] ?? '').map(x => new d.TextRun({ text: x.text, bold: i === 0 || x.bold, italics: x.italics })) })] })) })),
        })]
      }
      case 'list': return b.items.flatMap((it, k) => [
        new d.Paragraph({ ...(b.ordered ? { children: [new d.TextRun(`${b.start + k}. `), ...runs(it.text)], indent: { left: 360 * (level + 1) } } : { bullet: { level: Math.min(level, 8) }, children: runs(it.text) }) }),
        ...(it.children ? body(parseDoc(it.children), level + 1) : []),
      ])
    }
  })
  const doc = new d.Document({ title, creator: 'Tappy', sections: [{ children: body(parseDoc(reportMarkdown(text, links))) }] })
  return d.Packer.toBlob(doc)
}
