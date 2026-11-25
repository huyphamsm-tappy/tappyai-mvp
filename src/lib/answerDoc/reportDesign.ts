// 15/11 (owner: the designed report page - hero, key-figure cards, a highlight card, a bar card, numbered sections, tables, notes - "áp dụng cho TẤT CẢ các báo cáo, không vá từng case"): what the designed PDF
// needs to know about ANY finished report, read from its markdown by fixed rules, with no model call and nothing keyed to a topic, a company or a number. Pure and deterministic.
//   title / scope     the first "# " line and the italic line under it;
//   sections          every "## " part, its title without its leading number, its blocks; the sources list (a heading named Nguồn / Sources) apart;
//   kpis              up to three key figures from the SUMMARY section: the number is copied verbatim from a sentence of the report (a quantity with a scale word and unit first, a percentage second), with the
//                     words before it as its label and the words after it as its note; fewer than two found = no key-figure band;
//   highlight         the report's own main sentence (the closing paragraph of the summary, else the first sentence of its first paragraph);
//   bars              the first table that has a share / percentage column over three to eight rows, drawn as bars as well as a table;
//   caveats / scope   the first two items of the section that states what is doubtful or limited, and the scope line.
// It shows nothing it cannot read from the text: no confidence label, no invented figure.
import { parseDoc, type DocBlock } from '@/lib/answerDoc/parse'
import { tableRows } from '@/lib/answerDoc/reportDocx'
import { reportMarkdown, type ReportLink } from '@/lib/answerDoc/reportExport'

export interface DesignKpi { value: string; unit: string; label: string; note: string }
export interface DesignBars { title: string; unit: string; rows: Array<{ label: string; value: number; text: string }> }
export interface DesignSection { index: number; title: string; blocks: DocBlock[] }
export interface DesignModel {
  title: string
  scope: string
  sections: DesignSection[]
  sources: DocBlock[]
  kpis: DesignKpi[]
  highlight: string
  bars: DesignBars | null
  caveats: string[]
}

const SUMMARY = /(tóm tắt|tổng quan|summary|overview|executive|điểm chính|key findings)/i
const DOUBT = /(chưa chắc|còn nghi ngờ|nghi ngờ|chưa rõ|uncertain|doubt|hạn chế|limitation|caveat|lưu ý|rủi ro)/i
const SOURCES = /^(nguồn|nguồn tham khảo|tài liệu tham khảo|sources?|references)$/i

/** Markdown and citation marks removed: the text a person reads. Pure. */
export function plainText(s: string): string {
  return s
    .replace(/\[(\d{1,3})\](?:\[(\d{1,3})\])*/g, '')
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .trim()
}

