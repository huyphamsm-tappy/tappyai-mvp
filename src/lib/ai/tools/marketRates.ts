// Market rates from the pages that publish them themselves (owner 17/11: "pick the official, frequently updated page for each and make it the default").
//   fx      Vietcombank's own exchange-rate feed (the bank publishes it for the public: buy / transfer / sell, one request per 5 minutes, so cached 5 minutes);
//   crypto  Coinbase's public spot price (and the price on a date a week back, so "up or down" is computed here, not by the model);
//   oil     the NYMEX / ICE futures quote of Yahoo Finance's public chart feed (Brent BZ=F, WTI CL=F): the exchange itself licenses its feed, this is the free public reading of it.
// Fixed hosts only, a short timeout, a cache, no key, nothing of the user is sent. Every result carries `source`, `source_url` (the page a reader can open: granted as a source
// reference in urlGrants.ts), `as_of` and, for a change, the numbers it was computed from. Any failure is `{ error, source_url }`, never an invented number.
import { getCache, setCache } from './common'

export type MarketKind = 'fx' | 'crypto' | 'oil'

const TIMEOUT_MS = 5000
const UA = 'Mozilla/5.0 (compatible; TappyAI/1.0)'

async function getText(url: string): Promise<string> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/xml, */*' }, signal: ctl.signal })
    if (!r.ok) throw new Error(`http_${r.status}`)
    return await r.text()
  } finally { clearTimeout(t) }
}

const num = (s: string | undefined): number | null => {
  if (!s) return null
  const v = Number(s.replace(/,/g, ''))
  return Number.isFinite(v) && v > 0 ? v : null
}
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

// ── fx: Vietcombank ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface FxRow { code: string; name: string; buy: number | null; transfer: number | null; sell: number | null }
/** The rows of Vietcombank's XML feed and its own timestamp ("11/17/2026 3:16:45 PM", month first). Pure. */
export function parseVcbXml(xml: string): { rows: FxRow[]; stamp: string | null } {
  const rows: FxRow[] = []
  for (const m of xml.matchAll(/<Exrate\b([^>]*)\/>/g)) {
    const a = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(m[1])?.[1]
    const code = a('CurrencyCode')?.trim().toUpperCase()
    if (!code) continue
    rows.push({ code, name: (a('CurrencyName') ?? '').trim(), buy: num(a('Buy')), transfer: num(a('Transfer')), sell: num(a('Sell')) })
  }
  return { rows, stamp: /<DateTime>([^<]+)<\/DateTime>/.exec(xml)?.[1]?.trim() ?? null }
}

/** "11/17/2026 3:16:45 PM" (Vietnam time) to an ISO instant with the +07:00 offset; null when it does not read. Pure. */
export function vcbStampToIso(stamp: string | null): string | null {
  const m = stamp && /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(stamp)
  if (!m) return null
  let h = Number(m[4])
  if (m[7]) { h = h % 12 + (m[7].toUpperCase() === 'PM' ? 12 : 0) }
  const p = (n: number | string, w = 2) => String(n).padStart(w, '0')
  return `${m[3]}-${p(m[1])}-${p(m[2])}T${p(h)}:${m[5]}:${m[6]}+07:00`
}

const VCB_PAGE = 'https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/Ty-gia'
const VCB_FEED = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx'

async function vcbRows(): Promise<{ rows: FxRow[]; stamp: string | null }> {
  const hit = getCache('market:vcb') as { rows: FxRow[]; stamp: string | null } | undefined
  if (hit) return hit
  const parsed = parseVcbXml(await getText(VCB_FEED))
  if (!parsed.rows.length) throw new Error('no_rows')
  setCache('market:vcb', parsed, 5 * 60 * 1000)
  return parsed
}

export async function getFxRate(currency: string) {
  const code = (currency || 'USD').trim().toUpperCase().slice(0, 3)
  try {
    const { rows, stamp } = await vcbRows()
    const row = rows.find(r => r.code === code)
    if (!row) return { error: 'currency_not_listed', listed: rows.map(r => r.code), source: 'Vietcombank', source_url: VCB_PAGE }
    return {
      source: 'Vietcombank', source_url: VCB_PAGE, kind: 'fx', unit: 'VND per 1 unit of the currency', currency: code,
      buy_cash_or_transfer_note: 'buy = banknotes, transfer = bank transfer, sell = the bank sells to you',
      buy: row.buy, transfer: row.transfer, sell: row.sell, as_of: vcbStampToIso(stamp) ?? stamp,
      note: 'The rate of ONE bank (Vietcombank), not the central rate of the State Bank and not an average; other banks differ by tens of dong.',
    }
  } catch { return { error: 'fetch_failed', source: 'Vietcombank', source_url: VCB_PAGE } }
}

