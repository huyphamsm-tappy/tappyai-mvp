// 15/11 (owner's designed page, "áp dụng cho tất cả các báo cáo"): the downloaded PDF laid out as the owner drew it - a dark hero with the Tappy logo, the title, two pills and the tri-colour rule; three
// key-figure cards; a dark highlight card beside a bar card; numbered coloured section chips; tables as light cards; a violet scope note and an amber data note; sources; a footer on every page.
// Everything is DERIVED from the report's own text by reportDesign.ts (fixed rules, no model, nothing keyed to a topic): a report with no figures simply has no key-figure band, one with no
// share table has no bar card. Fixed-size parts (hero decorations, pills, cards, chips) are drawn with canvas shapes and text laid over them; parts that grow with the text (paragraphs, lists, tables,
// notes) flow. Pure data out: no pdfmake import here, so it is testable on its own.
import { designModel, clip, plainText, type DesignModel } from '@/lib/answerDoc/reportDesign'
import { blocksToNodes, pdfRuns, type PdfCover, type PdfNode } from '@/lib/answerDoc/reportPdf'
import { tableRows } from '@/lib/answerDoc/reportDocx'
import type { ReportLink } from '@/lib/answerDoc/reportExport'

const NAVY = '#0A1A33'
const NAVY2 = '#10264A'
const BLUE = '#2F6BFF'
const AMBER = '#F5A800'
const CORAL = '#F0786A'
const VIOLET = '#8B6BF0'
const TEAL = '#17B3A0'
const INK = '#14213D'
const MUTED = '#5B6785'
const SOFT = '#8FA8D8'
const LINE = '#DCE4F4'
const BG = '#F6F8FD'
const PALETTE = [BLUE, AMBER, CORAL, VIOLET, TEAL]

const PAGE = { w: 595.28, h: 841.89 }
const MX = 36
const CW = PAGE.w - 2 * MX
const NOGRID = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }

/** What the designed page needs besides the text: the cover facts, the logo as a data URL (when the browser could load it), and the clock. */
export interface DesignOptions { cover: PdfCover; logo?: string; now?: Date }

const rrect = (x: number, y: number, w: number, h: number, r: number, color?: string, line?: string): PdfNode => ({ type: 'rect', x, y, w, h, r, ...(color ? { color } : {}), ...(line ? { lineColor: line, lineWidth: 0.9 } : {}) })

/** A box of FIXED size w x h: a rounded shape drawn first, the content laid over it. The row height is fixed, so the box takes exactly h of the page. */
function card(w: number, h: number, shapes: PdfNode[], children: PdfNode[], pad: [number, number, number, number] = [12, 10, 12, 4]): PdfNode {
  return {
    width: w,
    stack: [
      { canvas: shapes },
      { table: { widths: [w], heights: [h], body: [[{ stack: children, margin: pad }]] }, layout: NOGRID, margin: [0, -h, 0, 0] },
    ],
  }
}

