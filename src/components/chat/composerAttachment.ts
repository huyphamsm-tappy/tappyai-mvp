// 01/11: what the chat composer accepts as an attachment - an image or a PDF (the server reads the PDF's text: pdfAttachments.ts). One set of
// rules for the attach button, a file dropped on the chat and a picture pasted into the box. The limits are the server's, said before sending.
export const PDF_MAX_BYTES = 3_000_000
const IMAGE_TYPE = /^image\/(png|jpeg|webp|gif)$/

export type AttachCheck = { ok: true; isPdf: boolean } | { ok: false; error: 'attach.unsupported' | 'attach.pdfTooLarge' }

/** Whether the file may be sent; on a refusal, the i18n key of the message to show. Pure. */
export function checkAttachment(file: Pick<File, 'type' | 'size'>): AttachCheck {
  const isPdf = file.type === 'application/pdf'
  if (!isPdf && !IMAGE_TYPE.test(file.type)) return { ok: false, error: 'attach.unsupported' }
  if (isPdf && file.size > PDF_MAX_BYTES) return { ok: false, error: 'attach.pdfTooLarge' }
  return { ok: true, isPdf }
}

const readableType = (f: Pick<File, 'type'>) => f.type === 'application/pdf' || IMAGE_TYPE.test(f.type)

/**
 * The first file that can be sent (a good image beside a PDF over the limit wins); with none sendable, the first of a readable type (so the
 * person is told why it was refused), then the first file; null for no files. Pure.
 */
export function firstAttachable(files: ArrayLike<File> | null | undefined): File | null {
  const list = files ? Array.from(files) : []
  return list.find(f => checkAttachment(f).ok) ?? list.find(readableType) ?? list[0] ?? null
}

/**
 * What a paste into the box attaches: a readable file, and only when the clipboard holds no text. Cells copied from a spreadsheet carry a
 * rendered picture beside their text, and a copied document is not something Tappy reads: both go on as an ordinary paste (null). Pure.
 */
export function pastedAttachment(dt: { files: ArrayLike<File>; types: ArrayLike<string> } | null | undefined): File | null {
  if (!dt) return null
  const types = Array.from(dt.types)
  if (types.includes('text/plain') || types.includes('text/html')) return null
  return Array.from(dt.files).find(f => readableType(f) && checkAttachment(f).ok) ?? Array.from(dt.files).find(readableType) ?? null
}

/** True while files (not selected text or a link) are being dragged. Pure. */
export function dragHasFiles(dt: { types: ArrayLike<string> } | null | undefined): boolean {
  return !!dt && Array.from(dt.types).includes('Files')
}
