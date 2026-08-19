// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AlertWell } from './AlertWell'
import { AttentionPanel } from './AttentionPanel'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import { ALERT_SEVERITY_ORDER, type ControllerAlert } from '@/lib/controller/alerts'

// Controller V2 — Phase 7 / B5: the ALERT WELL rendered.
//
// The server derived, ordered and permission-filtered the list (proved in
// src/lib/controller/__tests__/alerts.test.ts). This proves the surface shows
// it faithfully, shows a real answer when there is nothing, and adds nothing of
// its own. useTranslation resolves to the default locale (en) under test.

afterEach(cleanup)

const alert = (over: Partial<ControllerAlert> = {}): ControllerAlert => ({
  id: 'module_disabled:m', kind: 'module_disabled', severity: 'info',
  moduleId: 'm', moduleName: 'Deals', detail: '', ...over,
})

describe('an empty well is an answer, not a missing source', () => {
  it('says nothing needs attention', () => {
    render(<AlertWell alerts={[]} />)

    expect(screen.getByText(enStrings['admin.home.alerts.none'])).toBeDefined()
  })

  it('does not render an empty list', () => {
    const { container } = render(<AlertWell alerts={[]} />)

    expect(container.querySelector('li')).toBeNull()
  })
})

describe('every alert is rendered from what the server sent', () => {
  it('names the module and explains the kind', () => {
    render(<AlertWell alerts={[alert({ moduleName: 'Audit Log', kind: 'module_unavailable', severity: 'error' })]} />)

    expect(screen.getByText('Audit Log')).toBeDefined()
    expect(screen.getByText(new RegExp(enStrings['admin.home.alerts.module_unavailable']))).toBeDefined()
  })

  it('shows the capability id when the kind carries one', () => {
    render(<AlertWell alerts={[alert({ kind: 'capability_unresolved', severity: 'warning', detail: 'audit.read' })]} />)

    expect(screen.getByText('audit.read')).toBeDefined()
  })

  it('renders each alert once, with no duplication', () => {
    const alerts = [alert({ id: 'a', moduleId: 'a' }), alert({ id: 'b', moduleId: 'b' })]
    const { container } = render(<AlertWell alerts={alerts} />)

    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('preserves the order the server chose — it does not re-sort', () => {
    // The severity rule lives on the server. A second sort here could disagree
    // with it, and then neither would be authoritative.
    const alerts = [
      alert({ id: '1', moduleId: 'z', moduleName: 'Zed', severity: 'error', kind: 'module_unavailable' }),
      alert({ id: '2', moduleId: 'a', moduleName: 'Alpha', severity: 'info' }),
    ]
    const { container } = render(<AlertWell alerts={alerts} />)

    const names = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(names[0]).toContain('Zed')
    expect(names[1]).toContain('Alpha')
  })
})

describe('severity is never colour alone', () => {
  it.each(ALERT_SEVERITY_ORDER)('%s carries a text label for assistive tech', (severity) => {
    render(<AlertWell alerts={[alert({ severity })]} />)

    // UI standards §8: "Error messages — not colour-only, always include text."
    expect(screen.getByText(`${enStrings[`admin.home.alerts.severity.${severity}`]}:`, { exact: false })).toBeDefined()
  })
})

describe('both locales carry every string the well can render', () => {
  const KEYS = [
    'admin.home.alerts.title',
    'admin.home.alerts.none',
    'admin.home.alerts.module_unavailable',
    'admin.home.alerts.capability_unresolved',
    'admin.home.alerts.module_disabled',
    ...ALERT_SEVERITY_ORDER.map((s) => `admin.home.alerts.severity.${s}`),
  ]

  it.each(KEYS)('%s exists in vi and en, and the two differ', (key) => {
    expect(viStrings[key], `missing vi ${key}`).toBeTruthy()
    expect(enStrings[key], `missing en ${key}`).toBeTruthy()
    expect(viStrings[key], `vi === en for ${key}`).not.toBe(enStrings[key])
  })
})

describe('nothing internal reaches the surface', () => {
  it('renders no raw kind code, no ids, no internal terms', () => {
    render(
      <AlertWell
        alerts={[
          alert({ id: 'module_unavailable:tappy.hub.security.audit', moduleId: 'tappy.hub.security.audit', kind: 'module_unavailable', severity: 'error' }),
        ]}
      />
    )

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('module_unavailable')
    expect(text).not.toContain('tappy.hub.security.audit')
    for (const forbidden of [/supabase/i, /service.?role/i, /token/i, /secret/i, /postgres/i]) {
      expect(text).not.toMatch(forbidden)
    }
  })
})

describe('the Home keeps everything it had', () => {
  it('still renders recent audit activity alongside the well', () => {
    // The well replaced a NotConnected placeholder inside AttentionPanel. The
    // audit list is the panel's other half and must survive.
    render(
      <AttentionPanel
        attention={{
          recentAudit: [{ id: '1', action: 'deals.created', actorEmail: 'a@tappyai.com', actorRole: 'admin', createdAt: '2026-08-19T00:00:00Z' }],
          alerts: [],
        }}
      />
    )

    expect(screen.getByText('deals.created')).toBeDefined()
    expect(screen.getByText(enStrings['admin.home.attention.recent'])).toBeDefined()
    expect(screen.getByText(enStrings['admin.home.alerts.none'])).toBeDefined()
  })

  it('still shows the restricted state when audit is permission-gated away', () => {
    render(<AttentionPanel attention={{ recentAudit: null, alerts: [alert()] }} />)

    expect(screen.getByText(enStrings['admin.home.attention.restricted'])).toBeDefined()
    // …and the well still renders its alert. Both being present at once is the
    // independence claim: the audit gate closed, the well did not.
    expect(screen.getByText(enStrings['admin.home.alerts.title'])).toBeDefined()
    expect(screen.getByText('Deals')).toBeDefined()
  })
})
