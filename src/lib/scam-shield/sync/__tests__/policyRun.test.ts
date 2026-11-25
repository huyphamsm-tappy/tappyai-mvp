import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { KnowledgeVersionRow, KnowledgeVersionStore } from '../../knowledge/versions'
import { parseArticle } from '../extract'
import { decideStatus } from '../policy'
import { runScamShieldSync, type PageResult } from '../run'
import { parseAiStructured } from '../aiStructure'

const fx = (name: string) => readFileSync(join(__dirname, '..', '__fixtures__', name), 'utf8')
const LISTING = fx('bocongan-listing-canh-bao-toi-pham.html')
const ARTICLE = fx('bocongan-article-lua-dao-thai-nguyen.html')
const ARTICLE_URL = 'https://bocongan.gov.vn/bai-viet/kip-thoi-ngan-chan-lua-dao-qua-mang-bao-ve-tai-san-cho-nguoi-dan-1794452599'
const LISTING_URL = 'https://bocongan.gov.vn/chuyen-muc/canh-bao-toi-pham-1750063351'
const NOW = new Date('2026-11-18T03:00:00Z')

function memoryStore(seed: KnowledgeVersionRow[] = []): KnowledgeVersionStore & { rows: KnowledgeVersionRow[]; touched: string[] } {
  const rows = [...seed]
  const touched: string[] = []
  return {
    rows, touched,
    async listApproved(limit) { return rows.filter(r => r.status === 'approved').sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '')).slice(0, limit) },
    async hasHash(h) { return rows.some(r => r.content_hash === h) },
    async insert(row) { if (rows.some(r => r.content_hash === row.content_hash)) return false; rows.push({ ...row, version: rows.length + 1 }); return true },
    async touchVerified(h) { touched.push(h) },
  }
}

/** A fake site: the listing, plus every article URL answered with the one article fixture (its own URL differs per call). */
function fakeSite(over: Partial<Record<string, PageResult>> = {}) {
  const calls: string[] = []
  const fetchPage = async (url: string): Promise<PageResult> => {
    calls.push(url)
    if (over[url]) return over[url]!
    if (url === LISTING_URL) return { ok: true, body: LISTING, finalUrl: url }
    return { ok: true, body: ARTICLE, finalUrl: ARTICLE_URL }
  }
  return { fetchPage, calls }
}

describe('decideStatus — the auto-approval policy', () => {
  const article = parseArticle(ARTICLE, ARTICLE_URL)
  const base = { article, newestApprovedPublishedAt: '2026-09-08', now: NOW }

  it('approves an official https page, complete, newer than the last approved', () => {
    expect(decideStatus(base)).toEqual({ status: 'approved', reasons: [] })
    expect(decideStatus({ ...base, newestApprovedPublishedAt: null }).status).toBe('approved')
  })
  it('keeps a host that is not on the allow-list pending', () => {
    const d = decideStatus({ ...base, article: { ...article, url: 'https://news.example.com/bai-viet/x' } })
    expect(d.status).toBe('pending')
    expect(d.reasons).toContain('host_not_allowlisted_or_not_https')
  })
  it('keeps a look-alike host pending (suffix trick)', () => {
    expect(decideStatus({ ...base, article: { ...article, url: 'https://bocongan.gov.vn.evil.test/x' } }).status).toBe('pending')
  })
  it('keeps a plain-http page pending', () => {
    expect(decideStatus({ ...base, article: { ...article, url: 'http://bocongan.gov.vn/bai-viet/x' } }).reasons).toContain('host_not_allowlisted_or_not_https')
  })
  it('keeps a page that is not newer than the last approved one pending (older or same day)', () => {
    expect(decideStatus({ ...base, newestApprovedPublishedAt: '2026-11-11' }).reasons).toContain('not_newer_than_last_approved')
    expect(decideStatus({ ...base, newestApprovedPublishedAt: '2026-12-01' }).reasons).toContain('not_newer_than_last_approved')
  })
  it('keeps an incomplete extraction pending', () => {
    expect(decideStatus({ ...base, article: { ...article, paragraphs: [] } }).reasons).toContain('extraction_incomplete')
    expect(decideStatus({ ...base, article: { ...article, publishedAt: null } }).status).toBe('pending')
  })
  it('keeps a date in the future pending', () => {
    expect(decideStatus({ ...base, article: { ...article, publishedAt: '2027-01-01' } }).reasons).toContain('date_in_future')
  })
})

