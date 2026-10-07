// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

// Controller V2.4 — D14 ENTRY WIRING, tested where it actually broke.
//
// 🔑 WHY THIS FILE EXISTS. `resolveEntryContext` had 16 tests and every one of
// them passed. `WorkspaceChooser` had 10 and they passed too. And the feature
// was still broken in production, because the PAGE that joins them computed
// `presentedDepartments` and then handed `departments` — the unfiltered set — to
// the Home. `?dept=` narrowed nothing.
//
// Neither unit suite could have caught that: the resolver never sees the Home,
// and the Home never sees the resolver. The bug lived exactly in the seam, so
// the test has to live there too. It calls the real page function with real
// `resolveEntryContext`, `homeMode` and `departmentSummaries`, and mocks only
// the I/O edges (PDP, Supabase, registry, KPIs, the membership seam).
//
// It asserts on the RETURNED ELEMENT rather than rendering, because the two
// facts under test are "which component did the page choose" and "what data did
// it hand over" — both are props, and rendering would only add mocking surface
// without adding evidence.
//
// ⚠️ WHAT THIS DOES NOT TEST, deliberately: authorization. The PDP guard is
// mocked as already-passed, because D14 is presentation and the guard has its
// own suites. What IS asserted here is that the presentation layer cannot be
// steered into another department's data by a URL.

// ── The two leaf components, replaced by identifiable sentinels ──────────────
// Their identity is the branch assertion, their props are the data assertion.
const ControllerHome = vi.fn(() => null)
const WorkspaceChooser = vi.fn(() => null)
vi.mock('@/components/admin/home/ControllerHome', () => ({ ControllerHome }))
vi.mock('@/components/controller/WorkspaceChooser', () => ({ WorkspaceChooser }))

// ── I/O edges ───────────────────────────────────────────────────────────────
const actor = {
  userId: 'u1',
  email: 'someone@tappyai.com',
  roles: ['analyst'],
  highestRole: 'analyst',
  isOwner: false,
}
let currentActor: typeof actor & { isOwner: boolean } = { ...actor }

vi.mock('@/lib/admin/permissions', () => ({
  requirePagePermission: vi.fn(async () => ({ actor: currentActor })),
  PERMISSIONS: {
    DASHBOARD_HOME_VIEW: 'dashboard.home.view',
    SECURITY_ROLES_READ: 'security.roles.read',
    AUDIT_LOG_READ: 'audit.log.read',
  },
}))

// Everything PDP-gated says NO, so the page takes no database branch at all.
// That keeps this test about D14 and not about the audit panel.
vi.mock('@/lib/admin/permissions/engine', () => ({
  permissionEngine: { can: () => false },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/admin/analytics/homeSnapshotService', () => ({
  fetchHomeKpis: async () => ({ status: 'empty' }),
}))
vi.mock('@/lib/controller/registry/adminModules', () => ({
  buildAdminController: () => ({
    discover: () => [],
    listHubs: () => [],
    bindCapability: () => undefined,
    version: 'test',
  }),
}))
vi.mock('@/lib/controller/navigationProvider', () => ({ deriveNavigation: () => [] }))
vi.mock('@/lib/controller/alerts', () => ({ deriveAlerts: () => [] }))
vi.mock('@/lib/controller/adminConfig', () => ({ controllerEnv: () => 'local' }))

// THE MEMBERSHIP SEAM — the only place department facts enter the page. Mocked
// because it is the DB boundary; `resolveEntryContext`, `homeMode` and
// `departmentSummaries` downstream of it are the REAL implementations.
let context: {
  isOwner: boolean
  scope: { isGlobal: boolean; departmentIds: string[] }
  memberships: Array<{ userId: string; departmentId: string; orgRole: string; scope: string; status: string }>
  allowedModules: string[]
}
vi.mock('@/lib/controller/org/server', () => ({
  resolveDepartmentContext: async () => context,
}))

const membership = (departmentId: string, status: 'active' | 'suspended' = 'active') => ({
  userId: 'u1',
  departmentId,
  orgRole: 'member',
  scope: 'department',
  status,
})

const setContext = (opts: {
  isOwner?: boolean
  memberships?: ReturnType<typeof membership>[]
}) => {
  const memberships = opts.memberships ?? []
  currentActor = { ...actor, isOwner: opts.isOwner ?? false }
  context = {
    isOwner: opts.isOwner ?? false,
    scope: {
      isGlobal: opts.isOwner ?? false,
      departmentIds: memberships.filter((m) => m.status === 'active').map((m) => m.departmentId),
    },
    memberships,
    allowedModules: [],
  }
}

/** Call the real page function exactly as the App Router would. */
const visitAdmin = async (dept?: string): Promise<ReactElement> => {
  const { default: AdminHomePage } = await import('./page')
  return (await AdminHomePage({ searchParams: dept === undefined ? {} : { dept } })) as ReactElement
}

/** The department ids the Home was actually handed. */
const presentedIds = (el: ReactElement): string[] =>
  ((el.props as { data: { departments: Array<{ id: string }> } }).data.departments ?? []).map((d) => d.id)

/** The department ids the chooser was actually offered. */
const choosableIds = (el: ReactElement): string[] =>
  ((el.props as { departments: Array<{ id: string }> }).departments ?? []).map((d) => d.id)

// Two real department ids from the registry. Using invented ids would make
// `departmentSummaries` return nothing and every assertion vacuous.
const A = 'marketing'
const B = 'finance'

beforeEach(() => {
  vi.clearAllMocks()
  setContext({})
})

