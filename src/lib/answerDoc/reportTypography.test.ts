// 01/11 (owner UAT: the Deep Research PDF had ugly letters and the Word file tiny text with the lines on top of each other).
// PDF: the page is printed by the browser, so the font stack must cover Vietnamese (Georgia does not: the browser mixes glyphs from another font
// letter by letter). Word: the document had no styles at all, so Word used its tiny default with no spacing.
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { reportHtml } from './reportExport'
import { reportDocx } from './reportDocx'

const REPORT = '# Xe điện 2026\nMở đầu.\n## Doanh số\nBYD dẫn đầu [1].\n\n| Hãng | Xe |\n|---|---|\n| BYD | 2,26 tr |\n\n### Nguồn\n1. BYD sales — byd.com\n'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = () => reportHtml(REPORT, { title: 'T', images: [], links: [], format: esc, lang: 'vi' })
const css = () => /<style>([\s\S]*?)<\/style>/.exec(html())![1]

describe('the printable page (PDF)', () => {
  it('uses a font stack that covers Vietnamese, never Georgia / Times for the body', () => {
    const body = /body\{([^}]*)\}/.exec(css())![1]
    expect(body).toMatch(/Segoe UI|Noto Sans|Arial/)
    expect(body).not.toMatch(/Georgia|Times/)
  })
  it('reads comfortably: body text at least 16px with a line height of at least 1.65', () => {
    const body = /body\{([^}]*)\}/.exec(css())![1]
    expect(Number(/font-size:(\d+)px/.exec(body)![1])).toBeGreaterThanOrEqual(16)
    expect(Number(/line-height:([\d.]+)/.exec(body)![1])).toBeGreaterThanOrEqual(1.65)
  })
  it('keeps room between paragraphs, list items and table cells', () => {
    expect(css()).toMatch(/p\{[^}]*margin:[^}]*\}/)
    expect(css()).toMatch(/li\{[^}]*margin[^}]*\}/)
    expect(css()).toMatch(/th,td\{[^}]*padding:\s*8px/)
  })
})

describe('the Word file (.docx)', () => {
  const read = async (name: string) => {
    const blob = await reportDocx(REPORT, [], 'Xe điện 2026')
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    return zip.file(name)!.async('string')
  }
  it('defines a document font that covers Vietnamese, at 11 pt or more', async () => {
    const styles = await read('word/styles.xml')
    const defaults = /<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/.exec(styles)![1]
    expect(defaults).toMatch(/w:ascii="(Calibri|Segoe UI|Arial)"/)
    expect(Number(/<w:sz w:val="(\d+)"/.exec(defaults)![1])).toBeGreaterThanOrEqual(22)
  })
  it('spaces the lines (about 1.4) and the paragraphs', async () => {
    const styles = await read('word/styles.xml')
    const para = /<w:pPrDefault>([\s\S]*?)<\/w:pPrDefault>/.exec(styles)![1]
    expect(Number(/w:line="(\d+)"/.exec(para)![1])).toBeGreaterThanOrEqual(320)
    expect(Number(/w:after="(\d+)"/.exec(para)![1])).toBeGreaterThanOrEqual(120)
  })
  it('sizes the headings above the body text', async () => {
    const styles = await read('word/styles.xml')
    const h1 = /<w:style[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/.exec(styles)![0]
    expect(Number(/<w:sz w:val="(\d+)"/.exec(h1)![1])).toBeGreaterThanOrEqual(32)
  })
  it('pads the table cells', async () => {
    const doc = await read('word/document.xml')
    expect(doc).toMatch(/<w:tblCellMar>/)
  })
})
