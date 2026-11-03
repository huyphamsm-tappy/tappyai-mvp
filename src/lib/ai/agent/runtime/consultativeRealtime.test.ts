// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { RUNTIME_LIMITS } from './limits'
import { unreadableSourceLinks } from './unreadableSources'
import { createPageReader, __resetPageCache } from './readPage'
import { EvidenceLedger } from './evidence'
import { AgentRunTrace } from './trace'
import { buildActions, directionsUrl } from '@/lib/recommendation/actions'
import { CONSULT_PRINCIPLES } from './consultativeVoice'
import { citeSources } from '@/lib/ai/streamEnrichment'

// CONSULTATIVE_IN_AGENT — realtime and links, 11/10: read more official pages in one turn (no Serper credit, same deadline), show a source button
// when a page could not be read, and a code-built "Directions" button. Each piece is pinned in both directions (flag on / off).

afterEach(() => { __resetPageCache(); delete process.env.CONSULTATIVE_IN_AGENT; delete process.env.TAPPY_AGENT })

describe('page budget: 4 pages by default, 6 under the flag, nothing else moves', () => {
  it('limits: the default budget and every other ceiling are unchanged; the flag budget is 6', () => {
    expect(RUNTIME_LIMITS).toMatchObject({ maxPageReads: 4, maxToolCalls: 8, serperCredits: 8, serperCreditsTravel: 10, deadlineMs: 85_000, maxPageReadsConsult: 6 })
  })

  it('the reader honours the budget it is given (4 → the fifth page is refused; 6 → the fifth and sixth are read) — public pages only, no credit', async () => {
    const urls = Array.from({ length: 7 }, (_, k) => `https://example.gov.vn/p${k}`)
    const fetchPage = async (u: string) => ({ ok: true as const, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: `<html><head><title>t</title></head><body><main><p>Giá xăng RON 95 là 21.000 đồng một lít.</p></main></body></html>`, bytes: 100, truncated: false, redirects: 0, ms: 1 })
    for (const [max, okExpected] of [[4, 4], [6, 6]] as const) {
      __resetPageCache()
      const reader = createPageReader({ ledger: new EvidenceLedger(), allowed: () => true, trace: new AgentRunTrace({ messageCount: 1, provider: 't', serperLimit: 8, deadlineMs: 85_000, flag: 'test' } as never), lang: 'vi', maxReads: max, fetchPage })
      // one call opens at most 3 pages in parallel; three calls = the 7 URLs
      const pages = [
        ...await reader.readMany(urls.slice(0, 3), 'giá xăng', 'price' as never),
        ...await reader.readMany(urls.slice(3, 6), 'giá xăng', 'price' as never),
        ...await reader.readMany(urls.slice(6), 'giá xăng', 'price' as never),
      ]
      expect(pages.filter(p => !p.error).length, `budget ${max}`).toBe(okExpected)
      expect(pages.filter(p => p.error === 'page_budget_exhausted').length).toBe(urls.length - okExpected)
    }
  })

  it('wiring: the runtime picks the larger budget only when i.consultative is true', () => {
    const src = readFileSync('src/lib/ai/agent/runtime/index.ts', 'utf8')
    expect(src).toMatch(/maxReads: i\.consultative === true \? RUNTIME_LIMITS\.maxPageReadsConsult : RUNTIME_LIMITS\.maxPageReads/)
  })
})