const pill = (text: string, fill: string | null, line: string | null, color: string): PdfNode => {
  const w = Math.round(text.length * 5.4 + 24)
  return card(w, 20, [rrect(0, 0, w, 20, 10, fill ?? undefined, line ?? undefined)], [{ text, alignment: 'center', bold: true, fontSize: 7.5, color }], [0, 5.5, 0, 0])
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function logoNode(logo: string | undefined): PdfNode {
  // the logo is a square picture on a white ground: it sits on a white rounded tile, so its corners read as rounded on the dark band
  if (logo) return card(44, 44, [rrect(0, 0, 44, 44, 11, '#FFFFFF')], [{ image: logo, width: 38, height: 38 }], [3, 3, 0, 0])
  return card(44, 44, [rrect(0, 0, 44, 44, 11, BLUE)], [{ text: 'T', alignment: 'center', bold: true, fontSize: 22, color: '#FFFFFF' }], [0, 6, 0, 0])
}

function titleSize(t: string): number { return t.length <= 55 ? 25 : t.length <= 100 ? 21 : t.length <= 150 ? 18 : 16 }

function hero(m: DesignModel, o: DesignOptions): PdfNode[] {
  const title = m.title || o.cover.title
  const topic = o.cover.title && o.cover.title !== m.title ? clip(o.cover.title, 60) : clip(m.scope, 70)
  const updated = o.cover.updated ?? o.cover.facts[0] ?? ''
  const sub = [topic, updated].filter(Boolean).join('  ·  ')
  const kind = (o.cover.kind ?? o.cover.eyebrow.split('·')[0] ?? '').trim().toUpperCase()
  const sources = o.cover.sources ?? 0
  const pills: PdfNode[] = [pill(kind || 'BÁO CÁO NGHIÊN CỨU', '#14284F', null, '#CFE0FF')]
  if (sources > 0) pills.push(pill(`${sources} ${o.cover.sourcesWord ?? 'NGUỒN'}`.toUpperCase(), null, AMBER, AMBER))
  const heroStack: PdfNode[] = [
    { columns: [logoNode(o.logo), { width: '*', stack: [{ text: 'TAPPYAI', bold: true, fontSize: 15, color: '#FFFFFF', margin: [0, 6, 0, 1] }, { text: o.cover.labels?.line ?? 'RESEARCH  /  INTELLIGENCE', bold: true, fontSize: 7, color: SOFT }], margin: [12, 0, 0, 0] }], margin: [0, 0, 0, 16] },
    { columns: pills.map(p => ({ ...p })), columnGap: 8, margin: [0, 0, 0, 16] },
    { text: title, bold: true, fontSize: titleSize(title), color: '#FFFFFF', lineHeight: 1.18, margin: [0, 0, 0, 10] },
    ...(sub ? [{ text: sub, fontSize: 9.5, color: '#C3D2EE', margin: [0, 0, 0, 12] }] : []),
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 70, h: 3, color: AMBER }, { type: 'rect', x: 70, y: 0, w: 26, h: 3, color: CORAL }, { type: 'rect', x: 96, y: 0, w: 56, h: 3, color: BLUE }] },
  ]
  const now = o.now ?? new Date()
  return [
    // the dark band is a one-cell table: it grows with the title; a thin spacer column keeps it at least ~190 pt tall; the right 150 pt are left to the decorations
    { table: { widths: ['*'], body: [[{ fillColor: NAVY, margin: [MX, 30, MX + 150, 20], stack: [{ columns: [{ width: 1, canvas: [{ type: 'rect', x: 0, y: 0, w: 0.1, h: 138, color: NAVY }] }, { width: '*', stack: heroStack }] }] }]] }, layout: NOGRID, margin: [-MX, -36, -MX, 18] },
    // the decorations sit on the right of the band, drawn after it, and the "research note" text after them
    {
      absolutePosition: { x: 0, y: 0 },
      canvas: [
        { type: 'ellipse', x: 520, y: 34, r1: 112, r2: 112, color: '#11284D' },
        { type: 'ellipse', x: 500, y: 60, r1: 128, r2: 128, lineColor: '#2A4272', lineWidth: 1.1 },
        { type: 'ellipse', x: 510, y: 70, r1: 96, r2: 96, lineColor: '#7C6A3C', lineWidth: 2.4 },
        { type: 'ellipse', x: 455, y: 92, r1: 31, r2: 31, color: BLUE },
        { type: 'ellipse', x: 497, y: 62, r1: 8, r2: 8, color: AMBER },
        { type: 'ellipse', x: 429, y: 105, r1: 6.5, r2: 6.5, color: CORAL },
      ],
    },
    { absolutePosition: { x: PAGE.w - MX - 190, y: 40 }, width: 190, text: `${o.cover.labels?.note ?? 'RESEARCH NOTE'}   ${now.getFullYear()}.${pad2(now.getMonth() + 1)}`, alignment: 'right', bold: true, fontSize: 8, color: '#B5C6E8' },
  ]
}

// ── key-figure cards ──────────────────────────────────────────────────────────────────────────────────────────────────

