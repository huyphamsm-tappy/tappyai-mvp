// ── 31/10 (owner: "làm luôn mục PDF"): a PDF the person attaches, read on the server ──────────────────────────────────────────────────────
//
// The web client sends an attachment as a data URL (useChat `experimental_attachments`); the trust boundary (clientInput.ts) admits a PDF
// as a `file` part, bounded in count and size. Here, before any model is called, each such part becomes TEXT: the PDF's text layer
// (pdfText.ts, the page reader's own extractor - bounded in pages, characters and time, no script, no fonts), fenced as untrusted data
// (fence.ts `user_document`: anyone may have written the document, so it can never pass for an instruction). The model never receives the
// bytes. A PDF with no text layer (a scan) or with unmapped letters becomes one short note saying so - nothing is guessed. Pure apart from
// the parser, which is injectable for tests.

import { fenceUntrusted } from '@/lib/ai/security/fence'
import { pdfToText, pdfTextUnmapped, PDF_LIMITS } from '@/lib/ai/retrievalV5/pdfText'
import type { ValidatedMessage, ValidatedPart, FilePart } from '@/lib/ai/security/clientInput'

/** Characters of one document handed to the model: the latest message's documents in full (the page reader's cap), earlier ones shorter. */
export const PDF_TEXT_CHARS = { latest: PDF_LIMITS.chars, earlier: 8_000 } as const

export type PdfOutcome = 'read' | 'no_text' | 'unmapped' | 'unreadable'

/** The bytes of a `data:application/pdf;base64,…` URL, or null. */
export function pdfDataUrlBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
  if (!m) return null
  try { return new Uint8Array(Buffer.from(m[1], 'base64')) } catch { return null }
}

/** The text part a PDF becomes. Vietnamese labels: the model reads them in a Vietnamese app; the document text itself is fenced. */
export function pdfPartText(name: string, outcome: PdfOutcome, text: string | null, cut: boolean): string {
  const label = `Tệp PDF người dùng gửi: "${name.replace(/["\n\r]/g, ' ').slice(0, 120)}"`
  if (outcome === 'read' && text) return `${label}${cut ? ' (chỉ phần đầu tệp)' : ''}\n${fenceUntrusted('user_document', text)}`
  if (outcome === 'no_text') return `${label} - hệ thống không lấy được chữ trong tệp (có thể là bản scan/ảnh chụp, tệp có mật khẩu hoặc bị hỏng).`
  if (outcome === 'unmapped') return `${label} - chữ trong tệp bị mã hoá phông nên hệ thống không đọc đúng được nội dung.`
  return `${label} - hệ thống không mở được tệp này (hỏng, có mật khẩu hoặc quá lớn).`
}

type Reader = (bytes: Uint8Array, o: { chars: number }) => Promise<string | null>
const defaultReader: Reader = (bytes, o) => pdfToText(bytes, { chars: o.chars + 1 })

/**
 * The messages with every PDF part replaced by its text part. The LAST user message's documents get PDF_TEXT_CHARS.latest characters,
 * earlier ones PDF_TEXT_CHARS.earlier (a follow-up about the same document still has its opening; the cost of a long thread stays bounded).
 * Also returns, per document, what happened (for the turn's log: names never logged, only outcomes and sizes).
 */
export async function pdfPartsToText(messages: readonly ValidatedMessage[], read: Reader = defaultReader): Promise<{ messages: ValidatedMessage[]; docs: Array<{ outcome: PdfOutcome; chars: number; latest: boolean }> }> {
  const lastUser = messages.map(m => m.role).lastIndexOf('user')
  const docs: Array<{ outcome: PdfOutcome; chars: number; latest: boolean }> = []
  const out: ValidatedMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'user' || typeof m.content === 'string' || !m.content.some(p => p.type === 'file')) { out.push(m); continue }
    const latest = i === lastUser
    const cap = latest ? PDF_TEXT_CHARS.latest : PDF_TEXT_CHARS.earlier
    const parts: ValidatedPart[] = []
    for (const p of m.content) {
      if (p.type !== 'file') { parts.push(p); continue }
      const f = p as FilePart
      const bytes = pdfDataUrlBytes(f.data)
      const text = bytes ? await read(bytes, { chars: cap }).catch(() => null) : null
      const outcome: PdfOutcome = !bytes ? 'unreadable' : text === null ? 'no_text' : pdfTextUnmapped(text) ? 'unmapped' : 'read'
      const cut = !!text && text.length > cap
      const body = outcome === 'read' && text ? text.slice(0, cap) : null
      docs.push({ outcome, chars: body?.length ?? 0, latest })
      parts.push({ type: 'text', text: pdfPartText(f.name, outcome, body, cut) })
    }
    out.push({ role: 'user', content: parts })
  }
  return { messages: out, docs }
}
