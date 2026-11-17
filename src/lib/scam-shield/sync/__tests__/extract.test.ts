import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contentHash, decodeEntities, isCompleteArticle, isoFromVnDate, isScamWarning, parseArticle, parseListing } from '../extract'

// Fixtures are excerpts captured on 18/11/2026 from the real pages of bocongan.gov.vn (images stripped, structure kept):
//   bocongan-listing-canh-bao-toi-pham.html  — the first six cards of /chuyen-muc/canh-bao-toi-pham-1750063351
//   bocongan-article-lua-dao-thai-nguyen.html — /bai-viet/kip-thoi-ngan-chan-lua-dao-qua-mang-bao-ve-tai-san-cho-nguoi-dan-1794452599
const fx = (name: string) => readFileSync(join(__dirname, '..', '__fixtures__', name), 'utf8')
const LISTING_URL = 'https://bocongan.gov.vn/chuyen-muc/canh-bao-toi-pham-1750063351'
const ARTICLE_URL = 'https://bocongan.gov.vn/bai-viet/kip-thoi-ngan-chan-lua-dao-qua-mang-bao-ve-tai-san-cho-nguoi-dan-1794452599'

describe('parseListing — the Ministry "Cảnh báo tội phạm" category', () => {
  const items = parseListing(fx('bocongan-listing-canh-bao-toi-pham.html'), LISTING_URL)

  it('reads one item per card with an absolute official URL, the title, the lead and the date', () => {
    expect(items).toHaveLength(6)
    const first = items[0]
    expect(first.url).toBe('https://bocongan.gov.vn/bai-viet/khoi-to-doi-tuong-mua-ban-27-tai-khoan-ngan-hang-de-thu-loi-bat-chinh-1794803009')
    expect(first.title).toBe('Khởi tố đối tượng mua bán 27 tài khoản ngân hàng để thu lợi bất chính')
    expect(first.publishedAt).toBe('2026-11-16')
    expect(items.map(i => i.publishedAt)).toEqual(['2026-11-16', '2026-11-13', '2026-11-13', '2026-11-11', '2026-11-10', '2026-11-10'])
    expect(first.lead).toContain('Công an tỉnh Hà Tĩnh')
    expect(first.lead).toContain('"Thu thập, tàng trữ') // &quot; decoded
    for (const i of items) {
      expect(i.url.startsWith('https://bocongan.gov.vn/bai-viet/')).toBe(true)
      expect(i.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('keeps only the scam warnings among the crime news (title or lead names a scam shape)', () => {
    const relevant = items.filter(isScamWarning)
    expect(relevant.length).toBeGreaterThan(0)
    expect(relevant.length).toBeLessThan(items.length)
    expect(items.find(i => /Cà Mau/.test(i.title) && /trộm cắp/.test(i.title))).toBeDefined()
    expect(relevant.some(i => /trộm cắp tài sản trị giá/.test(i.title))).toBe(false)
    expect(relevant.some(i => /lừa đảo/.test(i.title))).toBe(true)
  })

  it('ignores links that are not articles or are on another host', () => {
    const html = '<article><a href="/chuyen-muc/x"><h2>Not an article</h2></a></article><article><a href="https://evil.example/bai-viet/a-1"><h2>Offsite</h2></a></article>'
    expect(parseListing(html, LISTING_URL)).toEqual([])
  })
})

describe('parseArticle — an article page', () => {
  const a = parseArticle(fx('bocongan-article-lua-dao-thai-nguyen.html'), ARTICLE_URL)

  it('reads title, lead, date, author and the body paragraphs verbatim', () => {
    expect(a.title).toBe('Kịp thời ngăn chặn lừa đảo qua mạng, bảo vệ tài sản cho người dân')
    expect(a.publishedAt).toBe('2026-11-11')
    expect(a.lead).toMatch(/^Ngày 11\/11\/2026, Công an xã Đồng Hỷ/)
    expect(a.author).toBe('Nguyễn Minh - Nguyễn An')
    expect(a.paragraphs.length).toBeGreaterThanOrEqual(4)
    expect(a.paragraphs[0]).toMatch(/^Sáng 11\/11, bà N\.T\.H/)
    expect(a.paragraphs.at(-1)).toMatch(/khuyến cáo người dân nâng cao cảnh giác/)
    expect(a.paragraphs.join(' ')).not.toMatch(/<|&quot;|&amp;/)
  })

  it('a complete article passes; one with no body or no date does not', () => {
    expect(isCompleteArticle(a)).toBe(true)
    expect(isCompleteArticle({ ...a, paragraphs: [] })).toBe(false)
    expect(isCompleteArticle({ ...a, publishedAt: null })).toBe(false)
    expect(isCompleteArticle({ ...a, title: '' })).toBe(false)
    expect(isCompleteArticle({ ...a, paragraphs: ['short', 'stub'] })).toBe(false)
  })

  it('falls back to the JSON-LD date when the page prints none, and to nothing for an empty page', () => {
    const noVisibleDate = fx('bocongan-article-lua-dao-thai-nguyen.html').replace(/<p class="text-\[15px\][^>]*>11\/11\/2026<\/p>/, '')
    expect(parseArticle(noVisibleDate, ARTICLE_URL).publishedAt).toBe('2026-11-11')
    const empty = parseArticle('<html><body>nothing</body></html>', ARTICLE_URL)
    expect(empty).toMatchObject({ title: '', publishedAt: null, paragraphs: [] })
    expect(isCompleteArticle(empty)).toBe(false)
  })

  it('the content hash is stable and changes when the text changes', () => {
    const h = contentHash(a)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(contentHash(parseArticle(fx('bocongan-article-lua-dao-thai-nguyen.html'), ARTICLE_URL))).toBe(h)
    expect(contentHash({ ...a, paragraphs: [...a.paragraphs, 'Cập nhật.'] })).not.toBe(h)
  })
})

describe('helpers', () => {
  it('dates: dd/mm/yyyy to ISO, impossible dates refused', () => {
    expect(isoFromVnDate('08/09/2026')).toBe('2026-09-08')
    expect(isoFromVnDate('31/02/2026')).toBeNull()
    expect(isoFromVnDate('no date')).toBeNull()
  })
  it('entities are decoded, numeric ones too', () => {
    expect(decodeEntities('A &amp; B &quot;c&quot; &#39;d&#39; &#x41;')).toBe('A & B "c" \'d\' A')
  })
})
