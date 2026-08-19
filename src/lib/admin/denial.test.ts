import { describe, it, expect } from 'vitest'
import { denialPath, parseDenial, DENIAL_REASONS } from './denial'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import { PERMISSIONS } from './permissions/registry'

// Controller V2 — B5, Denial UX. 01_ARCH §8:
//
//   "A 403 explains which permission is missing and who can grant it.
//    A dead end is a support ticket."
//
// MEASURED before this: four structurally different denials — Owner Gate
// failure, non-corporate identity, no admin role, and a PDP denial — all
// redirected to /reviews or /admin with no signal. Every one of them had a
// precise reason available and threw it away.
//
// This module is the ONLY place that decides what a denied user is told. It is
// pure: no request, no database, no session. Authorization itself is unchanged
// and stays server-side — this decides wording, never access.

describe('the reason codes are a closed, safe set', () => {
  it('exposes exactly the four causes the guards can produce', () => {
    expect([...DENIAL_REASONS].sort()).toEqual([
      'controller_unavailable',
      'missing_permission',
      'no_admin_role',
      'not_corporate',
    ])
  })

  it('has no code that names internal configuration state', () => {
    // ENV_MISMATCH and ENV_SET_BUT_NO_OWNER tell an attacker whether the owner
    // env var is set and whether it agrees with the database. Both collapse
    // into `controller_unavailable` on purpose.
    for (const r of DENIAL_REASONS) {
      expect(r).not.toMatch(/env|owner_id|mismatch|secret|token|key/i)
    }
  })
})

describe('denialPath — what the guards redirect to', () => {
  it('never targets /admin, so a denial cannot loop back into the Controller', () => {
    for (const reason of DENIAL_REASONS) {
      expect(denialPath(reason)).not.toMatch(/^\/admin/)
    }
  })

  it('carries the missing permission so the page can name it', () => {
    expect(denialPath('missing_permission', PERMISSIONS.SECURITY_ROLES_READ)).toBe(
      '/access-denied?reason=missing_permission&permission=security.roles.read'
    )
  })

  it('omits the permission when there is none to name', () => {
    expect(denialPath('not_corporate')).toBe('/access-denied?reason=not_corporate')
  })

  it('does not attach a permission to a cause that is not about one', () => {
    // A gate failure is not a permission problem; naming one would be a lie in
    // the URL and in the message.
    expect(denialPath('controller_unavailable', PERMISSIONS.AUDIT_LOG_READ)).toBe(
      '/access-denied?reason=controller_unavailable'
    )
  })

  it('encodes the permission rather than interpolating it raw', () => {
    expect(denialPath('missing_permission', 'a b&c' as never)).toContain('permission=a%20b%26c')
  })
})

describe('parseDenial — the query string is UNTRUSTED input', () => {
  it('accepts a well-formed pair and resolves the permission from the registry', () => {
    const d = parseDenial({ reason: 'missing_permission', permission: 'security.roles.read' })

    expect(d.reason).toBe('missing_permission')
    expect(d.permission?.id).toBe('security.roles.read')
    // §8: "…and who can grant it." The registry already knows.
    expect(d.permission?.defaultRoles).toContain('super_admin')
  })

  it('falls back to the generic reason for anything not in the closed set', () => {
    for (const junk of ['', 'ENV_MISMATCH', 'admin', '../../etc/passwd', '<script>']) {
      expect(parseDenial({ reason: junk }).reason).toBe('unknown')
    }
  })

  it('ignores a permission id the registry does not declare', () => {
    // Otherwise the page would render attacker-supplied text as if it were a
    // real permission name.
    const d = parseDenial({ reason: 'missing_permission', permission: '<img onerror=x>' })

    expect(d.permission).toBeUndefined()
    expect(d.reason).toBe('missing_permission')
  })

  it('ignores a permission attached to an unrelated reason', () => {
    const d = parseDenial({ reason: 'not_corporate', permission: 'security.roles.read' })

    expect(d.permission).toBeUndefined()
  })

  it('handles missing parameters without throwing', () => {
    expect(parseDenial({}).reason).toBe('unknown')
    expect(parseDenial({ permission: 'security.roles.read' }).permission).toBeUndefined()
  })

  it('takes the first value when a parameter is repeated', () => {
    // Next gives string | string[] for repeated params; an array must not reach
    // the registry lookup as an object.
    expect(parseDenial({ reason: ['not_corporate', 'missing_permission'] }).reason).toBe('not_corporate')
  })
})

describe('every reason resolves to a translated message in BOTH locales', () => {
  const ALL = [...DENIAL_REASONS, 'unknown'] as const

  it.each(ALL)('%s is translated in vi and en, and the two differ', (reason) => {
    for (const suffix of ['title', 'body'] as const) {
      const key = `admin.denied.${reason}.${suffix}`
      expect(viStrings[key], `missing vi ${key}`).toBeTruthy()
      expect(enStrings[key], `missing en ${key}`).toBeTruthy()
      // A key copied from English into the Vietnamese map would pass a mere
      // presence check while leaving the Vietnamese UI untranslated.
      expect(viStrings[key], `vi === en for ${key}`).not.toBe(enStrings[key])
    }
  })

  it('no message leaks a term that would describe internal state', () => {
    const forbidden = /env|service.?role|supabase|token|secret|cookie|session id|uuid/i
    for (const reason of ALL) {
      for (const strings of [viStrings, enStrings]) {
        expect(strings[`admin.denied.${reason}.title`]).not.toMatch(forbidden)
        expect(strings[`admin.denied.${reason}.body`]).not.toMatch(forbidden)
      }
    }
  })
})
