// 31/10 (owner: "mấu chốt cuối cùng của report là số liệu và sự chính xác"): a deep research section chart, drawn from the figures the
// server checked against their sources (deepResearch.ts sectionCharts / readResearchCharts). One SVG builder for the screen (shown as an
// image: no script, no markup in the page) and for the printable PDF page. Every text is escaped; numbers are formatted here. Pure.
import type { ResearchChart } from '@/lib/ai/research/deepResearch'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function formatValue(v: number, lang: string): string {
  return v.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 })
}

/** The chart as a standalone SVG document (light background, readable in both themes and on paper). */
export function chartSvg(c: ResearchChart, lang: string): string {
  const W = 640, PAD = 16
  const font = `font-family="Arial,Helvetica,sans-serif"`
  const max = Math.max(...c.points.map(p => p.value), 0) || 1
  const sources = [...new Set(c.points.map(p => p.source))].sort((a, b) => a - b).map(n => `[${n}]`).join('')
  const head = `<text x="${PAD}" y="24" ${font} font-size="15" font-weight="bold" fill="#111">${esc(cut(c.title, 70))}</text>` +
    `<text x="${PAD}" y="42" ${font} font-size="12" fill="#555">${esc(c.unit ? `${c.unit} · ` : '')}${esc(lang === 'vi' ? 'Nguồn' : 'Sources')} ${esc(sources)}</text>`
  let body = ''
  let H: number
  if (c.kind === 'bar') {
    const top = 56, row = 30, labelW = 170, barMax = W - PAD - labelW - 70
    H = top + c.points.length * row + PAD
    c.points.forEach((p, i) => {
      const y = top + i * row
      const w = Math.max(2, Math.round((Math.max(p.value, 0) / max) * barMax))
      body += `<text x="${PAD + labelW - 8}" y="${y + 19}" ${font} font-size="12" fill="#333" text-anchor="end">${esc(cut(p.label, 26))}</text>` +
        `<rect x="${PAD + labelW}" y="${y + 6}" width="${w}" height="18" rx="3" fill="#2f6fd6"/>` +
        `<text x="${PAD + labelW + w + 6}" y="${y + 19}" ${font} font-size="12" fill="#111">${esc(formatValue(p.value, lang))} [${p.source}]</text>`
    })
  } else {
    const top = 64, h = 180, left = PAD + 40, right = W - PAD - 20
    H = top + h + 40
    const min = Math.min(...c.points.map(p => p.value), 0)
    const span = max - min || 1
    const x = (i: number) => left + (c.points.length === 1 ? 0 : (i * (right - left)) / (c.points.length - 1))
    const y = (v: number) => top + h - ((v - min) / span) * h
    body += `<line x1="${left}" y1="${top + h}" x2="${right}" y2="${top + h}" stroke="#bbb"/>`
    body += `<polyline fill="none" stroke="#2f6fd6" stroke-width="2.5" points="${c.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`
    c.points.forEach((p, i) => {
      body += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="#2f6fd6"/>` +
        `<text x="${x(i).toFixed(1)}" y="${(y(p.value) - 9).toFixed(1)}" ${font} font-size="11" fill="#111" text-anchor="middle">${esc(formatValue(p.value, lang))}</text>` +
        `<text x="${x(i).toFixed(1)}" y="${top + h + 18}" ${font} font-size="12" fill="#333" text-anchor="middle">${esc(cut(p.label, 12))}</text>`
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${head}${body}</svg>`
}

/** The chart as an image address (the screen shows it as an <img>: an SVG image runs no script). */
export const chartDataUrl = (c: ResearchChart, lang: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg(c, lang))}`

/** The chart's figures as a markdown table with a caption (Markdown and Word files, where no picture is drawn). */
export function chartTable(c: ResearchChart, lang: string): string {
  const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ')
  const rows = c.points.map(p => `| ${cell(p.label)} | ${formatValue(p.value, lang)}${c.unit ? ` ${cell(c.unit)}` : ''} [${p.source}] |`).join('\n')
  const head = lang === 'vi' ? '| Mục | Giá trị |' : '| Item | Value |'
  const caption = `*${lang === 'vi' ? 'Biểu đồ' : 'Chart'}: ${cell(c.title)}*`
  return `${head}\n|---|---|\n${rows}\n\n${caption}`
}
