import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// F-096 (owner 2026-09-25): no email in new audit rows. The DB trigger (20260925d) enforces it for
// every writer; this pins the app writer so the intent is visible where the insert is written.
describe('writeAuditLog stores no email', () => {
  const src = readFileSync(join(__dirname, 'audit.ts'), 'utf8')
  it('inserts actor_email as null, never the caller-supplied address', () => {
    expect(src).toMatch(/actor_email:\s*null,/)
    expect(src).not.toMatch(/actor_email:\s*params\.actorEmail/)
  })
})
