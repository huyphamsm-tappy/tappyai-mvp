// 31/10: the page a reader landed on is matched to the search result's link loosely (pageKey) - measured: full text reached 7-21 of 42-58 sources.
import { describe, it, expect } from 'vitest'
import { pageKey } from './deepResearchDeps'

describe('pageKey', () => {
  it('www., a trailing slash, the fragment and the host case do not make two pages', () => {
    expect(pageKey('https://www.Example.com/a/b/#top')).toBe(pageKey('https://example.com/a/b'))
    expect(pageKey('https://example.com/')).toBe(pageKey('https://www.example.com'))
  })
  it('a different path or query is a different page', () => {
    expect(pageKey('https://example.com/a?x=1')).not.toBe(pageKey('https://example.com/a?x=2'))
    expect(pageKey('https://example.com/a')).not.toBe(pageKey('https://example.com/b'))
  })
})
