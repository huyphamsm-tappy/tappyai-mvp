// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { withNewsFallback } from './toolState'

const ctx = {} as never
const ws = (calls: unknown[]) => async (a: Record<string, unknown>) => { calls.push(a); return { results: [{ title: 'Giá điện tăng', link: 'https://vnexpress.net/a.html' }], pages: [{ url: 'https://vnexpress.net/a.html', ok: true }] } }

describe('get_news empty → public-web news search (flag on)', () => {
  it('an empty feed result triggers ONE web_search for the same topic and says so', async () => {
    const calls: unknown[] = []
    const exec = withNewsFallback(async () => ({ note: 'none', articles: [] }), ws(calls) as never, { lang: 'vi' })
    const r = await exec({ query: 'giá điện' }, ctx) as Record<string, unknown>
    expect(calls).toHaveLength(1)
    expect((calls[0] as { queries: string[] }).queries[0]).toContain('giá điện')
    expect(r.tool_state).toBe('SUCCESS')
    expect((r.fallback as { results: unknown[] }).results).toHaveLength(1)
    expect(String(r.note)).toMatch(/web công khai/)
  })
  it('a feed result with articles is returned untouched and no search is made', async () => {
    const calls: unknown[] = []
    const exec = withNewsFallback(async () => ({ query: 'x', total: 1, articles: [{ title: 'T' }] }), ws(calls) as never, { lang: 'vi' })
    const r = await exec({ query: 'x' }, ctx) as Record<string, unknown>
    expect(calls).toHaveLength(0)
    expect(r.tool_state).toBe('SUCCESS')
    expect(r.fallback).toBeUndefined()
  })
  it('when the search finds nothing either, the state stays EMPTY and the note forbids inventing news', async () => {
    const exec = withNewsFallback(async () => ({ articles: [] }), (async () => ({ results: [] })) as never, { lang: 'vi' })
    const r = await exec({ query: 'x' }, ctx) as Record<string, unknown>
    expect(r.tool_state).toBe('EMPTY')
    expect(String(r.note)).toMatch(/không bịa/)
  })
  it('no fallback is started without enough time left', async () => {
    const calls: unknown[] = []
    let t = 0
    const exec = withNewsFallback(async () => { t += 13_000; return { articles: [] } }, ws(calls) as never, { lang: 'vi', now: () => t })
    const r = await exec({ query: 'x' }, ctx) as Record<string, unknown>
    expect(calls).toHaveLength(0)
    expect(r.tool_state).toBe('EMPTY')
  })
})