describe('runScamShieldSync', () => {
  it('stores each new scam-warning article, oldest first, and approves those that pass the policy', async () => {
    const store = memoryStore()
    const site = fakeSite()
    const report = await runScamShieldSync({ store, fetchPage: site.fetchPage, now: () => NOW, pause: async () => {} })
    expect(report.errors).toEqual([])
    expect(report.sources[0]).toMatchObject({ listingOk: true, listed: 6 })
    expect(site.calls[0]).toBe(LISTING_URL)
    // every article URL the fake site answered with the SAME page (same hash): one row, the rest are "unchanged"
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ status: 'approved', host: 'bocongan.gov.vn', published_at: '2026-11-11', verified_at: NOW.toISOString() })
    expect(store.rows[0].body).toContain('Sáng 11/11, bà N.T.H')
    expect(store.rows[0].content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(report.inserted).toEqual([{ url: ARTICLE_URL, status: 'approved', reasons: [] }])
  })

  it('HASH-SKIP: a second run with unchanged pages stores nothing and re-verifies the row', async () => {
    const store = memoryStore()
    const run = () => runScamShieldSync({ store, fetchPage: fakeSite().fetchPage, now: () => NOW, pause: async () => {} })
    await run()
    const before = store.rows.length
    const second = await run()
    expect(store.rows).toHaveLength(before)
    expect(second.inserted).toEqual([])
    expect(second.unchanged).toBeGreaterThan(0)
    expect(store.touched).toContain(store.rows[0].content_hash)
  })

  it('a changed page is a new row (new hash), judged against the baseline again', async () => {
    const store = memoryStore()
    await runScamShieldSync({ store, fetchPage: fakeSite().fetchPage, now: () => NOW, pause: async () => {} })
    const changed = ARTICLE.replace('Sáng 11/11, bà N.T.H', 'Sáng 11/11 (đã cập nhật), bà N.T.H')
    const r = await runScamShieldSync({ store, fetchPage: fakeSite({ [ARTICLE_URL]: { ok: true, body: changed, finalUrl: ARTICLE_URL } }).fetchPage, now: () => NOW, pause: async () => {} })
    expect(store.rows).toHaveLength(2)
    // same published date as the approved one → not NEWER → pending for a person
    expect(r.inserted[0]).toMatchObject({ status: 'pending', reasons: ['not_newer_than_last_approved'] })
    expect(store.rows[1].verified_at).toBeNull()
  })

  it('never follows a redirect off the allow-list: the page is skipped, nothing stored', async () => {
    const store = memoryStore()
    const site = fakeSite({ [ARTICLE_URL]: { ok: true, body: ARTICLE, finalUrl: 'https://evil.example/bai-viet/x' } })
    const r = await runScamShieldSync({ store, fetchPage: async u => (u === LISTING_URL ? site.fetchPage(u) : { ok: true, body: ARTICLE, finalUrl: 'https://evil.example/bai-viet/x' }), now: () => NOW, pause: async () => {} })
    expect(store.rows).toHaveLength(0)
    expect(r.skipped.every(s => s.reason === 'redirected_off_allowlist')).toBe(true)
  })

  it('a source whose listing is not an official host is never fetched', async () => {
    const store = memoryStore()
    const calls: string[] = []
    const r = await runScamShieldSync({ store, fetchPage: async u => { calls.push(u); return { ok: false, reason: 'x' } }, now: () => NOW, pause: async () => {}, sources: [{ id: 's', listingUrl: 'https://news.example.com/list', organization: 'x' }] })
    expect(calls).toEqual([])
    expect(r.errors).toEqual(['s: listing_not_official'])
  })

  it('a failed listing or article fetch is reported, not thrown', async () => {
    const store = memoryStore()
    const down = await runScamShieldSync({ store, fetchPage: async () => ({ ok: false, reason: 'connect_timeout' }), now: () => NOW, pause: async () => {} })
    expect(down.errors).toEqual(['bocongan-canh-bao-toi-pham: listing_connect_timeout'])
    const partial = await runScamShieldSync({ store, fetchPage: async u => (u === LISTING_URL ? { ok: true, body: LISTING, finalUrl: u } : { ok: false, reason: 'http_error' }), now: () => NOW, pause: async () => {} })
    expect(partial.errors).toEqual([])
    expect(partial.skipped.length).toBeGreaterThan(0)
  })

  it('when the table is missing or the database is down nothing is crawled and the report says so', async () => {
    const broken: KnowledgeVersionStore = { ...memoryStore(), listApproved: async () => { throw new Error('relation does not exist') } }
    const calls: string[] = []
    const r = await runScamShieldSync({ store: broken, fetchPage: async u => { calls.push(u); return { ok: false, reason: 'x' } }, now: () => NOW, pause: async () => {} })
    expect(r.errors).toEqual(['store_unavailable'])
    expect(calls).toEqual([])
  })

  it('caps the articles read per run', async () => {
    const site = fakeSite()
    await runScamShieldSync({ store: memoryStore(), fetchPage: site.fetchPage, now: () => NOW, pause: async () => {}, maxArticles: 1 })
    expect(site.calls).toHaveLength(2) // the listing + one article
  })

  it('the model step is optional: its reading is stored BESIDE the verbatim text, never instead of it', async () => {
    const store = memoryStore()
    await runScamShieldSync({ store, fetchPage: fakeSite().fetchPage, now: () => NOW, pause: async () => {}, structure: async () => ({ machine_made: true, name: 'Giả công an' }) })
    expect(store.rows[0].structured).toMatchObject({ ai: { machine_made: true, name: 'Giả công an' }, policy: { reasons: [] } })
    expect(store.rows[0].body).toContain('Sáng 11/11, bà N.T.H')
    expect(store.rows[0].title).toBe('Kịp thời ngăn chặn lừa đảo qua mạng, bảo vệ tài sản cho người dân')

    const off = memoryStore()
    await runScamShieldSync({ store: off, fetchPage: fakeSite().fetchPage, now: () => NOW, pause: async () => {} })
    expect(off.rows[0].structured).not.toHaveProperty('ai')
  })
})

describe('parseAiStructured', () => {
  it('bounds and validates the model JSON; garbage is null', () => {
    const ok = parseAiStructured('```json\n{"name":"Giả công an","how_it_works":"Gọi video","red_flags":["a","b","c","d","e","f"],"what_to_do":["x"]}\n```')
    expect(ok).toMatchObject({ machine_made: true, name: 'Giả công an' })
    expect(ok!.red_flags).toHaveLength(5)
    expect(parseAiStructured('no json here')).toBeNull()
    expect(parseAiStructured('{"name":"","red_flags":[]}')).toBeNull()
  })
})
