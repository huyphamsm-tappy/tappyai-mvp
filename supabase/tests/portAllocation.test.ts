import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * C52 — every embedded-Postgres suite must own a port nothing else uses.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Two full runs of an UNCHANGED tree reported different results:
 *
 *     run 1:  3 files failed | 5578 passed | 32 skipped
 *     run 2:  5 files failed | 5561 passed | 53 skipped
 *
 * A gate that answers differently on identical input cannot answer "is this branch green", and
 * every genuinely green run after it means less.
 *
 * Part of it was orphaned `postgres.exe` fixtures from interrupted runs holding ports — an
 * environmental condition. But part of it was a real defect: `c8_event_outbox.test.ts` and
 * `music_tracks_boundary_rls.test.ts` both declared `PORT = 54350`. Vitest runs suites in
 * PARALLEL, so whichever reached `beforeAll` second found the port already bound, threw, and
 * failed its entire file — with a message about Postgres, not about a port clash.
 *
 * 🚨 The failure never looks like what it is. It surfaces as "this RLS suite is broken", which
 * sends the next reader into the SQL rather than into the port table.
 */

const TESTS_DIR = join(import.meta.dirname)

interface PortDecl {
  file: string
  port: number
}

function portDeclarations(): PortDecl[] {
  const out: PortDecl[] = []
  for (const entry of readdirSync(TESTS_DIR)) {
    if (!entry.endsWith('.test.ts')) continue
    const src = readFileSync(join(TESTS_DIR, entry), 'utf8')
    // Only the real declaration, never a mention inside a comment.
    for (const m of src.replace(/^\s*\/\/.*$/gm, '').matchAll(/^const PORT = (\d+)$/gm)) {
      out.push({ file: entry, port: Number(m[1]) })
    }
  }
  return out
}

describe('C52 — embedded-Postgres ports are unique per suite', () => {
  const declarations = portDeclarations()

  it('finds the suites that start their own Postgres', () => {
    // Without this the uniqueness assertion below would pass over an empty list — the same
    // shape of silence that let the collision live.
    expect(declarations.length).toBeGreaterThanOrEqual(8)
  })

  it('no two suites share a port', () => {
    const byPort = new Map<number, string[]>()
    for (const { file, port } of declarations) {
      byPort.set(port, [...(byPort.get(port) ?? []), file])
    }
    const collisions = [...byPort.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([port, files]) => `port ${port}: ${files.join(' + ')}`)

    expect(
      collisions,
      'suites run in parallel — a shared port makes one of them fail intermittently, ' +
      'and the failure reads as a broken SQL suite rather than a port clash',
    ).toEqual([])
  })

  it('every port is in the private range set aside for these fixtures', () => {
    // Keeps them clear of a developer's own Postgres on 5432 and of anything ephemeral.
    for (const { file, port } of declarations) {
      expect(port, `${file} uses ${port}`).toBeGreaterThanOrEqual(54300)
      expect(port, `${file} uses ${port}`).toBeLessThan(54400)
    }
  })
})
