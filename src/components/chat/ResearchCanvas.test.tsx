// @vitest-environment jsdom
// RFC-001 4.1 / 4.2 / 4.3 in the browser: the editorial answer (the cards BETWEEN the paragraphs), the research document (cover, contents from the real headings that can be used with the
// keyboard, footnote marks that go to their source line and back, a toolbar) and the progressive sections (a section is drawn only when it is complete; the ones already drawn are never
// removed, redrawn or moved by the next one).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { setLocale } from '@/lib/i18n/useTranslation'
import { formatMessage } from '@/components/ChatInterface'
import { ArticleAnswer } from './ArticleAnswer'
import ResearchCanvas from './ResearchCanvas'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const head = '# Xu hướng trà sữa\n\n*Phạm vi: Hà Nội.*\n\n'
const sec = (n: number, title: string, body: string) => `## ${n}. ${title}\n\n${body}\n\n`
const sources = '## Nguồn tham khảo\n\n1. Giá trà sữa 2026 — vnexpress.net\n2. Báo cáo ngành — cafef.vn\n'
const REPORT = head + sec(1, 'Tóm tắt', 'Giá rẻ bùng lên [1].') + sec(2, 'Quy mô', 'Thị trường phân cực [2].\n\n### 2.1. Chuỗi lớn\n\nChi tiết chuỗi.') + sec(3, 'Giá', '| A | B |\n|---|---|\n| 1 | 2 |') + sources

const canvas = (text: string, o: Partial<React.ComponentProps<typeof ResearchCanvas>> = {}) =>
  <ResearchCanvas msgId="m1" text={text} streaming={false} format={formatMessage} research={null} {...o} />

describe('editorial answer (4.1)', () => {
  const text = 'Mở đầu ngắn gọn.\n\nĐoạn hai.\n\nĐoạn ba.\n\nĐoạn bốn.\n\n> Mẹo: gọi trước.'
  const card = (name: string) => <div data-testid={name}>{name}</div>
  it('puts the cards between the paragraphs: the first after the lead, the second further down, neither at the very end', () => {
    setLocale('vi')
    const { container } = render(<ArticleAnswer text={text} images={[]} format={formatMessage} presentation={{ variant: 'editorial', embeds: [card('place'), card('shop')] }} />)
    const kids = Array.from(container.querySelector('[data-answer]')!.children)
    const at = (id: string) => kids.findIndex(k => k.querySelector(`[data-testid="${id}"]`))
    expect(at('place')).toBe(1)
    expect(at('shop')).toBeGreaterThan(at('place'))
    expect(at('shop')).toBeLessThan(kids.length - 1)
  })
  it('lead paragraph is larger, the answer reads at line-height 1.65, a quote is a callout, headings are real headings', () => {
    const { container } = render(<ArticleAnswer text={'Mở đầu.\n\n## Phần hai\n\nNội dung.\n\n> Mẹo nhỏ'} images={[]} format={formatMessage} presentation={{ variant: 'editorial' }} />)
    const root = container.querySelector('[data-answer]') as HTMLElement
    expect(root.className).toContain('leading-[1.65]')
    expect((root.children[0] as HTMLElement).className).toContain('text-[17px]')
    expect((root.children[2] as HTMLElement).className).not.toContain('text-[17px]')
    expect(container.querySelector('.tappy-callout')?.textContent).toBe('Mẹo nhỏ')
    expect(container.querySelector('h2')?.textContent).toBe('Phần hai')
  })
  it('flag off (no presentation): the former markup - no new attribute, no embed wrapper, headings stay plain blocks', () => {
    const html = renderToStaticMarkup(<ArticleAnswer text={'Mở đầu.\n\n## Phần hai\n\nNội dung.\n\n> Mẹo'} images={[]} format={formatMessage} />)
    expect(html).not.toContain('data-presentation')
    expect(html).not.toContain('tappy-embed')
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('tappy-callout')
    expect(html).toContain('text-[15.5px] leading-7')
  })
  it('an answer with no text still shows its cards', () => {
    const { container } = render(<ArticleAnswer text="" images={[]} format={formatMessage} presentation={{ variant: 'editorial', embeds: [card('place')] }} />)
    expect(container.querySelector('[data-testid="place"]')).not.toBeNull()
  })
})