// ── crypto: Coinbase ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COINBASE_PAGE: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'xrp', BNB: 'bnb', DOGE: 'dogecoin', USDT: 'tether', ADA: 'cardano' }
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export async function getCryptoPrice(symbol: string, now: Date = new Date()) {
  const sym = (symbol || 'ETH').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  const page = COINBASE_PAGE[sym] ? `https://www.coinbase.com/price/${COINBASE_PAGE[sym]}` : `https://www.coinbase.com/price`
  if (!sym) return { error: 'no_symbol', source: 'Coinbase', source_url: page }
  const key = `market:cb:${sym}:${isoDay(now)}:${Math.floor(now.getTime() / 60000)}`
  const hit = getCache(key)
  if (hit) return hit
  try {
    const weekAgo = isoDay(new Date(now.getTime() - 7 * 86400_000))
    const spot = async (q = '') => { const j = JSON.parse(await getText(`https://api.coinbase.com/v2/prices/${sym}-USD/spot${q}`)) as { data?: { amount?: string } }; return num(j.data?.amount) }
    const [nowUsd, weekUsd] = await Promise.all([spot(), spot(`?date=${weekAgo}`).catch(() => null)])
    if (nowUsd === null) throw new Error('no_price')
    let vnd: { usd_vnd_transfer: number; price_vnd: number; week_ago_price_vnd?: number } | undefined
    try {
      const usd = (await vcbRows()).rows.find(r => r.code === 'USD')?.transfer
      if (usd) vnd = { usd_vnd_transfer: usd, price_vnd: Math.round(nowUsd * usd), ...(weekUsd !== null ? { week_ago_price_vnd: Math.round(weekUsd * usd) } : {}) }
    } catch { /* USD price alone */ }
    const result = {
      source: 'Coinbase', source_url: page, kind: 'crypto', symbol: sym, currency: 'USD', price_usd: nowUsd, as_of: now.toISOString(),
      ...(weekUsd !== null ? { week_ago_date: weekAgo, week_ago_price_usd: weekUsd, change_vs_week_ago_pct: round(((nowUsd - weekUsd) / weekUsd) * 100, 1), change_note: 'computed by code from the two prices above' } : { change_note: 'no price a week ago was available: do not state a weekly change' }),
      ...(vnd ? { vnd_estimate: { ...vnd, note: 'USD price times Vietcombank\'s USD transfer rate: an estimate, not a price on a Vietnamese exchange' } } : {}),
    }
    setCache(key, result, 60 * 1000)
    return result
  } catch { return { error: 'fetch_failed_or_unknown_symbol', symbol: sym, source: 'Coinbase', source_url: page } }
}

// ── oil: Yahoo Finance chart feed of the NYMEX / ICE futures ─────────────────────────────────────────────────────────────────────────
const OIL: Record<string, { ticker: string; name: string }> = { BRENT: { ticker: 'BZ=F', name: 'Brent crude (futures)' }, WTI: { ticker: 'CL=F', name: 'WTI crude (futures)' } }

/** The last price, the previous close and their time from Yahoo's chart JSON; null when it does not read. The request is range=1d: with a longer range `chartPreviousClose` is the close BEFORE the range (measured 17/11: 95.82 over 5 days against 92.44 for the day), not the previous session's. Pure. */
export function parseYahooChart(json: unknown): { price: number; previousClose: number; time: string | null; currency: string } | null {
  const meta = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart?.result?.[0]?.meta
  if (!meta) return null
  const price = Number(meta.regularMarketPrice)
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose)
  if (!(price > 0) || !(prev > 0)) return null
  const t = Number(meta.regularMarketTime)
  return { price, previousClose: prev, time: t > 0 ? new Date(t * 1000).toISOString() : null, currency: typeof meta.currency === 'string' ? meta.currency : 'USD' }
}

export async function getOilPrice(which: string) {
  const o = OIL[(which || 'BRENT').trim().toUpperCase()] ?? OIL.BRENT
  const page = `https://finance.yahoo.com/quote/${encodeURIComponent(o.ticker)}/`
  const key = `market:oil:${o.ticker}`
  const hit = getCache(key)
  if (hit) return hit
  try {
    const p = parseYahooChart(JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(o.ticker)}?interval=1d&range=1d`)))
    if (!p) throw new Error('no_price')
    const result = {
      source: 'Yahoo Finance (futures quote)', source_url: page, kind: 'oil', instrument: o.name, unit: `${p.currency} per barrel`, price: round(p.price), previous_close: round(p.previousClose),
      change_vs_previous_close_pct: round(((p.price - p.previousClose) / p.previousClose) * 100, 1), change_note: 'computed by code from price and previous_close', as_of: p.time,
      note: 'The front-month futures contract; the quote can be delayed by minutes.',
    }
    setCache(key, result, 2 * 60 * 1000)
    return result
  } catch { return { error: 'fetch_failed', source: 'Yahoo Finance (futures quote)', source_url: page } }
}

export async function getMarketRate(kind: MarketKind, symbol: string) {
  if (kind === 'fx') return getFxRate(symbol)
  if (kind === 'crypto') return getCryptoPrice(symbol)
  return getOilPrice(symbol)
}
