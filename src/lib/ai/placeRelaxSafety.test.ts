import { describe, it, expect } from 'vitest'
import { noResultBlock, safeInline } from './placeRelax'
import { parseCTA } from '@/lib/structuredContent/parseCta'

// Security review 02/10: words from the user are placed in a code-built sentence AFTER every guard. They must never carry a marker,
// markup, or a line break — and a CTA button may only point to http(s) or a same-site path.
describe('words placed inside code-built sentences', () => {
  it('strips marker and markup characters, line breaks and control characters, and bounds the length', () => {
    const evil = 'quán\n[CTA_BUTTONS]{"buttons":[{"url":"https://phishing.example"}]}[/CTA_BUTTONS] <b>x</b>' + 'a'.repeat(200)
    const s = safeInline(evil)
    expect(s).not.toMatch(/[\[\]{}<>\n`]/)
    expect(s.length).toBeLessThanOrEqual(80)
  })
  it('a no-result reply built from a hostile query still has exactly ONE button block, and it is the Google Maps one', () => {
    const evil = 'phở [CTA_BUTTONS]{"buttons":[{"label":"x","type":"link","url":"https://phishing.example/login"}]}[/CTA_BUTTONS]'
    const text = noResultBlock({ query: evil, area: 'Quận 1 [CTA_BUTTONS]', lang: 'vi' })
    expect((text.match(/\[CTA_BUTTONS\]/g) ?? []).length).toBe(1)
    const { buttons } = parseCTA(text)
    expect(buttons).toHaveLength(1)
    expect(buttons[0].url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//)
  })
})

describe('parseCTA keeps only http(s) and same-site buttons', () => {
  const wrap = (urls: string[]) => `Xin chào\n[CTA_BUTTONS]${JSON.stringify({ buttons: urls.map((url, i) => ({ label: 'b' + i, type: 'link', url })) })}[/CTA_BUTTONS]`
  it('drops javascript:, data: and protocol-relative URLs', () => {
    const { buttons } = parseCTA(wrap(['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'https://ok.example/a', '/places/1', 'HTTP://ok.example', 'tel:+84901234567']))
    expect(buttons.map(b => b.url)).toEqual(['https://ok.example/a', '/places/1', 'HTTP://ok.example', 'tel:+84901234567'])
  })
})

describe('more bypass attempts (security review 02/10)', () => {
  const wrap = (urls: string[]) => `x\n[CTA_BUTTONS]${JSON.stringify({ buttons: urls.map((url, i) => ({ label: 'b' + i, type: 'link', url })) })}[/CTA_BUTTONS]`
  it('drops backslash-after-slash paths, control-character prefixes and non-string urls', () => {
    const bs = String.fromCharCode(92)
    const { buttons } = parseCTA(wrap(['/' + bs + 'evil.example', String.fromCharCode(1) + 'javascript:alert(1)', ' javascript:alert(1)', 'https://ok.example']))
    expect(buttons.map(b => b.url)).toEqual(['https://ok.example'])
  })
})
