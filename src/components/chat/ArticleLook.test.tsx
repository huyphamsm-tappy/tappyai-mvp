// 15/11 (owner's mockup): the source line under a data table, the picture names on the grid.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArticleAnswer, ImageGrid } from './ArticleAnswer'

const fmt = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
const html = (text: string, look = true) => renderToStaticMarkup(<ArticleAnswer text={text} images={[]} format={fmt} presentation={{ variant: 'editorial', look }} />)
const TABLE = '| Dầu | Giá |\n|---|---|\n| Brent | 95,84 |\n| WTI | 88,56 |'

describe('the line straight under a data table', () => {
  it('one short line right after a table is its caption in the look layout', () => {
    const h = html(`Giá dầu hôm nay.\n\nBảng giá:\n\n${TABLE}\n\nNguồn: Reuters, 13/11/2026.\n\nĐoạn bình thường sau đó.`)
    expect(h).toContain('v206-caption')
    expect(h.match(/v206-caption/g)).toHaveLength(1)
  })
  it('a paragraph that is not right after a table, a long one, a multi-line one and the plain layout stay ordinary', () => {
    expect(html('Giá dầu hôm nay.\n\nMột câu ngắn không đứng sau bảng.')).not.toContain('v206-caption')
    expect(html(`${TABLE}\n\n${'Rất dài. '.repeat(40)}`)).not.toContain('v206-caption')
    expect(html(`${TABLE}\n\nDòng một\nDòng hai`)).not.toContain('v206-caption')
    expect(html(`${TABLE}\n\nNguồn: Reuters.`, false)).not.toContain('v206-caption')
  })
})

describe('the picture grid', () => {
  const img = (t: string) => ({ title: t, src: `https://upload.wikimedia.org/${t}.jpg`, source: 'wikipedia' as const })
  it('each picture carries its name as a small caption; no title, no caption', () => {
    const h = renderToStaticMarkup(<ImageGrid images={[img('Model S'), img('Model 3'), img('Cybertruck')]} />)
    expect(h.match(/data-doc-caption/g)).toHaveLength(3)
    expect(h).toContain('Cybertruck')
    const none = renderToStaticMarkup(<ImageGrid images={[img(''), img(''), img('')]} />)
    expect(none).not.toContain('data-doc-caption')
    expect(renderToStaticMarkup(<ImageGrid images={[img('a'), img('b')]} />)).toBe('')
  })
})
