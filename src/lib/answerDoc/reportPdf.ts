// 15/11 (owner: "bấm vào là tải về, không phải Ctrl+P, người văn phòng không biết làm"): the finished report as a real PDF FILE that downloads on one click, written in the browser with pdfmake
// (loaded only when the person asks for the file; nothing is sent anywhere). The page is built from the same blocks as the Word file (parseDoc), so headings, lists, tables, quotes, links and the
// sources list match it: A4, Roboto (it covers Vietnamese; the package carries it), page numbers at the bottom, a heading is never left alone at the bottom of a page.
// The section pictures are not embedded (they are other sites' images). The older print-dialog path (reportExport.printHtml) stays in the code for the sandboxed print preview only.
import { parseDoc, type DocBlock } from '@/lib/answerDoc/parse'
import { downloadBlob, reportFileName, reportMarkdown, type ReportLink } from '@/lib/answerDoc/reportExport'
import { inlineRuns, tableRows } from '@/lib/answerDoc/reportDocx'

type Inline = { text: string; bold?: boolean; italics?: boolean; link?: string; color?: string; decoration?: string; background?: string; fontSize?: number }
// pdfmake's definition is plain data: nodes are objects with a few known keys
export type PdfNode = Record<string, unknown>

const BLUE = '#1A3D7C'
const LINK = '#1155CC'

/** Inline markdown as pdfmake text runs: bold, italic, code (small, shaded), links (https only, blue and underlined). Pure. */
export function pdfRuns(s: string): Inline[] {
  // Roboto has every Vietnamese letter and the usual punctuation, but not the arrow: it would print as an empty box
  return inlineRuns(s.replace(/→/g, '->')).map((r): Inline => {
    if (r.link) return { text: r.text, link: r.link, color: LINK, decoration: 'underline' }
    if (r.code) return { text: r.text, background: '#F1F1F1', fontSize: 9.5 }
    return { text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italics ? { italics: true } : {}) }
  })
}

const HEADING_STYLE = ['title', 'h1', 'h2', 'h3']

export function blocksToNodes(blocks: DocBlock[], level = 0): PdfNode[] {
  return blocks.flatMap((b): PdfNode[] => {
    switch (b.t) {
      // the report's "# " title is the document's title; its sections are h1..h3 (as in the Word file)
      case 'heading': return [{ text: pdfRuns(b.text), style: b.level === 1 ? 'title' : HEADING_STYLE[Math.min(b.level - 1, 3)] ?? 'h1', headlineLevel: 1 }]
      case 'para': return b.text.split('\n').filter(l => l.trim()).map(l => ({ text: pdfRuns(l), style: 'p' }))
      case 'quote': return [{ text: pdfRuns(b.text), style: 'quote' }]
      case 'hr': return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.7, lineColor: '#BBBBBB' }], margin: [0, 6, 0, 8] }]
      case 'raw': {
        const rows = tableRows(b.text)
        if (!rows) return [{ text: b.text, style: 'code', preserveLeadingSpaces: true }]
        const width = Math.max(...rows.map(r => r.length))
        return [{
          table: {
            headerRows: 1,
            widths: Array.from({ length: width }, () => '*'),
            body: rows.map((r, i) => Array.from({ length: width }, (_, k) => ({ text: pdfRuns(r[k] ?? ''), style: i === 0 ? 'th' : 'td' }))),
          },
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#C8CDD6', vLineColor: () => '#C8CDD6', fillColor: (row: number) => (row === 0 ? '#E8EEF8' : null), paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
          margin: [0, 2, 0, 10],
        }]
      }
      case 'list': {
        const items = b.items.map(it => (it.children ? { stack: [{ text: pdfRuns(it.text) }, ...blocksToNodes(parseDoc(it.children), level + 1)] } : { text: pdfRuns(it.text) }))
        return [b.ordered ? { ol: items, start: b.start, style: 'p', margin: [level ? 14 : 4, 0, 0, 6] } : { ul: items, style: 'p', margin: [level ? 14 : 4, 0, 0, 6] }]
      }
    }
  })
}

/** The cover of the file, as the report's cover on the screen: a line above the title, the title, and the facts the app really knows (the day, the number of sources). Texts arrive already in the person's language. */
export interface PdfCover {
  eyebrow: string; title: string; facts: string[]
  /** for the designed page (all optional; the plain cover ignores them): the kind of report, "Cập nhật <day>", how many sources, the word for "sources", and the labels of the notes and the footer in the person's language */
  kind?: string; updated?: string; sources?: number; sourcesWord?: string
  words?: { scope: string; caveats: string; sources: string; footer: string }
  /** the page's own brand lines (a trip plan is not a research note): the line under the logo, the note at the top right and the footer brand. Default: the research report's. */
  labels?: { line: string; note: string; footerBrand: string }
}

const coverNode = (c: PdfCover): PdfNode => ({
  table: { widths: ['*'], body: [[{ stack: [
    { text: c.eyebrow.toUpperCase(), style: 'coverEyebrow' },
    { text: c.title, style: 'coverTitle' },
    ...(c.facts.length ? [{ text: c.facts.join('   ·   '), style: 'coverFacts' }] : []),
  ], fillColor: BLUE, margin: [20, 18, 20, 18] }]] },
  layout: 'noBorders',
  margin: [0, 0, 0, 16],
})