function kpiRow(m: DesignModel): PdfNode[] {
  if (m.kpis.length < 2) return []
  const gap = 12
  const n = m.kpis.length
  const w = (CW - gap * (n - 1)) / n
  const cards = m.kpis.map((k, i) => {
    const accent = [BLUE, AMBER, CORAL][i % 3]
    const size = k.value.length > 9 ? 17 : k.value.length > 6 ? 21 : 25
    return {
      ...card(w, 94, [rrect(0, 0, w, 94, 12, '#FFFFFF', LINE), rrect(14, 12, 30, 3.4, 1.7, accent)], [
        { text: k.value, bold: true, fontSize: size, color: INK, margin: [0, 8, 0, 0], lineHeight: 1.1 },
        { text: k.unit || ' ', bold: true, fontSize: 7.5, color: accent, margin: [0, 1, 0, 3] },
        { text: clip(k.label, 30), fontSize: 8, color: MUTED, lineHeight: 1.15 },
        ...(k.note ? [{ text: clip(k.note, 31), fontSize: 8, color: '#8A94AD', lineHeight: 1.15 }] : []),
      ], [14, 14, 10, 0]),
      margin: [0, 0, 0, 0],
    }
  })
  return [{ columns: cards, columnGap: gap, margin: [0, 0, 0, 16] }]
}

// ── highlight card and bar card ───────────────────────────────────────────────────────────────────────────────────────

function highlightAndBars(m: DesignModel): PdfNode[] {
  if (!m.highlight && !m.bars) return []
  const label = 'ĐIỂM CHÍNH'
  if (!m.bars) {
    return [{ table: { widths: ['*'], body: [[{ stack: [{ text: label, bold: true, fontSize: 7.5, color: SOFT, margin: [0, 0, 0, 6] }, { text: m.highlight, bold: true, fontSize: 13.5, color: '#FFFFFF', lineHeight: 1.25 }], margin: [18, 16, 18, 16], fillColor: NAVY2 }]] }, layout: NOGRID, margin: [0, 0, 0, 16] }]
  }
  const rows = m.bars.rows
  const h = 46 + rows.length * 27 + 12
  const wl = Math.round(CW * 0.4)
  const wr = CW - wl - 12
  const text = m.highlight ? clip(m.highlight, 130) : ''
  const left = card(wl, h, [rrect(0, 0, wl, h, 14, NAVY2)], [
    { text: label, bold: true, fontSize: 7.5, color: SOFT, margin: [0, 0, 0, 8] },
    { text, bold: true, fontSize: text.length > 90 ? 12 : 14, color: '#FFFFFF', lineHeight: 1.25 },
  ], [16, 18, 16, 0])
  const max = Math.max(...rows.map(r => r.value), 1)
  const trackW = wr - 150
  const bar = rows.map((r, i) => ({
    columns: [
      { width: 96, text: clip(r.label, 18), fontSize: 9, bold: i === 0, color: INK, margin: [0, 5, 0, 0] },
      { width: trackW, canvas: [rrect(0, 9, trackW, 8, 4, '#E9EFFA'), rrect(0, 9, Math.max(8, (r.value / max) * trackW), 8, 4, PALETTE[i % 3])] },
      { width: '*', text: r.text, alignment: 'right', fontSize: 9, bold: true, color: INK, margin: [0, 5, 0, 0] },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 1],
    height: 26,
  }))
  const right = card(wr, h, [rrect(0, 0, wr, h, 14, '#FFFFFF', LINE)], [
    { columns: [{ width: '*', text: m.bars.title.toUpperCase(), bold: true, fontSize: 7.5, color: MUTED }, { width: 'auto', text: m.bars.unit ? `ĐƠN VỊ: ${m.bars.unit}` : '', bold: true, fontSize: 7, color: '#8A94AD' }], margin: [0, 0, 0, 10] },
    ...bar,
  ], [16, 16, 16, 0])
  return [{ columns: [left, right], columnGap: 12, margin: [0, 0, 0, 16] }]
}

