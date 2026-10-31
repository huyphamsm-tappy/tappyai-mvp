// 31/10 (owner: a deep research report is a FILE people keep - "document, pdf và markdown"): the finished report as Markdown, as a printable
// page (the browser's "Save as PDF", with the section pictures) and as Word (reportDocx.ts). Built on the CLIENT from what the person already
// has on screen: the report text, the research card's source links (https only, readResearchStatus) and the section pictures (doc_media,
// re-checked). Nothing is sent anywhere; the pictures stay remote links, never fetched or stored by the app. Pure builders + two browser helpers.
import { parseDoc, headingTitle, titleKey, type DocBlock } from '@/lib/answerDoc/parse'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

export interface ReportLink { id: number; title: string; url: string }
export interface ReportImage { title: string; src: string }

/** A file name from the report title: letters, digits, spaces and dashes only, at most 60 characters. */
export function reportFileName(title: string, ext: 'md' | 'docx'): string {
  const base = title.normalize('NFC').replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim()
  return `${base || 'report'}.${ext}`
}

const mdLabel = (s: string) => s.replace(/[[\]\\\n]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The report as Markdown: the text as written, with the numbered lines of its LAST section (the sources list the server built, "n. title —
 * site") turned into links to the card's sources of the same number. A number without an https link stays as text.
 */
export function reportMarkdown(text: string, links: readonly ReportLink[]): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let last = -1
  lines.forEach((l, i) => { if (/^\s{0,3}#{1,6}\s/.test(l)) last = i })
  const byId = new Map(links.filter(l => isSafeHttpsUrl(l.url)).map(l => [l.id, l]))
  return lines.map((l, i) => {
    if (i <= last) return l
    const m = /^(\d{1,3})\.\s+(.*)$/.exec(l)
    const link = m ? byId.get(Number(m[1])) : undefined
    return link ? `${m![1]}. [${mdLabel(link.title) || mdLabel(m![2])}](${link.url})` : l
  }).join('\n').trim() + '\n'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The report as one printable HTML page: the same blocks and inline formatter as the chat's article layout (`format` is the chat's own
 * sanitising formatter), each section picture under its heading, the sources linked. No script; opened in a sandboxed frame to print.
 */
export function reportHtml(text: string, o: { title: string; images: readonly ReportImage[]; links: readonly ReportLink[]; format: (s: string) => string; lang: string }): string {
  const pics = new Map<string, ReportImage>()
  for (const img of o.images) { const k = titleKey(img.title); if (k && isSafeHttpsUrl(img.src) && !pics.has(k)) pics.set(k, img) }
  const blocks = parseDoc(reportMarkdown(text, o.links))
  const html = (bs: DocBlock[]): string => bs.map(b => {
    switch (b.t) {
      case 'heading': {
        const lv = Math.min(Math.max(b.level, 1), 4)
        const t = headingTitle(b.text)
        const img = t ? pics.get(titleKey(t)) : undefined
        if (img) pics.delete(titleKey(t!))
        return `<h${lv}>${o.format(b.text)}</h${lv}>${img ? `<figure><img src="${esc(img.src)}" alt="${esc(img.title)}" referrerpolicy="no-referrer"></figure>` : ''}`
      }
      case 'para': return `<p>${o.format(b.text)}</p>`
      case 'quote': return `<blockquote>${o.format(b.text)}</blockquote>`
      case 'hr': return '<hr>'
      case 'raw': return `<div>${o.format(b.text)}</div>`
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul'
        return `<${tag}${b.ordered && b.start !== 1 ? ` start="${b.start}"` : ''}>${b.items.map(it => `<li>${o.format(it.text)}${it.children ? html(parseDoc(it.children)) : ''}</li>`).join('')}</${tag}>`
      }
    }
  }).join('\n')
  return `<!doctype html><html lang="${esc(o.lang)}"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.6;font-size:15px}
h1,h2,h3,h4{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.3}h1{font-size:28px;margin-bottom:4px;border-bottom:2px solid #1a4fb5;padding-bottom:8px}h1+p{color:#555;margin-top:6px}h2{font-size:20px;margin-top:28px;color:#1a3d7c}h3{font-size:17px}
table+div em,table+p em{color:#555;font-size:13px}
@page{margin:18mm 16mm;@bottom-center{content:counter(page) " / " counter(pages);font-family:Arial,sans-serif;font-size:10px;color:#666}}
figure{margin:12px 0}figure img{max-width:100%;max-height:320px;object-fit:cover;border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
a{color:#1a4fb5}blockquote{border-left:3px solid #ccc;margin:12px 0;padding-left:12px;color:#444}
@media print{body{margin:0 auto}h2,h3{break-after:avoid}figure,table{break-inside:avoid}}
</style></head><body>${html(blocks)}</body></html>`
}

/** Saves a file the browser builds (no request). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Opens the browser's print dialog (where "Save as PDF" is) on the page, in a sandboxed frame without scripts. */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = html
  frame.onload = () => {
    const w = frame.contentWindow
    // pictures load before printing (at most 4 s), then the frame goes
    const imgs = Array.from(frame.contentDocument?.images ?? [])
    Promise.race([Promise.all(imgs.map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r })))), new Promise(r => setTimeout(r, 4000))])
      .then(() => { w?.focus(); w?.print(); setTimeout(() => frame.remove(), 60_000) })
  }
  document.body.appendChild(frame)
}
