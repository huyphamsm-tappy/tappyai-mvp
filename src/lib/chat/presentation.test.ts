import { describe, it, expect } from 'vitest'
import { parseDoc } from '@/lib/answerDoc/parse'
import {
  amendedSections, arrivalOf, buildToc, embedAnchors, footnotesOf, isSourcesSection, linkCitations, plainHeading, safeId, splitSections, stripTitleLine, withoutTrailingSources,
} from './presentation'

describe('withoutTrailingSources (16/11, UAT 60)', () => {
  it('a section that ends with its own small heading and numbered source lines loses them; anything else gives null', () => {
    const s = '## 6. Điều chưa chắc\n\nCòn thiếu số liệu [1].\n\n### Nguồn tham khảo\n\n1. Giá nhà — cafef.vn, 15/11/2026\n2. Lãi vay — vnexpress.net, 14/11/2026\n'
    expect(withoutTrailingSources(s)).toBe('## 6. Điều chưa chắc\n\nCòn thiếu số liệu [1].\n')
    expect(withoutTrailingSources('## Tóm tắt\n\nChỉ có chữ.')).toBeNull()
    expect(withoutTrailingSources('## A\n\ntext\n\n### Ghi chú\n\nmột dòng thường\n1. chỉ một — a.vn')).toBeNull()
  })
})

// RFC-001 section 4: the pure parts of the response presentation. The expectations are written from the RFC (embeds BETWEEN the paragraphs, the contents from the report's REAL headings,
// numbered footnotes linked to the sources list, a section drawn only when complete, nothing removed when one is rewritten) - not from what the first implementation happened to do.

const blocks = (md: string) => parseDoc(md)

describe('embedAnchors (4.1: the cards sit between the paragraphs, not piled at the end)', () => {
  const answer = ['Mở đầu.', 'Đoạn hai.', 'Đoạn ba.', 'Đoạn bốn.', 'Đoạn năm.', 'Đoạn sáu.'].join('\n\n')
  it('the first embed follows the lead paragraph', () => {
    expect(embedAnchors(blocks(answer), 1)).toEqual([0])
  })
  it('two embeds are spread: one after the lead, one further down - not both at the end', () => {
    const a = embedAnchors(blocks(answer), 2)
    expect(a[0]).toBe(0)
    expect(a[1]).toBeGreaterThan(1)
    expect(a[1]).toBeLessThan(5)
  })
  it('keeps the order of the embeds (anchors never go backwards)', () => {
    const a = embedAnchors(blocks(answer), 4)
    expect([...a].sort((x, y) => x - y)).toEqual(a)
  })
  it('never right after a heading (it would split a title from its text)', () => {
    const md = 'Mở đầu.\n\n## Các quán\n\nĐoạn dưới tiêu đề.\n\n## Kết\n\nCuối.'
    const bs = blocks(md)
    for (const i of embedAnchors(bs, 3)) expect(bs[i].t).not.toBe('heading')
  })
  it('not after a line that introduces what follows ("Các quán nên thử:")', () => {
    const md = 'Mở đầu.\n\nCác quán nên thử:\n\n- A\n- B\n\nĐoạn kết.'
    const bs = blocks(md)
    const a = embedAnchors(bs, 2)
    for (const i of a) expect((bs[i] as { text?: string }).text ?? '').not.toMatch(/:$/)
  })
  it('a lead before the first heading: the embed is not above the lead', () => {
    const bs = blocks('# Tiêu đề\n\nMở đầu.\n\nHai.')
    expect(embedAnchors(bs, 1)[0]).toBe(bs.findIndex(b => b.t === 'para'))
  })
  it('one short paragraph: the embed follows it; no text at all: -1 (the caller puts the embeds first)', () => {
    expect(embedAnchors(blocks('Chỉ một đoạn.'), 2)).toEqual([0, 0])
    expect(embedAnchors([], 2)).toEqual([-1, -1])
    expect(embedAnchors(blocks('x'), 0)).toEqual([])
  })
})

