// Tappy Business — the commerce data boundary, enforced by the Architecture Guard.
//
// WHAT THIS RULE PROTECTS
//
// The nine Business tables grant privileges to `service_role` alone, with RLS
// enabled and NO policies. The database therefore has no row-level opinion about
// who is asking — whatever the application selects, it gets. Merchant isolation
// is entirely a property of the query, and a query that forgets `merchant_id`
// returns another merchant's customers, their phone numbers and their delivery
// addresses, with no error anywhere.
//
// `src/lib/business/authz.ts` produces the scope. Calling it was a convention.
// This rule makes it a boundary: the table NAMES are reachable only from
// `src/lib/business/repositories/`, so a query written anywhere else in `src/`
// fails CI before review.
//
// These tests run the REAL guard end-to-end against a throwaway tree, following
// controllerRules.test.ts. Re-declaring the patterns here would prove the copy.

import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const root = join(__dirname, '..', '..')
const GUARD = join(root, 'scripts', 'architecture', 'check.mjs')

// The nine tables, written out rather than imported: if this list and the
// guard's ever disagree, that disagreement is the bug this file should catch.
const BUSINESS_TABLES = [
  'business_merchants',
  'business_merchant_terms_acceptances',
  'business_products',
  'business_product_option_groups',
  'business_product_option_values',
  'business_orders',
  'business_order_items',
  'business_order_status_history',
  'business_product_reports',
]

// Fixtures go into a THROWAWAY TREE, never the repository's own src/ — writing
// them into the real tree races with src/lib/supabase/admin.test.ts, which walks
// src/ looking for ad-hoc service-role clients. The guard takes its root from
// process.cwd(), so pointing cwd at a temp tree scans that tree instead.
let sandbox: string | null = null

function sandboxDir(): string {
  if (!sandbox) {
    sandbox = mkdtempSync(join(tmpdir(), 'arch-business-'))
    mkdirSync(join(sandbox, 'src'), { recursive: true })
    writeFileSync(join(sandbox, 'package.json'), readFileSync(join(root, 'package.json')))
  }
  return sandbox
}

function runGuardIn(cwd: string): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync('node', [GUARD], { cwd, encoding: 'utf8' }) }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

/** Write a fixture into the sandbox and run the guard there. */
function withFixture(relPath: string, contents: string): { code: number; output: string } {
  const abs = join(sandboxDir(), relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, contents)
  return runGuardIn(sandboxDir())
}

afterEach(() => {
  if (sandbox) {
    rmSync(sandbox, { recursive: true, force: true })
    sandbox = null
  }
})

describe('baseline', () => {
  it('the guard passes on the repository as it stands', () => {
    // Every assertion below is "the guard NOW fails". That is only meaningful if
    // it passes without a fixture.
    expect(runGuardIn(root).code).toBe(0)
  })
})

describe('the illegal access this rule exists to stop', () => {
  it('🔑 rejects a service-role query on a Business table from an arbitrary file', () => {
    // The exact scenario from the P0 review: an unscoped read of every
    // merchant's orders, which the database would answer without complaint.
    const { code, output } = withFixture(
      'src/somewhere/arbitrary-file.ts',
      [
        "import { createAdminClient } from '@/lib/supabase/admin'",
        'export async function leak() {',
        "  return createAdminClient().from('business_orders').select('*')",
        '}',
        '',
      ].join('\n')
    )
    expect(code).not.toBe(0)
    expect(output).toContain('no-business-tables-outside-data-layer')
    expect(output).toContain('arbitrary-file')
  })

  it('rejects an API route reaching a Business table directly', () => {
    const { code } = withFixture(
      'src/app/api/orders/route.ts',
      "export const GET = async () => db.from('business_order_items').select('*')\n"
    )
    expect(code).not.toBe(0)
  })

  it('rejects the table name in a bare string, not only in a .from() call', () => {
    // A helper one layer away, an .rpc() argument, or a raw SQL template all
    // reach the same unguarded rows, so the name itself is what is fenced.
    const { code } = withFixture(
      'src/lib/reporting/export.ts',
      "const TABLE = 'business_order_status_history'\nexport const t = TABLE\n"
    )
    expect(code).not.toBe(0)
  })

  it('rejects a template literal naming a table', () => {
    const { code } = withFixture(
      'src/lib/reporting/raw.ts',
      'export const sql = `SELECT * FROM ' + '`business_merchants`' + '`\n'
    )
    expect(code).not.toBe(0)
  })

  it.each(BUSINESS_TABLES)('covers %s', (table) => {
    // A rule that names eight of nine tables is a rule with a hole in it.
    const { code } = withFixture(
      'src/lib/anything/probe.ts',
      `export const q = db.from('${table}').select('*')\n`
    )
    expect(code, table).not.toBe(0)
  })
})

describe('the boundary is the repositories directory, not the whole module', () => {
  it('🔑 ALLOWS a query inside src/lib/business/repositories/', () => {
    // The rule is a fence, not a ban. If this failed, the data layer could not
    // do its job and the rule would be useless.
    const { code } = withFixture(
      'src/lib/business/repositories/orders.ts',
      "export const q = db.from('business_orders').select('id')\n"
    )
    expect(code).toBe(0)
  })

  it('🔑 rejects a query in src/lib/business/ but OUTSIDE repositories/', () => {
    // authz.ts, ids.ts and money.ts have no business reaching a table. Allowing
    // the parent directory would let a future file put an unscoped query beside
    // the authorization code that is supposed to gate it.
    const { code, output } = withFixture(
      'src/lib/business/shortcut.ts',
      "export const q = db.from('business_products').select('*')\n"
    )
    expect(code).not.toBe(0)
    expect(output).toContain('shortcut')
  })

  it('rejects a nested file that merely looks like the data layer', () => {
    const { code } = withFixture(
      'src/lib/business/helpers/repositories/sneaky.ts',
      "export const q = db.from('business_orders').select('*')\n"
    )
    expect(code).not.toBe(0)
  })
})

describe('prose is not a violation', () => {
  it('allows a table name in a line comment', () => {
    // The guard strips comments before matching, which is what lets
    // registry.ts and authz.ts explain the boundary they participate in.
    const { code } = withFixture(
      'src/lib/docs/notes.ts',
      '// merchant scope resolves against business_merchants.controller_user_id\nexport const x = 1\n'
    )
    expect(code).toBe(0)
  })

  it('allows a table name in a block comment', () => {
    const { code } = withFixture(
      'src/lib/docs/block.ts',
      '/**\n * business_orders holds customer PII.\n */\nexport const x = 1\n'
    )
    expect(code).toBe(0)
  })
})
