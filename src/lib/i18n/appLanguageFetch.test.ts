// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * U05 / C29 — the app's language, not the browser's, reaches our own API.
 *
 * ============================================================================
 * WHY THIS TEST EXISTS
 * ============================================================================
 * C29 is the fix that covers 115 `fetch('/api/…')` call sites with one interceptor, and it shipped
 * with **zero** automated coverage. It was verified once, by hand, in a browser. Nothing failed if
 * `<AppLanguageFetch />` were deleted from the layout, if the `/api/` prefix check were widened, or
 * if the locale were captured at install time instead of read per call.
 *
 * 🚨 So this asserts BEHAVIOUR — what header actually goes out on the wire — and never the
 * existence of a file or an import. A guard that checks the interceptor is *present* passes on a
 * broken interceptor, which is the failure mode that let this go unguarded in the first place.
 *
 * The scenario in every test is the one that was broken in production: the BROWSER is English and
 * the USER chose Vietnamese inside TappyAI. Anything that sends `en` there is the bug.
 */

const STORAGE_KEY = 'tappy_lang'

/** Captures what the underlying fetch was actually called with. */
interface Captured {
  url: string
  language: string | null
  init: RequestInit | undefined
}

let captured: Captured[] = []
let original: ReturnType<typeof vi.fn>

/** Fresh module + fresh window.fetch for every test, so installs cannot leak between them. */
async function freshInterceptor() {
  vi.resetModules()
  captured = []
  original = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    // Read the header from wherever this call shape puts it.
    const language =
      input instanceof Request
        ? input.headers.get('Accept-Language')
        : new Headers(init?.headers).get('Accept-Language')
    captured.push({ url, language, init })
    return new Response('{}', { status: 200 })
  })
  window.fetch = original as unknown as typeof fetch
  // The install flag lives on a global Symbol so a remount cannot stack wrappers; clear it too.
  delete (window as unknown as Record<symbol, unknown>)[Symbol.for('tappy.appLanguageFetch.installed')]
  const mod = await import('./appLanguageFetch')
  mod.installAppLanguageFetch()
  return mod
}

beforeEach(() => {
  window.localStorage.clear()
  // jsdom serves http://localhost/ — same-origin for the relative URLs used below.
})

describe('C29 — the chosen language is sent to our own API', () => {
  it('🚨 app=vi on an English browser sends Accept-Language: vi', async () => {
    // The measured production bug, in one assertion.
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('/api/reviews/abc/like', { method: 'POST' })

    expect(captured).toHaveLength(1)
    expect(captured[0].language).toBe('vi')
  })

  it('app=en sends Accept-Language: en', async () => {
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'en')

    await window.fetch('/api/subscription')

    expect(captured[0].language).toBe('en')
  })

  it('🚨 the locale is read PER CALL, not captured at install time', async () => {
    // A user can change language mid-session. Capturing at install would keep sending the old
    // value until the next cold start — and would still pass a test that only ever set it once.
    await freshInterceptor()

    window.localStorage.setItem(STORAGE_KEY, 'vi')
    await window.fetch('/api/config')
    window.localStorage.setItem(STORAGE_KEY, 'en')
    await window.fetch('/api/config')

    expect(captured.map((c) => c.language)).toEqual(['vi', 'en'])
  })

  it('applies to every call shape, not just string URLs', async () => {
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('/api/a')
    await window.fetch(new URL('/api/b', window.location.href))
    // Built from the live origin: jsdom serves a port, and a hardcoded 'http://localhost'
    // is a DIFFERENT origin, so isOwnApi would correctly decline it and the test would be
    // measuring its own URL mistake rather than the interceptor.
    await window.fetch(new Request(new URL('/api/c', window.location.href).href))

    expect(captured.map((c) => c.language)).toEqual(['vi', 'vi', 'vi'])
  })
})

describe('C29 — what it must NOT touch', () => {
  it('leaves cross-origin requests alone', async () => {
    // Sending our UI language to a third party is not ours to do, and an extra header can turn a
    // working CORS preflight into a failing one.
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('https://xyzcompany.supabase.co/rest/v1/reviews')

    expect(captured[0].language).toBeNull()
  })

  it('leaves same-origin NON-api requests alone', async () => {
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('/reviews/abc')

    expect(captured[0].language).toBeNull()
  })

  it("respects a caller's own explicit Accept-Language", async () => {
    // A call that deliberately asks for one language keeps working.
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('/api/config', { headers: { 'Accept-Language': 'ja' } })

    expect(captured[0].language).toBe('ja')
  })

  it('sends nothing when the user has never chosen a language', async () => {
    // Then the browser's own header is the honest answer, and it is also what seeds the UI, so
    // header and UI still agree.
    await freshInterceptor()

    await window.fetch('/api/config')

    expect(captured[0].language).toBeNull()
  })

  it('preserves the rest of the request', async () => {
    // A header-adding wrapper that drops the body or the method would pass every assertion above.
    await freshInterceptor()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('/api/reviews/abc/comments', {
      method: 'POST',
      body: JSON.stringify({ body: 'hi' }),
    })

    expect(captured[0].init?.method).toBe('POST')
    expect(captured[0].init?.body).toBe(JSON.stringify({ body: 'hi' }))
  })
})

describe('C29 — installation is safe to repeat', () => {
  it('a second install does not stack wrappers', async () => {
    // React StrictMode double-invokes effects and a hot reload re-runs the module. Stacked
    // wrappers would still send the right header, so only a call count can catch this.
    const mod = await freshInterceptor()
    mod.installAppLanguageFetch()
    mod.installAppLanguageFetch()
    window.localStorage.setItem(STORAGE_KEY, 'vi')

    await window.fetch('/api/config')

    expect(original).toHaveBeenCalledTimes(1)
    expect(captured[0].language).toBe('vi')
  })
})

describe('C29 — the interceptor is actually mounted in the app', () => {
  it('the layout renders AppLanguageFetch', async () => {
    // The behaviour above is worthless if nothing installs it. This is the one structural check
    // here, and it exists because the failure it catches — a deleted line in layout.tsx — is
    // invisible to every behavioural test in this file.
    const { readFileSync } = await import('node:fs')
    const layout = readFileSync('src/app/layout.tsx', 'utf8')
    expect(layout).toMatch(/<AppLanguageFetch\s*\/>/)
    expect(layout).toMatch(/import AppLanguageFetch from '@\/components\/AppLanguageFetch'/)
  })

  it('the component installs at module scope, not inside an effect', async () => {
    // An effect runs after the first paint, so requests fired during hydration would miss the
    // header — exactly the requests that render the first screen.
    const { readFileSync } = await import('node:fs')
    const component = readFileSync('src/components/AppLanguageFetch.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(component).toMatch(/typeof window !== 'undefined'/)
    expect(component).toContain('installAppLanguageFetch()')
    expect(component, 'installing inside useEffect misses hydration-time requests').not.toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*installAppLanguageFetch/,
    )
  })
})
