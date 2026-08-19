// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { AdminShell } from './AdminShell'
import { ADMIN_HUBS } from '@/lib/controller/registry/adminModules'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import type { NavGroup } from '@/lib/controller/adminNavigation'

// Controller V2 — PHASE 7: the shell renders HUBS, not a flat list.
//
// Contract:
//   FOUNDATION_01_CONTRACTS.md §2   a Hub "contains and governs modules, owns a
//                                   permission scope + nav group"
//   FOUNDATION_01_CONTRACTS.md §13  boundary: "Controller shell → Hub shell →
//                                   module surface fed by a Navigation Provider"
//   01_CONTROLLER_V2_ARCHITECTURE.md §8  navigation derived from the registry;
//                                   i18n "no raw strings"
//
// The Navigation Provider has always returned `NavGroup[]` carrying each hub's
// label and order. AdminShell flattened it away, so five registered hubs were
// invisible and their nav-group i18n keys were never translated. This is not a
// redesign: it renders data the frozen contract already requires the provider
// to produce.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

// No global auto-cleanup in this config: without this, each render stacks another
// copy of the sidebar into document.body and getAllByRole sees every one of them.
afterEach(cleanup)

// useTranslation resolves to the DEFAULT locale (en) under test. Asserting the
// Vietnamese strings here would be asserting a locale the component was never
// asked to render; the vi/en coverage is proven separately below.
const T = enStrings

const GROUPS: NavGroup[] = [
  {
    hubId: 'tappy.hub.founder', label: 'admin.nav.group.founder', order: 0,
    items: [{ moduleId: 'm.home', label: 'admin.nav.dashboard', icon: 'LayoutDashboard', route: '/admin', order: 0 }],
  },
  {
    hubId: 'tappy.hub.security', label: 'admin.nav.group.security', order: 20,
    items: [
      { moduleId: 'm.audit', label: 'admin.nav.auditLog', icon: 'ScrollText', route: '/admin/audit', order: 20 },
      { moduleId: 'm.rbac', label: 'admin.nav.roles', icon: 'KeyRound', route: '/admin/rbac', order: 30 },
    ],
  },
]

function renderShell(navGroups: NavGroup[]) {
  return render(
    <AdminShell role="super_admin" isOwner={false} email="a@tappyai.com" env="local" navGroups={navGroups}>
      <div>child</div>
    </AdminShell>
  )
}

describe('§2/§13 — the sidebar is hub-grouped', () => {
  it('renders a heading for every hub that has visible items', () => {
    renderShell(GROUPS)
    expect(screen.getByText(T['admin.nav.group.founder'])).toBeDefined()
    expect(screen.getByText(T['admin.nav.group.security'])).toBeDefined()
  })

  it('nests each module under its own hub, not in one flat list', () => {
    renderShell(GROUPS)
    // The security group must contain the security modules and NOT Home.
    const security = screen.getByRole('group', { name: T['admin.nav.group.security'] })
    expect(within(security).getByText(T['admin.nav.auditLog'])).toBeDefined()
    expect(within(security).getByText(T['admin.nav.roles'])).toBeDefined()
    expect(within(security).queryByText(T['admin.nav.dashboard'])).toBeNull()
  })

  it('preserves hub order given by the provider', () => {
    renderShell(GROUPS)
    const headings = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(headings).toEqual([
      T['admin.nav.group.founder'],
      T['admin.nav.group.security'],
    ])
  })

  it('renders nothing for a hub with no visible items — no empty heading', () => {
    // deriveNavigation already drops empty groups; the shell must not resurrect
    // one by rendering a heading before checking its items.
    renderShell([{ hubId: 'tappy.hub.empty', label: 'admin.nav.group.commerce', order: 30, items: [] }])
    expect(screen.queryByText(T['admin.nav.group.commerce'])).toBeNull()
  })

  it('still renders every module link, so grouping loses no navigation', () => {
    renderShell(GROUPS)
    for (const route of ['/admin', '/admin/audit', '/admin/rbac']) {
      expect(document.querySelector(`a[href="${route}"]`)).not.toBeNull()
    }
  })
})

describe('§8 — no raw strings: every registered hub has a translated nav group', () => {
  it.each(ADMIN_HUBS.map((h) => [h.id, h.navigationGroup] as const))(
    '%s declares %s, and it is translated in both locales',
    (_id, key) => {
      // Deliberately NOT `T` here: this block is about both locales, and using
      // the render locale would compare en against itself.
      expect(viStrings[key], `missing vi translation for ${key}`).toBeTruthy()
      expect(enStrings[key], `missing en translation for ${key}`).toBeTruthy()
    }
  )

  it('vi and en are actually different text, not a copied placeholder', () => {
    // A key added to both maps with the same English text would pass a mere
    // presence check while leaving the Vietnamese UI untranslated.
    const differing = ADMIN_HUBS.filter((h) => viStrings[h.navigationGroup] !== enStrings[h.navigationGroup])
    expect(differing).toHaveLength(ADMIN_HUBS.length)
  })
})
