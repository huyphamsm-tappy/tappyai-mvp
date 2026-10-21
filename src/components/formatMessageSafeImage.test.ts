import { describe, it, expect } from 'vitest'
import { formatMessage } from './ChatInterface'

// ── Gate 2 N1/N2, D-N3: the web client draws a markdown image only for a safe https URL ──
//
// `formatMessage` turns `![alt](url)` into `<img src=…>` for any `https?://` URL. A message stored
// before the server-side checks (or any future source that forgets them) could therefore still make
// the browser load `http:`, an internal host, a private IP or a URL with userinfo. The image is now
// drawn only when `isSafeHttpsUrl` admits it; an unsafe one is dropped, never shown as a link.
// Registered in gate2/n12/N12-DECISIONS.json (D-N3).

const BAD = [
  'http://cdn.example/a.jpg',
  'https://localhost/a.jpg',
  'https://127.0.0.1/a.jpg',
  'https://10.0.0.5/a.jpg',
  'https://u:p@cdn.example/a.jpg',
  'https://[::1]/a.jpg',
]
const GOOD = 'https://cdn.example/a.jpg'

describe('D-N3 — formatMessage draws only safe https images', () => {
  for (const bad of BAD) {
    it(`![…](${bad.slice(0, 32)}) is not drawn`, () => {
      const html = formatMessage(`Ảnh quán:\n![Ảnh địa điểm](${bad})`)
      expect(html).not.toContain('<img')
      expect(html).not.toContain(bad)
    })
  }

  it('in a gallery, only the unsafe image is dropped; the safe ones are drawn', () => {
    const html = formatMessage(`![a](${GOOD})\n![b](http://cdn.example/b.jpg)\n![c](https://cdn.example/c.jpg)`)
    expect(html).toContain(`src="${GOOD}"`)
    expect(html).toContain('src="https://cdn.example/c.jpg"')
    expect(html).not.toContain('http://cdn.example/b.jpg')
  })

  it('control: a safe https image is drawn as before', () => {
    expect(formatMessage(`![Ảnh địa điểm](${GOOD})`)).toContain(`<img src="${GOOD}"`)
  })
})
