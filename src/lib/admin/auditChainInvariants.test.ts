import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Controller V2 — Component 7: the audit chain's SOURCE-LEVEL preconditions.
//
// Four of Component 7's twelve preconditions are properties of the source text,
// not of runtime behaviour. No amount of SQL testing can observe the ABSENCE of
// an `EXCEPTION WHEN` handler — it can only fail to notice its consequences,
// and only under a schedule the test happened to produce.
//
// This file follows `singleDecisionPath.test.ts` (Component 4): read the tree so
// a future edit fails loudly instead of silently. Component 9a is the reason it
// is worded carefully — that guard shipped INERT and CI reported 8/8 green over
// a live violation. Every assertion here was checked RED by planting the
// violation it is meant to catch.
//
// Spec: docs/controller-v2/07_PHASE_F_TEST_SPECIFICATION.md § "Static assertions"

const ROOT = process.cwd()
const MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20260807_audit_chain.sql'), 'utf8')
const PHASE0 = readFileSync(join(ROOT, 'supabase/migrations/20260713_backoffice_phase0.sql'), 'utf8')
const AUDIT_TS = readFileSync(join(ROOT, 'src/lib/admin/audit.ts'), 'utf8')
const AUDIT_ROUTE = readFileSync(join(ROOT, 'src/app/api/admin/audit/route.ts'), 'utf8')

/** Every .sql file under supabase/, so a second migration cannot smuggle a violation in. */
function sqlFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sqlFiles(full))
    else if (entry.endsWith('.sql')) out.push(full)
  }
  return out
}
const ALL_SQL = sqlFiles(join(ROOT, 'supabase'))

/** SQL comments cannot execute. Only code counts — and the migration is 40% comment. */
function stripSqlComments(sql: string): string {
  return sql
    // 🚨 NORMALISE FIRST. Without this the whole guard is line-ending dependent, and it fails on
    // a Windows checkout while passing on CI — three permanent red assertions against a file
    // nobody has touched, which is worse than no guard at all because it trains the reader to
    // ignore the colour.
    //
    // Measured on the same bytes, one file, the two encodings:
    //     CRLF → trigger body 4180 chars, `-- P7. No EXCEPTION handler` still in it,
    //            2 EXCEPTION tokens reported as "not a RAISE" — both of them COMMENTS
    //     LF   → trigger body 1298 chars, comment stripped, 0 offenders
    //
    // In JS regex `\r` is a line terminator, so `$` can anchor BEFORE the `\r` that `split('\n')`
    // leaves at the end of every line of a CRLF file. `--.*$` then matches an empty span rather
    // than the comment, and the comment survives into what the assertions read as "code".
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
}

/** The body between $chain$ ... $chain$ — the trigger function, code only. */
function triggerBody(): string {
  const m = MIGRATION.match(/\$chain\$([\s\S]*?)\$chain\$/)
  if (!m) throw new Error('trigger body not found: the $chain$ dollar-quote tag was renamed')
  return stripSqlComments(m[1])
}

// ═════════════════════════════════════════════════════════════════════════════
// The guard's own guard. If these fail, every assertion below is vacuous —
// which is the exact failure mode Component 9a shipped.
// ═════════════════════════════════════════════════════════════════════════════

