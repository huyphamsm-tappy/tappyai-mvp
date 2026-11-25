// 01/11 (owner UAT: a file could not be dragged into the chat, only added with the attach button). The rules the button always had, now one
// place the button, the drop and the paste all use.
import { describe, it, expect } from 'vitest'
import { checkAttachment, checkAddition, attachableList, shrunkSize, firstAttachable, pastedAttachment, dragHasFiles, PDF_MAX_BYTES, ATTACH_MAX_IMAGES, ATTACH_MAX_PDFS, DOCX_TYPE, XLSX_TYPE, normalizedType, docIcon, ATTACH_ACCEPT } from './composerAttachment'

const f = (type: string, size = 100, name = 'x') => ({ type, size, name }) as File

describe('checkAttachment', () => {
  it('accepts PNG, JPEG, WEBP, GIF and a PDF within the limit', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) expect(checkAttachment(f(t))).toEqual({ ok: true, isPdf: false })
    expect(checkAttachment(f('application/pdf', PDF_MAX_BYTES))).toEqual({ ok: true, isPdf: true })
  })
  it('refuses a PDF over the limit and any other type, with the message keys the button used', () => {
    expect(checkAttachment(f('application/pdf', PDF_MAX_BYTES + 1))).toEqual({ ok: false, error: 'attach.pdfTooLarge' })
    expect(checkAttachment(f('image/svg+xml'))).toEqual({ ok: false, error: 'attach.unsupported' })
    expect(checkAttachment(f(''))).toEqual({ ok: false, error: 'attach.unsupported' })
  })
})

describe('firstAttachable', () => {
  it('takes the first file Tappy can read, even when others come before it', () => {
    const doc = f('application/msword', 5, 'a.doc'); const png = f('image/png', 5, 'b.png'); const pdf = f('application/pdf', 5, 'c.pdf')
    expect(firstAttachable([doc, png, pdf])).toBe(png)
  })
  it('with nothing readable returns the first file, so the person is told why', () => {
    const doc = f('application/msword', 5, 'a.doc')
    expect(firstAttachable([doc, f('text/plain')])).toBe(doc)
  })
  it('returns null for no files', () => {
    expect(firstAttachable([])).toBeNull()
    expect(firstAttachable(null)).toBeNull()
  })
})

describe('firstAttachable prefers a file that can actually be sent (reviewer 01/11)', () => {
  it('a PDF over the limit does not hide a good image dropped with it', () => {
    const big = f('application/pdf', PDF_MAX_BYTES + 1, 'big.pdf'); const png = f('image/png', 5, 'ok.png')
    expect(firstAttachable([big, png])).toBe(png)
  })
  it('when nothing can be sent, the first readable-type file is returned so the person is told why', () => {
    const big = f('application/pdf', PDF_MAX_BYTES + 1, 'big.pdf')
    expect(firstAttachable([f('text/plain'), big])).toBe(big)
  })
})

describe('pastedAttachment: a paste is a picture only when it has no text (reviewer 01/11)', () => {
  const png = f('image/png', 5, 'shot.png')
  it('a screenshot (files, no text) becomes the attachment', () => {
    expect(pastedAttachment({ files: [png], types: ['Files'] })).toBe(png)
  })
  it('cells copied from a spreadsheet carry a rendered image AND text: the text is pasted as usual', () => {
    expect(pastedAttachment({ files: [png], types: ['text/plain', 'text/html', 'Files'] })).toBeNull()
  })
  it('a copied file Tappy cannot read is not swallowed: the paste goes on', () => {
    expect(pastedAttachment({ files: [f('application/msword')], types: ['Files'] })).toBeNull()
  })
  it('nothing on the clipboard', () => {
    expect(pastedAttachment(null)).toBeNull()
    expect(pastedAttachment({ files: [], types: ['text/plain'] })).toBeNull()
  })
})

