// @vitest-environment jsdom
// TAPPY_ANSWER_V4 layer 2 — the article layout (ArticleAnswer): block typography, item pictures placed next to THEIR item (matched by title in
// any script), unsafe picture URLs never rendered, every inline run still through the chat formatter (escaping: no raw HTML from the text).
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArticleAnswer, EntityRow, summaryOpening } from './ArticleAnswer'
import { formatMessage } from '@/components/ChatInterface'
import type { DocItemImage } from '@/lib/answerDoc/media'

const render = (text: string, images: DocItemImage[] = []) => renderToStaticMarkup(<ArticleAnswer text={text} images={images} format={formatMessage} />)
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d }

const ART = 'Trời mưa thử mấy món này:\n\n## Món nước\n1. **Lẩu Thái** – chua cay\n2. **Phở bò** – thơm\n\n> Mẹo: gọi sớm.\n\n---\nChúc ngon miệng!'

describe('ArticleAnswer', () => {
  it('blocks get their own elements: heading, ordered list, quote, rule, paragraphs', () => {
    const d = dom(render(ART))
    expect(d.querySelectorAll('ol > li')).toHaveLength(2)
    expect(d.querySelector('ol')!.className).toContain('list-decimal')
    expect(d.querySelector('hr')).not.toBeNull()
    expect(d.textContent).toContain('Món nước')
    expect(d.querySelector('strong')!.textContent).toBe('Lẩu Thái')
    expect(d.textContent).not.toContain('**')
    expect(d.textContent).not.toContain('## ')
  })

  it('each picture sits in the list item it belongs to; an unmatched picture is not shown', () => {
    const d = dom(render(ART, [
      { title: 'phở BÒ', src: 'https://img.example/pho.jpg', source: 'web' },
      { title: 'Món không có trong bài', src: 'https://img.example/x.jpg', source: 'web' },
    ]))
    const items = d.querySelectorAll('ol > li')
    expect(items[0].querySelector('img')).toBeNull()
    expect(items[1].querySelector('img')!.getAttribute('src')).toBe('https://img.example/pho.jpg')
    expect(d.querySelectorAll('img')).toHaveLength(1)
  })

  it('a section heading gets its picture under it (one section per item)', () => {
    const d = dom(render('### Ngày 1 – Hồ Xuân Hương\nĐi dạo.\n\n### Ngày 2 – Đồi chè\nNgắm bình minh.', [{ title: 'Ngày 2', src: 'https://upload.wikimedia.org/d.jpg', source: 'wikipedia', href: 'https://vi.wikipedia.org/wiki/Da_Lat' }]))
    const img = d.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://upload.wikimedia.org/d.jpg')
    expect(img.closest('a')!.getAttribute('href')).toBe('https://vi.wikipedia.org/wiki/Da_Lat')
  })

  it('an unsafe picture URL is never rendered; raw HTML in the answer stays text', () => {
    const d = dom(render('- **A món** <img src=x onerror=alert(1)>\n- **B món** y', [{ title: 'A món', src: 'http://img.example/a.jpg', source: 'web' }]))
    expect(d.querySelectorAll('img')).toHaveLength(0)
    expect(d.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('Thai item titles match their pictures', () => {
    const d = dom(render('- **ต้มยำกุ้ง** – เผ็ด\n- **ผัดไทย** – หวาน', [{ title: 'ผัดไทย', src: 'https://img.example/pt.jpg', source: 'web' }]))
    expect(d.querySelectorAll('li')[1].querySelector('img')).not.toBeNull()
  })

  it('a long summary shows its OPENING, cut at a word, with "…" (UAT 19/10: the clamped card showed the end)', () => {
    const s = 'Elon Reeve Musk là một doanh nhân, nổi tiếng với vai trò mấu chốt trong hai công ty Tesla, Inc. và SpaceX, cũng như chủ sở hữu của Twitter. Musk là người giàu nhất thế giới.'
    const o = summaryOpening(s)
    expect(o.startsWith('Elon Reeve Musk là một doanh nhân')).toBe(true)
    expect(o.endsWith('…')).toBe(true)
    expect(o.length).toBeLessThanOrEqual(151)
    expect(s.startsWith(o.slice(0, -1))).toBe(true)
    expect(summaryOpening('Ngắn.')).toBe('Ngắn.')
  })

  it('EntityRow: two or more Wikipedia subjects side by side; non-Wikipedia links dropped', () => {
    const e = (n: string, href = `https://en.wikipedia.org/wiki/${n}`) => ({ name: n, summary: `${n} …`, href, image: `https://upload.wikimedia.org/${n}.jpg`, source: 'Wikipedia' as const })
    const d = dom(renderToStaticMarkup(<EntityRow entities={[e('Elon_Musk'), e('Mark_Zuckerberg')]} onOpen={() => {}} />))
    expect(d.querySelectorAll('[role="button"]')).toHaveLength(2)
    expect(d.querySelector('[role="button"] p')!.textContent).toBe('Elon_Musk …')
    expect(renderToStaticMarkup(<EntityRow entities={[e('A'), e('B', 'https://evil.example/B')]} onOpen={() => {}} />)).toBe('')
  })
})