describe('buildToc (4.2: the contents list what the report really has)', () => {
  const report = '# Báo cáo trà sữa\n\nPhạm vi.\n\n## 1. Tóm tắt\n\nA\n\n## 2. **Quy mô** thị trường\n\nB\n\n### 2.1. Chuỗi lớn\n\nC\n\n#### mục nhỏ\n\n**Ghi chú:**\n\n## Nguồn tham khảo\n\n1. A — a.vn'
  it('lists level 2 and 3 headings in order with their own words, not the RFC\'s five fixed headings', () => {
    const toc = buildToc(report, 'm1')
    expect(toc.map(e => e.title)).toEqual(['1. Tóm tắt', '2. Quy mô thị trường', '2.1. Chuỗi lớn', 'Nguồn tham khảo'])
    expect(toc.map(e => e.level)).toEqual([2, 2, 3, 2])
  })
  it('leaves out the title line, deeper headings and bold pseudo headings', () => {
    const titles = buildToc(report, 'm1').map(e => e.title)
    expect(titles).not.toContain('Báo cáo trà sữa')
    expect(titles).not.toContain('mục nhỏ')
    expect(titles.join(' ')).not.toContain('Ghi chú')
  })
  it('ids are unique, safe and numbered in document order', () => {
    const toc = buildToc(report, 'msg:1/α')
    expect(new Set(toc.map(e => e.id)).size).toBe(toc.length)
    for (const e of toc) expect(e.id).toMatch(/^[A-Za-z0-9_-]+-h\d+$/)
    expect(toc[0].id.endsWith('-h0')).toBe(true)
  })
  it('a heading inside a code fence is not a heading', () => {
    expect(buildToc('## Thật\n\n```\n## Giả\n```\n', 'x').map(e => e.title)).toEqual(['Thật'])
  })
  it('plainHeading strips emphasis, code ticks and link syntax', () => {
    expect(plainHeading('**Giá** `VND` [Foody](https://foody.vn)')).toBe('Giá VND Foody')
  })
  it('safeId keeps only characters safe in an id and a fragment', () => {
    expect(safeId('a b:c/d')).toBe('a_b_c_d')
    expect(safeId('')).toBe('x')
  })
})

describe('splitSections / arrivalOf (4.3: a section is drawn only when it is complete)', () => {
  const s1 = '## 1. Tóm tắt\nÝ một [1].\n\n'
  const s2 = '## 2. Quy mô\nÝ hai [2].\n\n'
  const s3 = '## 3. Giá\nÝ ba [1].\n'
  const head = '# Tiêu đề\n\nPhạm vi.\n\n'
  const whole = head + s1 + s2 + s3
  it('head + sections joined is exactly the text (nothing lost, nothing added)', () => {
    const sp = splitSections(whole)
    expect(sp.head + sp.sections.map(s => s.text).join('')).toBe(whole)
    expect(sp.sections.map(s => s.title)).toEqual(['1. Tóm tắt', '2. Quy mô', '3. Giá'])
  })
  it('fenced code is not scanned for headings', () => {
    expect(splitSections('## A\n```\n## B\n```\n').sections).toHaveLength(1)
  })
  it('not streaming: everything is drawn, nothing pending', () => {
    const a = arrivalOf(whole, false)
    expect(a.complete).toHaveLength(3)
    expect(a.pending).toBeNull()
    expect(a.head).toBe(head)
  })
  it('streaming: the last section (the one being written) is NOT drawn; the earlier ones are', () => {
    const a = arrivalOf(whole, true)
    expect(a.complete.map(s => s.title)).toEqual(['1. Tóm tắt', '2. Quy mô'])
    expect(a.pending).toEqual({ title: '3. Giá' })
    expect(a.complete.map(s => s.text).join('')).not.toContain('Ý ba')
  })
  it('streaming with no section begun yet: nothing is drawn, not even the head', () => {
    expect(arrivalOf('# Tiêu đề\n\nPhạm vi', true)).toEqual({ head: null, complete: [], pending: null })
  })
  it('a heading line still being typed is not shown as a title', () => {
    expect(arrivalOf(head + s1 + '## 2. Quy m', true).pending).toEqual({ title: null })
  })
  it('sections that were complete stay complete as the next arrive (the drawn prefix only grows)', () => {
    const steps = [head + s1 + s2, head + s1 + s2 + s3, head + s1 + s2 + s3 + '## 4. Kết\nx\n'].map(t => arrivalOf(t, true).complete.map(s => s.text))
    for (let i = 1; i < steps.length; i++) expect(steps[i].slice(0, steps[i - 1].length)).toEqual(steps[i - 1])
  })
})

