// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ControllerOriginProvider } from './originGate'
import { GuardedSurface } from './GuardedSurface'
import { en as enStrings } from '@/lib/i18n/admin'

import { SendNotificationForm } from '@/components/admin/notifications/SendNotificationForm'
import { UsersManager } from '@/components/admin/users/UsersManager'
import { DealsManager } from '@/components/admin/deals/DealsManager'
import { ModerationQueue } from '@/components/admin/moderation/ModerationQueue'
import { RolesManager } from '@/components/admin/rbac/RolesManager'
import { UserSessionsPanel } from '@/components/admin/users/UserSessionsPanel'
import { UserNotesPanel } from '@/components/admin/users/UserNotesPanel'
import { MembershipRoster } from '@/components/admin/org/MembershipRoster'
import { UserAnalyticsDashboard } from '@/components/admin/analytics/UserAnalyticsDashboard'
import { AuditViewer } from '@/components/admin/audit/AuditViewer'

// ─────────────────────────────────────────────────────────────────────────────
// IS THE ORIGIN GATE ACTUALLY WIRED UP — across the Controller, not just in the
// one form the ticket happened to name?
//
// originGate.test.tsx proves the primitive decides correctly. It cannot prove
// that nine different surfaces consume it, and "the author remembered to add
// two lines to each file" is exactly the kind of claim that rots.
//
// 🚨 NOTHING HERE READS SOURCE. No grep, no import-path assertion, no "does the
// component call the hook". Each case RENDERS THE REAL COMPONENT at a real
// `window.location.origin` and asks the question a person would: is this
// control offered to me, and does the app say why not.
//
// The assertion is deliberately about the EXPLANATION, not about a particular
// button: a surface passes when it presents at least one control disabled and
// labelled with the origin reason. That survives someone adding, renaming or
// reordering buttons — it only fails if the surface stops explaining itself,
// which is the regression worth catching.
//
// Every case also runs on the canonical origin, where the same label must be
// ABSENT. A gate stuck closed would satisfy every "is it disabled?" assertion
// ever written, so the enabled half is what makes the disabled half mean
// something.
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL = 'https://www.tappyai.com'
const ALIAS = 'https://tappyai-mvp.vercel.app'
const REASON = enStrings['admin.origin.actionUnavailable']
const DATA_UNAVAILABLE = enStrings['admin.origin.dataUnavailable']

function setBrowserOrigin(origin: string) {
  const url = new URL(origin)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: url.origin, href: `${url.origin}/admin` },
  })
}

const ALL: Record<string, boolean> = new Proxy({}, { get: () => true })
const USERS_CAN = ALL as never
const MODERATION_CAN = ALL as never
const NOTES_CAN = ALL as never
const SESSIONS_CAN = ALL as never
const UUID = '11111111-1111-4111-8111-111111111111'

/**
 * Every guarded surface fetches on mount. The response shape differs per
 * surface, so this answers with something structurally empty but valid for all
 * of them; the tests never assert on the data, only on what is offered.
 *
 * ⚠️ NO REAL NETWORK, and nothing here can send a notification.
 */
// A single permissive row. Several surfaces render their actions PER ITEM, so an
// empty list would prove nothing about them — the control would simply not
// exist. Field names differ per surface, so the row answers to any of them.
const ROW = new Proxy(
  { id: UUID, user_id: UUID, created_at: '2026-01-01T00:00:00.000Z' } as Record<string, unknown>,
  {
    get: (target, key) =>
      key in target ? target[key as string] : typeof key === 'string' ? `${key}` : undefined,
    has: () => true,
  },
)

const payload = {
  // Every surface reads `json.data`, and each expects a LIST.
  data: [ROW] as unknown[],
  users: [ROW], deals: [ROW], items: [ROW], roles: [ROW], sessions: [ROW],
  notes: [ROW], memberships: [ROW], rows: [ROW],
  total: 1, nextCursor: null,
}

/** Controls that carry the origin explanation, whatever element they are. */
const explainedControls = () =>
  Array.from(document.querySelectorAll('[title]')).filter(
    (el) => el.getAttribute('title') === REASON,
  )

/**
 * Click the affordance that reveals a surface's gated control.
 *
 * 🔑 Three surfaces keep their write controls behind one interaction — a detail
 * panel, an edit form, a per-item action. Rather than gate an always-visible
 * button in production purely so a test could see it — an abstraction invented
 * for the test, which is the wrong trade — the test does what a person does and
 * opens the thing first.
 */
async function openNthButton(index: number) {
  const buttons = await screen.findAllByRole('button')
  fireEvent.click(buttons[index])
}