describe('source buttons for pages that could not be read', () => {
  const results = [{
    results: [
      { link: 'https://www.gso.gov.vn/gia-xang', title: 'Giá xăng — Tổng cục Thống kê', host: 'gso.gov.vn' },
      { link: 'https://vnexpress.net/gia-xang', title: 'Giá xăng hôm nay', host: 'vnexpress.net' },
      { link: 'https://vnexpress.net/khac', title: 'Bài khác cùng host', host: 'vnexpress.net' },
      { link: 'http://insecure.example/x', title: 'không https' },
    ],
    pages: [{ url: 'https://vnexpress.net/gia-xang', error: 'page_unreadable', reason: 'http_error' }],
  }]

  it('a reply that says it could not verify gets up to 2 sources — the tried-and-failed page first, one per host, https only', () => {
    const l = unreadableSourceLinks(results, 'Mình chưa xác minh được giá xăng hôm nay từ trang chính thức.')
    expect(l.map(x => x.host)).toEqual(['vnexpress.net', 'gso.gov.vn'])
    expect(l.every(x => x.url.startsWith('https://'))).toBe(true)
    expect(l[0].id).toBe('S1')
  })

  it('NOT offered when the reply states the fact as verified, or already cites [S1]', () => {
    expect(unreadableSourceLinks(results, 'Giá xăng RON 95 hôm nay là 21.000 đồng một lít.')).toEqual([])
    expect(unreadableSourceLinks(results, 'Mình chưa xác minh được phần này [S1].')).toEqual([])
    expect(unreadableSourceLinks([], 'Mình chưa xác minh được giá.')).toEqual([])
  })

  it('the citation step renders them as ONE "Nguồn:" line with the tool-returned URLs (and only those)', () => {
    const l = unreadableSourceLinks(results, 'Mình chưa xác minh được giá xăng.')
    const allowed = new Set(l.map(x => x.url.toLowerCase().replace(/\/$/, '')))
    const out = citeSources('Mình chưa xác minh được giá xăng.', l, allowed, 'vi')
    expect(out).toMatch(/\n\nNguồn: \[vnexpress\.net\]\(https:\/\/vnexpress\.net\/gia-xang\) · \[gso\.gov\.vn\]/)
  })

  it('wiring: only with i.consultative, and only after a turn with no readable page and no editorial link', () => {
    const src = readFileSync('src/lib/ai/agent/runtime/index.ts', 'utf8')
    expect(src).toMatch(/else if \(i\.consultative === true\) \{[\s\S]*unreadableSourceLinks\(\[\.\.\.lastResults\.values\(\)\], run\.text\)/)
  })
})

describe('Directions button (Google Maps URLs API, built by code)', () => {
  const row = { name: 'Bếp Ông Cậu', address: '12 Lý Tự Trọng, Quận 1, TP.HCM', place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4', maps_link: 'https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4' }
  const kinds = () => buildActions(row, 'food').map(a => a.kind)

  it('flag OFF: no directions action (the action list is what it was)', () => {
    expect(kinds()).not.toContain('directions')
  })

  it('flag ON: one https directions action from the row\'s own name + address + place id; opens the Maps directions page', () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'; process.env.TAPPY_AGENT = '2'
    const a = buildActions(row, 'food').find(x => x.kind === 'directions')
    expect(a).toBeTruthy()
    expect(a!.urlKind).toBe('direct')
    const u = new URL(a!.url)
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(u.searchParams.get('api')).toBe('1')
    expect(u.searchParams.get('destination')).toBe('Bếp Ông Cậu, 12 Lý Tự Trọng, Quận 1, TP.HCM')
    expect(u.searchParams.get('destination_place_id')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
    expect(a!.url).not.toMatch(/^(grab|shopee|momo|tel):/)
  })

  it('flag ON but nothing to anchor the destination on (no address and no Google place id): no button rather than a wrong one', () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'; process.env.TAPPY_AGENT = '2'
    expect(directionsUrl('Quán A', undefined, undefined)).toBeNull()
    expect(directionsUrl('Quán A', undefined, 'node/12345')).toBeNull()
    expect(buildActions({ name: 'Quán A', maps_link: 'https://www.google.com/maps/place/?q=Quán+A' }, 'food').map(a => a.kind)).not.toContain('directions')
    expect(directionsUrl('Quán A', '1 Hai Bà Trưng', undefined)).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Qu/)
  })
})

describe('principles: blocked pages and cross-checking', () => {
  it('say what to do without letting the model write a link', () => {
    expect(CONSULT_PRINCIPLES).toContain('mở thêm vài trang chính thức hoặc báo uy tín để đối chiếu thay vì tin một nguồn')
    expect(CONSULT_PRINCIPLES).toContain('Trang chặn đọc hoặc không có số liệu: nói thẳng MỘT lần là phần đó chưa xác minh được, không bịa; hệ thống có thể tự kèm nút nguồn nên đừng tự dán link')
    expect(CONSULT_PRINCIPLES).toContain('Bạn không tự viết link')
  })
})
