// ── ACCESSTRADE static CSV feed — parser only ────────────────────────────────
// Header contract observed 11–13 Sep 2026 on every merchant file:
//   "sku","name","url","price","discount","image","desc","category"
// `price` is the list price and `discount` the SALE price for the electronics
// merchants (CellphoneS, DMX, TGDD); for the Shopee subset `discount` is a
// percentage — so the parser exposes both raw numbers and the caller decides
// per merchant. No stock, brand or per-row timestamp exists in the file.
//
// Pure: takes text, returns rows. Fetching lives in ./source.ts under the
// transport policy (owner decision D6).

export interface FeedItem {
  sku: string
  name: string
  url: string
  price: number | null
  discount: number | null
  image: string | null
  description: string | null
  category: string | null
  feedFile: string
}

export interface FeedParseResult {
  items: FeedItem[]
  rowsTotal: number
  rowsRejected: number
  header: string[]
}

const REQUIRED_HEADER = ['sku', 'name', 'url', 'price', 'discount', 'image', 'desc', 'category']

/** RFC-4180-ish line splitter with quoted fields and doubled quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

function num(v: string): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function httpsOrNull(v: string, allowedHosts: readonly string[]): string | null {
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:') return null
    if (allowedHosts.length && !allowedHosts.includes(u.hostname.toLowerCase())) return null
    return u.toString()
  } catch {
    return null
  }
}

export function parseAccesstradeCsv(text: string, feedFile: string, opts: { allowedHosts: readonly string[]; maxRows?: number }): FeedParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  if (lines.length === 0) return { items: [], rowsTotal: 0, rowsRejected: 0, header: [] }
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const missing = REQUIRED_HEADER.filter(h => !header.includes(h))
  if (missing.length) throw new Error(`feed ${feedFile}: header missing ${missing.join(',')}`)
  const idx = Object.fromEntries(REQUIRED_HEADER.map(h => [h, header.indexOf(h)])) as Record<(typeof REQUIRED_HEADER)[number], number>
  const items: FeedItem[] = []
  let rejected = 0
  const max = opts.maxRows ?? Number.POSITIVE_INFINITY
  for (let i = 1; i < lines.length && items.length < max; i++) {
    const cells = parseCsvLine(lines[i])
    const url = httpsOrNull(cells[idx.url] ?? '', opts.allowedHosts)
    const sku = (cells[idx.sku] ?? '').trim()
    const name = (cells[idx.name] ?? '').trim()
    if (!url || !sku || !name) { rejected++; continue }
    items.push({
      sku,
      name,
      url,
      price: num(cells[idx.price] ?? ''),
      discount: num(cells[idx.discount] ?? ''),
      image: httpsOrNull(cells[idx.image] ?? '', []),
      description: (cells[idx.desc] ?? '').trim() || null,
      category: (cells[idx.category] ?? '').trim() || null,
      feedFile,
    })
  }
  return { items, rowsTotal: lines.length - 1, rowsRejected: rejected, header }
}
