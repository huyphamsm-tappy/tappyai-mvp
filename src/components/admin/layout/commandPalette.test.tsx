// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette'
import { AdminShell } from './AdminShell'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import type { NavGroup } from '@/lib/controller/adminNavigation'

// Controller V2 — Phase 7 / B5: the COMMAND PALETTE, rendered.
//
// NAVIGATE only. §8's other two words — `act` and `search` — are named and never
// specified, so they are not built. Two tests below GUARD that decision: they
// fail if a future edit grows an action or an entity search, which is the point.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

afterEach(() => {
  cleanup()
  window.localStorage.removeItem('tappy_lang')
})

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

async function openPalette(groups: readonly NavGroup[] = GROUPS) {
  render(<CommandPalette navGroups={groups} />)
  await userEvent.click(screen.getByRole('button', { name: new RegExp(enStrings['admin.palette.open']) }))
  return screen.getByRole('dialog')
}

describe('opening it', () => {
  it('opens on Ctrl+K — the ⌘K shortcut on a platform with no ⌘ key', async () => {
    render(<CommandPalette navGroups={GROUPS} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.keyboard('{Control>}k{/Control}')

    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('opens on Meta+K', async () => {
    render(<CommandPalette navGroups={GROUPS} />)

    await userEvent.keyboard('{Meta>}k{/Meta}')

    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('is also reachable without the shortcut', async () => {
    // A keyboard-only affordance is invisible to anyone who was not told it
    // exists — and UI standards §8 requires every control to be reachable.
    await openPalette()

    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('announces the shortcut on the trigger', async () => {
    render(<CommandPalette navGroups={GROUPS} />)

    const trigger = screen.getByRole('button', { name: new RegExp(enStrings['admin.palette.open']) })
    expect(trigger.getAttribute('aria-keyshortcuts')).toContain('Meta+K')
  })

  it('forgets the previous query when reopened', async () => {
    render(<CommandPalette navGroups={GROUPS} />)
    await userEvent.keyboard('{Control>}k{/Control}')
    await userEvent.type(screen.getByRole('textbox'), 'audit')
    await userEvent.keyboard('{Control>}k{/Control}') // close
    await userEvent.keyboard('{Control>}k{/Control}') // reopen

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })
})

describe('NAVIGATE — it shows exactly the authorized navigation', () => {
  it('lists every module the server authorized, with its hub', async () => {
    const dialog = await openPalette()

    expect(within(dialog).getByText(enStrings['admin.nav.auditLog'])).toBeDefined()
    expect(within(dialog).getAllByText(enStrings['admin.nav.group.security'])).toHaveLength(2)
  })

  it('shows NOTHING for an actor the PDP filtered down to nothing', async () => {
    // "You never see a door you cannot open" — and no fallback list either.
    const dialog = await openPalette([])

    expect(within(dialog).getByText(enStrings['admin.palette.noResults'])).toBeDefined()
    expect(dialog.querySelectorAll('a')).toHaveLength(0)
  })

  it('cannot show a module absent from the authorized list, whatever is typed', async () => {
    // The security property, exercised: filtering is a subset operation.
    const dialog = await openPalette([GROUPS[0]])
    await userEvent.type(screen.getByRole('textbox'), 'rbac')

    expect(within(dialog).queryByText(enStrings['admin.nav.roles'])).toBeNull()
  })

  it('renders links, so every entry is reachable by Tab', async () => {
    const dialog = await openPalette()

    expect(dialog.querySelectorAll('a[href]')).toHaveLength(3)
  })

  it('keeps the order the Navigation Provider chose', async () => {
    const dialog = await openPalette()

    const hrefs = [...dialog.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/admin', '/admin/audit', '/admin/rbac'])
  })

  it('narrows as the operator types, on the label and the hub name', async () => {
    const dialog = await openPalette()

    await userEvent.type(screen.getByRole('textbox'), 'security')

    expect(within(dialog).queryByText(enStrings['admin.nav.dashboard'])).toBeNull()
    expect(within(dialog).getByText(enStrings['admin.nav.auditLog'])).toBeDefined()
  })

  it('says so when nothing matches', async () => {
    const dialog = await openPalette()

    await userEvent.type(screen.getByRole('textbox'), 'zzzz')

    expect(within(dialog).getByText(enStrings['admin.palette.noResults'])).toBeDefined()
  })
})

describe('ACT and SEARCH are NOT implemented — and that is guarded', () => {
  it('offers no command that mutates anything', async () => {
    // §8 names `act` but no source lists a single command, its permission, its
    // confirmation or its audit. If someone adds one, this fails until the
    // contract gap is closed deliberately.
    const dialog = await openPalette()

    expect(dialog.querySelectorAll('button[type="submit"], form')).toHaveLength(0)
    const text = dialog.textContent ?? ''
    for (const verb of ['Delete', 'Revoke', 'Grant', 'Disable', 'Enable', 'Suspend', 'Export']) {
      expect(text).not.toContain(verb)
    }
  })

  it('searches no entity — only the navigation list it was handed', async () => {
    // A query that would match a user, a deal or an audit row returns nothing,
    // because nothing here reaches data.
    const dialog = await openPalette()

    await userEvent.type(screen.getByRole('textbox'), 'a@tappyai.com')

    expect(within(dialog).getByText(enStrings['admin.palette.noResults'])).toBeDefined()
  })
})

describe('nothing internal is rendered', () => {
  it('shows translated labels, never a route, a module id or a raw key', async () => {
    const dialog = await openPalette()

    const text = dialog.textContent ?? ''
    expect(text).not.toContain('/admin/audit')
    expect(text).not.toContain('m.audit')
    expect(text).not.toContain('admin.nav.auditLog')
    for (const forbidden of [/permission/i, /supabase/i, /token/i, /secret/i]) {
      expect(text).not.toMatch(forbidden)
    }
  })

  it('carries both locales for every string it renders', () => {
    for (const key of ['admin.palette.open', 'admin.palette.title', 'admin.palette.placeholder', 'admin.palette.noResults']) {
      expect(viStrings[key], `missing vi ${key}`).toBeTruthy()
      expect(enStrings[key], `missing en ${key}`).toBeTruthy()
      expect(viStrings[key], `vi === en for ${key}`).not.toBe(enStrings[key])
    }
  })
})

describe('the shell keeps everything it had', () => {
  it('renders the palette alongside hub navigation, the Context Bar and the identity', () => {
    render(
      <AdminShell role="admin" isOwner={false} email="a@tappyai.com" env="preview" navGroups={GROUPS}>
        <p>page content</p>
      </AdminShell>
    )

    expect(screen.getByRole('button', { name: new RegExp(enStrings['admin.palette.open']) })).toBeDefined()
    expect(screen.getByRole('group', { name: enStrings['admin.nav.group.security'] })).toBeDefined()
    expect(screen.getByText(enStrings['admin.home.env.preview'])).toBeDefined()
    expect(screen.getByText('a@tappyai.com')).toBeDefined()
    expect(screen.getByText('page content')).toBeDefined()
  })
})