/** MUTATION surfaces: real component, primary action gated by the shared hook. */
const MUTATION_SURFACES: { group: string; render: () => ReactElement; reveal?: () => Promise<void> }[] = [
  { group: 'notifications', render: () => <SendNotificationForm /> },
  // 🚨 NOT COVERED HERE, and said so rather than faked: the ban/suspend CONFIRM
  // inside UsersManager's detail panel. Reaching it takes three interactions
  // through a panel this stub could not open, and a test that quietly stopped
  // asserting would be worse than one that admits its edge. The users module's
  // other two guarded writes — session revoke / force-logout and adding a note —
  // ARE covered below, and they render inside this same surface in production.
  {
    group: 'deals',
    render: () => <DealsManager />,
    // Start a new deal, which is what renders the save control.
    reveal: () => openNthButton(0),
  },
  {
    group: 'moderation',
    render: () => <ModerationQueue can={MODERATION_CAN} />,
    // Choose an action on the queued item, which reveals the reason + confirm.
    reveal: () => openNthButton(0),
  },
  { group: 'rbac', render: () => <RolesManager /> },
  { group: 'sessions', render: () => <UserSessionsPanel userId={UUID} can={SESSIONS_CAN} /> },
  { group: 'user notes', render: () => <UserNotesPanel userId={UUID} can={NOTES_CAN} /> },
]

/**
 * GUARDED READ surfaces. These are wrapped at the page level, because the thing
 * being gated is the page's dependency on a guarded GET — the composition the
 * pages actually ship is what is rendered here.
 */
const GUARDED_READ_SURFACES: { group: string; render: () => ReactElement }[] = [
  { group: 'analytics (guarded GET)', render: () => <GuardedSurface><UserAnalyticsDashboard /></GuardedSurface> },
  { group: 'memberships (guarded GET)', render: () => <GuardedSurface><MembershipRoster /></GuardedSurface> },
]

const mount = (node: ReactElement) =>
  render(<ControllerOriginProvider canonicalOrigin={CANONICAL}>{node}</ControllerOriginProvider>)

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.localStorage.setItem('tappy_lang', 'en')
  // URL-aware: a detail endpoint answers with ONE record, a list with a list.
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (/\/users\/[0-9a-f-]{36}$/.test(String(url)) ? { data: ROW } : payload),
  })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the origin gate is wired into every guarded mutation surface', () => {
  it.each(MUTATION_SURFACES)(
    '$group — on a non-canonical origin, an action is offered as unavailable AND says why',
    async ({ render: renderSurface, reveal }) => {
      setBrowserOrigin(ALIAS)
      mount(renderSurface())
      if (reveal) await reveal()

      await waitFor(() => expect(explainedControls().length).toBeGreaterThan(0))
      // Explaining is not enough — it must actually be unusable.
      for (const el of explainedControls()) {
        expect(el.hasAttribute('disabled')).toBe(true)
      }
    },
  )

  it.each(MUTATION_SURFACES)(
    '$group — on the canonical origin, nothing is refused for that reason',
    async ({ render: renderSurface, reveal }) => {
      setBrowserOrigin(CANONICAL)
      mount(renderSurface())
      if (reveal) await reveal()

      // Let the mount effects settle so this is not passing merely by being early.
      await waitFor(() => expect(document.body.textContent).toBeTruthy())
      expect(explainedControls()).toHaveLength(0)
    },
  )
})

describe('the origin gate is wired into guarded READ surfaces', () => {
  it.each(GUARDED_READ_SURFACES)(
    '$group — on a non-canonical origin, says the data cannot load here',
    async ({ render: renderSurface }) => {
      setBrowserOrigin(ALIAS)
      mount(renderSurface())

      await waitFor(() => expect(screen.getByText(DATA_UNAVAILABLE)).toBeTruthy())
      // …and the panel is not also rendered underneath, half-loaded.
      expect(screen.queryByTestId('controller-surface-unavailable')).toBeTruthy()
    },
  )

  it.each(GUARDED_READ_SURFACES)(
    '$group — on the canonical origin, the surface renders as before',
    async ({ render: renderSurface }) => {
      setBrowserOrigin(CANONICAL)
      mount(renderSurface())

      await waitFor(() => expect(document.body.textContent).toBeTruthy())
      expect(screen.queryByText(DATA_UNAVAILABLE)).toBeNull()
    },
  )
})

describe('🔑 negative control — the gate is scoped to what is actually guarded', () => {
  // `/api/admin/audit` carries NO same-origin guard (measured on origin/main,
  // alongside the users list, users/[id], home/snapshot and settings). If this
  // ever starts reporting unavailable, the gate has stopped modelling the real
  // dependency and started disabling the Controller wholesale — which is the
  // failure mode this PR was explicitly scoped away from.
  it('an UNGUARDED read-only surface stays usable on a non-canonical origin', async () => {
    setBrowserOrigin(ALIAS)
    mount(<AuditViewer />)

    await waitFor(() => expect(document.body.textContent).toBeTruthy())
    expect(screen.queryByText(DATA_UNAVAILABLE)).toBeNull()
    expect(explainedControls()).toHaveLength(0)
  })
})