// ── notes ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function notes(m: DesignModel, scopeLabel: string, caveatLabel: string): PdfNode[] {
  const parts: Array<{ fill: string; label: string; color: string; body: PdfNode[] }> = []
  if (m.scope) parts.push({ fill: '#EEEBFF', label: scopeLabel, color: VIOLET, body: [{ text: clip(m.scope, 170), fontSize: 8.5, color: INK, lineHeight: 1.3 }] })
  if (m.caveats.length) parts.push({ fill: '#FFF3D6', label: caveatLabel, color: '#A15C00', body: m.caveats.map(c => ({ text: `• ${c}`, fontSize: 8, color: '#5B4A1A', lineHeight: 1.25, margin: [0, 0, 0, 3] })) })
  if (!parts.length) return []
  const cells: PdfNode[] = []
  parts.forEach((p, i) => { if (i) cells.push({ text: '' }); cells.push({ stack: [{ text: p.label.toUpperCase(), bold: true, fontSize: 7.5, color: p.color, margin: [0, 0, 0, 4] }, ...p.body], margin: [12, 10, 12, 7] }) })
  const fills = parts.map(p => p.fill)
  return [{
    // dontBreakRows: the notes stay in one piece on one page, never a coloured sliver at the foot of one page and the rest on the next
    table: { widths: parts.length === 2 ? ['*', 12, '*'] : ['*'], body: [cells], dontBreakRows: true },
    layout: { ...NOGRID, fillColor: (_r: number, _n: unknown, c: number) => (c % 2 === 0 ? fills[c / 2] : null) },
    margin: [0, 0, 0, 16],
  }]
}

// ── sections ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function sectionHeader(index: number, title: string): PdfNode {
  const color = PALETTE[(index - 1) % PALETTE.length]
  return {
    headlineLevel: 1,
    columns: [
      card(30, 20, [rrect(0, 0, 30, 20, 10, color)], [{ text: pad2(index), alignment: 'center', bold: true, fontSize: 8.5, color: '#FFFFFF' }], [0, 5, 0, 0]),
      { width: '*', text: title.toUpperCase().length < 46 ? title.toUpperCase() : title, bold: true, fontSize: title.length < 46 ? 11.5 : 12, color: INK, lineHeight: 1.2, margin: [10, 2, 0, 0] },
    ],
    columnGap: 0,
    margin: [0, 8, 0, 8],
  }
}

const PCT_HEAD = /(%|thị phần|tỷ trọng|tỉ trọng|\bshare\b|tỷ lệ)/i

function designTable(raw: string): PdfNode | null {
  const rows = tableRows(raw)
  if (!rows) return null
  const width = Math.max(...rows.map(r => r.length))
  const pctCol = rows.length <= 9 ? rows[0].findIndex((h, i) => i > 0 && PCT_HEAD.test(h)) : -1
  return {
    table: {
      headerRows: 1,
      widths: Array.from({ length: width }, () => '*'),
      body: rows.map((r, i) => Array.from({ length: width }, (_, k) => {
        const text = r[k] ?? ''
        if (i === 0) return { text: plainText(text).toUpperCase(), bold: true, fontSize: 7.5, color: MUTED }
        const accent = k === pctCol ? { bold: true, color: PALETTE[(i - 1) % 3] } : {}
        return { text: pdfRuns(text), fontSize: 9.5, ...(k === 0 && i === 1 ? { bold: true } : {}), ...accent }
      })),
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.8 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      fillColor: (row: number) => (row === 0 ? '#EEF2FB' : '#FFFFFF'),
      paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 7, paddingBottom: () => 7,
    },
    margin: [0, 2, 0, 12],
  }
}

function themedBlocks(blocks: Parameters<typeof blocksToNodes>[0]): PdfNode[] {
  return blocksToNodes(blocks).map((n): PdfNode => {
    if (n.ul) return { ...n, markerColor: BLUE, type: 'square' }
    if (n.ol) return { ...n, markerColor: BLUE }
    return n
  })
}

function sectionBody(blocks: Parameters<typeof blocksToNodes>[0]): PdfNode[] {
  const out: PdfNode[] = []
  let run: typeof blocks = []
  const flush = () => { if (run.length) { out.push(...themedBlocks(run)); run = [] } }
  for (const b of blocks) {
    if (b.t === 'raw') {
      const t = designTable(b.text)
      if (t) { flush(); out.push(t); continue }
    }
    run.push(b)
  }
  flush()
  return out
}

