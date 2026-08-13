import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REQUIRED_ENV, URL_ENV, validateEnv, loadEnvFiles } from './check-env.mjs'

// Controller V2 — Component 9b, the deploy-time configuration gate.
//
// This suite lives under scripts/ on purpose. The required set names the
// service-role key and the Anthropic key, and the architecture guard forbids
// naming either inside src/ (`no-adhoc-service-role-client` from C9a,
// `no-vendor-api-keys` from the AI platform freeze). Those rules are right —
// a config module must not become a second place that knows privileged
// credentials — so the required list and its test both sit outside src/.
//
// The validator is exercised directly. Nothing here mocks validateEnv itself.

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ANTHROPIC_API_KEY: 'anthropic-key',
  NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com',
}

describe('C9b — the required set is exactly the five the Owner approved', () => {
  it('contains precisely those five names', () => {
    expect([...REQUIRED_ENV].sort()).toEqual(
      [
        'ANTHROPIC_API_KEY',
        'NEXT_PUBLIC_SITE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
      ].sort()
    )
  })

  it('does NOT require variables that belong to inactive capabilities', () => {
    // Owner decision 2026-08-13: a variable is not required merely because a
    // consumer reads it without a fallback. These are all read without one, and
    // none of them is present in Production today — requiring any would fail
    // every deploy.
    for (const name of [
      'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_PRIVATE_KEY', 'APPLE_ROOT_CA_PEM',
      'GOOGLE_CLOUD_PROJECT', 'GOOGLE_WEB_RISK_API_KEY',
      'LLM_FAST_MODEL', 'LLM_SMART_MODEL', 'LLM_VISION_MODEL',
      'NEXT_PUBLIC_POSTHOG_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
      'STRIPE_SECRET_KEY', 'CRON_SECRET', 'ZALO_APP_ID',
    ]) {
      expect(REQUIRED_ENV).not.toContain(name)
    }
  })
})

describe('C9b — validation', () => {
  it('a fully valid environment produces no issues', () => {
    expect(validateEnv(VALID)).toEqual([])
  })

  it('each required variable, when missing, is reported individually', () => {
    for (const name of REQUIRED_ENV) {
      const source = { ...VALID }
      delete source[name]
      const issues = validateEnv(source)
      expect(issues).toEqual([{ name, problem: 'missing' }])
    }
  })

  it('an empty or whitespace-only value is rejected, not treated as set', () => {
    for (const blank of ['', '   ']) {
      const issues = validateEnv({ ...VALID, ANTHROPIC_API_KEY: blank })
      expect(issues).toEqual([{ name: 'ANTHROPIC_API_KEY', problem: 'empty' }])
    }
  })

  it('rejects a malformed URL — D5 was a WRONG value, not a missing one', () => {
    expect(validateEnv({ ...VALID, NEXT_PUBLIC_SITE_URL: 'www.tappyai.com' }))
      .toEqual([{ name: 'NEXT_PUBLIC_SITE_URL', problem: 'not-a-url' }])
  })

  it('rejects a non-http scheme', () => {
    expect(validateEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'ftp://example.com' }))
      .toEqual([{ name: 'NEXT_PUBLIC_SUPABASE_URL', problem: 'not-http-url' }])
  })

  it('only URL-shaped variables get URL validation', () => {
    // A key that happens not to look like a URL must not be rejected.
    expect(validateEnv({ ...VALID, ANTHROPIC_API_KEY: 'not a url at all' })).toEqual([])
    expect(URL_ENV).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL'])
  })

  it('reports every problem at once, not just the first', () => {
    const issues = validateEnv({ NEXT_PUBLIC_SITE_URL: 'nonsense' })
    expect(issues).toHaveLength(5)
    expect(issues.filter((i) => i.problem === 'missing')).toHaveLength(4)
    expect(issues.find((i) => i.name === 'NEXT_PUBLIC_SITE_URL')?.problem).toBe('not-a-url')
  })

  it('an unknown extra variable is ignored', () => {
    expect(validateEnv({ ...VALID, SOMETHING_ELSE: 'x' })).toEqual([])
  })
})

describe('C9b — secrets never appear in output', () => {
  it('issues carry a name and a problem kind, and nothing else', () => {
    const issues = validateEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: '' })
    for (const issue of issues) {
      expect(Object.keys(issue).sort()).toEqual(['name', 'problem'])
    }
  })

  it('no issue object contains the offending value', () => {
    const secret = 'super-secret-value-do-not-leak'
    const issues = validateEnv({ ...VALID, NEXT_PUBLIC_SITE_URL: secret })
    expect(JSON.stringify(issues)).not.toContain(secret)
  })
})

describe('C9b — .env loading precedence', () => {
  const files = { '.env.local': 'A=from_local\nB=only_in_local\n', '.env': 'A=from_env\nC=only_in_env\n' }
  const read = (f) => files[f]
  const exists = (f) => f in files

  it('the real environment always wins over a file', () => {
    const target = { A: 'from_process' }
    loadEnvFiles(read, exists, ['.env.local', '.env'], target)
    expect(target.A).toBe('from_process')
  })

  it('an earlier file wins over a later one', () => {
    const target = {}
    loadEnvFiles(read, exists, ['.env.local', '.env'], target)
    expect(target.A).toBe('from_local')
  })

  it('variables unique to a later file are still loaded', () => {
    const target = {}
    loadEnvFiles(read, exists, ['.env.local', '.env'], target)
    expect(target.B).toBe('only_in_local')
    expect(target.C).toBe('only_in_env')
  })

  it('a missing file is skipped rather than throwing', () => {
    const target = {}
    expect(() => loadEnvFiles(read, exists, ['.env.nope'], target)).not.toThrow()
    expect(target).toEqual({})
  })

  it('strips surrounding quotes', () => {
    const quoted = { '.env': 'Q="quoted"\nS=\'single\'\n' }
    const target = {}
    loadEnvFiles((f) => quoted[f], (f) => f in quoted, ['.env'], target)
    expect(target.Q).toBe('quoted')
    expect(target.S).toBe('single')
  })
})

describe('C9b — the gate is actually wired into the build', () => {
  it('package.json runs the gate before next build', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.scripts.build).toContain('scripts/check-env.mjs')
    expect(pkg.scripts.build.indexOf('check-env.mjs')).toBeLessThan(pkg.scripts.build.indexOf('next build'))
    // `&&` — a failing gate must stop the build, not merely precede it.
    expect(pkg.scripts.build).toMatch(/check-env\.mjs\s*&&\s*next build/)
  })
})
