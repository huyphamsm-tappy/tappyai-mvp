// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// GA4_MEASUREMENT_ID is read at module load (Next inlines NEXT_PUBLIC_*), so each case
// stubs the env first and imports the module fresh.
async function loadGa4(id: string | undefined) {
  vi.resetModules()
  if (id === undefined) vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '')
  else vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', id)
  const mod = await import('./ga4')
  mod.__resetGa4ForTests()
  return mod
}

// dataLayer entries are `arguments` objects — flatten them for assertions.
function layer(): unknown[][] {
  return (window.dataLayer ?? []).map(a => Array.from(a as ArrayLike<unknown>))
}
function events(name?: string) {
  return layer().filter(e => e[0] === 'event' && (name === undefined || e[1] === name))
}

const ID = 'G-TEST000000'

beforeEach(() => {
  window.dataLayer = []
  window.history.replaceState(null, '', '/')
  document.title = 'TappyAI'
})
afterEach(() => { vi.unstubAllEnvs() })

describe('enablement', () => {
  it('is fully inert without a measurement id — nothing is pushed', async () => {
    const ga = await loadGa4(undefined)
    expect(ga.isGa4Enabled()).toBe(false)
    ga.ga4Init()
    ga.mirrorToGa4('page_view', { path: '/explore' })
    ga.mirrorToGa4('auth_login_completed', { method: 'google' })
    expect(layer()).toEqual([])
  })

  it('init pushes js + config exactly once, with automatic page_view OFF', async () => {
    const ga = await loadGa4(ID)
    ga.ga4Init()
    ga.ga4Init()
    const l = layer()
    expect(l).toHaveLength(2)
    expect(l[0][0]).toBe('js')
    expect(l[1][0]).toBe('config')
    expect(l[1][1]).toBe(ID)
    expect((l[1][2] as Record<string, unknown>).send_page_view).toBe(false)
  })
})

describe('page_view — one per route, never a query string', () => {
  it('fires once per pathname and collapses a repeated effect for the same path', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('page_view', { path: '/explore' })
    ga.mirrorToGa4('page_view', { path: '/explore' })   // strict-mode / remount replay
    ga.mirrorToGa4('page_view', { path: '/reviews' })
    expect(events('page_view').map(e => (e[2] as Record<string, unknown>).page_path)).toEqual(['/explore', '/reviews'])
  })

  it('strips query string and hash from the location it reports', async () => {
    const ga = await loadGa4(ID)
    window.history.replaceState(null, '', '/login?email=1&returnTo=%2Fchat#x')
    ga.mirrorToGa4('page_view', { path: '/login?email=1&returnTo=%2Fchat#x' })
    const [pv] = events('page_view')
    const p = pv[2] as Record<string, string>
    expect(p.page_location).toBe(`${window.location.origin}/login`)
    expect(p.page_path).toBe('/login')
    expect(JSON.stringify(layer())).not.toContain('email=1')
    expect(JSON.stringify(layer())).not.toContain('returnTo')
  })

  it('collapses UUID path segments (chat threads, review ids) to _id', async () => {
    const ga = await loadGa4(ID)
    expect(ga.normalizePath('/chat/2f1c9d4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe('/chat/_id')
    expect(ga.normalizePath('/reviews/abc-slug-123')).toBe('/reviews/abc-slug-123')
    expect(ga.normalizePath('')).toBe('/')
  })

  it('re-configures page_location on every route so later events carry the sanitised URL', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('page_view', { path: '/explore?q=bun+bo' })
    const configs = layer().filter(e => e[0] === 'config')
    const last = configs[configs.length - 1][2] as Record<string, unknown>
    expect(last.page_location).toBe(`${window.location.origin}/explore`)
    expect(last.send_page_view).toBe(false)
  })
})

