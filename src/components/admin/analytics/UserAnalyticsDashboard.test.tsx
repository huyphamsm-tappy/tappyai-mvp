// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserAnalyticsDashboard } from './UserAnalyticsDashboard'
import { en as enStrings } from '@/lib/i18n/admin'

// Module 04 User Analytics — the dashboard's VIEW ↔ PAYLOAD binding.
//
// THE INVARIANT UNDER TEST: a payload may only be rendered by the view that
// asked for it.
//
// The component keeps ONE `data` slot for four differently-shaped payloads and
// nothing in the runtime data says which view a payload came from. Two
// independent defects follow, and this file proves both by driving the
// component, never by reading its source:
//
//   1. TRANSITION RENDER. `setView` re-renders immediately while `data` still
//      holds the previous view's payload and `loading` is still false (it is
//      raised inside the effect, which runs after the commit). The new view
//      then reads fields that do not exist on the old payload.
//
//   2. STALE RESPONSE. Requests are per-view, uncached, with no abort and no
//      sequence guard, so a response for the view the operator has LEFT can
//      land after the current view's response and overwrite it.
//
// `GrowthResult` and `EngagementResult` BOTH carry `series`, so `'series' in
// data` cannot tell them apart — a structural check is not a discriminator.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/analytics/users' }))

const T = enStrings

// Distinct magnitudes per payload so a leak between views is visible as a
// number on screen, not merely as an absence.
const GROWTH = {
  status: 'ok' as const,
  series: [{ date: '2026-08-01', totalUsers: 1234, newUsers: 56 }],
  momGrowthRate: 0.25,
}
const ENGAGEMENT = {
  status: 'ok' as const,
  series: [{ date: '2026-08-01', dau: 11, wau: 22, mau: 33, stickiness: 0.33 }],
}
const FUNNEL = {
  status: 'ok' as const,
  free: 900,
  pro: 100,
  conversionRate: 0.1,
}
const RETENTION = {
  status: 'ok' as const,
  cohorts: [
    {
      cohortDate: '2026-08-01',
      cohortSize: 40,
      d1: { retained: 20, rate: 0.5 },
      d7: { retained: 10, rate: 0.25 },
      // Not measurable — the day has not closed. Must never render as 0%.
      d30: { retained: 0, rate: null },
    },
  ],
}

type Pending = {
  view: string
  settle: (body: unknown, status?: number) => void
  /** Reject the request itself — the network failed, no response exists. */
  fail: (reason?: string) => void
}

/**
 * A fetch that hands back the resolver instead of resolving, so a test can
 * choose the ORDER responses arrive in. That ordering is the whole point of the
 * stale-response cases: with an auto-resolving stub the race cannot be posed.
 */
function deferredFetch(): Pending[] {
  const pending: Pending[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const view = /view=([a-z]+)/.exec(String(input))?.[1] ?? 'unknown'
      return new Promise((resolve, reject) => {
        pending.push({
          view,
          settle: (body, status = 200) =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              json: async () => body,
            } as Response),
          fail: (reason = 'network down') => reject(new Error(reason)),
        })
      })
    })
  )
  return pending
}

/** Resolve one in-flight request and let React flush the resulting render. */
async function deliver(p: Pending, body: unknown, status = 200) {
  await act(async () => {
    p.settle(body, status)
    await Promise.resolve()
  })
}

