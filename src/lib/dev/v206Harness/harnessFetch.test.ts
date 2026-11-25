// The harness must never reach a paid service, and the chips must resolve from fixed local data. Both are enforced by ONE fetch wrapper that the harness installs;
// these tests pin what it answers itself and what it refuses.
import { describe, it, expect, vi } from 'vitest'
import { createHarnessFetch, isBlockedEndpoint } from './harnessFetch'

const passthrough = () => vi.fn(async () => new Response('passed', { status: 200 }))

describe('isBlockedEndpoint', () => {
  it.each([
    '/api/chat', '/api/chat?x=1', '/api/research', '/api/research/start', '/api/deep-research', '/api/tts', '/api/voice/transcribe', '/api/media/video/generate',
    // not paid, but it writes: the chat mints a real anonymous user on every first open, and the harness must leave no trace in the database
    '/api/auth/anonymous',
  ])('%s is refused', (p) => { expect(isBlockedEndpoint(p)).toBe(true) })

  it.each(['/api/config', '/api/favorites', '/api/conversations', '/api/entity-profile?t=a', '/chat', '/_next/static/x.js', '/api/chatty-unrelated', '/api/auth/session'])('%s is not blocked', (p) => {
    expect(isBlockedEndpoint(p)).toBe(false)
  })
})

describe('createHarnessFetch', () => {
  it('answers /api/entity-profile from the fixed profiles, for the names asked, and never calls the network', async () => {
    const orig = passthrough()
    const f = createHarnessFetch(orig as unknown as typeof fetch)
    const res = await f('/api/entity-profile?t=Elon%20Musk&t=Ai%20Do%20Kh%C3%B4ng%20Bi%E1%BA%BFt')
    const j = await res.json()
    expect(j.profiles.map((p: { name: string }) => p.name)).toEqual(['Elon Musk'])
    expect(orig).not.toHaveBeenCalled()
  })

  it('refuses a paid endpoint with a 503 and never forwards it (a POST to the chat route included)', async () => {
    const orig = passthrough()
    const f = createHarnessFetch(orig as unknown as typeof fetch)
    const res = await f('/api/chat', { method: 'POST', body: '{}' })
    expect(res.status).toBe(503)
    expect(orig).not.toHaveBeenCalled()
    const res2 = await f(new Request('http://localhost:3000/api/research/start', { method: 'POST' }))
    expect(res2.status).toBe(503)
    expect(orig).not.toHaveBeenCalled()
  })

  it('anything else goes through unchanged', async () => {
    const orig = passthrough()
    const f = createHarnessFetch(orig as unknown as typeof fetch)
    const res = await f('/api/config')
    expect(await res.text()).toBe('passed')
    expect(orig).toHaveBeenCalledTimes(1)
  })

  it('an absolute URL to the same paid path is refused too (a full URL is not a way round)', async () => {
    const orig = passthrough()
    const f = createHarnessFetch(orig as unknown as typeof fetch)
    expect((await f('http://localhost:3000/api/chat', { method: 'POST' })).status).toBe(503)
    expect(orig).not.toHaveBeenCalled()
  })
})
