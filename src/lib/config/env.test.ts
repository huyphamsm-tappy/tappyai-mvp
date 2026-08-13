import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serverEnv, envNumber, envBoolean } from './env'
import { isSameOrigin } from '@/lib/admin/rbac'

// Controller V2 — Component 9b, the runtime typed boundary.
//
// The deploy-time gate and the required set are covered by
// scripts/check-env.test.mjs; this file covers runtime access only.
//
// Nothing here mocks the accessors under test — they read the real
// `process.env`, which the tests set and restore.

const saved = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
  Object.assign(process.env, saved)
})

describe('C9b — serverEnv.siteUrl', () => {
  it('returns the configured value', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.tappyai.com'
    expect(serverEnv.siteUrl()).toBe('https://www.tappyai.com')
  })

  it('treats unset and whitespace-only alike, as undefined', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(serverEnv.siteUrl()).toBeUndefined()
    process.env.NEXT_PUBLIC_SITE_URL = '   '
    expect(serverEnv.siteUrl()).toBeUndefined()
  })

  it('does NOT throw when missing — the deploy gate owns that failure', () => {
    // Throwing here would turn a configuration mistake into a 500 on a live
    // instance, which is exactly what building the gate at deploy time avoids.
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(() => serverEnv.siteUrl()).not.toThrow()
  })
})

describe('C9b — envNumber', () => {
  it('parses a numeric value', () => {
    process.env.C9B_N = '30'
    expect(envNumber('C9B_N', 365)).toBe(30)
  })

  it('falls back when unset', () => {
    delete process.env.C9B_N
    expect(envNumber('C9B_N', 365)).toBe(365)
  })

  it('falls back on a non-numeric value instead of returning NaN', () => {
    // The previous form, Number(process.env.X ?? 365), produced NaN for a typo
    // and shipped it into the response. This is the behaviour C9b changes.
    process.env.C9B_N = 'thirty'
    expect(envNumber('C9B_N', 365)).toBe(365)
    expect(Number.isNaN(envNumber('C9B_N', 365))).toBe(false)
  })

  it('falls back on an empty value', () => {
    process.env.C9B_N = ''
    expect(envNumber('C9B_N', 365)).toBe(365)
  })

  it('accepts zero and negatives as real values, not as "missing"', () => {
    process.env.C9B_N = '0'
    expect(envNumber('C9B_N', 365)).toBe(0)
    process.env.C9B_N = '-5'
    expect(envNumber('C9B_N', 365)).toBe(-5)
  })
})

describe('C9b — envBoolean', () => {
  it('honours the exact strings true and false', () => {
    process.env.C9B_B = 'true'
    expect(envBoolean('C9B_B', false)).toBe(true)
    process.env.C9B_B = 'false'
    expect(envBoolean('C9B_B', true)).toBe(false)
  })

  it('falls back when unset', () => {
    delete process.env.C9B_B
    expect(envBoolean('C9B_B', true)).toBe(true)
    expect(envBoolean('C9B_B', false)).toBe(false)
  })

  it('a typo uses the default rather than coercing', () => {
    // 'flase' is truthy as a string. The old `!== 'false'` form would have
    // silently enabled the flag; here a typo cannot flip it away from default.
    for (const typo of ['flase', 'TRUE', '1', '0', 'yes']) {
      process.env.C9B_B = typo
      expect(envBoolean('C9B_B', true)).toBe(true)
      expect(envBoolean('C9B_B', false)).toBe(false)
    }
  })

  it('preserves the previous BACKOFFICE_ENABLED semantics', () => {
    // Old: `process.env.BACKOFFICE_ENABLED !== 'false'` — anything but the
    // literal 'false' meant enabled. New: envBoolean(name, true). Same outcome
    // for unset, for 'false', and for arbitrary junk.
    delete process.env.BACKOFFICE_ENABLED
    expect(envBoolean('BACKOFFICE_ENABLED', true)).toBe(true)
    process.env.BACKOFFICE_ENABLED = 'false'
    expect(envBoolean('BACKOFFICE_ENABLED', true)).toBe(false)
    process.env.BACKOFFICE_ENABLED = 'junk'
    expect(envBoolean('BACKOFFICE_ENABLED', true)).toBe(true)
  })
})

