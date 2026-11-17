// 01/11: what the chat composer accepts as an attachment - an image or a PDF (the server reads the PDF's text: pdfAttachments.ts). One set of
// rules for the attach button, a file dropped on the chat and a picture pasted into the box. The limits are the server's, said before sending.
// 15/11 (owner: "chen nhieu anh/file hon"): SEVERAL files per message. The real ceiling is the request body (4.5 MB, readCappedBody; base64 adds a third),
// so the COMBINED size is what is limited, and photos are shrunk in the browser first (a phone photo is 3-8 MB, a 1600 px JPEG ~300 KB and just as readable
// for the model). Counts match the server's per-message caps (clientInput.ts maxImagePartsPerMessage / maxPdfPartsPerMessage).
export const PDF_MAX_BYTES = 3_000_000
export const ATTACH_MAX_IMAGES = 5
export const ATTACH_MAX_PDFS = 3
/** All files of one message together, after photos are shrunk: 3 MB raw = 4 MB base64, under the 4.5 MB body ceiling with room for the text. */
export const ATTACH_TOTAL_BYTES = 3_000_000
export const IMAGE_MAX_SIDE = 1600
const IMAGE_KEEP_BYTES = 400_000
const IMAGE_TYPE = /^image\/(png|jpeg|webp|gif)$/
// 15/11: Word and Excel (.docx / .xlsx) are read on the server like a PDF (officeText.ts). Older .doc / .xls and macro files are not accepted.
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** The file input's accept list: pictures and the three document kinds. */
export const ATTACH_ACCEPT = `image/png,image/jpeg,image/webp,image/gif,application/pdf,${DOCX_TYPE},${XLSX_TYPE},.docx,.xlsx`
const isDocType = (t: string) => t === 'application/pdf' || t === DOCX_TYPE || t === XLSX_TYPE
/** Some systems give an Office file no type: its extension then says which. */
export function normalizedType(file: Pick<File, 'type' | 'name'>): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = /\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1]?.toLowerCase()
  return ext === 'docx' ? DOCX_TYPE : ext === 'xlsx' ? XLSX_TYPE : file.type
}
/** The icon of a document chip. */
export function docIcon(type: string): string { return type === XLSX_TYPE ? '📊' : type === DOCX_TYPE ? '📝' : '📄' }

export type AttachError = 'attach.unsupported' | 'attach.pdfTooLarge' | 'attach.tooManyImages' | 'attach.tooManyPdfs' | 'attach.tooBig'
/** `isPdf` is true for any DOCUMENT (PDF, Word, Excel): a file whose text the server reads, as opposed to a picture. */
export type AttachCheck = { ok: true; isPdf: boolean } | { ok: false; error: 'attach.unsupported' | 'attach.pdfTooLarge' }

/** Whether the file may be sent; on a refusal, the i18n key of the message to show. Pure. */
export function checkAttachment(file: Pick<File, 'type' | 'size'> & { name?: string }): AttachCheck {
  const type = normalizedType({ type: file.type, name: file.name ?? '' })
  const isPdf = isDocType(type)
  if (!isPdf && !IMAGE_TYPE.test(type)) return { ok: false, error: 'attach.unsupported' }
  if (isPdf && file.size > PDF_MAX_BYTES) return { ok: false, error: 'attach.pdfTooLarge' }
  return { ok: true, isPdf }
}

/** Can `next` join the files already chosen? Counts per kind and the combined size. Pure. */
export function checkAddition(current: ReadonlyArray<Pick<File, 'type' | 'size'> & { name?: string }>, next: Pick<File, 'type' | 'size'> & { name?: string }): { ok: true } | { ok: false; error: AttachError } {
  const one = checkAttachment(next)
  if (!one.ok) return one
  const pdfs = current.filter(f => isDocType(normalizedType({ type: f.type, name: f.name ?? '' }))).length
  const images = current.length - pdfs
  if (one.isPdf && pdfs >= ATTACH_MAX_PDFS) return { ok: false, error: 'attach.tooManyPdfs' }
  if (!one.isPdf && images >= ATTACH_MAX_IMAGES) return { ok: false, error: 'attach.tooManyImages' }
  if (current.reduce((n, f) => n + f.size, 0) + next.size > ATTACH_TOTAL_BYTES) return { ok: false, error: 'attach.tooBig' }
  return { ok: true }
}

/** The side a picture is shrunk to (never enlarged). Pure. */
export function shrunkSize(width: number, height: number, maxSide = IMAGE_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (!(longest > maxSide)) return { width, height }
  const k = maxSide / longest
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/**
 * A photo shrunk to at most IMAGE_MAX_SIDE on its long side, as JPEG. Small pictures, and anything the browser cannot draw, are returned as they are; the
 * result is never larger than the original. Browser only (canvas); never throws.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!IMAGE_TYPE.test(file.type) || file.size <= IMAGE_KEEP_BYTES) return file
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
    const bmp = await createImageBitmap(file)
    const { width, height } = shrunkSize(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) { bmp.close?.(); return file }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height) // a transparent PNG becomes white, not black, as JPEG
    ctx.drawImage(bmp, 0, 0, width, height)
    bmp.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return file }
}

const readableType = (f: Pick<File, 'type'> & { name?: string }) => { const t = normalizedType({ type: f.type, name: f.name ?? '' }); return isDocType(t) || IMAGE_TYPE.test(t) }

/**
 * The first file that can be sent (a good image beside a PDF over the limit wins); with none sendable, the first of a readable type (so the
 * person is told why it was refused), then the first file; null for no files. Pure.
 */
export function firstAttachable(files: ArrayLike<File> | null | undefined): File | null {
  const list = files ? Array.from(files) : []
  return list.find(f => checkAttachment(f).ok) ?? list.find(readableType) ?? list[0] ?? null
}

/** Every file of a drop or a pick, readable ones first (so a refused file does not hide the good ones), at most 12 looked at. Pure. */
export function attachableList(files: ArrayLike<File> | null | undefined): File[] {
  const list = files ? Array.from(files).slice(0, 12) : []
  return [...list.filter(f => checkAttachment(f).ok), ...list.filter(f => !checkAttachment(f).ok)]
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
