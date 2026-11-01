// 01/11 (owner UAT: a file could not be dragged into the chat, only added with the attach button). The rules the button always had, now one
// place the button, the drop and the paste all use.
import { describe, it, expect } from 'vitest'
import { checkAttachment, firstAttachable, dragHasFiles, PDF_MAX_BYTES } from './composerAttachment'

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

describe('dragHasFiles', () => {
  it('is true only while files (not selected text or a link) are being dragged', () => {
    expect(dragHasFiles({ types: ['Files'] })).toBe(true)
    expect(dragHasFiles({ types: ['text/plain', 'Files'] })).toBe(true)
    expect(dragHasFiles({ types: ['text/plain'] })).toBe(false)
    expect(dragHasFiles(null)).toBe(false)
  })
})
