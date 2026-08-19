// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DeniedView } from './DeniedView'
import { en as enStrings } from '@/lib/i18n/admin'
import { DENIAL_REASONS, type DisplayReason } from '@/lib/admin/denial'

// Controller V2 — B5, Denial UX (01_ARCH §8), the rendered surface.
//
// The server decided everything shown here; this proves the page states it, and
// states nothing else. `useTranslation` resolves to the default locale (en)
// under test — both-locale coverage is proven in src/lib/admin/denial.test.ts,
// which asserts every key exists in vi and en AND that the two differ.

afterEach(cleanup)

const PERMISSION = {
  displayName: 'View admin role assignments',
  description: 'See who holds which administrative role.',
  roles: ['super_admin'] as const,
}

describe('every reason renders its own explanation', () => {
  it.each([...DENIAL_REASONS, 'unknown'] as const)('%s', (reason: DisplayReason) => {
    render(<DeniedView reason={reason} canReturnToController={false} />)

    expect(screen.getByText(enStrings[`admin.denied.${reason}.title`])).toBeDefined()
    expect(screen.getByText(enStrings[`admin.denied.${reason}.body`])).toBeDefined()
  })

  it('announces the refusal to assistive technology', () => {
    // UI standards §8: error messages are never colour-only, and the icon is
    // decorative — so the refusal must be announced, not merely drawn.
    render(<DeniedView reason="not_corporate" canReturnToController={false} />)

    expect(screen.getByRole('alert')).toBeDefined()
  })
})

describe('§8 — "explains which permission is missing and who can grant it"', () => {
  it('names the permission and the roles that hold it', () => {
    render(<DeniedView reason="missing_permission" permission={PERMISSION} canReturnToController />)

    expect(screen.getByText(PERMISSION.displayName)).toBeDefined()
    expect(screen.getByText(PERMISSION.description)).toBeDefined()
    expect(screen.getByText('super_admin')).toBeDefined()
    expect(screen.getByText(enStrings['admin.denied.whoCanAccess'])).toBeDefined()
  })

  it('renders no permission block when the server resolved none', () => {
    // An unknown permission id is dropped server-side rather than echoed; the
    // view must then show the reason alone, not an empty labelled box.
    render(<DeniedView reason="missing_permission" canReturnToController />)

    expect(screen.queryByText(enStrings['admin.denied.whoCanAccess'])).toBeNull()
  })
})

describe('"a dead end is a support ticket" — there is always a way onward', () => {
  it('always offers the way back to the site', () => {
    render(<DeniedView reason="not_corporate" canReturnToController={false} />)

    expect(document.querySelector('a[href="/reviews"]')).not.toBeNull()
  })

  it('offers the Controller only to someone who can actually open it', () => {
    render(<DeniedView reason="missing_permission" canReturnToController />)
    expect(document.querySelector('a[href="/admin"]')).not.toBeNull()

    cleanup()

    // A non-corporate visitor cannot open /admin at all; linking there would be
    // a second dead end and a second redirect.
    render(<DeniedView reason="not_corporate" canReturnToController={false} />)
    expect(document.querySelector('a[href="/admin"]')).toBeNull()
  })
})

describe('no sensitive information reaches the page', () => {
  it.each([...DENIAL_REASONS, 'unknown'] as const)('%s leaks nothing internal', (reason: DisplayReason) => {
    render(<DeniedView reason={reason} permission={PERMISSION} canReturnToController />)

    const text = document.body.textContent ?? ''
    // The Owner Gate distinguishes ENV_SET_BUT_NO_OWNER from ENV_MISMATCH, and
    // the corporate boundary has six sub-reasons. None of that describes the
    // visitor, so none of it may appear.
    for (const forbidden of [
      /ENV_/i, /MISMATCH/i, /service.?role/i, /supabase/i,
      /token/i, /secret/i, /cookie/i, /NON_CORPORATE_DOMAIN/,
      /EMAIL_UNVERIFIED/, /NO_GRANT/, /UNKNOWN_PERMISSION/,
    ]) {
      expect(text, `${reason} leaked ${forbidden}`).not.toMatch(forbidden)
    }
  })

  it('never renders the raw reason code itself', () => {
    // The code is a wire identifier, not a message. Showing it would be the
    // "raw internal error in the UI" the contract forbids.
    render(<DeniedView reason="controller_unavailable" canReturnToController={false} />)

    expect(document.body.textContent).not.toContain('controller_unavailable')
  })
})
