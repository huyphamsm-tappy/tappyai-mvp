// RETRIEVAL_V5 · the text layer of a PDF (owner task 20/10/2026, sửa đổi 5). Cổng 2 lần 1: the key source of u28 (the embassy's passport
// procedure) was a PDF and the page reader refused every PDF — 8 facts lost at "đọc" (class b).
//
// pdfjs-dist (Mozilla, Apache-2.0, pure JS; installed alone in the shared node_modules, its optional native canvas left out), loaded at RUN time
// on the server only (webpackIgnore). Bounded: at most PDF_LIMITS.pages pages, PDF_LIMITS.chars characters, PDF_LIMITS.ms milliseconds; no
// script evaluation (isEvalSupported false), no font loading. A PDF without a text layer (a scan) gives null — out of scope (no OCR).
// The bytes come from safePageFetch (same address policy, timeouts, size cap); the text is DATA like any page text.

export const PDF_LIMITS = { bytes: 3_000_000, pages: 30, chars: 60_000, ms: 6_000 } as const

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The PDF's text as a plain HTML page, so it goes through the SAME extractor as any page (instruction-like sentences dropped, blocks picked
 * by fact density, the same caps): paragraphs = blank-line groups, a run of "-", "•" or numbered lines = a list; the first line = the title.
 */
export function pdfTextAsHtml(text: string): string {
  // line by line (measured 20/10, u28's embassy PDF: one paragraph per blank-line group made a 1,000-character block that the 700-character
  // paragraph cap cut in half): a line opening with "-", "•", "1." … starts a list item (its wrapped continuation lines join it); other lines
  // join the current paragraph; a blank line ends both
  const lines = text.split('\n').map(l => l.trim())
  const title = esc(lines.find(Boolean)?.slice(0, 200) ?? '')
  const out: string[] = []
  let para: string[] = [], items: string[] = []
  const flushPara = () => { if (para.length) out.push(`<p>${esc(para.join(' '))}</p>`); para = [] }
  const flushList = () => { if (items.length) out.push(`<ul>${items.map(it => `<li>${esc(it)}</li>`).join('')}</ul>`); items = [] }
  for (const l of lines) {
    if (!l) { flushPara(); flushList(); continue }
    if (/^([-•–*+]|\d{1,2}[.)])\s/.test(l)) { flushPara(); items.push(l); continue }
    if (items.length) { items[items.length - 1] += ' ' + l; continue }
    para.push(l)
  }
  flushPara(); flushList()
  return `<html><head><title>${title}</title></head><body><main>${out.join('\n')}</main></body></html>`
}

/**
 * Lần 2c (B0, owner 20/10): a text layer whose letters have no Unicode mapping. Measured on u28's embassy PDF: its Vietnamese letters live in
 * embedded TrueType subsets with no ToUnicode / Differences / glyph names, and pdfjs hands them out as control characters (U+0001–U+001F) —
 * "ĐẠI SỨ QUÁN" came out as "\u0001\u0002I S\u0003 QUÁN"; the page cleaner turned them into spaces and the model got broken words. Such a
 * text is not handed to the model (no OCR here): true when control characters (tabs / line ends aside) are ≥ 1 % of the non-space
 * characters and at least 10. Pure.
 */
export function pdfTextUnmapped(text: string): boolean {
  const ctl = (text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) ?? []).length
  const visible = text.replace(/\s/g, '').length
  return ctl >= 10 && ctl >= visible * 0.01
}

type PdfJs ={ getDocument: (o: Record<string, unknown>) => { promise: Promise<PdfDoc>; destroy?: () => Promise<void> } }
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>; destroy?: () => Promise<void> }

let loaded: Promise<PdfJs> | null = null
const load = (): Promise<PdfJs> => (loaded ??= import(/* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs' as string) as Promise<PdfJs>)

/** The text of a PDF's text layer, lines kept; null when it has none (a scan), cannot be parsed, or takes too long. Never throws. */
export async function pdfToText(bytes: Uint8Array, o: { pages?: number; chars?: number; ms?: number; pdfjs?: () => Promise<PdfJs> } = {}): Promise<string | null> {
  const maxPages = o.pages ?? PDF_LIMITS.pages, maxChars = o.chars ?? PDF_LIMITS.chars
  let doc: PdfDoc | null = null
  const work = (async () => {
    const pdfjs = await (o.pdfjs ?? load)()
    // a copy: pdfjs detaches the buffer it is given
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise
    let text = ''
    for (let p = 1; p <= Math.min(doc.numPages, maxPages) && text.length < maxChars; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      text += tc.items.map(it => (it.str ?? '') + (it.hasEOL ? '\n' : '')).join('') + '\n\n'
    }
    const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars)
    // a scan has (almost) no text layer
    return clean.replace(/\s/g, '').length >= 40 ? clean : null
  })().catch(() => null) // a parse error after the time limit settles here, never as an unhandled rejection
  try {
    return await Promise.race([work, new Promise<null>(r => setTimeout(() => r(null), o.ms ?? PDF_LIMITS.ms))])
  } catch {
    return null
  } finally {
    try { await (doc as PdfDoc | null)?.destroy?.() } catch { /* cleanup only */ }
  }
}
