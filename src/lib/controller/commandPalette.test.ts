import { describe, it, expect } from 'vitest'
import { toCommands, filterCommands } from './commandPalette'
import type { NavGroup } from './navigationProvider'

// Controller V2 — Phase 7 / B5: the COMMAND PALETTE, navigation half.
//
// The entire authoritative corpus for this surface is four statements:
//
//   01_ARCH §1  shell = "derived nav · command palette · hub switcher"
//   01_ARCH §8  "⌘K Command Palette — navigate · act · search"
//   01_ARCH §8  "the command palette making every action reachable in two keystrokes"
//   01_ARCH §8  Navigation: "Derived from the Module Registry, filtered by the
//               actor's permissions. You never see a door you cannot open."
//
// NAVIGATE is defined by the last of those and by the Navigation Provider that
// already implements it. ACT and SEARCH are not: no source names a single
// command, its permission, its confirmation or its audit; and none names a
// searchable entity, field, ranking or scope. Neither is invented here.
//
// This module NEVER re-derives permissions. It transforms NavGroup[] — a list
// the server already filtered through the PDP and the hub permissionScope —
// and cannot widen it.

/** In the order `deriveNavigation` returns them — hub order, then item order. */
const GROUPS: NavGroup[] = [
  {
    hubId: 'tappy.hub.dashboard', label: 'admin.nav.group.dashboard', order: 0,
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

/**
 * A stub label resolver, NOT the real dictionary.
 *
 * Two reasons, and the first is the Architecture Guard catching this file:
 * `01_ARCH` §1.4 forbids a consumer-app import inside `src/lib/controller/`, and
 * `@/lib/i18n/admin` is one. The rule is right — a kernel test that cannot
 * compile without the consumer app is a kernel that cannot be extracted.
 *
 * The second is that this module is about FILTERING, not about translation
 * content. Real-dictionary coverage belongs where the surface renders it, and
 * `commandPalette.test.tsx` asserts both locales there.
 */
const LABELS: Record<string, string> = {
  'admin.nav.dashboard': 'Dashboard',
  'admin.nav.auditLog': 'Audit Log',
  'admin.nav.roles': 'RBAC',
  'admin.nav.group.dashboard': 'Control Center',
  'admin.nav.group.security': 'Security',
  'admin.nav.group.analytics': 'Analytics',
  'admin.nav.group.commerce': 'Commerce',
}
const label = (key: string) => LABELS[key] ?? key

describe('toCommands — the palette consumes the authorized navigation model', () => {
  it('produces one command per navigation item, and nothing else', () => {
    const commands = toCommands(GROUPS)

    expect(commands.map((c) => c.route)).toEqual(['/admin', '/admin/audit', '/admin/rbac'])
  })

  it('carries each command under its hub, so the palette can say where it leads', () => {
    const audit = toCommands(GROUPS).find((c) => c.route === '/admin/audit')

    expect(audit).toMatchObject({
      labelKey: 'admin.nav.auditLog',
      hubLabelKey: 'admin.nav.group.security',
      icon: 'ScrollText',
    })
  })

  it('preserves the order the Navigation Provider chose', () => {
    expect(toCommands(GROUPS).map((c) => c.labelKey)).toEqual([
      'admin.nav.dashboard',
      'admin.nav.auditLog',
      'admin.nav.roles',
    ])
  })

  it('does NOT re-sort — the provider is the only ordering authority', () => {
    // Given groups in a different order, the output follows the INPUT. A second
    // sort here could disagree with the sidebar's and then the same registry
    // state would render two different sequences.
    const reversed = [GROUPS[1], GROUPS[0]]

    expect(toCommands(reversed).map((c) => c.labelKey)).toEqual([
      'admin.nav.auditLog',
      'admin.nav.roles',
      'admin.nav.dashboard',
    ])
  })

  it('emits nothing for an actor whose navigation is empty', () => {
    // An actor the PDP filtered down to nothing gets an empty palette — never a
    // fallback list, which would be a door they cannot open.
    expect(toCommands([])).toEqual([])
  })

  it('drops an empty hub rather than emitting a heading with no commands', () => {
    expect(toCommands([{ hubId: 'h', label: 'admin.nav.group.commerce', order: 0, items: [] }])).toEqual([])
  })

  it('never emits a duplicate route', () => {
    const dup: NavGroup[] = [
      GROUPS[1],
      { hubId: 'other', label: 'admin.nav.group.analytics', order: 5, items: [GROUPS[1].items[0]] },
    ]

    const routes = toCommands(dup).map((c) => c.route)
    expect(routes).toEqual([...new Set(routes)])
  })

  it('exposes i18n KEYS, not resolved text — the UI owns the locale', () => {
    for (const c of toCommands(GROUPS)) {
      expect(c.labelKey).toMatch(/^admin\./)
      expect(c.hubLabelKey).toMatch(/^admin\./)
    }
  })
})

describe('filterCommands — typing narrows the SAME list, it does not search anything', () => {
  const commands = toCommands(GROUPS)

  it('returns everything for an empty query', () => {
    expect(filterCommands(commands, '', label)).toHaveLength(3)
    expect(filterCommands(commands, '   ', label)).toHaveLength(3)
  })

  it('matches on the translated label', () => {
    const hits = filterCommands(commands, 'audit', label)

    expect(hits.map((c) => c.route)).toEqual(['/admin/audit'])
  })

  it('matches on the hub name too, so "security" finds what lives there', () => {
    const hits = filterCommands(commands, 'security', label)

    expect(hits.map((c) => c.route).sort()).toEqual(['/admin/audit', '/admin/rbac'])
  })

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(filterCommands(commands, '  AUDIT  ', label).map((c) => c.route)).toEqual(['/admin/audit'])
  })

  it('never matches on the route or the module id', () => {
    // Those are internal identifiers. Matching them would let an operator find a
    // screen by typing a path they were never shown, and would leak the id shape.
    expect(filterCommands(commands, 'm.rbac', label)).toEqual([])
    expect(filterCommands(commands, '/admin/audit', label)).toEqual([])
  })

  it('returns nothing for a query that matches nothing — no fallback list', () => {
    expect(filterCommands(commands, 'zzzz-no-such-thing', label)).toEqual([])
  })

  it('preserves the input order of whatever survives', () => {
    const hits = filterCommands(commands, 'a', label)

    expect(hits).toEqual(commands.filter((c) => hits.includes(c)))
  })

  it('cannot widen the list it was given', () => {
    // The security property: filtering is a subset operation. No query can
    // produce a command the server did not authorize.
    const everyQuery = ['', 'a', 'admin', 'user', 'deal', '*', '.*']
    for (const q of everyQuery) {
      for (const hit of filterCommands(commands, q, label)) {
        expect(commands).toContain(hit)
      }
    }
  })
})
