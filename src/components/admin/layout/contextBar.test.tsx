// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextBar } from './ContextBar'
import { AdminShell } from './AdminShell'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import { controllerEnv, type ControllerEnv } from '@/lib/controller/adminConfig'

// Controller V2 — Phase 7 / B5: the CONTEXT BAR.
//
// 01_ARCH §8 names it "env · date range · locale". 17_UI_UX_Standards §2 —
// implementation-authoritative since B5 — states the requirement it serves:
// "Context is always visible … always in view".
//
// SCOPE, and why it is partial: `env` and `locale` are fully defined. The DATE
// RANGE is not — §5.4 defines the picker's presets and its "Last 30 days"
// default, and ADR-008 fixes the reporting timezone, but NO authoritative source
// says what the range filters. It is therefore not built here; a control that
// looks like a filter and filters nothing is worse than an absent one.
//
// MEASURED before this: `env` appeared only on the Home (CommandHeader), so on
// every other Controller page an operator could not tell production from
// preview. `locale` already lived in the shell header and MOVES here — it is not
// duplicated, because two controls for one setting can disagree.

// The shell now carries a real sign-out, which uses the router. Only the STUB
// grows a function the component legitimately needs — no assertion changes.
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

// setLocale persists to localStorage, so a click test would leave every later
// render in Vietnamese. Clearing it keeps each test independent.
afterEach(() => {
  cleanup()
  window.localStorage.removeItem('tappy_lang')
})

const ENVS: ControllerEnv[] = ['production', 'preview', 'local']

describe('§2 — the environment is always in view', () => {
  it.each(ENVS)('names the %s environment in words, not a raw value', (env) => {
    render(<ContextBar env={env} />)

    expect(screen.getByText(enStrings[`admin.home.env.${env}`])).toBeDefined()
  })

  it('never renders the raw VERCEL_ENV value or any deployment identifier', () => {
    render(<ContextBar env="preview" />)

    const text = document.body.textContent ?? ''
    // 'preview' the raw value vs "Preview" the label: the label is what §2 asks
    // for. Anything resembling a deployment id or secret must not be here at all.
    for (const forbidden of [/VERCEL/i, /vercel\.app/i, /[0-9a-f]{40}/, /token/i, /secret/i, /supabase/i]) {
      expect(text).not.toMatch(forbidden)
    }
  })

  it('marks the environment for assistive technology, not by colour alone', () => {
    // UI standards §8: never colour alone.
    render(<ContextBar env="production" />)

    expect(screen.getByLabelText(enStrings['admin.context.envLabel'])).toBeDefined()
  })
})

describe('locale stays exactly one control', () => {
  it('offers both locales and marks the active one', () => {
    render(<ContextBar env="local" />)

    expect(screen.getByRole('button', { name: 'VI' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('switches the rendered language when clicked', async () => {
    render(<ContextBar env="preview" />)
    expect(screen.getByText(enStrings['admin.home.env.preview'])).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: 'VI' }))

    // 'preview', not 'production': Production reads the same in both locales, so
    // it could not tell a switched locale from an unswitched one.
    expect(screen.getByText(viStrings['admin.home.env.preview'])).toBeDefined()

    // Restore. The locale is module-level state seeded from localStorage, so
    // clearing storage in afterEach does NOT undo it — every later render in
    // this file would stay Vietnamese and assert English.
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText(enStrings['admin.home.env.preview'])).toBeDefined()
  })

  it('the shell renders the locale control ONCE — the old header copy is gone', () => {
    // Two controls for one setting can disagree; the Context Bar is where §8
    // puts this one.
    render(
      <AdminShell canonicalOrigin={null} role="admin" isOwner={false} email="a@tappyai.com" env="production" navGroups={[]}>
        <div>child</div>
      </AdminShell>
    )

    expect(screen.getAllByRole('button', { name: 'VI' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'EN' })).toHaveLength(1)
  })
})

describe('the bar is presentation only', () => {
  it('renders no link, form or control other than the locale buttons', () => {
    // It must not become a second place where access is decided or navigation
    // happens — §13 keeps authorization server-side.
    const { container } = render(<ContextBar env="production" />)

    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelectorAll('input, select, form')).toHaveLength(0)
    expect(container.querySelectorAll('button')).toHaveLength(2)
  })

  it('renders no date-range control, because its semantics are undefined', () => {
    // Guarding the DECISION, not just the absence: if someone later adds a
    // picker, this fails until the contract gap is closed and this test is
    // deliberately updated.
    const { container } = render(<ContextBar env="production" />)

    const text = container.textContent ?? ''
    for (const preset of ['Last 30 days', 'Last 7 days', 'Custom range', 'Today']) {
      expect(text).not.toContain(preset)
    }
  })
})

describe('the shell keeps everything it had', () => {
  const navGroups = [
    { hubId: 'h', label: 'admin.nav.group.security', order: 0, items: [{ moduleId: 'm', label: 'admin.nav.auditLog', icon: 'ScrollText', route: '/admin/audit', order: 0 }] },
  ]

  it('still renders hub-grouped navigation and the page content', () => {
    render(
      <AdminShell canonicalOrigin={null} role="admin" isOwner={false} email="a@tappyai.com" env="preview" navGroups={navGroups}>
        <p>page content</p>
      </AdminShell>
    )

    const group = screen.getByRole('group', { name: enStrings['admin.nav.group.security'] })
    expect(within(group).getByText(enStrings['admin.nav.auditLog'])).toBeDefined()
    expect(screen.getByText('page content')).toBeDefined()
  })

  it('still shows the actor identity and the way back to the app', () => {
    render(
      <AdminShell canonicalOrigin={null} role="admin" isOwner={false} email="a@tappyai.com" env="production" navGroups={[]}>
        <div />
      </AdminShell>
    )

    expect(screen.getByText('a@tappyai.com')).toBeDefined()
    expect(document.querySelector('a[href="/reviews"]')).not.toBeNull()
  })

  it('shows the environment on EVERY page, not only the Home', () => {
    render(
      <AdminShell canonicalOrigin={null} role="admin" isOwner={false} email="a@tappyai.com" env="preview" navGroups={navGroups}>
        <div>some other page</div>
      </AdminShell>
    )

    expect(screen.getByText(enStrings['admin.home.env.preview'])).toBeDefined()
  })
})

describe('controllerEnv — one mapping, not one per caller', () => {
  it.each([
    ['production', 'production'],
    ['preview', 'preview'],
    ['development', 'local'],
    [undefined, 'local'],
    ['something-else', 'local'],
  ] as const)('maps VERCEL_ENV=%s to %s', (raw, expected) => {
    expect(controllerEnv(raw)).toBe(expected)
  })
})

describe('both locales carry every string the bar renders', () => {
  const KEYS = ['admin.context.envLabel', ...ENVS.map((e) => `admin.home.env.${e}`)]

  it.each(KEYS)('%s exists in both locales', (key) => {
    expect(viStrings[key], `missing vi ${key}`).toBeTruthy()
    expect(enStrings[key], `missing en ${key}`).toBeTruthy()
  })

  it('the translatable ones actually differ', () => {
    // 'Production' is deliberately identical in both maps: it is a proper noun
    // used verbatim in Vietnamese engineering usage. Asserting difference there
    // would force a worse translation just to satisfy a test.
    for (const key of ['admin.context.envLabel', 'admin.home.env.preview', 'admin.home.env.local']) {
      expect(viStrings[key], `vi === en for ${key}`).not.toBe(enStrings[key])
    }
  })
})