/** Reject one in-flight request and let React flush whatever follows. */
async function breakRequest(p: Pending) {
  await act(async () => {
    p.fail()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Run an interaction and report the error it raised, if any, instead of throwing. */
async function errorFrom(fn: () => Promise<void>): Promise<Error | null> {
  try {
    await fn()
    return null
  } catch (e) {
    return e as Error
  }
}

const tab = (key: 'growth' | 'engagement' | 'funnel' | 'retention') =>
  screen.getByRole('button', { name: T[`admin.userAnalytics.tab.${key}`] })

beforeAll(() => {
  // The dashboard renders through the app-wide locale store; pin it so the
  // assertions below compare against ONE catalogue rather than whatever the
  // test host's navigator happens to say.
  window.localStorage.setItem('tappy_lang', 'en')
})

beforeEach(() => {
  vi.unstubAllGlobals()
  // React prints render errors through console.error; the assertions report the
  // failure, so the noise is suppressed rather than the error swallowed.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── 1. VIEW / PAYLOAD MISMATCH ──────────────────────────────────────────────
//
// Each case leaves the new view's request in flight on purpose. That is the
// exact window the operator sees after clicking a tab, and the component must
// survive it without reading the old payload through the new view's shape.

describe('a payload is never rendered by a view that did not ask for it', () => {
  it('🔑 Growth payload must not be read as Engagement when the tab changes', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { data: GROWTH })
    expect(screen.getByText(T['admin.userAnalytics.growth.total'])).toBeTruthy()

    const err = await errorFrom(() => user.click(tab('engagement')))

    expect(err).toBeNull()
    // The old view's numbers must be gone, not merely unlabelled.
    expect(screen.queryByText('1,234')).toBeNull()
    expect(screen.getByText(T['admin.common.loading'])).toBeTruthy()
  })

  it('🔑 Growth payload must not be read as Funnel when the tab changes', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { data: GROWTH })

    const err = await errorFrom(() => user.click(tab('funnel')))

    expect(err).toBeNull()
    expect(screen.queryByText('1,234')).toBeNull()
    expect(screen.getByText(T['admin.common.loading'])).toBeTruthy()
  })

  it('🔑 Growth payload must not be read as Retention when the tab changes', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { data: GROWTH })

    const err = await errorFrom(() => user.click(tab('retention')))

    expect(err).toBeNull()
    expect(screen.queryByText(T['admin.userAnalytics.retention.cohort'])).toBeNull()
    expect(screen.getByText(T['admin.common.loading'])).toBeTruthy()
  })

  it('🔑 an Engagement payload answering the Growth request must not render as Growth', async () => {
    // The reverse direction, posed directly rather than through a tab change,
    // so it is proven independently of the three cases above. `latestGrowth`
    // uses the same `'series' in data` structural check, and an EngagementPoint
    // has `series` too — so Growth is vulnerable in exactly the same way.
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)

    const err = await errorFrom(() => deliver(pending[0], { data: ENGAGEMENT }))

    expect(err).toBeNull()
    // Engagement's numbers must not appear under Growth's labels.
    expect(screen.queryByText('11')).toBeNull()
    expect(screen.queryByText('22')).toBeNull()
    expect(screen.queryByText('33')).toBeNull()
  })
})

// ── 2. STALE RESPONSE RACE ──────────────────────────────────────────────────

describe('a response for a view the operator has left is discarded', () => {
  it('🔑 a late Growth response must not overwrite the Engagement view', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)

    // A (growth) is in flight; the operator switches before it lands.
    await user.click(tab('engagement'))
    const growthReq = pending.find((p) => p.view === 'growth')!
    const engagementReq = pending.find((p) => p.view === 'engagement')!

    // B answers first and is the view actually on screen.
    await deliver(engagementReq, { data: ENGAGEMENT })
    expect(screen.getByText(T['admin.userAnalytics.engagement.dau'])).toBeTruthy()

    // A lands late. It belongs to a view nobody is looking at.
    const err = await errorFrom(() => deliver(growthReq, { data: GROWTH }))

    expect(err).toBeNull()
    expect(screen.queryByText('1,234')).toBeNull()
    expect(screen.getByText(T['admin.userAnalytics.engagement.dau'])).toBeTruthy()
    expect(screen.getByText('11')).toBeTruthy()
  })

  it('🔑 a late Engagement response must not overwrite the Growth view', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)

    await user.click(tab('engagement'))
    await user.click(tab('growth'))
    const engagementReq = pending.find((p) => p.view === 'engagement')!
    const growthReqs = pending.filter((p) => p.view === 'growth')

    await deliver(growthReqs[growthReqs.length - 1], { data: GROWTH })
    expect(screen.getByText('1,234')).toBeTruthy()

    const err = await errorFrom(() => deliver(engagementReq, { data: ENGAGEMENT }))

    expect(err).toBeNull()
    expect(screen.queryByText(T['admin.userAnalytics.engagement.dau'])).toBeNull()
    expect(screen.getByText('1,234')).toBeTruthy()
  })
})

