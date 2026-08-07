// @vitest-environment jsdom
//
// The Games hub used to mount <SupertuxPreload>, which background-fetched
// supertux2.data + supertux2.wasm from Vercel Blob on every visit — so a user who
// merely opened the hub and never pressed play still pulled the large assets over
// the network. That is unnecessary Blob traffic, and the assets are not part of
// the Android V1 release at all.
//
// These tests pin the fix: rendering the hub must issue no network activity for
// the SuperTux assets. They deliberately assert on the *mechanisms* a preload
// would have to use (fetch, Cache API, <link rel=preload>) rather than on the
// absence of one particular component, so a reintroduced preload fails here no
// matter how it is written.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import GameHubPage from './page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/game',
  useSearchParams: () => new URLSearchParams(),
}))

let fetchSpy: ReturnType<typeof vi.fn>
let cacheOpen: ReturnType<typeof vi.fn>

// Flush the microtask queue *and* a macrotask turn. The preload chained
// caches.open().then(match).then(fetch), so awaiting a couple of microtasks is
// not enough to prove the fetch never happens — a timer turn is.
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

beforeEach(() => {
  // The removed preload read these two env vars and bailed out early when both
  // were empty. Without stubbing them the test would pass against the OLD code
  // too, which would make it worthless as a regression guard.
  vi.stubEnv('NEXT_PUBLIC_SUPERTUX_DATA_URL', 'https://test.public.blob.vercel-storage.com/supertux2.data')
  vi.stubEnv('NEXT_PUBLIC_SUPERTUX_WASM_URL', 'https://test.public.blob.vercel-storage.com/supertux2.wasm')

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
  window.localStorage.clear()

  fetchSpy = vi.fn(() => Promise.resolve(new Response('', { status: 200 })))
  vi.stubGlobal('fetch', fetchSpy)

  // jsdom has no Cache API. Provide one so that a reintroduced preload would take
  // its happy path and be caught, instead of silently bailing on `'caches' in window`.
  cacheOpen = vi.fn(() => Promise.resolve({
    match: vi.fn(() => Promise.resolve(undefined)),
    put: vi.fn(() => Promise.resolve()),
  }))
  vi.stubGlobal('caches', { open: cacheOpen, keys: vi.fn(() => Promise.resolve([])) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Games hub does not preload SuperTux assets', () => {
  it('renders without fetching anything', async () => {
    render(<GameHubPage />)
    await settle()

    const urls = fetchSpy.mock.calls.map(c => String(c[0]))
    expect(urls.filter(u => /supertux2\.(data|wasm)/.test(u))).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never opens the SuperTux asset cache', async () => {
    render(<GameHubPage />)
    await settle()
    // The old preload called caches.open('supertux-assets-v1') unconditionally.
    expect(cacheOpen).not.toHaveBeenCalled()
  })

  it('emits no preload/prefetch link tags for the assets', () => {
    const { container } = render(<GameHubPage />)
    const hints = container.querySelectorAll('link[rel="preload"], link[rel="prefetch"]')
    expect(hints.length).toBe(0)
    expect(document.head.innerHTML).not.toMatch(/supertux2\.(data|wasm)/)
  })

  it('still links to the game so it can be started on demand', () => {
    render(<GameHubPage />)
    const link = screen.getByRole('link', { name: /SuperTux/i })
    expect(link.getAttribute('href')).toBe('/game/supertux')
  })
})