describe('D14 page wiring — which screen the actor lands on', () => {
  it('A · one active membership enters the Home directly, no chooser', async () => {
    setContext({ memberships: [membership(A)] })
    const el = await visitAdmin()

    expect(el.type, 'a single membership must not be asked to choose').toBe(ControllerHome)
    expect(presentedIds(el)).toEqual([A])
  })

  it('B · two memberships and no selection ⇒ the chooser', async () => {
    setContext({ memberships: [membership(A), membership(B)] })
    const el = await visitAdmin()

    expect(el.type).toBe(WorkspaceChooser)
    expect(choosableIds(el).sort()).toEqual([B, A].sort())
  })

  it('C · two memberships with a valid ?dept= enters the Home', async () => {
    setContext({ memberships: [membership(A), membership(B)] })
    const el = await visitAdmin(A)

    expect(el.type).toBe(ControllerHome)
  })

  it('the Owner goes straight to the enterprise Home and is never asked', async () => {
    setContext({ isOwner: true })
    const el = await visitAdmin()

    expect(el.type).toBe(ControllerHome)
    // Un-narrowed: the Owner's reach is global and must not be collapsed to one
    // of fifteen departments.
    expect(presentedIds(el).length).toBeGreaterThan(1)
  })

  it('an actor with no membership keeps the existing `none` Home', async () => {
    setContext({ memberships: [] })
    const el = await visitAdmin()

    expect(el.type).toBe(ControllerHome)
    expect(presentedIds(el)).toEqual([])
  })
})

describe('D14 page wiring — ?dept= actually scopes the Home presentation', () => {
  it('🔑 D · the Home receives ONLY the selected department', async () => {
    // THE REGRESSION TEST. Against the old wiring — `departments` passed instead
    // of `presentedDepartments` — this returns both ids and fails.
    setContext({ memberships: [membership(A), membership(B)] })
    const el = await visitAdmin(A)

    expect(presentedIds(el), 'the unselected department is still being presented').toEqual([A])
  })

  it('🔑 the Owner keeps every department — narrowing must not leak into the global actor', async () => {
    setContext({ isOwner: true })
    const before = presentedIds(await visitAdmin())
    const after = presentedIds(await visitAdmin(A))

    // The Owner's `selectedDepartmentId` is null by D14, so `?dept=` is inert.
    expect(after).toEqual(before)
  })

  it('a single-membership actor is scoped to that one department', async () => {
    setContext({ memberships: [membership(A)] })

    expect(presentedIds(await visitAdmin())).toEqual([A])
  })
})

describe('D14 page wiring — fail closed', () => {
  it('🔑 E · a department the actor does NOT own never reaches the Home', async () => {
    setContext({ memberships: [membership(A), membership(B)] })
    const el = await visitAdmin('engineering')

    expect(el.type, 'an unowned id fell through into a workspace').toBe(WorkspaceChooser)
    expect(choosableIds(el)).not.toContain('engineering')
  })

  it('a garbage / hostile id returns the actor to the question', async () => {
    setContext({ memberships: [membership(A), membership(B)] })

    for (const hostile of ['../../etc/passwd', '<script>', '', 'MARKETING', 'marketing ']) {
      const el = await visitAdmin(hostile)
      expect(el.type, `hostile id was accepted: ${JSON.stringify(hostile)}`).toBe(WorkspaceChooser)
    }
  })

  it('🔑 a SUSPENDED membership is not a workspace', async () => {
    // One active, one suspended. Asking for the suspended one must not present
    // it — and must not silently present the active one either.
    setContext({ memberships: [membership(A), membership(B, 'suspended')] })
    const el = await visitAdmin(B)

    expect(el.type).toBe(ControllerHome) // only one ACTIVE membership ⇒ no choice to make
    expect(presentedIds(el), 'a suspended department was presented').toEqual([A])
    expect(presentedIds(el)).not.toContain(B)
  })

  it('a suspended-only actor is given no workspace at all', async () => {
    setContext({ memberships: [membership(A, 'suspended')] })
    const el = await visitAdmin(A)

    expect(el.type).toBe(ControllerHome)
    expect(presentedIds(el)).toEqual([])
  })
})

describe('D14 page wiring — selection is presentation, never authorization', () => {
  it('🔑 the presented set is always a subset of the actor’s own active memberships', async () => {
    setContext({ memberships: [membership(A)] })
    const owned = [A]

    for (const requested of [undefined, A, B, 'engineering', 'nonsense']) {
      const el = await visitAdmin(requested)
      if (el.type !== ControllerHome) continue
      for (const id of presentedIds(el)) {
        expect(owned, `?dept=${requested} presented a department outside the actor's memberships`).toContain(id)
      }
    }
  })

  it('?dept= changes no role, permission or ownership field on the Home data', async () => {
    setContext({ memberships: [membership(A), membership(B)] })
    const plain = (await visitAdmin(A)).props as { data: Record<string, unknown> }
    const other = (await visitAdmin(B)).props as { data: Record<string, unknown> }

    expect(other.data.actor).toEqual(plain.data.actor)
    expect(other.data.mode).toEqual(plain.data.mode)
    expect(other.data.scope).toEqual(plain.data.scope)
    expect(other.data.quickActions).toEqual(plain.data.quickActions)
  })

  it('🔑 G · the page writes NO cookie, storage or active_department', async () => {
    // D14 permits exactly one carrier: the URL. Asserted against the page source
    // because a persistence write is a thing the page would have to DO, and its
    // absence cannot be observed from a return value.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

    for (const forbidden of ['cookies(', 'localStorage', 'sessionStorage', 'active_department']) {
      // `active_department` appears in prose explaining that it is NOT used;
      // strip comments before looking for real code.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `page persists department state via ${forbidden}`).not.toContain(forbidden)
    }
  })
})
