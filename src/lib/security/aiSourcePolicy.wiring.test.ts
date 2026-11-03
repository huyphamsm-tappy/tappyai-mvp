// 01/11 (owner: another AI product is never a source): the doors that do not go through the chat's tool objects - Deep Research's own search
// merge and the deep (Exa) evidence the model reads - and the chat route itself, where the policy wraps every tool before the other wrappers.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { mergeSearchRows } from '@/lib/ai/research/deepResearchDeps'
import { deepEvidenceForModel } from '@/lib/ai/consultative/deepSearch'

describe('Deep Research rows', () => {
  it('a Serper or Parallel row that is an AI product page is not merged in', () => {
    const serper = [{ url: 'https://vi.wikipedia.org/wiki/A' }, { url: 'https://aihay.vn/hoi-dap/1' }]
    const parallel = [{ url: 'https://chatgpt.com/share/1' }, { url: 'https://vnexpress.net/b' }]
    expect(mergeSearchRows(serper, parallel).map(r => r.url)).toEqual(['https://vi.wikipedia.org/wiki/A', 'https://vnexpress.net/b'])
  })
})

describe('deep (Exa) evidence', () => {
  it('leaves out pages that are AI product pages', () => {
    const ev = deepEvidenceForModel({ rounds: 1, usd: 0, stopped: null, pages: [
      { url: 'https://aihay.vn/x', title: 'a', publishedDate: null, highlights: ['h'] },
      { url: 'https://vnexpress.net/y', title: 'b', publishedDate: '2026-10-01', highlights: ['h'] },
    ] } as never) as { pages: Array<{ url: string }> }
    expect(ev.pages.map(p => p.url)).toEqual(['https://vnexpress.net/y'])
  })
})

describe('the chat route', () => {
  const ROUTE = readFileSync('src/app/api/chat/route.ts', 'utf8')
  it('wraps the tools with the source policy before the turn web ticket wrapper (innermost)', () => {
    const policy = ROUTE.indexOf('wrapToolsWithoutAiSources(tools')
    const ticket = ROUTE.indexOf('wrapToolsWithTurnWebTicket(tools')
    expect(policy).toBeGreaterThan(0)
    expect(ticket).toBeGreaterThan(policy)
  })
})
