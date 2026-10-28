import { describe, it, expect, vi, afterEach } from 'vitest'
import { serperPost, serperLastAccountErrorAt, __resetSerperAccountError } from './serperClient'

afterEach(() => { vi.unstubAllGlobals(); __resetSerperAccountError() })

describe('serperLastAccountErrorAt (one brain: a refused lookup is reported as failed, not empty)', () => {
  it('a 403 from the provider records the time; a 200 and a 500 do not', async () => {
    expect(serperLastAccountErrorAt()).toBe(0)
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ organic: [] }), { status: 500 }))
    await serperPost('search', 'test-key', { q: 'x' }, 2000)
    expect(serperLastAccountErrorAt()).toBe(0)
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ organic: [{ title: 'a', link: 'https://a.example', snippet: 's' }] }), { status: 200 }))
    await serperPost('search', 'test-key', { q: 'y' }, 2000)
    expect(serperLastAccountErrorAt()).toBe(0)
    const before = Date.now()
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'Unauthorized.', statusCode: 403 }), { status: 403 }))
    const r = await serperPost('search', 'test-key', { q: 'z' }, 2000)
    expect(r?.status).toBe(403)
    expect(serperLastAccountErrorAt()).toBeGreaterThanOrEqual(before)
  })
})
