import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// Controller V2 — Component 11: the diagnostic probe's SAFETY GUARD.
//
// The probe creates and revokes a REAL session. Pointed at production that is a
// production mutation, and it is the one irreversible mistake available in this
// component. The guard that prevents it is therefore a security control, and a
// security control with no test is a comment.
//
// The probe is executed as a SUBPROCESS rather than imported: it is a
// top-level-await script that would otherwise run on import, which is exactly
// the accident this file exists to prevent.
//
// Both cases asserted here exit BEFORE any network call, so this suite makes no
// requests and needs no credentials.

const PROBE = join(process.cwd(), 'scripts', 'diagnostics', 'c11-session-revocation-probe.mjs')
const PRODUCTION_URL = 'https://fwznnobrdctuskgrvuik.supabase.co'

/** Run the probe with a controlled environment; return {status, output}. */
function run(env) {
  try {
    const stdout = execFileSync(process.execPath, [PROBE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      // A clean environment: `.env.staging` must not leak into these cases, and
      // neither must a developer's shell.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output: stdout }
  } catch (e) {
    return { status: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

// Distinctive, obviously fake values — if any of these ever appear in output,
// the probe is leaking whatever was configured.
const FAKE_ANON = 'FAKE-ANON-KEY-b7a1c9e3d5'
const FAKE_SERVICE = 'FAKE-SERVICE-ROLE-KEY-9f2e4d6a8c'

describe('C11 probe — refuses to run against production', () => {
  it('exits 3 and names the refusal when pointed at the production project', () => {
    const { status, output } = run({
      STAGING_SUPABASE_URL: PRODUCTION_URL,
      STAGING_SUPABASE_ANON_KEY: FAKE_ANON,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE,
    })
    // Exit code, not just the message: a caller scripting this probe reads the
    // code, and a guard that printed a warning and continued would still be a
    // production mutation.
    expect(status, 'the probe did not refuse the production project').toBe(3)
    expect(output).toContain('REFUSING')
  })

  it('refuses on the project ref alone, whatever the host looks like', () => {
    // The ref can appear in a pooler or custom hostname. Matching the ref rather
    // than the exact URL is what makes the guard hard to walk around.
    const { status } = run({
      STAGING_SUPABASE_URL: 'https://fwznnobrdctuskgrvuik.pooler.supabase.com',
      STAGING_SUPABASE_ANON_KEY: FAKE_ANON,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE,
    })
    expect(status).toBe(3)
  })

  it('never echoes key material, even while refusing', () => {
    const { output } = run({
      STAGING_SUPABASE_URL: PRODUCTION_URL,
      STAGING_SUPABASE_ANON_KEY: FAKE_ANON,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE,
    })
    expect(output).not.toContain(FAKE_ANON)
    expect(output).not.toContain(FAKE_SERVICE)
  })

  it('exits 2 when configuration is absent, rather than falling back to anything', () => {
    // The failure mode this guards: a missing .env.staging silently resolving to
    // the production values already present in .env.local.
    const { status, output } = run({})
    expect(status).toBe(2)
    expect(output).toContain('Missing STAGING_SUPABASE_URL')
  })

  it('does not read .env.local — the production file is not a fallback', () => {
    const { status, output } = run({})
    expect(status).not.toBe(0)
    expect(output).not.toContain('fwznnobrdctuskgrvuik')
  })
})