describe('product events — the allowlist is the taxonomy', () => {
  it('maps auth events to Google recommended names with only the enum params', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('auth_signup_completed', { method: 'zalo', user_id: 'u-1', email: 'a@b.c' })
    ga.mirrorToGa4('auth_login_completed', { method: 'google', is_first_login: false, email: 'a@b.c' })
    ga.mirrorToGa4('auth_login_failed', { method: 'email', reason: 'invalid_credentials', password: 'x' })
    ga.mirrorToGa4('auth_logout_completed', {})
    expect(events('sign_up')[0][2]).toEqual({ method: 'zalo' })
    expect(events('login')[0][2]).toEqual({ method: 'google', is_first_login: false })
    expect(events('login_failed')[0][2]).toEqual({ method: 'email', reason: 'invalid_credentials' })
    expect(events('logout')[0][2]).toEqual({})
    const all = JSON.stringify(layer())
    expect(all).not.toContain('a@b.c')
    expect(all).not.toContain('u-1')
    expect(all).not.toContain('password')
  })

  it('chat_response_received → chat_response with the domain only', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('chat_response_received', { feature: 'food', content: 'Bún bò Huế ở Q1 …' })
    expect(events('chat_response')[0][2]).toEqual({ feature: 'food' })
    expect(JSON.stringify(layer())).not.toContain('Bún bò')
  })

  it('review events never forward ids, place names or the search query', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('review_search', { query: 'phở gà nguyễn du' })
    ga.mirrorToGa4('review_like', { review_id: 'r-9', place: 'Phở Hòa', liked: true })
    ga.mirrorToGa4('review_share', { review_id: 'r-9', place: 'Phở Hòa' })
    ga.mirrorToGa4('place_save', { review_id: 'r-9' })
    ga.mirrorToGa4('search_result_saved', { place_type: 'saved' })
    expect(events('search')[0][2]).toEqual({ search_type: 'reviews' })
    expect(events('review_like')[0][2]).toEqual({ liked: true })
    expect(events('share')[0][2]).toEqual({ content_type: 'review' })
    expect(events('save_place').map(e => e[2])).toEqual([{ source: 'reviews' }, { place_type: 'saved', source: 'chat' }])
    const all = JSON.stringify(layer())
    expect(all).not.toContain('r-9')
    expect(all).not.toContain('Phở Hòa')
    expect(all).not.toContain('nguyễn du')
  })

  it('an internal event outside the map is not sent at all', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('page_time', { path: '/x', duration_ms: 4000 })
    ga.mirrorToGa4('some_future_event', { anything: 1 })
    expect(events()).toEqual([])
  })

  it('recommendation_click forwards the vertical only, never the place/product', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('recommendation_click', { domain: 'food', place_id: 'p-7', name: 'Phở Hòa', position: 0 })
    expect(events('recommendation_click')[0][2]).toEqual({ domain: 'food' })
    const all = JSON.stringify(layer())
    expect(all).not.toContain('p-7')
    expect(all).not.toContain('Phở Hòa')
  })

  it('report (F-031) → report_submitted with the reason enum only', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('report', { reason: 'copyright', review_id: 'r-1', content: 'reported text' })
    expect(events('report_submitted')[0][2]).toEqual({ reason: 'copyright' })
    const all = JSON.stringify(layer())
    expect(all).not.toContain('r-1')
    expect(all).not.toContain('reported text')
  })

  it('scam_check forwards check_type + risk level, never the checked content', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('scam_check', { check_type: 'url', risk_level: 'HIGH', url: 'http://scam.example/pay?acct=123', message: 'send 5tr' })
    expect(events('scam_check')[0][2]).toEqual({ check_type: 'url', risk_level: 'HIGH' })
    const all = JSON.stringify(layer())
    expect(all).not.toContain('scam.example')
    expect(all).not.toContain('send 5tr')
  })

  it('chat_opened fires with no parameters', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('chat_opened', { conversation_id: 'c-1', category: 'food' })
    expect(events('chat_opened')[0][2]).toEqual({})
    expect(JSON.stringify(layer())).not.toContain('c-1')
  })

  it('affiliate_click forwards vertical, provider slug and the tracked boolean only', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('affiliate_click', { domain: 'shopping', provider: 'lazada', tracked: true, url: 'https://lazada.vn/x?sub=abc', linkId: 'l-9' })
    expect(events('affiliate_click')[0][2]).toEqual({ domain: 'shopping', provider: 'lazada', tracked: true })
    const all = JSON.stringify(layer())
    expect(all).not.toContain('lazada.vn/x')
    expect(all).not.toContain('l-9')
  })

  it('shopping_search_click forwards the vertical + platform enum only, never the seller or url', async () => {
    const ga = await loadGa4(ID)
    ga.mirrorToGa4('shopping_search_click', { domain: 'shopping', platform: 'shopee', seller: 'CellphoneS', url: 'https://google.com/search?q=x&prds=1', name: 'iPhone 16' })
    expect(events('shopping_search_click')[0][2]).toEqual({ domain: 'shopping', platform: 'shopee' })
    const all = JSON.stringify(layer())
    expect(all).not.toContain('CellphoneS')
    expect(all).not.toContain('google.com/search')
    expect(all).not.toContain('iPhone 16')
  })

  it('every mapped param is an enum-or-boolean key, never free text, ids or the user', async () => {
    const ga = await loadGa4(ID)
    const forbidden = /(^|_)(id|ids|email|name|query|q|text|content|message|token|phone|address|lat|lng|url)$/i
    for (const [internal, m] of Object.entries(ga.GA4_EVENT_MAP)) {
      for (const p of m.params) expect(p, `${internal} forwards ${p}`).not.toMatch(forbidden)
    }
  })
})

describe('tracker integration', () => {
  it('track() mirrors into GA4 through the same allowlist', async () => {
    await loadGa4(ID)
    const { track } = await import('@/lib/tracking/tracker')
    track('auth_login_completed', { method: 'google', is_first_login: true })
    track('page_time', { path: '/', duration_ms: 1500 })
    expect(events('login')[0][2]).toEqual({ method: 'google', is_first_login: true })
    expect(events()).toHaveLength(1)
  })
})
