// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import MarketingConsentSettings from './MarketingConsentSettings'

// V2.2-2 — the consumer marketing-consent controls, tested by DRIVING THEM.
//
// 🚨 THE TEST THAT MATTERS MOST IS THE FAILED WRITE. `fetch` RESOLVES on 401,
// 403 and 500 — it rejects only on a network failure. A component that updates
// its own state optimistically therefore shows a toggle turning ON while the
// server refused, and nothing anywhere reports a problem. This repository has
// shipped that exact bug in three controls already, so the failing case here
// returns `ok: false` with a body that LOOKS like success — the only shape that
// isolates `res.ok` from the response payload.

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const OFF = { channels: { push: false, email: false, in_app: false }, globallyUnsubscribed: false }
const PUSH_ON = { channels: { push: true, email: false, in_app: false }, globallyUnsubscribed: false }
const UNSUBSCRIBED = { channels: { push: true, email: false, in_app: false }, globallyUnsubscribed: true }

let fetchMock: ReturnType<typeof vi.fn>

/** A `fetch` whose GET yields `initial` and whose PUT yields `afterPut`. */
function wireFetch(initial: unknown, afterPut: { ok: boolean; body: unknown } = { ok: true, body: initial }) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return { ok: afterPut.ok, json: async () => ({ data: afterPut.body }) } as Response
    }
    return { ok: true, json: async () => ({ data: initial }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
}

const pushToggle = () => screen.getByLabelText('notifications.marketing.push.toggleAria')
const unsubToggle = () => screen.getByLabelText('notifications.marketing.unsubscribeAll.aria')

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('what a new user sees', () => {
  it('🚨 a user with no consent rows sees marketing OFF', async () => {
    wireFetch(OFF)
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle().getAttribute('aria-checked')).toBe('false'))
  })

  it('a stored opt-in renders ON — positive control', async () => {
    wireFetch(PUSH_ON)
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle().getAttribute('aria-checked')).toBe('true'))
  })

  it('renders nothing at all when the read is refused', async () => {
    // Signed out. A control that cannot work must not be drawn.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response))
    const { container } = render(<MarketingConsentSettings />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('opting in', () => {
  it('sends the channel and the new value to the server', async () => {
    wireFetch(OFF, { ok: true, body: PUSH_ON })
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle()).toBeTruthy())

    await act(async () => {
      fireEvent.click(pushToggle())
    })

    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT')
    expect(put).toBeTruthy()
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({
      channel: 'push',
      optedIn: true,
    })
  })

  it('renders the state the SERVER returned, not the one requested', async () => {
    // The request asks for ON; the server reports OFF. The UI must follow the
    // server — anything else lets the screen and the database disagree with
    // nothing failing.
    wireFetch(OFF, { ok: true, body: OFF })
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle()).toBeTruthy())

    await act(async () => {
      fireEvent.click(pushToggle())
    })
    await waitFor(() => expect(pushToggle().getAttribute('aria-checked')).toBe('false'))
  })

  it('🚨 a REFUSED write leaves the toggle OFF and shows an error', async () => {
    // The body deliberately looks like a success payload. Only `res.ok`
    // distinguishes them, which is exactly the check that gets omitted.
    wireFetch(OFF, { ok: false, body: PUSH_ON })
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle()).toBeTruthy())

    await act(async () => {
      fireEvent.click(pushToggle())
    })

    expect(pushToggle().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('notifications.marketing.error')).toBeTruthy()
  })

  it('a network failure also leaves the toggle OFF', async () => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') throw new Error('offline')
      return { ok: true, json: async () => ({ data: OFF }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle()).toBeTruthy())
    await act(async () => {
      fireEvent.click(pushToggle())
    })

    expect(pushToggle().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('notifications.marketing.error')).toBeTruthy()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('global unsubscribe (M-10)', () => {
  it('sends the global flag rather than a channel', async () => {
    wireFetch(PUSH_ON, { ok: true, body: UNSUBSCRIBED })
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(unsubToggle()).toBeTruthy())

    await act(async () => {
      fireEvent.click(unsubToggle())
    })

    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT')
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({
      globallyUnsubscribed: true,
    })
  })

  it('🚨 while unsubscribed, the push toggle reads OFF even though the channel row says ON', async () => {
    // The stored per-channel value is `true`; the override is what the person
    // is actually subject to, so that is what the screen must show.
    wireFetch(UNSUBSCRIBED)
    render(<MarketingConsentSettings />)
    await waitFor(() => expect(pushToggle().getAttribute('aria-checked')).toBe('false'))
  })

  it('while unsubscribed, the push toggle is disabled', async () => {
    // A control that appears to work while changing nothing is worse than one
    // that plainly does not.
    wireFetch(UNSUBSCRIBED)
    render(<MarketingConsentSettings />)
    await waitFor(() => expect((pushToggle() as HTMLButtonElement).disabled).toBe(true))
  })

  it('the unsubscribe toggle itself stays usable so it can be reversed', async () => {
    wireFetch(UNSUBSCRIBED)
    render(<MarketingConsentSettings />)
    await waitFor(() => expect((unsubToggle() as HTMLButtonElement).disabled).toBe(false))
  })
})
