import { describe, it, expect } from 'vitest'
import { parseAccesstradeCsv } from './accesstradeCsv'
import { decideFeedSource, FEED_FETCH_OPTIONS } from './source'

const HEADER = '"sku","name","url","price","discount","image","desc","category"'
const ROW = '"43152","iPhone 15 128GB | Chính hãng VN/A","https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb","22990000.0","21790000.0","https://cdn.example/img.jpg","desc, with comma","Điện thoại"'

describe('ACCESSTRADE CSV parser', () => {
  it('parses the verified header contract with quoted commas and both price columns', () => {
    const r = parseAccesstradeCsv(`${HEADER}\n${ROW}\n`, 'dienmayxanh.com.csv', { allowedHosts: ['www.dienmayxanh.com'] })
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ sku: '43152', price: 22990000, discount: 21790000, description: 'desc, with comma', category: 'Điện thoại', feedFile: 'dienmayxanh.com.csv' })
  })

  it('rejects rows whose product URL is not https on the merchant host (feed cannot inject foreign links)', () => {
    const bad = ROW.replace('https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb', 'http://evil.example/x')
    const r = parseAccesstradeCsv(`${HEADER}\n${bad}\n${ROW}`, 'f.csv', { allowedHosts: ['www.dienmayxanh.com'] })
    expect(r.items).toHaveLength(1)
    expect(r.rowsRejected).toBe(1)
  })

  it('throws on a header that does not match the contract', () => {
    expect(() => parseAccesstradeCsv('"a","b"\n1,2', 'f.csv', { allowedHosts: [] })).toThrow(/header missing/)
  })
})

describe('feed transport policy (D6)', () => {
  it('is disabled by default and never accepts http or the expired-TLS host', () => {
    expect(decideFeedSource('https://api.accesstrade.vn/v1/datafeeds', false)).toEqual({ ok: false, reason: 'ingest_disabled' })
    expect(decideFeedSource('http://datafeed.accesstrade.me/dienmayxanh.com.csv', true)).toEqual({ ok: false, reason: 'not_https' })
    expect(decideFeedSource('https://datafeed.accesstrade.me/dienmayxanh.com.csv', true)).toEqual({ ok: false, reason: 'known_broken_tls' })
    expect(decideFeedSource('https://evil.example/feed.csv', true)).toEqual({ ok: false, reason: 'host_not_allowed' })
    expect(decideFeedSource('https://api.accesstrade.vn/v1/datafeeds?merchant=dienmayxanh', true).ok).toBe(true)
  })

  it('fetch options can never disable certificate validation and refuse redirects', () => {
    expect(FEED_FETCH_OPTIONS.redirect).toBe('error')
    expect('rejectUnauthorized' in FEED_FETCH_OPTIONS).toBe(false)
    expect(Object.isFrozen(FEED_FETCH_OPTIONS)).toBe(true)
  })
})
