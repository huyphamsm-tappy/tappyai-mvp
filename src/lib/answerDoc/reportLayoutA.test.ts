import { describe, it, expect } from 'vitest'
import { reportHtml } from './reportExport'

const fmt = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const base = { title: 'Xu hướng trà sữa <Hà Nội>', images: [], links: [{ id: 1, title: 'A', url: 'https://a.vn/' }, { id: 2, title: 'B', url: 'https://b.vn/' }], format: fmt, lang: 'vi' }
const text = '# Xu hướng\n\n## Quy mô\nNội dung [1]\n'

describe('reportHtml design A', () => {
  it('without the option the page is the one that existed: no cover, no brand block', () => {
    const h = reportHtml(text, base)
    expect(h).not.toContain('class="cover"'); expect(h).not.toContain('#FF9500')
  })
  it('with design a: a cover with the eyebrow, the escaped title, the day and the source count; brand colours; zebra tables; a running footer', () => {
    const h = reportHtml(text, { ...base, design: 'a' })
    expect(h).toContain('class="cover"'); expect(h).toContain('Báo cáo nghiên cứu · TappyAI'); expect(h).toContain('Cập nhật'); expect(h).toContain('2 nguồn')
    expect(h).toContain('Xu hướng trà sữa &lt;Hà Nội&gt;'); expect(h).not.toContain('<Hà Nội>')
    expect(h).toContain('#007AFF'); expect(h).toContain('#FF9500'); expect(h).toContain('nth-child(even)'); expect(h).toContain('@bottom-left')
    expect(h.indexOf('class="cover"')).toBeLessThan(h.indexOf('<h1>'))
  })
  it('English wording follows the report language; the body blocks are the same either way', () => {
    const h = reportHtml(text, { ...base, lang: 'en', design: 'a' })
    expect(h).toContain('Research report · TappyAI'); expect(h).toContain('2 sources')
    const plain = reportHtml(text, base)
    expect(h).toContain('<h2>Quy mô</h2>'); expect(plain).toContain('<h2>Quy mô</h2>')
  })
})