/** The text cut at the last word that fits `max` characters, with an ellipsis when something was left out. Pure. */
export function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:–—-]+$/, '')}…`
}

const firstSentence = (s: string) => s.split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u)[0] ?? s

// JavaScript's \b knows only ASCII letters, so "tỷ" would never end a word: the end of the scale word is "not followed by a letter or digit"
const QTY = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s?(nghìn tỷ|tỷ|triệu|nghìn|trillion|billion|million|thousand)(?![\p{L}\p{N}])(?:\s?(USD|đồng|VND|xe|chip|euro|EUR|oz)(?![\p{L}\p{N}]))?/iu
// a price or amount written straight with its currency and no scale word ("3.885 USD/oz", "4.250 USD"): used after the scale-word quantities, before the percentages
const MONEY = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{3,}(?:,\d+)?)\s?(USD(?:\/oz)?|VND|EUR|euro|đồng(?:\/\p{L}+)?)(?![\p{L}\p{N}])/iu
const PCT = /(?<![\d.,])([+\-−]?\d+(?:[.,]\d+)?)\s?%/u
const TRAILING_VERB = /\s*(đạt|là|khoảng|ở mức|vào|tăng|giảm|lên|xuống|đến|tới|gần|hơn|trên|dưới|còn|chỉ|với|cho|của|trong|tại|từ|ở|mức|đã|sẽ|được|:|,|—|–|-|\()\s*$/iu

const lastWords = (s: string, n: number) => s.split(/\s+/).slice(-n).join(' ')
const firstWords = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(' ')

function labelBefore(before: string): string {
  // the clause the figure belongs to: what follows the last comma, colon, semicolon, dash or bracket
  let t = (before.split(/[,;:(–—]/).pop() ?? before).trim()
  for (let i = 0; i < 4 && TRAILING_VERB.test(t); i++) t = t.replace(TRAILING_VERB, '').trim()
  return lastWords(t, 7).replace(/^(và|nhưng|còn|nên|vì|do|theo|nếu|khi|mà)\s+/i, '')
}

/** A figure that is one end of a range ("từ 4.250 USD đến 6.300 USD") is not a headline number. */
const inRange = (s: string, at: number, len: number) => /(từ|between)\s*$/i.test(s.slice(Math.max(0, at - 6), at)) || /^\s*(đến|tới|–|—|-|to)\s*\d/i.test(s.slice(at + len))

function noteAfter(after: string): string {
  const t = after.replace(/^[\s,;:–—)-]+/, '').split(/[.;]/)[0] ?? ''
  return clip(firstWords(t, 9), 46)
}

/** Key figures from a section's sentences, in order of appearance: quantities with a scale word first, then percentages; at most `max`, one per sentence, none repeated. Pure. */
export function keyFigures(blocks: DocBlock[], max = 3): DesignKpi[] {
  const texts: string[] = []
  for (const b of blocks) {
    if (b.t === 'para') texts.push(plainText(b.text))
  }
  for (const b of blocks) if (b.t === 'list') for (const it of b.items) texts.push(plainText(it.text))
  const sentences = texts.flatMap(t => t.split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u)).filter(s => s.length >= 12)
  const seen = new Set<string>()
  const qty: Array<{ at: number; k: DesignKpi }> = []
  const pct: Array<{ at: number; k: DesignKpi }> = []
  const money: Array<{ at: number; k: DesignKpi }> = []
  sentences.forEach((s, i) => {
    const mo = QTY.test(s) ? null : MONEY.exec(s)
    if (mo && inRange(s, mo.index ?? 0, mo[0].length)) return
    if (mo && !seen.has(mo[1])) {
      seen.add(mo[1])
      const before = labelBefore(s.slice(0, mo.index))
      const after = noteAfter(s.slice((mo.index ?? 0) + mo[0].length))
      if (before.replace(/[^\p{L}]/gu, '').length >= 6 || after) money.push({ at: i, k: { value: mo[1], unit: mo[2].toUpperCase(), label: before.length >= 6 ? before : clip(firstWords(after, 5), 30), note: before.length >= 6 ? after : '' } })
      return
    }
    const q = QTY.exec(s)
    if (q && !seen.has(q[1])) {
      seen.add(q[1])
      const unit = `${q[2]}${q[3] ? ` ${q[3]}` : ''}`.toUpperCase()
      const before = labelBefore(s.slice(0, q.index))
      const after = noteAfter(s.slice((q.index ?? 0) + q[0].length))
      qty.push({ at: i, k: { value: q[1], unit, label: before || clip(firstWords(after, 5), 30), note: before ? after : '' } })
      return
    }
    const p = PCT.exec(s)
    if (p && !seen.has(p[1])) {
      seen.add(p[1])
      const grew = /(tăng|giảm|increase|decrease|grew|fell)\s*(khoảng|gần|hơn)?\s*$/iu.exec(s.slice(Math.max(0, (p.index ?? 0) - 16), p.index))
      const sign = /^[+\-−]/.test(p[1]) ? '' : grew ? (/^(giảm|decrease|fell)/i.test(grew[1]) ? '−' : '+') : ''
      const rest = s.slice((p.index ?? 0) + p[0].length)
      const vs = /^\s*(so với (?:cùng kỳ|quý trước|quý \d|năm trước|năm ngoái|năm \d{4}|tháng trước|tháng \d{1,2}|[^\s,.;]+(?:\s[^\s,.;]+)?))/iu.exec(rest)
      pct.push({ at: i, k: { value: `${sign}${p[1].replace(/^[+\-−]/, (m) => m)}%`, unit: vs ? vs[1].toUpperCase() : '', label: labelBefore(s.slice(0, p.index)), note: vs ? '' : noteAfter(rest) } })
    }
  })
  const firstTier = [...qty, ...money]
  return [...firstTier, ...pct.slice(0, Math.max(0, max - firstTier.length))].slice(0, max).sort((a, b) => a.at - b.at).map(x => x.k)
}

const cell = (s: string) => plainText(s)
const numberOf = (s: string): number | null => {
  const m = /^[~≈+\-−]?\s*(\d+(?:[.,]\d+)?)/.exec(cell(s))
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** The first table with a share / percentage column over three to eight rows, as bars. null when there is none. Pure. */
export function barsFrom(blocks: DocBlock[]): DesignBars | null {
  for (const b of blocks) {
    if (b.t !== 'raw') continue
    const rows = tableRows(b.text)
    if (!rows || rows.length < 4 || rows.length > 9) continue
    const head = rows[0]
    for (let c = 1; c < head.length; c++) {
      if (!/(%|thị phần|tỷ trọng|tỉ trọng|\bshare\b|tỷ lệ)/i.test(head[c])) continue
      const data = rows.slice(1).map(r => ({ label: cell(r[0] ?? ''), value: numberOf(r[c] ?? ''), text: cell(r[c] ?? '') }))
      const ok = data.filter(d => d.label && d.value !== null && (d.value as number) >= 0 && (d.value as number) <= 100)
      if (ok.length >= 3 && ok.length === data.length) return { title: cell(head[c]).replace(/\s*\(%\)\s*$/, ''), unit: /%/.test(head[c]) ? '%' : '', rows: ok.map(d => ({ label: d.label, value: d.value as number, text: d.text })) }
    }
  }
  return null
}

/** The report's blocks as the design reads them. Pure. */
export function designModel(text: string, links: readonly ReportLink[]): DesignModel {
  const blocks = parseDoc(reportMarkdown(text, links))
  const h1 = blocks.findIndex(b => b.t === 'heading' && b.level === 1)
  const title = h1 >= 0 ? plainText((blocks[h1] as { text: string }).text) : ''
  let i = h1 >= 0 ? h1 + 1 : 0
  let scope = ''
  const maybe = blocks[i]
  if (maybe?.t === 'para' && /^\s*\*[^*].*\*\s*$/.test(maybe.text.trim())) {
    scope = plainText(maybe.text).replace(/^(phạm vi|scope)\s*:\s*/i, '')
    scope = scope.charAt(0).toLocaleUpperCase() + scope.slice(1)
    i++
  }
  const sections: DesignSection[] = []
  let sources: DocBlock[] = []
  let cur: DesignSection | null = null
  let inSources = false
  for (; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.t === 'heading' && b.level >= 2 && SOURCES.test(plainText(b.text).replace(/^\d+[.)]\s*/, ''))) { inSources = true; continue }
    if (inSources) { sources.push(b); continue }
    if (b.t === 'heading' && b.level === 2) {
      cur = { index: sections.length + 1, title: plainText(b.text).replace(/^\d+[.)]\s*/, ''), blocks: [] }
      sections.push(cur)
      continue
    }
    if (!cur) { cur = { index: 1, title: '', blocks: [] }; sections.push(cur) }
    cur.blocks.push(b)
  }
  const summary = sections.find(s => SUMMARY.test(s.title)) ?? sections[0]
  const kpis = summary ? keyFigures(summary.blocks) : []
  let highlight = ''
  if (summary) {
    const paras = summary.blocks.filter((b): b is Extract<DocBlock, { t: 'para' }> => b.t === 'para').map(b => plainText(b.text)).filter(t => t.length >= 40)
    const listIdx = summary.blocks.findIndex(b => b.t === 'list')
    const after = listIdx >= 0 ? summary.blocks.slice(listIdx).filter((b): b is Extract<DocBlock, { t: 'para' }> => b.t === 'para').map(b => plainText(b.text)).filter(t => t.length >= 40) : []
    const pick = after.length ? after[after.length - 1] : paras[0]
    if (pick) highlight = clip(firstSentence(pick), 170)
  }
  const bars = barsFrom(sections.flatMap(s => s.blocks))
  const doubt = sections.find(s => DOUBT.test(s.title) && s.blocks.some(b => b.t === 'list'))
  const caveats = doubt ? doubt.blocks.flatMap(b => (b.t === 'list' ? b.items.map(it => clip(plainText(it.text), 150)) : [])).filter(Boolean).slice(0, 2) : []
  return { title, scope, sections, sources, kpis: kpis.length >= 2 ? kpis : [], highlight, bars, caveats }
}