describe('C9b — migrated consumers actually go through the typed boundary', () => {
  // Behavioural tests cannot see this: reading `process.env.X` directly and
  // reading it through `serverEnv` produce identical results. Only the source
  // shows which path a consumer takes, so the migration is asserted structurally
  // — the same technique the F-10 tripwire uses.
  const SRC = join(process.cwd(), 'src')
  const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

  const MIGRATED: ReadonlyArray<{ file: string; forbidden: readonly string[]; expects: string }> = [
    { file: 'lib/admin/rbac.ts', forbidden: ['process.env.NEXT_PUBLIC_SITE_URL'], expects: 'serverEnv' },
    { file: 'app/api/stripe/checkout/route.ts', forbidden: ['process.env.NEXT_PUBLIC_SITE_URL'], expects: 'serverEnv' },
    { file: 'app/api/stripe/portal/route.ts', forbidden: ['process.env.NEXT_PUBLIC_SITE_URL'], expects: 'serverEnv' },
    {
      file: 'app/api/admin/settings/route.ts',
      forbidden: ['process.env.AUDIT_LOG_RETENTION_DAYS', 'process.env.BACKOFFICE_ENABLED'],
      expects: '@/lib/config/env',
    },
    {
      file: 'app/admin/settings/page.tsx',
      forbidden: ['process.env.AUDIT_LOG_RETENTION_DAYS', 'process.env.BACKOFFICE_ENABLED'],
      expects: '@/lib/config/env',
    },
  ]

  it('the scan is not vacuous — it reads real files that exist', () => {
    for (const { file } of MIGRATED) expect(read(file).length).toBeGreaterThan(100)
  })

  it('no migrated consumer still reads its variable straight from process.env', () => {
    for (const { file, forbidden } of MIGRATED) {
      const source = read(file)
      for (const needle of forbidden) {
        expect(source, `${file} still reads ${needle} directly`).not.toContain(needle)
      }
    }
  })

  it('each migrated consumer imports the typed boundary', () => {
    for (const { file, expects } of MIGRATED) {
      expect(read(file), `${file} does not use ${expects}`).toContain(expects)
    }
  })

  it('client-reachable NEXT_PUBLIC_* reads are deliberately NOT migrated', () => {
    // Next.js inlines these by literal text substitution; routing them through a
    // function returns undefined in the browser. Keeping them direct is required,
    // so this pins the exception rather than leaving it to memory.
    expect(read('lib/supabase/client.ts')).toContain('process.env.NEXT_PUBLIC_SUPABASE_URL')
  })
})

describe('C9b — behaviour of the migrated same-origin guard', () => {
  it('accepts the configured origin and rejects a foreign one', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.tappyai.com'
    const matching = new Request('https://www.tappyai.com/api/admin/x', {
      headers: { origin: 'https://www.tappyai.com' },
    })
    const foreign = new Request('https://www.tappyai.com/api/admin/x', {
      headers: { origin: 'https://evil.example' },
    })
    expect(isSameOrigin(matching)).toBe(true)
    expect(isSameOrigin(foreign)).toBe(false)
  })

  it('still fails closed for a foreign origin when the value is absent', () => {
    // Behaviour preserved: an absent origin config cannot turn into "allow".
    delete process.env.NEXT_PUBLIC_SITE_URL
    const foreign = new Request('https://www.tappyai.com/api/admin/x', {
      headers: { origin: 'https://evil.example' },
    })
    expect(isSameOrigin(foreign)).toBe(false)
  })

  it('a request with no Origin header is still treated as same-origin', () => {
    // Unchanged from before C9b: server-to-server calls carry no Origin.
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(isSameOrigin(new Request('https://www.tappyai.com/api/admin/x'))).toBe(true)
  })
})
