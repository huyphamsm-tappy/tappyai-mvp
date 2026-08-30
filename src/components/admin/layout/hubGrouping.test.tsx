// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { AdminShell } from './AdminShell'
import { ADMIN_HUBS, ADMIN_MODULES } from '@/lib/controller/registry/adminModules'
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

// The shell now carries a real sign-out, which uses the router. Only the STUB
// grows a function the component legitimately needs — no assertion changes.
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

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
    <AdminShell canonicalOrigin={null} role="super_admin" isOwner={false} email="a@tappyai.com" env="local" navGroups={navGroups}>
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
    //
    // ONE exception, named rather than counted: "Marketing" is the word used in
    // Vietnamese too. Listing the key means a SECOND untranslated hub heading
    // still fails — which a loosened count assertion would have allowed through.
    const IDENTICAL_BY_DESIGN = ['admin.nav.group.marketing']
    const copied = ADMIN_HUBS.filter(
      (h) => viStrings[h.navigationGroup] === enStrings[h.navigationGroup] &&
        !IDENTICAL_BY_DESIGN.includes(h.navigationGroup)
    )
    expect(copied).toEqual([])
    // The exception must stay real: if it is ever translated differently, drop it.
    expect(viStrings['admin.nav.group.marketing']).toBe(enStrings['admin.nav.group.marketing'])
  })

  // The same rule for MODULE labels. Hub headings were covered above from
  // Phase 7; module labels were not, and a module registered with an
  // untranslated label renders a raw i18n key in the sidebar — §8's "no raw
  // strings" broken in the one place an operator looks most.
  it.each(ADMIN_MODULES.map((m) => [m.id, m.navigation.label] as const))(
    '%s declares %s, translated in both locales',
    (_id, key) => {
      expect(viStrings[key], `missing vi translation for ${key}`).toBeTruthy()
      expect(enStrings[key], `missing en translation for ${key}`).toBeTruthy()
    }
  )

  it('module labels differ between locales too', () => {
    const differing = ADMIN_MODULES.filter(
      (m) => viStrings[m.navigation.label] !== enStrings[m.navigation.label]
    )
    expect(differing).toHaveLength(ADMIN_MODULES.length)
  })

  // The same generalisation for ICONS. `navIcon` falls back to HelpCircle for
  // an unknown name, which is safe but silent — a typo'd icon renders a
  // question mark in the sidebar and nothing fails. Module 08 had this guard
  // for itself; mutation A21 showed it did not cover the module added after it,
  // so it is asserted across the whole registry.
  it.each(ADMIN_MODULES.map((m) => [m.id, m.navigation.icon] as const))(
    '%s declares icon %s, and it resolves to a real icon',
    async (_id, icon) => {
      const { navIcon } = await import('./navIcons')
      const { HelpCircle } = await import('lucide-react')
      expect(navIcon(icon)).not.toBe(HelpCircle)
    }
  )
})
