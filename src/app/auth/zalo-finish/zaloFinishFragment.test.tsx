// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import ZaloFinishPage from './page'

// /auth/zalo-finish receives the Zalo access token in the URL fragment (`#at=…`). The page must
// strip the fragment the moment it has read it, with replaceState, so the token does not stay in
// the address bar or the back/forward entry. (It may still be in the browser's History database,
// which records the URL at navigation — jsdom cannot test that, and replaceState cannot undo it.
// Removing the token from the URL entirely is the follow-up.) It must still USE the token it read.

const TOKEN = 'fake-zalo-access-token-for-tests-only'

let hashSeenByFirstFetch: string | null = null
let calls: { url: string; body?: string }[] = []

beforeEach(() => {
  hashSeenByFirstFetch = null
  calls = []
  window.history.replaceState(null, '', `/auth/zalo-finish?x=1#at=${TOKEN}&next=%2Fdeals&platform=web`)
  // Never resolves: the test is about what happens BEFORE the network, and a resolved flow would
  // try to navigate, which jsdom does not implement.
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (hashSeenByFirstFetch === null) hashSeenByFirstFetch = window.location.hash
    calls.push({ url: String(url), body: init?.body as string | undefined })
    return new Promise(() => {})
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('zalo-finish removes #at= from the URL', () => {
  it('the fragment is gone after the page reads it', async () => {
    const pushes = vi.spyOn(window.history, 'pushState')
    render(<ZaloFinishPage />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(window.location.href).not.toContain('at=')
    // Path and query survive; only the fragment is dropped. No new history entry was added.
    expect(window.location.pathname).toBe('/auth/zalo-finish')
    expect(window.location.search).toBe('?x=1')
    expect(pushes).not.toHaveBeenCalled()
  })

  it('it is stripped BEFORE any network request', async () => {
    render(<ZaloFinishPage />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(hashSeenByFirstFetch).toBe('')
  })

  it('the token it read is still the one used', async () => {
    render(<ZaloFinishPage />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toContain(encodeURIComponent(TOKEN))
  })

  it('a URL without a token is cleaned too', async () => {
    window.history.replaceState(null, '', '/auth/zalo-finish#next=%2F')
    const strip = vi.spyOn(window.history, 'replaceState')
    const replace = vi.fn()
    const loc = window.location
    vi.stubGlobal('location', { hash: loc.hash, pathname: loc.pathname, search: loc.search, replace })
    render(<ZaloFinishPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?error=zalo_failed'))
    expect(strip).toHaveBeenCalledWith(null, '', '/auth/zalo-finish')
    expect(strip.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0])
  })
})

describe('the source keeps the guarantee', () => {
  it('replaceState runs before the missing-token early return', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    const strip = src.indexOf('window.history.replaceState(')
    expect(strip).toBeGreaterThan(src.indexOf("params.get('at')"))
    expect(strip).toBeLessThan(src.indexOf('if (!at)'))
    expect(strip).toBeLessThan(src.indexOf('await fetch('))
  })
})
