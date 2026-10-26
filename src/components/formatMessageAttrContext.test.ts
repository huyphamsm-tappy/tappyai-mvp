// Hotfix (XSS in the chat renderer): can untrusted text leave the HTML attribute it is put in? formatMessage turns a photo link's label into
// <img alt="…">, and a LATER pass turned every bare URL in the string into a chip — including a URL that sat inside that alt attribute.
// The chip's own quotes closed `alt`, and the rest of the URL (`…/onmouseover=…`) parsed as an attribute of the <img>.
// SAFE TEST: the HTML is only PARSED (JSDOM; scripts never run, no event is dispatched, no browser) and its attributes are read.
// The handler name used here is inert.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { formatMessage } from '@/components/ChatInterface'

// jsdom ships no type declarations here (no new dev dependency is added for a test): loaded untyped, used only to PARSE.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } }

const INERT = '__tappy_never__'
/** The parsed render, wrapped so every element can be inspected. */
const parse = (html: string) => new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document.getElementById('r')!
/** Event-handler attributes the renderer did not write itself (its own photo fallback `onerror` is the only one it writes). */
const foreignHandlers = (root: Element) => [...root.querySelectorAll('*')].flatMap(el => [...el.attributes]
  .filter(a => /^on/i.test(a.name) && !(el.tagName === 'IMG' && a.name === 'onerror' && a.value === "this.style.display='none'"))
  .map(a => `${el.tagName.toLowerCase()}[${a.name}=${a.value}]`))
const PHOTO = 'https://lh3.googleusercontent.com/p/AF1Qip-photo=w800'

describe('XSS hotfix · photo link label → <img alt>', () => {
  it('H1 a URL inside a photo link label cannot create an event-handler attribute or break out of `alt`', () => {
    const root = parse(formatMessage(`[ảnh https://evil.example/a/onmouseover=${INERT}](${PHOTO})`))
    expect(foreignHandlers(root)).toEqual([])
    const imgs = [...root.querySelectorAll('img')]
    expect(imgs.length).toBe(1)
    for (const img of imgs) expect(img.getAttribute('alt') ?? '').not.toMatch(/</)
  })
  it('H2 same for the markdown image form `![label](photo)`', () => {
    const root = parse(formatMessage(`![ảnh https://evil.example/a/onmouseover=${INERT}](${PHOTO})`))
    expect(foreignHandlers(root)).toEqual([])
    for (const img of root.querySelectorAll('img')) expect(img.getAttribute('alt') ?? '').not.toMatch(/</)
  })
  it('H3 a label with a URL that carries a quote and an `on…=` handler stays inside `alt` (the quote is data, never markup)', () => {
    const root = parse(formatMessage(`[ảnh https://evil.example/x"onmouseover=${INERT} y](${PHOTO})`))
    expect(foreignHandlers(root)).toEqual([])
    expect(root.querySelectorAll('img').length).toBe(1)
  })
  it('H4 a URL in the label of the second photo of a group cannot reach the first or the third', () => {
    const root = parse(formatMessage(`[a](${PHOTO}) [b https://evil.example/onmouseover=${INERT}](${PHOTO}) [c](${PHOTO})`))
    expect(foreignHandlers(root)).toEqual([])
    expect(root.querySelectorAll('img').length).toBe(3)
  })
})

describe('XSS hotfix · link label → chip (no attribute carries the label on this build)', () => {
  it('H5 a URL inside an ordinary link label cannot create an event-handler attribute', () => {
    const root = parse(formatMessage(`Theo nguồn ([quán https://evil.example/a/onmouseover=${INERT}](https://vnexpress.net/b.html)).`))
    expect(foreignHandlers(root)).toEqual([])
    for (const a of root.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').toMatch(/^(https?:\/\/|\/)/)
  })
})

describe('XSS hotfix · the legitimate render paths still work', () => {
  it('H6 a bare URL in text still becomes one chip (a link to that URL, labelled, no raw URL printed)', () => {
    const root = parse(formatMessage('Xem thêm tại https://vnexpress.net/b.html nhé'))
    const links = [...root.querySelectorAll('a')]
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('href')).toContain('vnexpress.net')
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toContain('noopener')
    expect(root.textContent ?? '').not.toContain('https://')
  })
  it('H7 a markdown link with a plain label still becomes a chip showing that label', () => {
    const root = parse(formatMessage('Đọc [bài này](https://vnexpress.net/b.html) nhé'))
    const links = [...root.querySelectorAll('a')]
    expect(links.length).toBe(1)
    expect(links[0].textContent).toContain('bài này')
    expect(links[0].getAttribute('href')).toContain('vnexpress.net')
  })
  it('H8 a photo link with a plain label still renders the photo with that label as `alt`', () => {
    const root = parse(formatMessage(`[Ảnh quán cà phê](${PHOTO})`))
    const imgs = [...root.querySelectorAll('img')]
    expect(imgs.length).toBe(1)
    expect(imgs[0].getAttribute('src')).toBe(PHOTO)
    expect(imgs[0].getAttribute('alt')).toBe('Ảnh quán cà phê')
    expect(foreignHandlers(root)).toEqual([])
  })
  it('H9 two bare URLs in one line still become two separate chips', () => {
    const root = parse(formatMessage('A https://vnexpress.net/a.html và B https://tuoitre.vn/b.html'))
    expect(root.querySelectorAll('a').length).toBe(2)
  })
  it('H10 a bare URL right after a tag or a closing parenthesis is still chipped (only text is rewritten)', () => {
    const root = parse(formatMessage('**Giá:** https://vnexpress.net/a.html (xem https://tuoitre.vn/b.html)'))
    expect(root.querySelectorAll('a').length).toBe(2)
    expect(foreignHandlers(root)).toEqual([])
  })
})
