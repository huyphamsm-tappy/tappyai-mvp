// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { ControllerOriginProvider, useControllerOrigin, normalizeOrigin, deriveOriginState } from './originGate'
import { OriginNotice } from './OriginNotice'
import { GuardedSurface, useGuardedActionProps } from './GuardedSurface'
import { en as enStrings } from '@/lib/i18n/admin'

// ─────────────────────────────────────────────────────────────────────────────
// The Controller origin gate.
//
// 🚨 EVERY ASSERTION HERE IS BEHAVIOURAL. The defect this ships against was
// found by measurement, and the guard it sits in front of already has a source-
// text-shaped guard elsewhere in this repo that stayed green while the behaviour
// it claimed to protect was switched off. So nothing below greps a file: each
// test renders a real tree at a real `window.location.origin` and reads what a
// person would see.
//
// It also asserts the ENABLED path, not only the disabled one. A gate that is
// always closed passes every "is it disabled?" test anybody writes.
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL = 'https://www.tappyai.com'

/** jsdom's origin is fixed at construction, so it is replaced per test. */
function setBrowserOrigin(origin: string) {
  const url = new URL(origin)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: url.origin, href: `${url.origin}/admin` },
  })
}

function Probe() {
  const { guardedApiAvailable, showUnavailableNotice, canonicalOrigin } = useControllerOrigin()
  const action = useGuardedActionProps()
  return (
    <div>
      <span data-testid="available">{String(guardedApiAvailable)}</span>
      <span data-testid="notice">{String(showUnavailableNotice)}</span>
      <span data-testid="canonical">{String(canonicalOrigin)}</span>
      <button data-testid="mutate" {...action}>send</button>
    </div>
  )
}

const mount = (canonical: string | null) =>
  render(
    <ControllerOriginProvider canonicalOrigin={canonical}>
      <OriginNotice />
      <Probe />
      <GuardedSurface>
        <p data-testid="panel">analytics</p>
      </GuardedSurface>
    </ControllerOriginProvider>,
  )

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('tappy_lang', 'en')
  setBrowserOrigin(CANONICAL)
})
afterEach(cleanup)

describe('1. canonical origin — the Controller works exactly as before', () => {
  it('mutation controls are enabled', async () => {
    mount(CANONICAL)
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
    expect(screen.getByTestId('mutate').hasAttribute('disabled')).toBe(false)
  })

  it('no banner is shown', async () => {
    mount(CANONICAL)
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
    expect(screen.queryByTestId('controller-origin-notice')).toBeNull()
  })

  it('guarded read surfaces render their content', async () => {
    mount(CANONICAL)
    await waitFor(() => expect(screen.getByTestId('panel')).toBeTruthy())
    expect(screen.queryByTestId('controller-surface-unavailable')).toBeNull()
  })
})

describe('2. non-canonical origin', () => {
  beforeEach(() => setBrowserOrigin('https://tappyai-mvp.vercel.app'))

  it('🚨 mutation controls are disabled', async () => {
    mount(CANONICAL)
    await waitFor(() => expect(screen.getByTestId('mutate').hasAttribute('disabled')).toBe(true))
  })

  it('🚨 guarded READ surfaces say so instead of pretending to load', async () => {
    // Six client-fetched GET routes carry the same-origin guard. Left alone they
    // spin or render "no data", and the person concludes the platform is empty.
    mount(CANONICAL)
    await waitFor(() => expect(screen.getByTestId('controller-surface-unavailable')).toBeTruthy())
    expect(screen.queryByTestId('panel')).toBeNull()
  })

  it('the banner appears exactly once', async () => {
    mount(CANONICAL)
    await waitFor(() => expect(screen.getAllByTestId('controller-origin-notice')).toHaveLength(1))
  })

  it('the banner offers the canonical address as a real link', async () => {
    mount(CANONICAL)
    const cta = await screen.findByText(enStrings['admin.origin.notice.cta'])
    expect(cta.getAttribute('href')).toBe(CANONICAL)
  })
})

describe('3. fail-closed', () => {
  it('a missing canonical origin disables mutation', async () => {
    mount(null)
    await waitFor(() => expect(screen.getByTestId('mutate').hasAttribute('disabled')).toBe(true))
    expect(screen.getByTestId('available').textContent).toBe('false')
  })

  it('a malformed canonical origin disables mutation', async () => {
    mount('not-a-url')
    await waitFor(() => expect(screen.getByTestId('mutate').hasAttribute('disabled')).toBe(true))
    expect(screen.getByTestId('canonical').textContent).toBe('null')
  })

  it('a missing canonical origin offers no broken CTA link', async () => {
    setBrowserOrigin('https://tappyai-mvp.vercel.app')
    mount(null)
    await waitFor(() => expect(screen.getByTestId('controller-origin-notice')).toBeTruthy())
    expect(screen.queryByText(enStrings['admin.origin.notice.cta'])).toBeNull()
  })

  it('🚨 an UNOBSERVED browser origin is not "allowed" — the state a render cannot show', () => {
    // React flushes the provider's effect inside `render()`, so this state never
    // reaches the DOM. It is the state fail-closed depends on, so it is asserted
    // against the decision function the provider actually uses.
    const unknown = deriveOriginState(CANONICAL, null)
    expect(unknown.guardedApiAvailable).toBe(false)
    // …and it must NOT raise the banner, or the notice would flash on the
    // canonical origin during first paint.
    expect(unknown.showUnavailableNotice).toBe(false)
  })

  it('every unknown combination fails closed', () => {
    for (const [canonical, observed] of [
      [null, null], [null, CANONICAL], [CANONICAL, null],
      ['not-a-url', CANONICAL], [CANONICAL, 'not-a-url'],
    ] as const) {
      expect(deriveOriginState(canonical, observed).guardedApiAvailable,
        `${String(canonical)} / ${String(observed)}`).toBe(false)
    }
  })
})

describe('4. normalisation', () => {
  it('a trailing slash is not a different site', async () => {
    mount('https://www.tappyai.com/')
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
  })

  it('a path on the configured value is reduced to its origin', async () => {
    mount('https://www.tappyai.com/admin?x=1')
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
  })

  it('normalizeOrigin answers null for what cannot be an origin', () => {
    for (const bad of [null, undefined, '', '   ', 'www.tappyai.com', '//tappyai.com', 'not a url']) {
      expect(normalizeOrigin(bad), String(bad)).toBeNull()
    }
  })

  it('a different scheme, host or port is not canonical', async () => {
    for (const other of ['http://www.tappyai.com', 'https://tappyai.com', 'https://www.tappyai.com:8443']) {
      cleanup()
      setBrowserOrigin(other)
      mount(CANONICAL)
      await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('false'))
    }
  })
})

describe('5. the gate is presentation, not authorization', () => {
  it('renders no allow/deny decision of its own — it only reflects the origin', async () => {
    // The value is derived from `canonicalOrigin` and `window.location.origin`
    // and nothing else: no role, no permission, no session. Feeding it a
    // canonical origin equal to the browser's always yields available, whatever
    // else is true of the actor.
    setBrowserOrigin('https://example.test')
    mount('https://example.test')
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
  })
})