describe('research document (4.2)', () => {
  it('draws a cover, the toolbar and a contents list made of the report\'s own headings (not the RFC\'s five)', () => {
    setLocale('vi')
    const { getByTestId, container } = render(canvas(REPORT))
    expect(container.querySelector('h1')?.textContent).toBe('Xu hướng trà sữa')
    expect(getByTestId('research-toolbar')).toBeTruthy()
    fireEvent.click(getByTestId('research-toc-toggle'))
    const items = Array.from(getByTestId('research-toc-panel').querySelectorAll('a')).map(a => a.textContent)
    expect(items).toEqual(['1. Tóm tắt', '2. Quy mô', '2.1. Chuỗi lớn', '3. Giá', 'Nguồn tham khảo'])
  })
  it('a numbered heading is one inline heading (no block row inside the h2) and keeps its number', () => {
    const { container } = render(canvas(REPORT))
    const h = Array.from(container.querySelectorAll('h2')).find(x => x.textContent?.includes('Quy mô'))!
    expect(h.querySelector('div')).toBeNull()
    expect(h.textContent?.replace(/⁠/g, '')).toBe('2. Quy mô')
  })
  it('the title appears once (the cover), not again as the first line of the body', () => {
    const { container } = render(canvas(REPORT))
    expect(Array.from(container.querySelectorAll('h1')).filter(h => h.textContent === 'Xu hướng trà sữa')).toHaveLength(1)
  })
  it('contents entries are real links to the headings that exist on the page', () => {
    const { getByTestId } = render(canvas(REPORT))
    fireEvent.click(getByTestId('research-toc-toggle'))
    for (const a of Array.from(getByTestId('research-toc-panel').querySelectorAll('a'))) {
      const id = a.getAttribute('href')!.slice(1)
      expect(document.getElementById(id), id).not.toBeNull()
    }
  })
  it('keyboard: the button opens the list, arrows move between entries, Escape closes it and returns to the button, Enter jumps to the heading', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { getByTestId, queryByTestId } = render(canvas(REPORT))
    const btn = getByTestId('research-toc-toggle')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const links = Array.from(getByTestId('research-toc-panel').querySelectorAll('a'))
    fireEvent.keyDown(btn, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(links[0])
    fireEvent.keyDown(links[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(links[1])
    fireEvent.keyDown(links[1], { key: 'Escape' })
    expect(queryByTestId('research-toc-panel')).toBeNull()
    expect(document.activeElement).toBe(btn)
    fireEvent.click(btn)
    fireEvent.click(Array.from(getByTestId('research-toc-panel').querySelectorAll('a'))[1])
    expect(scroll).toHaveBeenCalled()
    const target = document.getElementById(links[1].getAttribute('href')!.slice(1))!
    expect(target.textContent).toContain('Quy mô')
    expect(document.activeElement).toBe(target)
    expect(queryByTestId('research-toc-panel')).toBeNull()
  })
  it('citations are numbered marks that go to their line in the sources list; the list keeps every source', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { container } = render(canvas(REPORT))
    const mark = container.querySelector('a[data-cite="2"]') as HTMLElement
    expect(mark.textContent).toBe('2')
    expect(container.querySelector('#m1-fn1')?.textContent).toContain('Giá trà sữa 2026')
    expect(container.querySelector('#m1-fn2')?.textContent).toContain('cafef.vn')
    fireEvent.click(mark)
    expect(document.activeElement).toBe(container.querySelector('#m1-fn2'))
    expect(container.querySelector('#m1-fn2')?.getAttribute('data-active')).toBe('true')
    // and back to where it was cited
    fireEvent.click(container.querySelector('#m1-fn2 button')!)
    expect(document.activeElement).toBe(mark)
  })
  it('a state change inside the document does not replace the text nodes (the focused mark and a text selection survive)', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { container } = render(canvas(REPORT))
    const mark = container.querySelector('a[data-cite="1"]')!
    const para = mark.parentElement!
    fireEvent.click(mark)
    expect(mark.isConnected).toBe(true)
    expect(mark.parentElement).toBe(para)
  })
  it('a footnote mark is not an outbound link: the chat\'s link handler never sees the click', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const onClick = vi.fn()
    const { container } = render(canvas(REPORT, { onClick }))
    fireEvent.click(container.querySelector('a[data-cite="1"]')!)
    expect(onClick).not.toHaveBeenCalled()
  })
  it('a source with a known link is a link (https), one without is plain text', () => {
    const research = { type: 'tappy.research.v1' as const, title: 'Xu hướng trà sữa', phase: 'done' as const, steps: [], sources: 2, links: [{ id: 1, title: 'Giá', url: 'https://vnexpress.net/a' }] }
    const { container } = render(canvas(REPORT, { research }))
    expect(container.querySelector('#m1-fn1 a')?.getAttribute('href')).toBe('https://vnexpress.net/a')
    expect(container.querySelector('#m1-fn2 a')).toBeNull()
  })
  it('copy Markdown writes the report text to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { getByTestId } = render(canvas(REPORT))
    await act(async () => { fireEvent.click(getByTestId('research-copy-md')) })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('## 2. Quy mô')
    expect(getByTestId('research-copy-md').textContent).toContain('Đã sao chép')
  })
  it('share is offered only when the page can open the message\'s share sheet', () => {
    const onShare = vi.fn()
    const { queryByTestId, rerender, getByTestId } = render(canvas(REPORT))
    expect(queryByTestId('research-share')).toBeNull()
    rerender(canvas(REPORT, { onShare }))
    fireEvent.click(getByTestId('research-share'))
    expect(onShare).toHaveBeenCalledTimes(1)
  })
  it('collapsed (the summary view): no contents list, the text it was given only', () => {
    const { queryByTestId, container } = render(canvas(head + sec(1, 'Tóm tắt', 'Ý chính.'), { collapsed: true }))
    expect(queryByTestId('research-toc-toggle')).toBeNull()
    expect(container.textContent).toContain('Ý chính.')
  })
  it('English wording', () => {
    setLocale('en')
    const { getByTestId } = render(canvas(REPORT))
    expect(getByTestId('research-toolbar').textContent).toContain('Export PDF')
    expect(getByTestId('research-toolbar').textContent).toContain('Copy Markdown')
    setLocale('vi')
  })
})

