// 15/11 (owner: "chen file word va excel cung khong duoc"): the text of a Word (.docx) or Excel (.xlsx) file the person attaches, read on the server.
// Both are ZIP packages of XML. Nothing is executed: no macros (.docm/.xlsm are not accepted), no formulas are evaluated (the value Excel last saved is shown),
// no external link is followed, no picture is read. Bounded: the ZIP's own directory is checked BEFORE anything is inflated (a small file can expand to
// gigabytes), then only the few XML parts that carry text are inflated; rows, cells and characters are capped. The result goes to the model fenced as
// untrusted data exactly like a PDF's text (pdfAttachments.ts). Pure; never throws (null = could not read).
import { unzipSync, strFromU8 } from 'fflate'

export const OFFICE_LIMITS = {
  /** all entries together, as the ZIP directory declares them */
  maxInflatedBytes: 40_000_000,
  maxEntries: 2_000,
  /** one XML part we read */
  maxPartBytes: 25_000_000,
  maxSheets: 12,
  maxRowsPerSheet: 3_000,
  maxColumns: 60,
} as const

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)

/** Entry names and declared sizes from the ZIP central directory; null for anything odd (ZIP64, truncated, too many or too large entries). */
export function zipDirectory(b: Uint8Array): Array<{ name: string; size: number }> | null {
  if (b.length < 22) return null
  let e = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) { if (u32(b, i) === 0x06054b50) { e = i; break } }
  if (e < 0) return null
  const count = u16(b, e + 10)
  let o = u32(b, e + 16)
  if (count === 0xffff || o === 0xffffffff || count > OFFICE_LIMITS.maxEntries) return null
  const out: Array<{ name: string; size: number }> = []
  let total = 0
  for (let i = 0; i < count; i++) {
    if (o + 46 > b.length || u32(b, o) !== 0x02014b50) return null
    const size = u32(b, o + 24)
    const nameLen = u16(b, o + 28), extraLen = u16(b, o + 30), commentLen = u16(b, o + 32)
    if (size === 0xffffffff || o + 46 + nameLen > b.length) return null
    total += size
    if (total > OFFICE_LIMITS.maxInflatedBytes) return null
    out.push({ name: strFromU8(b.subarray(o + 46, o + 46 + nameLen)), size })
    o += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** The named parts, inflated, after the directory check. null when the package is not a safe ZIP; a part that is absent is simply missing from the map. */
function readParts(bytes: Uint8Array, want: (name: string) => boolean): Map<string, string> | null {
  const dir = zipDirectory(bytes)
  if (!dir) return null
  if (dir.some(d => want(d.name) && d.size > OFFICE_LIMITS.maxPartBytes)) return null
  try {
    // fflate inflates every entry; the directory check above already bounded the whole package
    const files = unzipSync(bytes)
    const out = new Map<string, string>()
    for (const [name, data] of Object.entries(files)) if (want(name)) out.set(name, strFromU8(data))
    return out
  } catch { return null }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, g: string) => {
    if (g[0] !== '#') return ENTITIES[g.toLowerCase()] ?? ''
    const n = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
    return Number.isFinite(n) && n > 8 && n < 0x110000 ? String.fromCodePoint(n) : ''
  })
}

/** The text of a .docx: its paragraphs, table cells separated by a tab and rows by a line. null when the file is not a readable package. Pure. */
export function docxToText(bytes: Uint8Array): string | null {
  const parts = readParts(bytes, n => n === 'word/document.xml')
  const xml = parts?.get('word/document.xml')
  if (xml === undefined) return null
  const text = decode(xml
    .replace(/<w:tab\s*\/>/g, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>') // a cell's last paragraph does not end the line: the cell does
    .replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, ''))
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const colIndex = (ref: string): number => {
  const m = /^([A-Z]+)/.exec(ref)
  if (!m) return -1
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1]
const textOf = (xml: string) => decode([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''))

/**
 * The text of an .xlsx: for each visible sheet its name and its rows (cells separated by a tab, empty rows left out). A formula shows the value Excel last saved;
 * dates are the numbers Excel stores. Rows, columns and sheets are capped (`cut` says so). null when the file is not a readable package. Pure.
 */
export function xlsxToText(bytes: Uint8Array): { text: string; cut: boolean } | null {
  const parts = readParts(bytes, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n))
  const book = parts?.get('xl/workbook.xml')
  if (!parts || book === undefined) return null
  const shared = [...(parts.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]))
  const rels = new Map<string, string>()
  for (const m of (parts.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id'), target = attr(m[1], 'Target')
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'))
  }
  let cut = false
  const blocks: string[] = []
  const sheets = [...book.matchAll(/<sheet\b([^>]*)\/?>/g)].map(m => ({ name: decode(attr(m[1], 'name') ?? ''), id: attr(m[1], 'r:id'), hidden: /hidden/i.test(attr(m[1], 'state') ?? '') }))
  let shown = 0
  for (const sh of sheets) {
    if (sh.hidden || !sh.id) continue
    if (shown >= OFFICE_LIMITS.maxSheets) { cut = true; break }
    const xml = parts.get(rels.get(sh.id) ?? '')
    if (xml === undefined) continue
    shown++
    const rows: string[] = []
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= OFFICE_LIMITS.maxRowsPerSheet) { cut = true; break }
      const cells: string[] = []
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = colIndex(attr(c[1], 'r') ?? '')
        if (col < 0 || col >= OFFICE_LIMITS.maxColumns) { if (col >= OFFICE_LIMITS.maxColumns) cut = true; continue }
        const t = attr(c[1], 't'), inner = c[2] ?? ''
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        let val = ''
        if (t === 'inlineStr') val = textOf(inner)
        else if (v !== undefined) val = t === 's' ? (shared[Number(v)] ?? '') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : decode(v)
        if (val) { while (cells.length < col) cells.push(''); cells[col] = val.replace(/[\t\r\n]+/g, ' ') }
      }
      if (cells.some(Boolean)) rows.push(cells.join('\t'))
    }
    blocks.push(`## Sheet: ${sh.name}\n${rows.join('\n') || '(trống)'}`)
  }
  return { text: blocks.join('\n\n').trim(), cut }
}
