import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Route-level contract for the share API: auth is required for every write,
// slugs are validated before any read, a withdrawn/unknown share is a 404, and
// the public GET returns ONLY the frozen payload + public columns.

const store = {
  getPublicSharedResult: vi.fn(),
  withdrawSharedResult: vi.fn(),
  createSharedResult: vi.fn(),
}
vi.mock('@/lib/share/sharedResultStore', () => ({
  getPublicSharedResult: (...a: unknown[]) => store.getPublicSharedResult(...a),
  withdrawSharedResult: (...a: unknown[]) => store.withdrawSharedResult(...a),
  createSharedResult: (...a: unknown[]) => store.createSharedResult(...a),
  SharedResultError: class extends Error { constructor(public code: string, m?: string) { super(m ?? code) } },
}))
const auth = { user: null as null | { id: string } }
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: auth.user, supabase: {} }) }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicDailyRateLimit: async () => ({ ok: true, retryAfter: 0, scope: 'instance' }) }))
vi.mock('@/lib/share/shareRequest', async (orig) => {
  const real = await orig<typeof import('@/lib/share/shareRequest')>()
  return { ...real, resolveShareSource: async () => ({ ok: true, payload: { v: 1, title: 'T', query: 'q', domain: 'food', locale: 'vi', body: 'b', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-09-13T00:00:00.000Z' }, domain: 'food' }) }
})

import { GET, DELETE } from './[slug]/route'
import { POST as CREATE } from './route'

const req = (url: string, init?: RequestInit & { ip?: string }) => new NextRequest(new Request(`https://www.tappyai.com${url}`, init), {})
const row = { id: 'id1', slug: 'AbCdEfGh12', query: 'q', payload: { v: 1, title: 'T' }, domain: 'food', locale: 'vi', og_version: 1, view_count: 3, ask_count: 0, created_at: '2026-09-13T00:00:00.000Z' }

beforeEach(() => { vi.clearAllMocks(); auth.user = null })

describe('GET /api/shared-results/[slug]', () => {
  it('404s an invalid slug without touching the store', async () => {
    const res = await GET(req('/api/shared-results/bad'), { params: { slug: 'bad' } })
    expect(res.status).toBe(404)
    expect(store.getPublicSharedResult).not.toHaveBeenCalled()
  })
  it('404s a missing or withdrawn share', async () => {
    store.getPublicSharedResult.mockResolvedValueOnce(null)
    expect((await GET(req('/api/shared-results/AbCdEfGh12'), { params: { slug: 'AbCdEfGh12' } })).status).toBe(404)
  })
  it('returns the frozen payload with public columns only, cacheable, no auth needed', async () => {
    store.getPublicSharedResult.mockResolvedValueOnce({ ...row, owner_id: 'LEAK' })
    const res = await GET(req('/api/shared-results/AbCdEfGh12'), { params: { slug: 'AbCdEfGh12' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['created_at', 'og_version', 'payload', 'slug'])
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=3600/)
  })
})

describe('DELETE /api/shared-results/[slug]', () => {
  it('requires auth', async () => {
    expect((await DELETE(req('/api/shared-results/AbCdEfGh12', { method: 'DELETE' }), { params: { slug: 'AbCdEfGh12' } })).status).toBe(401)
  })
  it('withdraws only the caller-owned share (store answers false → 404)', async () => {
    auth.user = { id: 'u1' }
    store.withdrawSharedResult.mockResolvedValueOnce(false)
    expect((await DELETE(req('/api/shared-results/AbCdEfGh12', { method: 'DELETE' }), { params: { slug: 'AbCdEfGh12' } })).status).toBe(404)
    expect(store.withdrawSharedResult).toHaveBeenCalledWith('AbCdEfGh12', 'u1')
    store.withdrawSharedResult.mockResolvedValueOnce(true)
    expect((await DELETE(req('/api/shared-results/AbCdEfGh12', { method: 'DELETE' }), { params: { slug: 'AbCdEfGh12' } })).status).toBe(200)
  })
})

describe('POST /api/shared-results', () => {
  const body = JSON.stringify({ conversationId: '11111111-1111-4111-8111-111111111111', messageIndex: 1 })
  it('requires auth — sharing is never anonymous-by-accident', async () => {
    expect((await CREATE(req('/api/shared-results', { method: 'POST', body }))).status).toBe(401)
  })
  it('rejects a malformed body before any resolution', async () => {
    auth.user = { id: 'u1' }
    expect((await CREATE(req('/api/shared-results', { method: 'POST', body: '{"conversationId":"x"}' }))).status).toBe(400)
    expect(store.createSharedResult).not.toHaveBeenCalled()
  })
  it('creates and returns the public URL + slug, owner attached server-side', async () => {
    auth.user = { id: 'u1' }
    store.createSharedResult.mockResolvedValueOnce(row)
    const res = await CREATE(req('/api/shared-results', { method: 'POST', body }))
    expect(res.status).toBe(201)
    const out = await res.json()
    expect(out.slug).toBe('AbCdEfGh12')
    expect(out.url).toMatch(/^https:\/\/.+\/r\/AbCdEfGh12$/)
    expect(store.createSharedResult).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u1' }))
    expect(JSON.stringify(out)).not.toContain('u1')
  })
})
