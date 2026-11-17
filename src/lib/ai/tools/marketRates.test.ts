import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseVcbXml, vcbStampToIso, parseYahooChart, getFxRate, getCryptoPrice, getOilPrice } from './marketRates'
import { setCache } from './common'

const XML = `<!--For reference only-->
<ExrateList>
  <DateTime>11/17/2026 3:16:45 PM</DateTime>
  <Exrate CurrencyCode="USD" CurrencyName="US DOLLAR" Buy="25,520.00" Transfer="25,550.00" Sell="25,930.00" />
  <Exrate CurrencyCode="DKK" CurrencyName="DANISH KRONE" Buy="-" Transfer="3,719.00" Sell="3,870.00" />
</ExrateList>`

let calls: string[] = []
const reply = (routes: Record<string, string | number>) => vi.fn(async (url: string) => {
  calls.push(String(url))
  const hit = Object.entries(routes).find(([k]) => String(url).includes(k))
  if (!hit) throw new Error('unrouted ' + url)
  if (typeof hit[1] === 'number') return new Response('x', { status: hit[1] })
  return new Response(hit[1], { status: 200 })
})
const clear = () => { for (const k of ['market:vcb', 'market:oil:BZ=F', 'market:oil:CL=F']) setCache(k, null, 1) }

beforeEach(() => { calls = []; clear() })
afterEach(() => { vi.unstubAllGlobals(); clear() })

describe('Vietcombank feed', () => {
  it('reads rows and its own timestamp; "-" is no number; the stamp becomes an instant in Vietnam time', () => {
    const p = parseVcbXml(XML)
    expect(p.rows).toEqual([
      { code: 'USD', name: 'US DOLLAR', buy: 25520, transfer: 25550, sell: 25930 },
      { code: 'DKK', name: 'DANISH KRONE', buy: null, transfer: 3719, sell: 3870 },
    ])
    expect(vcbStampToIso(p.stamp)).toBe('2026-11-17T15:16:45+07:00')
    expect(vcbStampToIso('11/17/2026 12:05:00 AM')).toBe('2026-11-17T00:05:00+07:00')
    expect(vcbStampToIso('11/17/2026 12:05:00 PM')).toBe('2026-11-17T12:05:00+07:00')
    expect(vcbStampToIso('junk')).toBeNull()
  })
  it('a currency answer names the bank, its page and the time; an unlisted currency lists what exists; a failure is an error, never a number', async () => {
    vi.stubGlobal('fetch', reply({ 'pXML.aspx': XML }))
    const r = await getFxRate('usd') as Record<string, unknown>
    expect(r).toMatchObject({ source: 'Vietcombank', currency: 'USD', buy: 25520, transfer: 25550, sell: 25930, as_of: '2026-11-17T15:16:45+07:00' })
    expect(String(r.source_url)).toContain('vietcombank.com.vn')
    expect(await getFxRate('XYZ')).toMatchObject({ error: 'currency_not_listed', listed: ['USD', 'DKK'] })
    clear()
    vi.stubGlobal('fetch', reply({ 'pXML.aspx': 500 }))
    expect(await getFxRate('USD')).toMatchObject({ error: 'fetch_failed', source: 'Vietcombank' })
  })
  it('one request per five minutes: the second call is served from the cache', async () => {
    const f = reply({ 'pXML.aspx': XML }); vi.stubGlobal('fetch', f)
    await getFxRate('USD'); await getFxRate('DKK')
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('Coinbase spot', () => {
  it('the weekly change is computed by code from the two prices; the VND figure is marked an estimate', async () => {
    vi.stubGlobal('fetch', reply({ 'date=': JSON.stringify({ data: { amount: '2000.00' } }), '/spot': JSON.stringify({ data: { amount: '1800.00' } }), 'pXML.aspx': XML }))
    const r = await getCryptoPrice('eth', new Date('2026-11-17T08:00:00Z')) as Record<string, unknown>
    expect(r).toMatchObject({ source: 'Coinbase', symbol: 'ETH', price_usd: 1800, week_ago_date: '2026-11-10', week_ago_price_usd: 2000, change_vs_week_ago_pct: -10 })
    expect(r.source_url).toBe('https://www.coinbase.com/price/ethereum')
    expect(r.vnd_estimate).toMatchObject({ usd_vnd_transfer: 25550, price_vnd: 45_990_000, week_ago_price_vnd: 51_100_000 })
    expect(calls.some(u => u.includes('ETH-USD/spot?date=2026-11-10'))).toBe(true)
  })
  it('no price a week back: no weekly change is given, and the answer says not to state one; no price at all: an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { if (String(u).includes('date=')) throw new Error('no'); if (String(u).includes('pXML')) return new Response(XML); return new Response(JSON.stringify({ data: { amount: '5.5' } })) }))
    const r = await getCryptoPrice('xyz1', new Date('2026-11-17T08:01:00Z')) as Record<string, unknown>
    expect(r.change_vs_week_ago_pct).toBeUndefined()
    expect(String(r.change_note)).toContain('do not state')
    vi.stubGlobal('fetch', reply({ '/spot': 404 }))
    expect(await getCryptoPrice('nopeco', new Date('2026-11-17T08:02:00Z'))).toMatchObject({ error: 'fetch_failed_or_unknown_symbol' })
  })
  it('a symbol is cleaned to letters and digits: nothing else reaches the URL', async () => {
    const f = reply({ '/spot': JSON.stringify({ data: { amount: '1' } }), 'pXML.aspx': XML }); vi.stubGlobal('fetch', f)
    await getCryptoPrice('eth/../../x?a=b', new Date('2026-11-17T08:03:00Z'))
    expect(calls.every(u => !u.includes('..') && !u.includes('a=b'))).toBe(true)
  })
})

describe('oil futures', () => {
  const chart = (price: number, prev: number) => JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: price, chartPreviousClose: prev, regularMarketTime: 1794902991 } }] } })
  it('reads price and previous close; the change is computed by code; the request asks for ONE day (a longer range makes the previous close the one before the range)', async () => {
    vi.stubGlobal('fetch', reply({ 'BZ%3DF': chart(91.76, 92.44) }))
    const r = await getOilPrice('brent') as Record<string, unknown>
    expect(r).toMatchObject({ instrument: 'Brent crude (futures)', price: 91.76, previous_close: 92.44, change_vs_previous_close_pct: -0.7, unit: 'USD per barrel' })
    expect(calls[0]).toContain('range=1d')
    expect(String(r.source_url)).toContain('finance.yahoo.com')
  })
  it('WTI is its own ticker; a malformed reply or a failure is an error, never a number', async () => {
    vi.stubGlobal('fetch', reply({ 'CL%3DF': chart(88, 87) }))
    expect(await getOilPrice('wti')).toMatchObject({ instrument: 'WTI crude (futures)', price: 88 })
    expect(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } })).toBeNull()
    expect(parseYahooChart(null)).toBeNull()
    clear()
    vi.stubGlobal('fetch', reply({ 'BZ%3DF': 503 }))
    expect(await getOilPrice('brent')).toMatchObject({ error: 'fetch_failed' })
  })
})
