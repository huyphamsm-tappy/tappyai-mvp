import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { posix } from 'node:path'

// Controller V2 — PHASE 6: retirement of the pre-RBAC `ADMIN_IDS` / `isAdmin()`
// authorization gate.
//
// Authority for the removal, and its condition:
//   FOUNDATION_01_CONTRACTS.md §11        `src/lib/admin.ts` → REMOVE
//   00_LEGACY_AUDIT.md §"ADMIN_IDS"        "Must grep and confirm zero live
//                                           references before deleting"
//   docs/backoffice/23_Implementation_Roadmap.md:382
//                                          "Removal is safe after Phase 0 is
//                                           deployed, admins are seeded, and no
//                                           code path references isAdmin()"
//
// The reason it mattered is stated by the legacy audit itself: "a second
// authorization source is a privilege-escalation surface by definition." These
// tests keep that surface closed permanently, not just on the day it was deleted.

/** Source files only — excludes build output, deps, and worktrees. */
function sourceFiles(): string[] {
  return execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "scripts/**/*.mjs"', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

describe('the legacy ADMIN_IDS authorization gate is gone and cannot return', () => {
  it('src/lib/admin.ts no longer exists', () => {
    expect(existsSync('src/lib/admin.ts')).toBe(false)
  })

  it('nothing imports the deleted module', () => {
    // Relative specifiers are RESOLVED, not string-matched. `src/lib/i18n/
    // useTranslation.ts` legitimately imports './admin' — which is
    // `src/lib/i18n/admin`, the i18n strings, an entirely different module. A
    // substring rule would condemn it and would have to be loosened until it
    // stopped catching anything.
    //
    // '@/lib/admin' is matched exactly, NOT '@/lib/admin/...': the latter is the
    // live RBAC package and must keep working. The closing quote separates them.
    const offenders = sourceFiles().filter((f) => {
      const src = readFileSync(f, 'utf8')
      if (/from\s+['"]@\/lib\/admin['"]/.test(src)) return true
      const dir = posix.dirname(f)
      for (const [, spec] of src.matchAll(/from\s+['"](\.[^'"]*)['"]/g)) {
        if (posix.normalize(posix.join(dir, spec)) === 'src/lib/admin') return true
      }
      return false
    })
    // emailEntry.test.ts names the string in a FORBIDDEN-imports list; that is an
    // assertion about absence, not an import, so it is not matched above.
    expect(offenders).toEqual([])
  })

  it('no source calls isAdmin()', () => {
    const offenders = sourceFiles().filter(
      (f) => f !== 'src/lib/admin/legacyAdminGate.test.ts' && /\bisAdmin\s*\(/.test(readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})

describe('ADMIN_IDS is no longer read as an authorization gate anywhere', () => {
  // The last reader was `src/app/api/music/tracks/[id]/report/route.ts`, which inlined an
  // ADMIN_IDS env parse to fan a report notification out to admins. That route was retired with
  // music reuse (F-024 — it now answers 410 Gone), so no source reads ADMIN_IDS at all. The guard
  // this suite exists for — ADMIN_IDS must never become `ADMIN_IDS.includes(userId)`, the shape the
  // deprecated isAdmin gate had — is now upheld by the strongest possible fact: nothing reads it.
  it('no source reads process.env.ADMIN_IDS (comments aside)', () => {
    const offenders = sourceFiles()
      .filter((f) => f !== 'src/lib/admin/legacyAdminGate.test.ts')
      .filter((f) => {
        const withoutComments = readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
        return /process\.env\.ADMIN_IDS|\bADMIN_IDS\b/.test(withoutComments)
      })
    expect(offenders).toEqual([])
  })
})
