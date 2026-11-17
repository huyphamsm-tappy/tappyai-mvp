import { describe, it, expect } from 'vitest'
import { canonicalSourceUrl, unwrapProxyLink, isTranslateProxy } from './sourceUrl'

// UAT 18/11 case 39: the answer cited "[NASA](https://translate.google.com/translate?u=)" - a translate proxy whose page was cut off.
describe('a translate proxy is never a source in itself', () => {
  it('one that names a page becomes that page', () => {
    expect(unwrapProxyLink('https://translate.google.com/translate?u=https%3A%2F%2Fscience.nasa.gov%2Fearth%2F&hl=vi')).toBe('https://science.nasa.gov/earth/')
    expect(unwrapProxyLink('https://science-nasa-gov.translate.goog/earth/?_x_tr_sl=en&_x_tr_tl=vi')).toBe('https://science.nasa.gov/earth/')
  })
  it('one that names no page (empty or missing u=) is dropped', () => {
    expect(unwrapProxyLink('https://translate.google.com/translate?u=')).toBeNull()
    expect(unwrapProxyLink('https://translate.google.com/translate')).toBeNull()
  })
  it('an ordinary link is returned as it is', () => {
    expect(unwrapProxyLink('https://vnexpress.net/a-1.html')).toBe('https://vnexpress.net/a-1.html')
    expect(isTranslateProxy('https://vnexpress.net/')).toBe(false)
    expect(isTranslateProxy('not a url')).toBe(false)
  })
  it('the research helper is the same function (moved, not changed)', () => {
    expect(canonicalSourceUrl('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fx')).toBe('https://example.com/x')
    expect(canonicalSourceUrl('http://example.com/')).toBeNull()
  })
})
