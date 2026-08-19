import { describe, it, expect } from 'vitest'
import AccessDeniedPage from './page'
import { DENIAL_REASONS } from '@/lib/admin/denial'

// Controller V2 — B5: what the SERVER decides before the view renders.
//
// Added because a mutation SURVIVED: forcing `canReturnToController` to true
// broke nothing. Offering "Back to the Controller" to an identity the Controller
// just refused is a second dead end and a second redirect — the exact
// support-ticket loop 01_ARCH §8 exists to remove.
//
// The page is a server component and returns an element; these read its props
// rather than rendering, because the decision under test is the server's.

type Props = { reason: string; canReturnToController: boolean; permission?: { roles: readonly string[] } }

const propsFor = (searchParams: Record<string, string | string[] | undefined>): Props =>
  (AccessDeniedPage({ searchParams }) as { props: Props }).props

describe('the way back is offered only where it leads somewhere', () => {
  it('offers the Controller after a permission denial — the visitor IS an admin', () => {
    expect(propsFor({ reason: 'missing_permission' }).canReturnToController).toBe(true)
  })

  it.each(DENIAL_REASONS.filter((r) => r !== 'missing_permission'))(
    'does NOT offer the Controller for %s — it is closed to them',
    (reason) => {
      expect(propsFor({ reason }).canReturnToController).toBe(false)
    }
  )

  it('does NOT offer the Controller for an unrecognised reason', () => {
    // Fail closed on the link too: an unknown reason gives no reason to believe
    // the visitor was ever admitted.
    expect(propsFor({ reason: 'anything-else' }).canReturnToController).toBe(false)
    expect(propsFor({}).canReturnToController).toBe(false)
  })

  it('cannot be talked into the link by a forged permission parameter', () => {
    // The query string is user-controlled; the link must follow the REASON, not
    // the presence of a permission the visitor typed in.
    expect(propsFor({ reason: 'not_corporate', permission: 'audit.log.read' }).canReturnToController).toBe(false)
  })
})

describe('the permission handed to the view is registry-resolved, never echoed', () => {
  it('passes the roles that hold the permission', () => {
    const props = propsFor({ reason: 'missing_permission', permission: 'security.roles.read' })

    expect(props.permission?.roles).toContain('super_admin')
  })

  it('passes nothing when the registry does not declare the id', () => {
    expect(propsFor({ reason: 'missing_permission', permission: 'made.up.permission' }).permission).toBeUndefined()
  })
})
