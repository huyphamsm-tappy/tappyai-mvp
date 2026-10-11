// POST-UAT B1 (2026-10-09): UAT-01 showed raw ``` fences, UAT-08 raw table pipes. formatMessage renders fenced code (with a
// language label), inline code and GFM tables — escaped, never interpreted, and without breaking links, bold, lists or images.
import { describe, it, expect } from 'vitest'
import { formatMessage } from './ChatInterface'

describe('POST-UAT B1 · fenced code blocks', () => {
  it('Python block: language label, escaped content, no raw fence, no bold / link transforms inside', () => {
    const html = formatMessage('Ví dụ:\n\n```python\nfor i in range(3):\n    print("**hi** <b>", i)  # https://x.example\n```\n\nXong.')
    expect(html).not.toContain('```')
    expect(html).toContain('data-md="code"')
    expect(html).toContain('data-lang="python"')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
    expect(html).toContain('**hi**')            // not bolded inside code
    expect(html).not.toMatch(/<a [^>]*x\.example/) // not chipped inside code
    expect(html).toContain('    print(')       // indentation kept
    expect(html).toMatch(/Xong\./)
  })
  it('JavaScript block and plain (no language) block', () => {
    const js = formatMessage('```js\nconst a = `x` && b < c\n```')
    expect(js).toContain('data-lang="js"')
    expect(js).toContain('&amp;&amp; b &lt; c')
    const plain = formatMessage('```\nnpm run dev\n```')
    expect(plain).toContain('data-md="code"')
    expect(plain).not.toContain('data-lang')
  })
  it('an unclosed fence mid-stream renders as code (no stray ```), and closes cleanly once complete', () => {
    const mid = formatMessage('Đây:\n```python\nprint(1)\nprint(')
    expect(mid).not.toContain('```')
    expect(mid).toContain('data-md="code"')
    const done = formatMessage('Đây:\n```python\nprint(1)\nprint(2)\n```\nHết.')
    expect(done).toContain('print(2)')
    expect(done).toMatch(/Hết\./)
  })
  it('inline code is escaped and not bolded', () => {
    const html = formatMessage('Gõ `pip install **x** <y>` rồi chạy.')
    expect(html).toMatch(/<code[^>]*>pip install \*\*x\*\* &lt;y&gt;<\/code>/)
  })
  it('no unsafe HTML: a <script> in a code block or prose is inert text', () => {
    const html = formatMessage('<script>alert(1)</script>\n```html\n<img src=x onerror=alert(1)>\n```')
    expect(html).not.toMatch(/<script|<img src=x/)
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('POST-UAT B1 · tables', () => {
  const table = '| Loại vàng | Mua vào | Bán ra |\n|---|---:|---:|\n| SJC 9999 | 140,0 | 143,0 |\n| Nhẫn **9999** | 138,5 | 141,5 |'
  it('UAT-08 shape: a table renders as <table>, cells kept, no raw pipes, bold inside a cell works', () => {
    const html = formatMessage(`Giá vàng hôm nay:\n\n${table}\n\nNguồn: vang.today`)
    expect(html).toContain('data-md="table"')
    expect(html).toMatch(/<th[^>]*>Loại vàng<\/th>/)
    expect(html).toMatch(/<td[^>]*text-align:right[^>]*>143,0<\/td>/)
    expect(html).toContain('<strong>9999</strong>')
    expect(html).not.toMatch(/\|---/)
    expect(html).not.toMatch(/\| SJC/)
    expect(html).toMatch(/Nguồn: vang\.today/)
  })
  it('the table markup has no newlines (the body is pre-wrap)', () => {
    const html = formatMessage(table)
    const t = html.slice(html.indexOf('<div class="my-2 overflow-x-auto'), html.indexOf('</table></div>'))
    expect(t).not.toContain('\n')
  })
  it('mixed paragraph / table / list / link / citation all render', () => {
    const html = formatMessage(`So sánh nhanh:\n\n${table}\n\n- Ý 1\n- Ý 2\n\n1. Bước một\n\nXem [nguồn](https://vnexpress.net/a.html) (VnExpress).`)
    expect(html).toContain('<table')
    expect(html).toContain('<ul class="list-disc')
    expect(html).toMatch(/1\.<\/span><span>Bước một/)
    expect(html).toMatch(/<a href="https:\/\/vnexpress\.net\/a\.html"/)
  })
  it('a pipe in ordinary prose is not a table', () => {
    const html = formatMessage('Chọn A | B tùy bạn.')
    expect(html).not.toContain('<table')
  })
  it('a table that is still streaming (no separator yet) stays text until it is complete', () => {
    expect(formatMessage('| Loại | Giá |')).not.toContain('<table')
  })
})

describe('POST-UAT B1 · existing behaviour unchanged', () => {
  it('bold, headings, bullets, links and images still render as before', () => {
    const html = formatMessage('## Tiêu đề\n**Đậm** và *nghiêng*\n- một\n[Bản đồ](https://maps.google.com/?q=x)\n![ảnh](https://lh3.googleusercontent.com/a.jpg)')
    expect(html).toContain('<div class="font-semibold text-base mt-3 mb-1">Tiêu đề</div>')
    expect(html).toContain('<strong>Đậm</strong>')
    expect(html).toContain('<em>nghiêng</em>')
    expect(html).toContain('<li>một</li>')
    expect(html).toMatch(/<a href="https:\/\/maps\.google\.com/)
    expect(html).toMatch(/<img src="https:\/\/lh3\.googleusercontent\.com\/a\.jpg"/)
  })
})

describe('POST-UAT B1 · no empty line painted around a block (pre-wrap body; measured on the post-fix UAT-01 / UAT-08 shots)', () => {
  it('newlines next to a code block or a table are dropped, text newlines elsewhere stay', () => {
    const html = formatMessage('Ví dụ:\n\n```python\nprint(1)\n```\n\nXong.\nDòng hai.')
    expect(html).not.toMatch(/\n<div class="my-2[^"]*" data-md="code"/)
    expect(html).not.toMatch(/<\/pre><\/div>\n/)
    expect(html).toContain('Xong.\nDòng hai.')
    const t = formatMessage('Bảng:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nHết.')
    expect(t).not.toMatch(/\n<div class="my-2 overflow-x-auto/)
    expect(t).not.toMatch(/<\/table><\/div>\n/)
  })
})