function sourcesBlock(m: DesignModel, label: string): PdfNode[] {
  const items = m.sources.flatMap(b => (b.t === 'list' ? b.items.map(i => plainText(i.text)) : b.t === 'para' ? [plainText(b.text)] : [])).filter(Boolean)
  if (!items.length) return []
  const half = Math.ceil(items.length / 2)
  const col = (list: string[], start: number): PdfNode => ({ width: '*', ol: list.map(t => ({ text: clip(t, 120) })), start, fontSize: 7.5, color: MUTED, lineHeight: 1.2 })
  return [
    { text: label, bold: true, fontSize: 7.5, color: MUTED, margin: [0, 10, 0, 6], headlineLevel: 1 },
    { columns: items.length > 6 ? [col(items.slice(0, half), 1), col(items.slice(half), half + 1)] : [col(items, 1)], columnGap: 18 },
  ]
}

/** The designed page as a pdfmake document definition. A report with no "##" sections has nothing to design: the caller keeps the plain layout for it. Pure. */
export function reportPdfDesigned(text: string, links: readonly ReportLink[], o: DesignOptions): Record<string, unknown> | null {
  const m = designModel(text, links)
  if (!m.sections.some(s => s.title)) return null // no "##" part: nothing to design (the plain layout keeps such a text)
  const w = o.cover.words ?? { scope: 'PHẠM VI', caveats: 'LƯU Ý DỮ LIỆU', sources: 'NGUỒN', footer: 'CẬP NHẬT' }
  const body: PdfNode[] = []
  const summaryAt = Math.max(0, m.sections.findIndex(s => /(tóm tắt|tổng quan|summary|overview|executive|điểm chính|key findings)/i.test(s.title)))
  m.sections.forEach((s, i) => {
    if (s.title) body.push(sectionHeader(s.index, s.title))
    body.push(...sectionBody(s.blocks))
    // the designed cards follow the summary: key figures, the highlight (with the bar card), the notes
    if (i === summaryAt) body.push(...kpiRow(m), ...highlightAndBars(m), ...notes(m, w.scope, w.caveats))
  })
  body.push(...sourcesBlock(m, w.sources))
  const updated = o.cover.updated ?? o.cover.facts[0] ?? ''
  return {
    info: { title: m.title || o.cover.title, author: 'Tappy', creator: 'Tappy', producer: 'Tappy' },
    pageSize: 'A4',
    pageMargins: [MX, 36, MX, 56],
    background: (_page: number, size: { width: number; height: number }) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: size.height, color: BG }] }),
    content: [...hero(m, o), ...body],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.35, color: INK },
    styles: {
      title: { fontSize: 20, bold: true, color: INK },
      h1: { fontSize: 13, bold: true, color: INK, margin: [0, 10, 0, 4] },
      h2: { fontSize: 11, bold: true, color: INK, margin: [0, 8, 0, 3] },
      h3: { fontSize: 10, bold: true, color: MUTED, margin: [0, 6, 0, 3] },
      p: { margin: [0, 0, 0, 6] },
      quote: { italics: true, color: MUTED, margin: [14, 0, 0, 6] },
      code: { fontSize: 9, background: '#EEF2FB', margin: [0, 0, 0, 6] },
      th: { bold: true, fontSize: 8, color: MUTED },
      td: { fontSize: 9.5 },
    },
    pageBreakBefore: (node: { headlineLevel?: number }, following: unknown[]) => !!node.headlineLevel && following.length === 0,
    footer: (page: number, pages: number) => ({
      columns: [{ text: `${w.footer} ${updated.replace(/^\D+/, '')}  ·  ${o.cover.labels?.footerBrand ?? 'TAPPYAI RESEARCH'}`.toUpperCase(), alignment: 'left' }, { text: `${pad2(page)} / ${pad2(pages)}`, alignment: 'right' }],
      fontSize: 7.5, bold: true, color: '#7A86A3', margin: [MX, 22, MX, 0],
    }),
  }
}