/** The pdfmake document definition of a report: pure data, no pdfmake import (so it is testable on its own). With a cover, the report's own "# " title is not printed twice. Pure. */
export function reportPdfDefinition(text: string, links: readonly ReportLink[], title: string, cover?: PdfCover): Record<string, unknown> {
  let blocks = parseDoc(reportMarkdown(text, links))
  if (cover && blocks[0]?.t === 'heading' && blocks[0].level === 1) blocks = blocks.slice(1)
  return {
    info: { title, author: 'Tappy', creator: 'Tappy', producer: 'Tappy' },
    pageSize: 'A4',
    pageMargins: [56, 56, 56, 64],
    content: [...(cover ? [coverNode(cover)] : []), ...blocksToNodes(blocks)],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.35, color: '#222222' },
    styles: {
      title: { fontSize: 22, bold: true, color: BLUE, margin: [0, 0, 0, 10], lineHeight: 1.2 },
      h1: { fontSize: 15.5, bold: true, color: BLUE, margin: [0, 16, 0, 6], lineHeight: 1.2 },
      h2: { fontSize: 13, bold: true, color: BLUE, margin: [0, 12, 0, 5], lineHeight: 1.2 },
      h3: { fontSize: 11.5, bold: true, color: '#333333', margin: [0, 10, 0, 4] },
      p: { margin: [0, 0, 0, 6] },
      quote: { italics: true, color: '#555555', margin: [14, 0, 0, 6] },
      code: { fontSize: 9, background: '#F1F1F1', margin: [0, 0, 0, 6] },
      th: { bold: true, fontSize: 10, color: BLUE },
      td: { fontSize: 10 },
      coverEyebrow: { fontSize: 8.5, bold: true, color: '#BBD0F5', margin: [0, 0, 0, 8] },
      coverTitle: { fontSize: 21, bold: true, color: '#FFFFFF', lineHeight: 1.2, margin: [0, 0, 0, 10] },
      coverFacts: { fontSize: 9.5, color: '#DCE6FA' },
    },
    // a heading is never left alone at the foot of a page
    pageBreakBefore: (node: { headlineLevel?: number }, following: unknown[]) => !!node.headlineLevel && following.length === 0,
    // the brand on the left, "page / pages" on the right, on every page
    footer: (page: number, pages: number) => ({ columns: [{ text: 'TappyAI', alignment: 'left', bold: true, color: BLUE }, { text: `${page} / ${pages}`, alignment: 'right' }], fontSize: 9, color: '#777777', margin: [56, 24, 56, 0] }),
  }
}

/**
 * The Tappy logo for the hero of the designed page, as a small JPEG data URL (the app's own picture is 1254 px and 545 KB: it is redrawn at 160 px on white). A JPEG, not a PNG, on purpose: pdfmake
 * decodes a PNG with a Web Worker made from a blob, which the site's security policy may refuse, while a JPEG goes into the file as it is. The page puts it on a white rounded tile. undefined when
 * the browser cannot load or draw it: the page then shows a plain blue square with a "T" instead of failing. Browser only.
 */
export async function loadLogoDataUrl(src = '/branding/otter-logo.png'): Promise<string | undefined> {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return undefined
    const res = await fetch(src)
    if (!res.ok) return undefined
    const bmp = await createImageBitmap(await res.blob())
    const size = 160
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size)
    ctx.drawImage(bmp, 0, 0, size, size)
    bmp.close?.()
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch { return undefined }
}

/** Builds the PDF and hands it to the browser as a download named after the title: one click, no print dialog. */
export async function downloadReportPdf(text: string, links: readonly ReportLink[], title: string, cover?: PdfCover): Promise<void> {
  downloadBlob(await reportPdf(text, links, title, cover, await loadLogoDataUrl()), reportFileName(title, 'pdf'))
}

/**
 * The report as a PDF file (a Blob), built in the browser. pdfmake and its font file are loaded on first use only. With a cover, the report is laid out as the owner's designed page
 * (reportPdfDesign.ts) whenever it has "##" sections; anything else keeps the plain layout above.
 */
export async function reportPdf(text: string, links: readonly ReportLink[], title: string, cover?: PdfCover, logo?: string): Promise<Blob> {
  const [pm, fonts] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  const pdfMake = (pm as { default?: typeof pm.default }).default ?? (pm as unknown as typeof pm.default)
  const vfs = (fonts as { default?: Record<string, string> }).default ?? (fonts as unknown as Record<string, string>)
  pdfMake.addVirtualFileSystem(vfs)
  const designed = cover ? (await import('@/lib/answerDoc/reportPdfDesign')).reportPdfDesigned(text, links, { cover, ...(logo ? { logo } : {}) }) : null
  return pdfMake.createPdf(designed ?? reportPdfDefinition(text, links, title, cover)).getBlob()
}
