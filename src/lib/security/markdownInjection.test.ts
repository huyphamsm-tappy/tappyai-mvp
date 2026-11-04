// Security audit 04/11 (W-07): the two markdown builders feed dangerouslySetInnerHTML (the chat bubble and the public /r/<slug> page). They are safe
// because of a hand-written escape step, so this file attacks them: a corpus of known breakouts plus a seeded random fuzz. Whatever goes in, the
// HTML that comes out has no script/iframe/object tags, no `on*` or `srcdoc` attribute, and no javascript:/data: URL in href/src.
import { describe, it, expect } from 'vitest'
import { formatMessage } from '@/components/ChatInterface'
import { renderPublicMarkdown } from '@/lib/share/renderPublicMarkdown'

const TAG = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const FORBIDDEN_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'style', 'svg', 'math', 'frame', 'frameset', 'applet', 'template', 'noscript'])

/** Every problem found in one piece of rendered HTML (empty = safe). */
function problems(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(TAG)) {
    const name = m[1].toLowerCase()
    const attrs = m[2]
    if (FORBIDDEN_TAGS.has(name)) out.push(`forbidden tag <${name}>`)
    for (const a of attrs.matchAll(/([^\s"'<>\/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const attr = a[1].toLowerCase()
      const value = (a[2] ?? a[3] ?? a[4] ?? '').trim().toLowerCase().replace(/[\s\u0000-\u001f]/g, '')
      // The one handler the builders write themselves: a broken image hides itself. It is a fixed string, never built from the input.
      const ownImageHandler = name === 'img' && attr === 'onerror' && (a[2] ?? '') === "this.style.display='none'"
      if (attr.startsWith('on') && !ownImageHandler) out.push(`event attribute ${attr} in <${name}>`)
      if (attr === 'srcdoc') out.push(`srcdoc in <${name}>`)
      if ((attr === 'href' || attr === 'src' || attr === 'xlink:href' || attr === 'action' || attr === 'formaction') && /^(javascript|vbscript|data):/.test(value)) out.push(`${attr}=${value.slice(0, 20)} in <${name}>`)
    }
  }
  return out
}

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '[click](javascript:alert(1))',
  '[click](JaVaScRiPt:alert(1))',
  '[click](  javascript:alert(1))',
  '[click](java\tscript:alert(1))',
  '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[x](https://a.b/"onmouseover="alert(1))',
  '[x](https://a.b/\' onfocus=\'alert(1))',
  '[x](https://a.b/ onclick=alert(1))',
  '![x](https://a.b/x.png"onerror="alert(1))',
  '![x](https://a.b/x.png onerror=alert(1))',
  '![x](javascript:alert(1))',
  '![](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)',
  'https://a.b/x"onmouseover="alert(1)',
  'https://a.b/x\'onmouseover=\'alert(1)',
  'https://a.b/x><script>alert(1)</script>',
  '**<b onmouseover=alert(1)>x</b>**',
  '`<script>alert(1)</script>`',
  '```html\n<script>alert(1)</script>\n```',
  '```"><img src=x onerror=alert(1)>\ncode\n```',
  '| a | b |\n|---|---|\n| <img src=x onerror=alert(1)> | [x](javascript:alert(1)) |',
  '# <img src=x onerror=alert(1)>',
  '> <script>alert(1)</script>',
  '- <a href="javascript:alert(1)">x</a>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;alert(1)&#60;/script&#62;',
  '<<script>script>alert(1)<</script>/script>',
  '<a href="https://a.b" onclick="alert(1)">x</a>',
  '[a](https://a.b)(javascript:alert(1))',
  '[[x](javascript:alert(1))](https://a.b)',
  '\u0000<script>alert(1)</script>',
  '<scr\u0000ipt>alert(1)</scr\u0000ipt>',
  '[x](https://a.b/%22%20onmouseover=%22alert(1))',
  // found by the fuzz below: a code span glued to a URL / alt / label used to be restored INSIDE the attribute
  'https://a.b/x`" onclick="alert(1)`',
  '![x`" onerror="alert(1)`](https://a.b/x.png)',
  '[a`" onmouseover="alert(1)`](https://a.b/c)',
  '[https://a.b`" onfocus="alert(1)`](https://a.b/c)',
]

describe('markdown builders - known breakouts', () => {
  for (const [name, render] of [['formatMessage (chat)', formatMessage], ['renderPublicMarkdown (/r/<slug>)', renderPublicMarkdown]] as const) {
    it.each(PAYLOADS)(`${name}: %s`, (payload) => {
      expect(problems(render(payload)), render(payload)).toEqual([])
      expect(problems(render(`Mở đầu\n\n${payload}\n\nKết thúc`))).toEqual([])
    })
  }
})

describe('markdown builders - seeded fuzz', () => {
  // small deterministic generator, so a failure is reproducible
  const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000 }
  const PIECES = [
    '<', '>', '"', "'", '`', '[', ']', '(', ')', '!', '*', '**', '_', '#', '> ', '- ', '| ', '---', '\n', '\n\n', ' ', '\t', '&', '&amp;', '&lt;', '&#x3c;',
    'script', 'img', 'src=', 'href=', 'onerror=', 'onload=', 'onclick=', 'javascript:', 'data:text/html,', 'alert(1)', 'https://a.b/', 'https://a.b/x.png',
    'http://', '```', '```js\n', 'x', 'abc', 'Hà Nội', '\u0000', '‮', '\\',
  ]
  it('600 random documents render without script, event attributes or script URLs (both builders)', () => {
    const r = rng(20261104)
    for (let i = 0; i < 600; i++) {
      let doc = ''
      const n = 3 + Math.floor(r() * 40)
      for (let k = 0; k < n; k++) doc += PIECES[Math.floor(r() * PIECES.length)]
      for (const render of [formatMessage, renderPublicMarkdown]) {
        const found = problems(render(doc))
        expect(found, `input ${JSON.stringify(doc)}\n${render(doc)}`).toEqual([])
      }
    }
  })
})
