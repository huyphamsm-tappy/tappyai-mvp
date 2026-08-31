// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { ControllerOriginProvider } from '@/components/admin/layout/originGate'
import { BroadcastForm, CONFIRM_PHRASE, DRY_RUN_TTL_MS } from './BroadcastForm'
import { NotificationsShell } from './NotificationsShell'

// C-14 — the two-step confirmation, tested by DRIVING THE FORM.
//
// 🚨 A BROADCAST CANNOT BE RECALLED, so the assertions that matter are about
// what is IMPOSSIBLE, not about what works. Every test below either drives the
// UI to a real send and inspects the request body, or proves that a send cannot
// be reached from a given state.
//
// Nothing here reads source text. "The component contains the word BROADCAST"
// would pass against a form that ignored the phrase entirely.

const CANONICAL = 'https://www.tappyai.com'
const ALIAS = 'https://tappyai-mvp.vercel.app'

const PLAN = {
  campaignId: '11111111-1111-4111-8111-111111111111',
  audienceSize: 3,
  candidates: 5,
  excluded: { banned: 1, suspended: 1, noProfile: 0 },
  chunkCount: 1,
  chunkSizes: [3],
  audienceFingerprint: 'abcdef0123456789',
}

const RESULT = {
  campaignId: PLAN.campaignId,
  audienceSize: 3, alreadyNotified: 0, attempted: 3, chunkCount: 1,
  accepted: 3, failed: 0, gone: 0, unreachable: 0, errored: 0,
  status: 'completed', audienceFingerprint: PLAN.audienceFingerprint,
}

function setBrowserOrigin(origin: string) {
  const url = new URL(origin)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: url.origin, href: `${url.origin}/admin/notifications` },
  })
}

