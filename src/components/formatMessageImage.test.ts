import { describe, it, expect } from 'vitest'
import { formatMessage } from './ChatInterface'

// formatMessage is the ONLY transform between untrusted LLM/tool output and
// dangerouslySetInnerHTML, and it had no test coverage at all.
//
// Production, real Web UI, Vietnamese Food query: the place photo rendered as literal
// `![Ảnh địa điểm](https://encrypted-tbn0.gstatic.com/...)` text while the ShopeeFood/GrabFood
// links on adjacent lines rendered correctly — both injected by the same
// streamEnrichment.placeContentLines() block.
//
// The URL below is the exact shape production emits: a Google encrypted-tbn thumbnail whose
// query string contains `&`, which escapeHtml() turns into `&amp;` BEFORE the image regex runs.

const REAL_URL =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSM2ZOP-RL6NMNfxn0_DePKKC5NQr0b7KDiN_nxObbeDQ&s=10'
const REAL_MD = `![Ảnh địa điểm](${REAL_URL})`

describe('formatMessage renders the production place photo', () => {
  it('emits an <img> element', () => {
    expect(formatMessage(REAL_MD)).toContain('<img')
  })

  it('marks it zoomable', () => {
    expect(formatMessage(REAL_MD)).toContain('data-zoomable="true"')
  })

  it('keeps the alt text', () => {
    expect(formatMessage(REAL_MD)).toContain('alt="Ảnh địa điểm"')
  })

  it('keeps the https scheme and the host', () => {
    const html = formatMessage(REAL_MD)
    expect(html).toContain('src="https://encrypted-tbn0.gstatic.com/images?')
  })

  it('does not leave raw markdown visible', () => {
    expect(formatMessage(REAL_MD)).not.toContain('![Ảnh địa điểm]')
  })
})

describe('a photo gallery groups into one strip', () => {
  it('three consecutive images produce three <img> tags', () => {
    const md = [REAL_MD, REAL_MD, REAL_MD].join('\n')
    expect((formatMessage(md).match(/<img/g) ?? []).length).toBe(3)
  })
})

describe('existing behaviour is unchanged', () => {
  it('a normal markdown link still becomes an anchor', () => {
    const html = formatMessage('[ShopeeFood](https://shopeefood.vn/tim-kiem?q=bun%20bo)')
    expect(html).toContain('<a href="https://shopeefood.vn/tim-kiem?q=bun%20bo"')
    expect(html).toContain('>ShopeeFood</a>')
  })

  it('an image and a link in the same message both render', () => {
    const html = formatMessage(`${REAL_MD}\n[GrabFood](https://food.grab.com/vn/en/s?searchKeyword=x)`)
    expect(html).toContain('<img')
    expect(html).toContain('<a href="https://food.grab.com/vn/en/s?searchKeyword=x"')
  })

  it('still escapes HTML injected by a tool result', () => {
    // The reason escapeHtml runs first. Must not regress while fixing images.
    expect(formatMessage('<script>alert(1)</script>')).not.toContain('<script>')
  })

  it('does not turn a non-https image into an img', () => {
    expect(formatMessage('![x](javascript:alert(1))')).not.toContain('<img')
  })
})
