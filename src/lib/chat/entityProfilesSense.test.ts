import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmProfileSense, __clearEntityProfileCache, type WikiEntity } from './entityProfiles'

const profile = (name: string): WikiEntity => ({ name, title: name, description: 'xã', extract: 'Một xã.', image: null, href: 'https://vi.wikipedia.org/wiki/x', lang: 'vi' })
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

beforeEach(() => __clearEntityProfileCache())

describe('confirmProfileSense (18/11 review)', () => {
  it('a visitor (401) is not asked again for the next answer', async () => {
    const f = vi.fn().mockResolvedValue(res(401))
    const m = new Map([['Bình Minh', profile('Bình Minh')]])
    expect((await confirmProfileSense('Công ty Bình Minh đã ký hợp đồng.', m, f as unknown as typeof fetch)).size).toBe(0)
    expect((await confirmProfileSense('Một câu trả lời khác về Bình Minh.', m, f as unknown as typeof fetch)).size).toBe(0)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('a verdict from a signed-in account is cached per answer; "same" keeps the chip, "not same" drops it', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { same: [true, false] }))
    const m = new Map([['A', profile('A')], ['B', profile('B')]])
    const out = await confirmProfileSense('Câu trả lời.', m, f as unknown as typeof fetch)
    expect([...out.keys()]).toEqual(['A'])
    await confirmProfileSense('Câu trả lời.', m, f as unknown as typeof fetch)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