describe('progressive sections (4.3)', () => {
  const s1 = sec(1, 'Tóm tắt', 'Ý một [1].')
  const s2 = sec(2, 'Quy mô', 'Ý hai [2].')
  const s3 = sec(3, 'Giá', 'Ý ba.')
  it('draws only the sections that are complete: the one being written is a status line with its title, not its text', () => {
    setLocale('vi')
    const { container, getByTestId } = render(canvas(head + s1 + s2 + '## 3. Giá\n\nĐang viết dở một câu chưa', { streaming: true }))
    expect(container.textContent).toContain('Ý một')
    expect(container.textContent).toContain('Ý hai')
    expect(container.textContent).not.toContain('Đang viết dở')
    expect(getByTestId('research-pending').textContent).toContain('3. Giá')
    expect(container.querySelectorAll('section')).toHaveLength(2)
  })
  it('nothing of the head or a section is drawn before the first section has begun', () => {
    const { container, queryByTestId } = render(canvas('# Xu hướng trà sữa\n\nPhạm vi', { streaming: true }))
    expect(container.querySelectorAll('section')).toHaveLength(0)
    expect(container.textContent).not.toContain('Phạm vi')
    expect(queryByTestId('research-toolbar')).toBeNull()
  })
  it('a new section arriving leaves the ones already drawn exactly as they were: same DOM nodes, same order, nothing removed', () => {
    const { container, rerender } = render(canvas(head + s1 + '## 2. Quy mô\n\nđang', { streaming: true }))
    const first = container.querySelector('section[data-section="0"]')!
    const firstHtml = first.outerHTML
    rerender(canvas(head + s1 + s2 + '## 3. Giá\n\nđang', { streaming: true }))
    expect(container.querySelector('section[data-section="0"]')).toBe(first)
    expect(container.querySelectorAll('section')).toHaveLength(2)
    const again = container.querySelector('section[data-section="0"]')!
    // the only allowed difference is the one-shot arrival class
    expect(again.outerHTML.replace(' class="tappy-section-in"', '')).toBe(firstHtml.replace(' class="tappy-section-in"', ''))
    rerender(canvas(head + s1 + s2 + s3 + '## 4. Kết\n\nđang', { streaming: true }))
    expect(container.querySelectorAll('section')).toHaveLength(3)
    expect(container.querySelector('section[data-section="0"]')).toBe(first)
    // the end of the reply: the last section is complete, the status line is gone, the toolbar appears
    rerender(canvas(head + s1 + s2 + s3, { streaming: false }))
    expect(container.querySelectorAll('section')).toHaveLength(3)
    expect(container.textContent).toContain('Ý ba')
  })
  it('the contents grow with the sections that arrive and never lose an entry', () => {
    const { getByTestId, rerender } = render(canvas(head + s1 + s2 + '## 3. Giá\n\n', { streaming: true }))
    const titles = () => Array.from(getByTestId('research-toc-panel').querySelectorAll('a')).map(a => a.textContent)
    fireEvent.click(getByTestId('research-toc-toggle'))
    expect(titles()).toEqual(['1. Tóm tắt', '2. Quy mô'])
    rerender(canvas(head + s1 + s2 + s3 + '## 4. Kết\n\n', { streaming: true }))
    expect(titles()).toEqual(['1. Tóm tắt', '2. Quy mô', '3. Giá'])
  })
  it('a section re-sent with different text is replaced in place with a short notice; the others stay', () => {
    const { container, rerender } = render(canvas(head + s1 + s2 + s3 + sec(4, 'Kết', 'x'), { streaming: true }))
    const second = container.querySelector('section[data-section="1"]')!
    const third = container.querySelector('section[data-section="2"]')
    rerender(canvas(head + s1 + sec(2, 'Quy mô', 'Ý hai đã sửa.') + s3 + sec(4, 'Kết', 'x') + '## 5. Thêm\n\nđang', { streaming: true }))
    const nowSecond = container.querySelector('section[data-section="1"]')!
    expect(nowSecond.textContent).toContain('Ý hai đã sửa.')
    expect(nowSecond.textContent).toContain('vừa được cập nhật')
    expect(container.querySelector('section[data-section="0"]')!.textContent).not.toContain('vừa được cập nhật')
    expect(container.querySelector('section[data-section="2"]')).toBe(third)
    expect(second.isConnected || nowSecond.isConnected).toBe(true)
  })
  it('a streamed report is not an unverified claim on the page: no raw text of the unfinished section anywhere, including the contents', () => {
    const { container, getByTestId } = render(canvas(head + s1 + s2 + '## 3. Giá\n\nGiá cao nhất là 99 nghìn', { streaming: true }))
    fireEvent.click(getByTestId('research-toc-toggle'))
    expect(container.textContent).not.toContain('99 nghìn')
  })
})