/** Records every POST so the request BODY can be asserted, not just the call. */
function stubFetch(responder?: (body: Record<string, unknown>) => { ok?: boolean; status?: number; data?: unknown; error?: unknown }) {
  const calls: Record<string, unknown>[] = []
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push(body)
    const r = responder?.(body) ?? {}
    const ok = r.ok ?? true
    return {
      ok,
      status: r.status ?? (ok ? 200 : 500),
      json: async () => (ok ? { data: r.data ?? (body.dryRun ? PLAN : RESULT) } : { error: r.error }),
    }
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const mount = (node: React.ReactElement = <BroadcastForm />) =>
  render(<ControllerOriginProvider canonicalOrigin={CANONICAL}>{node}</ControllerOriginProvider>)

const compose = () => {
  fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Hello' } })
  fireEvent.change(screen.getByLabelText(/^body$/i), { target: { value: 'World' } })
}

const dryRun = async () => {
  fireEvent.click(screen.getByTestId('broadcast-dry-run'))
  await waitFor(() => expect(screen.getByTestId('broadcast-review')).toBeTruthy())
}

const typePhrase = (value: string) =>
  fireEvent.change(screen.getByTestId('broadcast-phrase'), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.localStorage.setItem('tappy_lang', 'en')
  setBrowserOrigin(CANONICAL)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('1. there is no send control before a dry run', () => {
  it('🚨 the send button does not EXIST — not merely disabled', () => {
    stubFetch()
    mount()
    compose()
    expect(screen.queryByTestId('broadcast-send')).toBeNull()
    expect(screen.queryByTestId('broadcast-phrase')).toBeNull()
    expect(screen.queryByTestId('broadcast-review')).toBeNull()
  })

  it('a fully composed message still offers only the dry run', () => {
    stubFetch()
    mount()
    compose()
    expect(screen.getByTestId('broadcast-dry-run')).toBeTruthy()
    expect(screen.queryByTestId('broadcast-send')).toBeNull()
  })
})

describe('2. a dry run renders the resolved audience', () => {
  it('🔑 shows audience size, chunk count, exclusions and fingerprint', async () => {
    const calls = stubFetch()
    mount(); compose(); await dryRun()

    expect(screen.getByTestId('broadcast-audience-size').textContent).toBe('3')
    expect(screen.getByTestId('broadcast-chunk-count').textContent).toBe('1')
    expect(screen.getByTestId('broadcast-excluded').textContent).toBe('2')
    expect(screen.getByTestId('broadcast-fingerprint').textContent).toBe('abcdef0123456789')
    // 🚨 The dry run must ask for a dry run.
    expect(calls[0].dryRun).toBe(true)
  })

  it('a dry run sends NO campaignId — the server mints it', async () => {
    const calls = stubFetch()
    mount(); compose(); await dryRun()
    expect(calls[0]).not.toHaveProperty('campaignId')
  })
})

describe('3. editing the message invalidates the dry run', () => {
  it.each([
    ['title', /title/i, 'Changed'],
    ['body', /^body$/i, 'Changed'],
    ['link', /link/i, '/deals'],
  ])('🚨 editing %s removes the send control', async (_f, label, value) => {
    stubFetch()
    mount(); compose(); await dryRun()
    expect(screen.getByTestId('broadcast-send')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(label), { target: { value } })

    expect(screen.queryByTestId('broadcast-send')).toBeNull()
    expect(screen.queryByTestId('broadcast-review')).toBeNull()
  })

  it('🚨 editing also clears an already-typed phrase', async () => {
    stubFetch()
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Different' } })
    await dryRun()
    // If the phrase had survived, this would be a send armed for an audience
    // the operator never confirmed.
    expect((screen.getByTestId('broadcast-phrase') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('broadcast-send').hasAttribute('disabled')).toBe(true)
  })
})

describe('4. the dry run expires', () => {
  it('🚨 after the TTL the send control is gone and an explanation appears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubFetch()
    mount(); compose()
    fireEvent.click(screen.getByTestId('broadcast-dry-run'))
    await waitFor(() => expect(screen.getByTestId('broadcast-review')).toBeTruthy())
    expect(screen.getByTestId('broadcast-send')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(DRY_RUN_TTL_MS + 1000) })

    expect(screen.queryByTestId('broadcast-send')).toBeNull()
    expect(screen.getByTestId('broadcast-expired')).toBeTruthy()
  })
})

describe('5 & 6. the confirmation phrase', () => {
  it('🚨 a wrong phrase keeps the send disabled', async () => {
    stubFetch()
    mount(); compose(); await dryRun()
    for (const wrong of ['', 'broadcast', 'BROADCAS', 'BROADCASTT', ' BROADCAST']) {
      typePhrase(wrong)
      expect(screen.getByTestId('broadcast-send').hasAttribute('disabled'), `"${wrong}" enabled the send`).toBe(true)
    }
  })

  it('🚨 a wrong phrase cannot send even if the form is submitted directly', async () => {
    const calls = stubFetch()
    mount(); compose(); await dryRun()
    typePhrase('nope')
    fireEvent.submit(screen.getByTestId('broadcast-form'))
    await waitFor(() => expect(calls.filter((c) => c.dryRun === false)).toHaveLength(0))
  })

  it('🔑 the exact phrase enables it', async () => {
    stubFetch()
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    expect(screen.getByTestId('broadcast-send').hasAttribute('disabled')).toBe(false)
  })
})

describe('7. the real send', () => {
  it('🚨 posts dryRun:false EXPLICITLY and the dry run’s campaignId', async () => {
    const calls = stubFetch()
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.click(screen.getByTestId('broadcast-send'))

    await waitFor(() => expect(screen.getByTestId('broadcast-result')).toBeTruthy())
    const real = calls.find((c) => c.dryRun === false)!
    expect(real).toBeTruthy()
    // Explicit false, never omitted: the server defaults to true, so an omission
    // must never be how a real send happens.
    expect(Object.prototype.hasOwnProperty.call(real, 'dryRun')).toBe(true)
    expect(real.dryRun).toBe(false)
    expect(real.campaignId).toBe(PLAN.campaignId)
  })

  it('shows the campaign id in the result, and offers no way to type one in (U-5)', async () => {
    stubFetch()
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.click(screen.getByTestId('broadcast-send'))
    await waitFor(() => expect(screen.getByTestId('broadcast-result')).toBeTruthy())

    expect(screen.getByTestId('broadcast-campaign-id').textContent).toContain(PLAN.campaignId)
    // Resume stays a backend capability: no input accepts a campaign id.
    for (const input of Array.from(document.querySelectorAll('input'))) {
      expect(input.getAttribute('data-testid')).not.toBe('broadcast-campaign-id-input')
    }
  })

  it('🚨 one confirmation authorises exactly ONE send', async () => {
    const calls = stubFetch()
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.click(screen.getByTestId('broadcast-send'))
    await waitFor(() => expect(screen.getByTestId('broadcast-result')).toBeTruthy())

    // The plan is spent: the review panel and send control are gone.
    expect(screen.queryByTestId('broadcast-send')).toBeNull()
    expect(calls.filter((c) => c.dryRun === false)).toHaveLength(1)
  })
})

describe('8. a stale campaignId can never be used', () => {
  it('🚨 after an edit + fresh dry run, the send uses the NEW campaign id', async () => {
    const second = { ...PLAN, campaignId: '22222222-2222-4222-8222-222222222222', audienceSize: 9 }
    let n = 0
    const calls = stubFetch((body) => (body.dryRun ? { data: n++ === 0 ? PLAN : second } : {}))

    mount(); compose(); await dryRun()
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Second message' } })
    await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.click(screen.getByTestId('broadcast-send'))

    await waitFor(() => expect(calls.some((c) => c.dryRun === false)).toBe(true))
    const real = calls.find((c) => c.dryRun === false)!
    expect(real.campaignId).toBe(second.campaignId)
    expect(real.campaignId).not.toBe(PLAN.campaignId)
  })
})

describe('9. the server-side kill switch surfaces safely', () => {
  it('🚨 a 403 renders as an error and no result is shown', async () => {
    stubFetch((body) =>
      body.dryRun ? {} : { ok: false, status: 403, error: { code: 'FORBIDDEN', message: 'Broadcast sending is disabled' } },
    )
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.click(screen.getByTestId('broadcast-send'))

    await waitFor(() => expect(screen.getByTestId('broadcast-error')).toBeTruthy())
    expect(screen.getByTestId('broadcast-error').textContent).toContain('disabled')
    expect(screen.queryByTestId('broadcast-result')).toBeNull()
  })
})

describe('10. the origin guard', () => {
  it('🚨 on a non-canonical origin the dry-run control is disabled', () => {
    const calls = stubFetch()
    setBrowserOrigin(ALIAS)
    mount(); compose()
    const dry = screen.getByTestId('broadcast-dry-run')
    expect(dry.hasAttribute('disabled')).toBe(true)
    fireEvent.click(dry)
    expect(calls).toHaveLength(0)
  })

  // 🚨 KNOWN UNTESTABLE, AND SAID SO RATHER THAN FAKED.
  //
  // `runDryRun` and `onSend` both re-check `guard.disabled` before issuing a
  // request. Mutation testing shows removing those checks SURVIVES this suite,
  // and no honest test kills it: React does not dispatch click or submit events
  // to a disabled control, and stripping the DOM attribute does not change that
  // — React decides from the fiber's props, not the attribute. So the handler
  // branch is unreachable while the control is correctly disabled.
  //
  // It is kept anyway. It costs nothing, and it is the backstop for a future
  // refactor that drops the `disabled` prop during a styling change. What
  // actually protects production is neither of these: `isSameOrigin` refuses
  // the request server-side, and this whole gate is only about not offering an
  // action the server will reject.
  //
  // A test asserting "no request was made" after clicking a disabled button
  // passes whether or not the handler checks anything, so one was written,
  // recognised as decorative, and deleted rather than left to look like cover.
})

describe('11. canBroadcast actually gates the surface', () => {
  it('🚨 canBroadcast=false renders NO broadcast tab and NO broadcast form', () => {
    stubFetch()
    mount(<NotificationsShell canSendUser canBroadcast={false} />)
    expect(screen.queryByTestId('notif-tab-broadcast')).toBeNull()
    expect(screen.queryByTestId('broadcast-form')).toBeNull()
    expect(screen.queryByTestId('broadcast-dry-run')).toBeNull()
  })

  it('🔑 canBroadcast=true offers the tab, and selecting it shows the form', () => {
    stubFetch()
    mount(<NotificationsShell canSendUser canBroadcast />)
    expect(screen.queryByTestId('broadcast-form')).toBeNull()   // targeted is the default
    fireEvent.click(screen.getByTestId('notif-tab-broadcast'))
    expect(screen.getByTestId('broadcast-form')).toBeTruthy()
  })

  it('an actor with ONLY broadcast gets the broadcast form and no tabs', () => {
    stubFetch()
    mount(<NotificationsShell canSendUser={false} canBroadcast />)
    expect(screen.getByTestId('broadcast-form')).toBeTruthy()
    expect(screen.queryByTestId('notif-tab-broadcast')).toBeNull()
  })
})

describe('13. nothing sensitive is rendered', () => {
  const FORBIDDEN = ['fcm.googleapis.com', 'Bearer', 'p256dh', 'CRON_SECRET', '@tappyai.com', 'endpoint']

  it('🚨 nothing sensitive appears at the REVIEW step', async () => {
    stubFetch()
    mount(); compose(); await dryRun()
    const text = document.body.textContent ?? ''
    for (const f of FORBIDDEN) expect(text, `rendered ${f}`).not.toContain(f)
    // What IS shown is a hash — safe, and the only opaque string here.
    expect(text).toContain('abcdef0123456789')
  })

  it('🚨 nothing sensitive appears at the RESULT step', async () => {
    stubFetch()
    mount(); compose(); await dryRun()
    typePhrase(CONFIRM_PHRASE)
    fireEvent.click(screen.getByTestId('broadcast-send'))
    await waitFor(() => expect(screen.getByTestId('broadcast-result')).toBeTruthy())

    const text = document.body.textContent ?? ''
    for (const f of FORBIDDEN) expect(text, `rendered ${f}`).not.toContain(f)
    // The campaign id is a uuid, and it is deliberately visible (U-5).
    expect(text).toContain(PLAN.campaignId)
  })
})
