// @vitest-environment jsdom
// Translate and Viết nội dung are hidden (SHOW_TRANSLATE / SHOW_VIET_CONTENT = false, owner decision
// 2026-10-25). These tests prove three things with the flags OFF: the entry points are gone from the
// registry, the pages 404, and both API routes refuse before reading the body or calling a model.
// The same tests also prove the routes come back when the flag is ON.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ calls: 0, vision: 0 }))

vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    generate: async () => { h.calls++; return { text: '{"caption":"x","hashtags":"#x"}' } },
    vision: async () => { h.vision++; return { text: '' } },
  },
}))

// notFound() in Next throws a sentinel; the mock keeps that contract so a 404 is observable.
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/translate',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => { throw new Error('the hidden page must not read the session') },
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/Header', () => ({ __esModule: true, default: () => null }))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => null }))
vi.mock('@/components/v3/TappyPresence', () => ({ __esModule: true, default: () => null }))

const jsonReq = (url: string, body: string) =>
  new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })

beforeEach(() => { h.calls = 0; h.vision = 0; vi.resetModules() })
afterEach(() => { vi.doUnmock('@/lib/config/product'); vi.unstubAllEnvs() })

describe('flags default to hidden', () => {
  it('SHOW_TRANSLATE and SHOW_VIET_CONTENT are false in product.ts', async () => {
    const cfg = await import('@/lib/config/product')
    expect(cfg.SHOW_TRANSLATE).toBe(false)
    expect(cfg.SHOW_VIET_CONTENT).toBe(false)
  })
})

describe('the registry has no entry point while hidden', () => {
  it('smartTools() and homeSmartTools() omit translate and captions, and no href points at them', async () => {
    const { smartTools, homeSmartTools, smartToolGroups } = await import('@/lib/tools/registry')
    const ids = smartTools().map((t) => t.id)
    expect(ids).not.toContain('translate')
    expect(ids).not.toContain('captions')
    expect(smartTools().map((t) => t.href)).not.toContain('/translate')
    expect(smartTools().map((t) => t.href)).not.toContain('/viet-content')
    expect(homeSmartTools().map((t) => t.id)).not.toContain('translate')
    expect(smartToolGroups().flatMap((g) => g.tools).map((t) => t.id)).not.toContain('captions')
  })
})

describe('the API refuses before any work while hidden', () => {
  it('/api/translate answers 404 not_found and calls no model, even with a body that would fail', async () => {
    const { POST } = await import('@/app/api/translate/route')
    const res = await POST(jsonReq('http://localhost/api/translate', 'not json'))
    expect(res.status).toBe(404)
    expect((await res.json() as { error: string }).error).toBe('not_available')
    expect(h.calls).toBe(0)
    expect(h.vision).toBe(0)
  })

  it('/api/viet-content answers 404 not_found and calls no model', async () => {
    const { POST } = await import('@/app/api/viet-content/route')
    const res = await POST(jsonReq('http://localhost/api/viet-content', '{"topic":"x"}') as unknown as Request)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('not_available')
    expect(body.message.length).toBeGreaterThan(0)
    expect(h.calls).toBe(0)
  })
})

describe('the pages 404 while hidden', () => {
  it('the translate page throws the notFound sentinel and renders nothing', async () => {
    const { default: TranslatePage } = await import('@/app/(app)/translate/page')
    expect(() => TranslatePage()).toThrow('NEXT_NOT_FOUND')
  })

  it('the viet-content page throws notFound before reading the session', async () => {
    const { default: VietContentPage } = await import('@/app/(app)/viet-content/page')
    await expect(VietContentPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('re-enabling restores the routes (flag ON)', () => {
  it('with SHOW_TRANSLATE and SHOW_VIET_CONTENT true, the routes stop answering 404', async () => {
    vi.doMock('@/lib/config/product', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/config/product')>()),
      SHOW_TRANSLATE: true,
      SHOW_VIET_CONTENT: true,
    }))
    const translate = await import('@/app/api/translate/route')
    const res = await translate.POST(jsonReq('http://localhost/api/translate', '{}'))
    // Past the flag, the existing validation answers: an empty text is a 400, not a 404.
    expect(res.status).toBe(400)
    const viet = await import('@/app/api/viet-content/route')
    const res2 = await viet.POST(jsonReq('http://localhost/api/viet-content', '{}') as unknown as Request)
    expect(res2.status).not.toBe(404)
  })
})
