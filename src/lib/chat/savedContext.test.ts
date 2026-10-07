import { describe, it, expect } from 'vitest'
import { attachSavedContext, readSavedContext } from './savedContext'

const REVIEW = '9d4cdf3b-a93f-427c-880a-9950472e3705'
const CTX = { kind: 'explore_clip' as const, reviewId: REVIEW }

describe('attachSavedContext — the reference rides on the first saved message', () => {
  it('puts the context on message 0 only, and keeps role/content of every message', () => {
    const out = attachSavedContext([
      { role: 'user', content: 'Cho mình biết thêm về Góc Huế' },
      { role: 'assistant', content: 'Đây là Góc Huế…' },
      { role: 'user', content: 'ở đâu?' },
    ], CTX)
    expect(out).toEqual([
      { role: 'user', content: 'Cho mình biết thêm về Góc Huế', context: CTX },
      { role: 'assistant', content: 'Đây là Góc Huế…' },
      { role: 'user', content: 'ở đâu?' },
    ])
  })

  it('without a context, the saved list is exactly { role, content } — generic threads are byte-identical', () => {
    const out = attachSavedContext([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], undefined)
    expect(out).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }])
    expect(Object.keys(out[0])).toEqual(['role', 'content'])
  })

  it('drops any other field the live message objects carry (ids, tool parts) and never mutates the input', () => {
    const live = [{ id: 'm1', role: 'user', content: 'x', createdAt: new Date() }]
    const out = attachSavedContext(live, CTX)
    expect(Object.keys(out[0])).toEqual(['role', 'content', 'context'])
    expect(Object.keys(live[0])).toEqual(['id', 'role', 'content', 'createdAt'])
  })

  it('an empty list stays empty', () => {
    expect(attachSavedContext([], CTX)).toEqual([])
  })
})

describe('readSavedContext — shape-only on the way back', () => {
  it('returns the reference from the first message', () => {
    expect(readSavedContext([{ role: 'user', content: 'x', context: CTX }, { role: 'assistant', content: 'y' }])).toEqual(CTX)
  })

  it('returns undefined for a thread that never had one', () => {
    expect(readSavedContext([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }])).toBeUndefined()
    expect(readSavedContext([])).toBeUndefined()
    expect(readSavedContext(null)).toBeUndefined()
    expect(readSavedContext('nope')).toBeUndefined()
  })

  it('refuses a malformed reference — wrong kind, non-UUID id, extra fields do not smuggle facts', () => {
    expect(readSavedContext([{ role: 'user', content: 'x', context: { kind: 'other', reviewId: REVIEW } }])).toBeUndefined()
    expect(readSavedContext([{ role: 'user', content: 'x', context: { kind: 'explore_clip', reviewId: 'not-a-uuid' } }])).toBeUndefined()
    const smuggled = readSavedContext([{ role: 'user', content: 'x', context: { kind: 'explore_clip', reviewId: REVIEW, placeName: 'Quán Bịa', placeAddress: 'x' } }])
    expect(smuggled).toEqual(CTX)
    expect(Object.keys(smuggled!)).toEqual(['kind', 'reviewId'])
  })

  it('only the first message counts — a reference on a later message is not the thread’s origin', () => {
    expect(readSavedContext([{ role: 'user', content: 'x' }, { role: 'user', content: 'y', context: CTX }])).toBeUndefined()
  })
})