describe('several files per message (owner 15/11)', () => {
  const img = (size = 100_000) => f('image/png', size)
  const pdf = (size = 100_000) => f('application/pdf', size)
  it('up to 5 images and 3 PDFs, then the count message', () => {
    expect(checkAddition(Array.from({ length: 4 }, () => img()), img())).toEqual({ ok: true })
    expect(checkAddition(Array.from({ length: 5 }, () => img()), img())).toEqual({ ok: false, error: 'attach.tooManyImages' })
    expect(checkAddition([pdf(), pdf()], pdf())).toEqual({ ok: true })
    expect(checkAddition([pdf(), pdf(), pdf()], pdf())).toEqual({ ok: false, error: 'attach.tooManyPdfs' })
    expect(ATTACH_MAX_IMAGES).toBe(5); expect(ATTACH_MAX_PDFS).toBe(3)
  })
  it('the COMBINED size is bounded (the request body ceiling), not only each file', () => {
    expect(checkAddition([pdf(1_500_000), pdf(1_000_000)], pdf(500_000))).toEqual({ ok: true })
    expect(checkAddition([pdf(1_500_000), pdf(1_000_000)], pdf(500_001))).toEqual({ ok: false, error: 'attach.tooBig' })
  })
  it('a single file is still judged by checkAttachment first', () => {
    expect(checkAddition([], f('application/pdf', PDF_MAX_BYTES + 1))).toEqual({ ok: false, error: 'attach.pdfTooLarge' })
    expect(checkAddition([], f('text/plain'))).toEqual({ ok: false, error: 'attach.unsupported' })
  })
  it('shrunkSize keeps the ratio, never enlarges', () => {
    expect(shrunkSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(shrunkSize(1000, 800)).toEqual({ width: 1000, height: 800 })
    expect(shrunkSize(1000, 5000)).toEqual({ width: 320, height: 1600 })
  })
  it('attachableList puts good files first and looks at no more than 12', () => {
    const doc = f('text/plain', 5, 'a.txt'); const png = f('image/png', 5, 'b.png')
    expect(attachableList([doc, png])).toEqual([png, doc])
    expect(attachableList(Array.from({ length: 20 }, () => png))).toHaveLength(12)
    expect(attachableList(null)).toEqual([])
  })
})

describe('Word and Excel (owner 15/11)', () => {
  const docx = (name = 'a.docx', type = DOCX_TYPE) => f(type, 100_000, name)
  it('.docx and .xlsx are accepted as documents, by type or by extension when the system gives none', () => {
    expect(checkAttachment(f(DOCX_TYPE))).toEqual({ ok: true, isPdf: true })
    expect(checkAttachment(f(XLSX_TYPE))).toEqual({ ok: true, isPdf: true })
    expect(checkAttachment(f('', 100, 'b.xlsx'))).toEqual({ ok: true, isPdf: true })
    expect(checkAttachment(f('application/octet-stream', 100, 'b.docx'))).toEqual({ ok: true, isPdf: true })
    expect(normalizedType({ type: '', name: 'b.xlsx' })).toBe(XLSX_TYPE)
  })
  it('old .doc / .xls, macro files and anything else stay refused', () => {
    expect(checkAttachment(f('application/msword', 100, 'a.doc'))).toEqual({ ok: false, error: 'attach.unsupported' })
    expect(checkAttachment(f('application/vnd.ms-excel', 100, 'a.xls'))).toEqual({ ok: false, error: 'attach.unsupported' })
    expect(checkAttachment(f('', 100, 'a.xlsm'))).toEqual({ ok: false, error: 'attach.unsupported' })
  })
  it('a document over 3 MB is refused like a PDF; documents share the 3-per-message count', () => {
    expect(checkAttachment(f(XLSX_TYPE, PDF_MAX_BYTES + 1))).toEqual({ ok: false, error: 'attach.pdfTooLarge' })
    expect(checkAddition([docx(), f(XLSX_TYPE, 100), f('application/pdf', 100)], docx())).toEqual({ ok: false, error: 'attach.tooManyPdfs' })
    expect(checkAddition([docx(), f(XLSX_TYPE, 100)], f('image/png', 100))).toEqual({ ok: true })
  })
  it('the picker offers them; the chip has an icon per kind', () => {
    expect(ATTACH_ACCEPT).toContain('.docx'); expect(ATTACH_ACCEPT).toContain('.xlsx')
    expect([docIcon(XLSX_TYPE), docIcon(DOCX_TYPE), docIcon('application/pdf')]).toEqual(['📊', '📝', '📄'])
  })
})

describe('dragHasFiles', () => {
  it('is true only while files (not selected text or a link) are being dragged', () => {
    expect(dragHasFiles({ types: ['Files'] })).toBe(true)
    expect(dragHasFiles({ types: ['text/plain', 'Files'] })).toBe(true)
    expect(dragHasFiles({ types: ['text/plain'] })).toBe(false)
    expect(dragHasFiles(null)).toBe(false)
  })
})