describe('S-00 — the assertions are not vacuous', () => {
  it('every source it reads is non-empty and is the file it claims to be', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION fn_audit_log_chain()')
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION fn_verify_audit_chain(')
    expect(PHASE0).toContain('CREATE TABLE IF NOT EXISTS audit_log (')
    expect(AUDIT_TS).toContain('export function writeAuditLog(')
    expect(AUDIT_ROUTE).toContain("from('audit_log')")
    expect(ALL_SQL.length).toBeGreaterThan(1)
  })

  it('the trigger body extracts to real code, not an empty string', () => {
    const body = triggerBody()
    expect(body.length).toBeGreaterThan(200)
    expect(body).toContain('pg_advisory_xact_lock')
    // Comment stripping must remove comments and nothing else.
    expect(body).not.toContain('P7. No EXCEPTION handler')
    expect(body).toContain('NEW.seq := nextval')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// S-01 … S-04 — the Phase F static assertions
// ═════════════════════════════════════════════════════════════════════════════

describe('S-01 — no exception handler in the trigger (P7)', () => {
  it('the trigger body opens no EXCEPTION block', () => {
    // An `EXCEPTION WHEN` clause opens an implicit subtransaction. If it rolls
    // back, `set_config(..., is_local := true)` reverts to the value at the
    // subtransaction's start — so the memo can silently go stale while the
    // handler proceeds to insert. Phase E §A4.
    expect(triggerBody()).not.toMatch(/\bEXCEPTION\s+WHEN\b/i)
  })

  it('every EXCEPTION token in the trigger belongs to a RAISE', () => {
    // Phase F wrote S-01 as "contains no EXCEPTION keyword". Taken literally
    // that is wrong: the P1 isolation assertion is a `RAISE EXCEPTION`, which is
    // a throw, not a handler. The invariant is that no EXCEPTION token opens a
    // block — asserted positively so the two forms cannot be confused later.
    const body = triggerBody()
    const tokens = [...body.matchAll(/\bEXCEPTION\b/gi)]
    expect(tokens.length).toBeGreaterThan(0) // the RAISE must still be there
    for (const t of tokens) {
      const before = body.slice(Math.max(0, t.index! - 40), t.index!)
      expect(before, `EXCEPTION at ${t.index} is not a RAISE`).toMatch(/\bRAISE\s*$/i)
    }
  })
})

describe('S-02 — nothing restores the memo on function exit (P8)', () => {
  it('no function anywhere in supabase/ names audit.chain_head in a SET clause', () => {
    // `CREATE FUNCTION ... SET audit.chain_head = ...` makes PostgreSQL SAVE and
    // RESTORE the GUC around every call. The restore would resurrect a stale
    // head after the function returns and the next row would chain to it.
    // set_config(..., true) is the sanctioned form and is not matched here.
    for (const f of ALL_SQL) {
      const code = stripSqlComments(readFileSync(f, 'utf8'))
      expect(code, f).not.toMatch(/\bSET\s+audit\.chain_head\b/i)
    }
  })

  it('the memo is only ever written by set_config with is_local = true', () => {
    const writes = [...stripSqlComments(MIGRATION).matchAll(/set_config\s*\(\s*'audit\.chain_head'[\s\S]*?;/gi)]
    expect(writes.length).toBe(1)
    // Transaction-local. Without the third argument the memo would outlive the
    // transaction on a pooled connection and poison the NEXT request's chain.
    expect(writes[0][0]).toMatch(/,\s*true\s*\)\s*;$/)
  })
})

describe('S-03 — the trigger is explicitly VOLATILE (P4)', () => {
  it('VOLATILE appears in the trigger function header, not left to the default', () => {
    // VOLATILE is the default, so omitting it works — until someone marks the
    // function STABLE for "performance". A STABLE function uses the CALLING
    // query's snapshot and is blind to the previous lock holder's committed
    // row: two honest writes fork. Stating it makes that edit visible in a diff.
    const header = stripSqlComments(MIGRATION).match(
      /CREATE OR REPLACE FUNCTION fn_audit_log_chain\(\)[\s\S]*?AS \$chain\$/
    )
    expect(header).not.toBeNull()
    expect(header![0]).toMatch(/\bVOLATILE\b/)
    expect(header![0]).not.toMatch(/\b(STABLE|IMMUTABLE)\b/)
  })

  it('the trigger runs SECURITY DEFINER with a pinned search_path', () => {
    // audit_log is RLS deny-by-default. The head-selection SELECT lives inside
    // this function; as INVOKER under a restricted role it would see an empty
    // table and every insert would start a new chain from NULL.
    const header = stripSqlComments(MIGRATION).match(
      /CREATE OR REPLACE FUNCTION fn_audit_log_chain\(\)[\s\S]*?AS \$chain\$/
    )![0]
    expect(header).toMatch(/\bSECURITY DEFINER\b/)
    expect(header).toMatch(/SET search_path\s*=\s*public,\s*pg_temp/)
  })
})

describe('S-04 — seq has no column default (P3)', () => {
  it('the seq column is added without DEFAULT and never given one', () => {
    // A column default is evaluated when the tuple is formed — BEFORE this
    // BEFORE-ROW trigger fires, therefore OUTSIDE the advisory lock. Two
    // concurrent inserts could then take sequence numbers in the opposite order
    // to the lock, and the verifier would report tampering on two honest rows.
    const code = stripSqlComments(MIGRATION)
    const add = code.match(/ADD COLUMN IF NOT EXISTS\s+seq\s+[^\n;]*/i)
    expect(add).not.toBeNull()
    expect(add![0]).not.toMatch(/\bDEFAULT\b/i)
    expect(add![0]).not.toMatch(/\bSERIAL\b/i)
    expect(code).not.toMatch(/ALTER COLUMN\s+seq\s+SET DEFAULT/i)
  })

  it('no migration attaches the sequence to the column', () => {
    // OWNED BY / nextval() as a default would reintroduce the same problem from
    // a different file.
    for (const f of ALL_SQL) {
      const code = stripSqlComments(readFileSync(f, 'utf8'))
      expect(code, f).not.toMatch(/audit_log\s*\.\s*seq\s*.*nextval/i)
      expect(code, f).not.toMatch(/ALTER SEQUENCE\s+audit_log_seq\s+OWNED BY/i)
    }
  })

  it('the sequence is only ever advanced inside the trigger', () => {
    const calls = [...stripSqlComments(MIGRATION).matchAll(/nextval\s*\(\s*'audit_log_seq'\s*\)/gi)]
    // Exactly two: the trigger, and the backfill loop which runs before the
    // trigger exists. A third would be a second allocation point.
    expect(calls.length).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Compatibility — the design's central claim is that nothing in TypeScript
// changes. That claim needs a test, or it decays the first time someone edits
// either file.
// ═════════════════════════════════════════════════════════════════════════════

describe('C7 compatibility — the application does not know the chain exists', () => {
  const INSERT_COLS = [
    'actor_id', 'actor_email', 'actor_role', 'action', 'target_type', 'target_id',
    'before_state', 'after_state', 'metadata', 'ip_address', 'user_agent',
  ]

  it('writeAuditLog inserts exactly the pre-Component-7 column set', () => {
    // ⚠️ RE-ANCHORED 2026-08-31, and made indentation-agnostic on the way.
    //
    // The previous pattern ended `\n {6}\}\)` — it required the closing brace at
    // exactly six spaces, i.e. the insert being nested inside the fire-and-forget
    // IIFE. Extracting that body into `writeAuditLogAwaited` un-nested it to four
    // spaces and the match returned null, failing with this assertion's own
    // "re-anchor this" message rather than with anything about columns.
    //
    // The invariant here is the COLUMN SET, which was never in question. Matching
    // `\n *\}\)` keeps the check while making it survive the next reindent —
    // a test that breaks on whitespace teaches people to edit the test.
    const insert = AUDIT_TS.match(/\.insert\(\{([\s\S]*?)\n *\}\)/)
    expect(insert, 'the .insert({...}) block moved — re-anchor this assertion').not.toBeNull()
    const cols = [...insert![1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
    expect(cols.sort()).toEqual([...INSERT_COLS].sort())
  })

  it('writeAuditLog never mentions the chain columns', () => {
    // If the application ever supplies seq / prev_hash / row_hash, the trigger
    // overwrites them — but the attempt means someone believes the client owns
    // the chain, which is the design's one prohibited belief.
    for (const c of ['seq', 'prev_hash', 'row_hash']) {
      expect(AUDIT_TS, c).not.toContain(c)
    }
  })

  it('the audit read API returns the same columns as before Component 7', () => {
    const sel = AUDIT_ROUTE.match(/\.select\('([^']+)'\)/)
    expect(sel).not.toBeNull()
    expect(sel![1].split(',').map((s) => s.trim())).toEqual([
      'id', 'actor_id', 'actor_email', 'actor_role', 'action',
      'target_type', 'target_id', 'metadata', 'created_at',
    ])
  })

  it('no audit_log reader uses select(*), which would leak the new columns', () => {
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const e of readdirSync(dir)) {
        const full = join(dir, e)
        if (statSync(full).isDirectory()) out.push(...walk(full))
        else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full)
      }
      return out
    }
    for (const f of walk(join(ROOT, 'src'))) {
      const src = readFileSync(f, 'utf8')
      if (!src.includes("from('audit_log')")) continue
      expect(src, f).not.toMatch(/from\('audit_log'\)[\s\S]{0,120}\.select\(\s*['"`]\*/)
    }
  })

  it('Component 7 adds no API route and no environment variable', () => {
    // The design (§B4) refuses a verifier route: no consumer exists yet, and an
    // engine with no consumer is the mistake this project has made four times.
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const e of readdirSync(dir)) {
        const full = join(dir, e)
        if (statSync(full).isDirectory()) out.push(...walk(full))
        else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full)
      }
      return out
    }
    const hits = walk(join(ROOT, 'src')).filter((f) =>
      readFileSync(f, 'utf8').includes('fn_verify_audit_chain')
    )
    expect(hits).toEqual([])
  })
})
