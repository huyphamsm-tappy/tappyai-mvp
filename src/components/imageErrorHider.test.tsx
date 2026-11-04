// @vitest-environment jsdom
// Security audit 04/11 (W-05): a reply photo that fails to load hides itself through ONE capture-phase listener keyed on a data attribute, not through
// an inline `onerror` attribute (which `script-src-attr 'none'` would block, and which an injected markup could abuse).
import { describe, it, expect } from 'vitest'
import { formatMessage } from './ChatInterface'

describe('broken reply photos', () => {
  it('the markup carries a data attribute and no inline handler', () => {
    const html = formatMessage('![ảnh](https://lh3.googleusercontent.com/place-photo-1)')
    expect(html).toContain('<img ')
    expect(html).toContain('data-hide-on-error="1"')
    expect(html).not.toMatch(/\son[a-z]+=/i)
  })

  it('an image that fails to load is hidden, one that carries no marker is left alone', () => {
    const host = document.createElement('div')
    host.innerHTML = formatMessage('![ảnh](https://lh3.googleusercontent.com/place-photo-2)')
    document.body.appendChild(host)
    const marked = host.querySelector('img') as HTMLImageElement
    const plain = document.createElement('img')
    document.body.appendChild(plain)
    marked.dispatchEvent(new Event('error')) // the real event does not bubble: the listener must be on the capture phase
    plain.dispatchEvent(new Event('error'))
    expect(marked.style.display).toBe('none')
    expect(plain.style.display).not.toBe('none')
  })
})
