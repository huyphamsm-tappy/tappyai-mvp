// 31/10: the page a reader landed on is matched to the search result's link loosely (pageKey) - measured: full text reached 7-21 of 42-58 sources.
import { describe, it, expect } from 'vitest'
import { pageKey, mergeSearchRows, deepResearchParallel, questionLanguageLine } from './deepResearchDeps'

describe('the language of the question (measured 01/11: an English question got German headings)', () => {
  it('stated only when the code is certain of it', () => {
    expect(questionLanguageLine('en')).toContain('written in English')
    expect(questionLanguageLine('vi')).toContain('in Vietnamese')
    expect(questionLanguageLine(null)).toBe('')
    expect(questionLanguageLine('xx')).toBe('')
  })
})

describe('Serper + Parallel rows (owner 01/11: "thêm nguồn Parallel")', () => {
  it('Serper\'s rows first, then Parallel\'s; a page both found is kept once', () => {
    const s = [{ url: 'https://a.example/x', from: 's' }, { url: 'https://www.google.com/goto?url=t', from: 's' }]
    const p = [{ url: 'https://www.a.example/x/', from: 'p' }, { url: 'https://b.example/y', from: 'p' }]
    expect(mergeSearchRows(s, p)).toEqual([...s, { url: 'https://b.example/y', from: 'p' }])
  })
  it('no key: nothing is sent, the run goes on with Serper alone', async () => {
    expect(await deepResearchParallel('')('q')).toEqual({ ok: false, rows: [] })
  })
})

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