describe('amendedSections (4.3: a section re-sent after checking is replaced in place, the others are untouched)', () => {
  it('names only the sections whose text changed', () => {
    expect(amendedSections(['a', 'b', 'c'], ['a', 'B', 'c', 'd'])).toEqual([1])
  })
  it('a section that only arrived is not an amendment', () => {
    expect(amendedSections(['a'], ['a', 'b'])).toEqual([])
    expect(amendedSections([], ['a'])).toEqual([])
  })
})

describe('footnotes (4.2: numbered citations linked to the sources list)', () => {
  const report = '## 1. Tóm tắt\nÝ [1] và [2].\n\n## Nguồn tham khảo\n1. Giá trà sữa 2026 — vnexpress.net\n2. **Báo cáo** ngành — cafef.vn\n'
  it('reads the numbered "title — site" lines of the last section', () => {
    expect(footnotesOf(report)).toEqual([
      { n: 1, title: 'Giá trà sữa 2026', site: 'vnexpress.net' },
      { n: 2, title: 'Báo cáo ngành', site: 'cafef.vn' },
    ])
  })
  it('gives each source its link when the live list knows it, https only', () => {
    const f = footnotesOf(report, [{ id: 1, url: 'https://vnexpress.net/a' }, { id: 2, url: 'http://cafef.vn/b' }])
    expect(f[0].href).toBe('https://vnexpress.net/a')
    expect(f[1].href).toBeUndefined()
  })
  it('numbered lines in an ordinary section are not sources', () => {
    expect(footnotesOf('## 1. Tóm tắt\n1. Một — hai\n\n## 2. Giá\ntext')).toEqual([])
  })
  it('isSourcesSection: the section that is only that list', () => {
    expect(isSourcesSection('## Nguồn\n1. A — a.vn\n2. B — b.vn\n')).toBe(true)
    expect(isSourcesSection('## Nguồn\n1. A — a.vn\n')).toBe(false)
    expect(isSourcesSection('## Giá\nVăn bản.\n1. A — a.vn\n2. B — b.vn\n')).toBe(false)
  })
  const known = new Map([[1, 'Giá trà sữa'], [2, 'Ngành "trà"']])
  it('linkCitations marks "[n]" that names a known source and points it at that source line', () => {
    const out = linkCitations('Giá tăng [1] và giảm [2].', 'm1', known)
    expect(out).toContain('href="#m1-fn1"')
    expect(out).toContain('data-cite="2"')
    expect(out).not.toContain('[1]')
    expect(out).toContain('title="Ngành &quot;trà&quot;"')
  })
  it('leaves an unknown number, a markdown-looking link and the inside of tags and links alone', () => {
    expect(linkCitations('xem [9]', 'm1', known)).toBe('xem [9]')
    const html = '<a href="https://x.vn/[1]" title="[1]">chip [1]</a> và [1]'
    const out = linkCitations(html, 'm1', known)
    expect(out.startsWith('<a href="https://x.vn/[1]" title="[1]">chip [1]</a>')).toBe(true)
    expect(out.endsWith('<a href="#m1-fn1" data-cite="1" class="tappy-cite" title="Giá trà sữa">1</a>')).toBe(true)
  })
  it('while the list has not arrived the mark is drawn but not a link', () => {
    const out = linkCitations('ý [1]', 'm1', new Map([[1, '']]), false)
    expect(out).toBe('ý <span class="tappy-cite">1</span>')
  })
  it('no known sources: the html is returned untouched', () => {
    expect(linkCitations('ý [1]', 'm1', new Map())).toBe('ý [1]')
  })
})

describe('stripTitleLine', () => {
  it('removes the report\'s own title line (the cover shows it) and nothing else', () => {
    expect(stripTitleLine('# Tiêu đề\n\n*Phạm vi.*\n\n')).toBe('*Phạm vi.*\n\n')
    expect(stripTitleLine('Không có tiêu đề\n')).toBe('Không có tiêu đề\n')
    expect(stripTitleLine('## Mục\n')).toBe('## Mục\n')
  })
})