// ── 3. THE CORRECT PAIRS STILL RENDER ───────────────────────────────────────
//
// Guards against over-fixing: a component that refuses to render anything would
// satisfy every case above. Each view is reached while `data` is still null, so
// these describe the intended behaviour and not the transition defect.

describe('each view renders its own payload', () => {
  it('Growth renders its totals and month-over-month ratio', async () => {
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { data: GROWTH })

    expect(screen.getByText(T['admin.userAnalytics.growth.total'])).toBeTruthy()
    expect(screen.getByText('1,234')).toBeTruthy()
    expect(screen.getByText('56')).toBeTruthy()
    expect(screen.getByText('+25.0%')).toBeTruthy()
  })

  it('Engagement renders DAU/WAU/MAU and stickiness', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await user.click(tab('engagement'))
    await deliver(pending.find((p) => p.view === 'engagement')!, { data: ENGAGEMENT })

    expect(screen.getByText(T['admin.userAnalytics.engagement.dau'])).toBeTruthy()
    expect(screen.getByText('11')).toBeTruthy()
    expect(screen.getByText('22')).toBeTruthy()
    expect(screen.getByText('33')).toBeTruthy()
    expect(screen.getByText('+33.0%')).toBeTruthy()
  })

  it('Funnel renders free/pro and the conversion ratio', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await user.click(tab('funnel'))
    await deliver(pending.find((p) => p.view === 'funnel')!, { data: FUNNEL })

    expect(screen.getByText(T['admin.userAnalytics.funnel.free'])).toBeTruthy()
    expect(screen.getByText('900')).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('+10.0%')).toBeTruthy()
  })

  it('Retention renders the cohort table, and an unmeasurable milestone stays an em dash', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await user.click(tab('retention'))
    await deliver(pending.find((p) => p.view === 'retention')!, { data: RETENTION })

    expect(screen.getByText(T['admin.userAnalytics.retention.cohort'])).toBeTruthy()
    expect(screen.getByText('2026-08-01')).toBeTruthy()
    expect(screen.getByText('40')).toBeTruthy()
    expect(screen.getByText('50.0%')).toBeTruthy()
    // d30 has no rate. A null rate is NOT zero.
    expect(screen.queryByText('0.0%')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

// ── 4. EMPTY / ERROR SEMANTICS SURVIVE ──────────────────────────────────────

describe('empty and error remain different facts, and neither becomes zero', () => {
  it('an empty rollup renders the empty explanation, not a grid of zeros', async () => {
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { data: { status: 'empty', series: [], momGrowthRate: null } })

    expect(screen.getByText(T['admin.userAnalytics.empty'])).toBeTruthy()
    expect(screen.queryByText(T['admin.userAnalytics.growth.total'])).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('a failed request renders the error state, not the empty one', async () => {
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { error: { message: 'nope' } }, 500)

    expect(screen.getByText(T['admin.userAnalytics.error'])).toBeTruthy()
    expect(screen.queryByText(T['admin.userAnalytics.empty'])).toBeNull()
  })

  it('the empty state of one view is not carried into the next view', async () => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await deliver(pending[0], { data: { status: 'empty', series: [], momGrowthRate: null } })
    expect(screen.getByText(T['admin.userAnalytics.empty'])).toBeTruthy()

    const err = await errorFrom(() => user.click(tab('funnel')))

    expect(err).toBeNull()
    // Still loading Funnel — Growth's "nothing measured" verdict says nothing
    // about the subscription funnel.
    expect(screen.getByText(T['admin.common.loading'])).toBeTruthy()
    await deliver(pending.find((p) => p.view === 'funnel')!, { data: FUNNEL })
    await waitFor(() => expect(screen.getByText('900')).toBeTruthy())
  })
})

// ── 5. EVERY VIEW REFUSES A PAYLOAD THAT IS NOT ITS OWN ─────────────────────
//
// Added after mutation testing: deleting the per-view contract check for
// Engagement, Funnel or Retention changed nothing any test could see, because
// only Growth was ever handed a foreign payload. Binding the tag to the request
// cannot catch this on its own — the tag says "engagement" and the body is
// still a Growth body, so the shape has to be checked too.
//
// The requested view answering in the wrong shape is an ERROR: an operator must
// be told, not shown a screen with the numbers quietly missing.

describe('a view refuses a body that does not satisfy its contract', () => {
  const foreignPayloadReachesView = async (
    view: 'engagement' | 'funnel' | 'retention',
    absent: string[]
  ) => {
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await user.click(tab(view))

    // The request for THIS view is answered with a Growth body.
    const err = await errorFrom(() =>
      deliver(pending.find((p) => p.view === view)!, { data: GROWTH })
    )

    expect(err).toBeNull()
    expect(screen.getByText(T['admin.userAnalytics.error'])).toBeTruthy()
    expect(screen.queryByText(T['admin.userAnalytics.empty'])).toBeNull()
    for (const label of absent) expect(screen.queryByText(label)).toBeNull()
    // Nor may the foreign body's own numbers leak onto the screen.
    expect(screen.queryByText('1,234')).toBeNull()
  }

  it('🔑 Engagement refuses a Growth body', async () => {
    await foreignPayloadReachesView('engagement', [T['admin.userAnalytics.engagement.dau']])
  })

  it('🔑 Funnel refuses a Growth body', async () => {
    await foreignPayloadReachesView('funnel', [T['admin.userAnalytics.funnel.free']])
  })

  it('🔑 Retention refuses a Growth body', async () => {
    await foreignPayloadReachesView('retention', [T['admin.userAnalytics.retention.cohort']])
  })
})

// ── 6. A FAILED REQUEST IS ALSO SCOPED TO ITS VIEW ─────────────────────────

describe('a request that fails for an abandoned view does not disturb the current one', () => {
  it('🔑 a rejected Growth request must not replace the Engagement view with an error', async () => {
    // Added after mutation testing: the guard on the failure path was
    // unprotected. A network error belonging to the tab the operator has
    // already left must not repaint the tab they are reading.
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)

    await user.click(tab('engagement'))
    await deliver(pending.find((p) => p.view === 'engagement')!, { data: ENGAGEMENT })
    expect(screen.getByText(T['admin.userAnalytics.engagement.dau'])).toBeTruthy()

    await breakRequest(pending.find((p) => p.view === 'growth')!)

    expect(screen.queryByText(T['admin.userAnalytics.error'])).toBeNull()
    expect(screen.getByText(T['admin.userAnalytics.engagement.dau'])).toBeTruthy()
    expect(screen.getByText('11')).toBeTruthy()
  })

  it('a failed request for the CURRENT view still renders the error state', async () => {
    // The counterpart, so the guard above cannot be "fixed" by ignoring
    // failures altogether.
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)

    await breakRequest(pending[0])

    expect(screen.getByText(T['admin.userAnalytics.error'])).toBeTruthy()
  })
})

// ── 7. AN EMPTY RESULT THAT CARRIES NUMBERS STILL READS AS EMPTY ───────────

describe('empty never becomes a real zero, even when the payload contains zeros', () => {
  it('🔑 an empty Funnel carries free: 0 and must still render the explanation', async () => {
    // `userAnalyticsService` returns `{ status: 'empty', free: 0, pro, ... }`
    // for a funnel with nothing in it. That zero is NOT a measurement, and it
    // is the one payload where losing the empty branch would put a plausible
    // "0 free users" on an operator's screen instead of a crash.
    const user = userEvent.setup()
    const pending = deferredFetch()
    render(<UserAnalyticsDashboard />)
    await user.click(tab('funnel'))
    await deliver(pending.find((p) => p.view === 'funnel')!, {
      data: { status: 'empty', free: 0, pro: 0, conversionRate: null },
    })

    expect(screen.getByText(T['admin.userAnalytics.empty'])).toBeTruthy()
    expect(screen.queryByText(T['admin.userAnalytics.funnel.free'])).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })
})
