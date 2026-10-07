import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'

// The audit writer reaches for the service-role client at import time in production. Mocked so the
// boundary can be exercised without a database, and so the CALLS themselves are assertable — the
// audit trail is a security property here, not a side note.
const auditCalls: Record<string, unknown>[] = []
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLogAwaited: async (params: Record<string, unknown>) => { auditCalls.push(params); return true },
  writeAuditLog: (params: Record<string, unknown>) => { auditCalls.push(params) },
}))

const { runAiWriteAction } = await import('../runAction')
const { savePriceWatchPolicy, MAX_ACTIVE_WATCHES } = await import('../savePriceWatch')
const { AI_TOOLS, writeTools, describeTool } = await import('../registry')

// ── P0-2: the AI → action → boundary → backend contract ──────────────────────
//
// WHAT WAS WRONG. `save_price_watch` decided and executed a database write from inside the model's
// stream, with the service-role client. It was correct in practice and structurally unguarded: the
// permission check, the ownership pin and the cap were properties of one function, so the next
// write tool would inherit them only by being copied carefully.
//
// WHAT THESE TESTS PIN. Not "the code is arranged a certain way" — the four things an attacker or
// a confused model would have to get past:
//
//   1. no identity, no write;
//   2. the model cannot name the owner of the row it creates;
//   3. the model cannot exceed the per-user cap by asking nicely;
//   4. every outcome, allowed or denied, leaves an audit row.

const ARGS = { product_name: 'AirPods Pro 2', target_price: 4_500_000, search_query: 'AirPods Pro 2 giá Shopee' }

/** Records every insert so ownership and payload can be asserted, not assumed. */
function fakeDb(opts: { activeCount?: number; insertError?: { code: string } } = {}) {
  const inserts: Record<string, unknown>[] = []
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ count: opts.activeCount ?? 0, error: null }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserts.push(row)
        return {
          select: () => ({
            single: () => Promise.resolve(
              opts.insertError
                ? { data: null, error: opts.insertError }
                : { data: { id: 'pw-1' }, error: null },
            ),
          }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { client: () => client, inserts }
}

const run = (actorId: string | null, rawArgs: unknown, db = fakeDb()) =>
  runAiWriteAction({
    tool: 'save_price_watch',
    actor: { userId: actorId },
    rawArgs,
    policy: savePriceWatchPolicy('vi', db.client),
  })

beforeEach(() => { auditCalls.length = 0 })

// ── 1 · Registry: "which AI tools can change state" is DATA ──────────────────

describe('P0-2 · the registry describes every tool the route declares', () => {
  const ROUTE = readFileSync('src/app/api/chat/route.ts', 'utf8')

  it('covers exactly the tools /api/chat exposes — no more, no fewer', () => {
    // Read from the route rather than from a second hand-kept list: a tool added there and not
    // here is precisely the gap that produced this work.
    const declared = new Set(
      [...ROUTE.matchAll(/(?:^|[{\s])([a-z_][a-z0-9_]*): tool\(\{/gm)].map(m => m[1]),
    )
    expect([...declared].sort()).toEqual(AI_TOOLS.map(d => d.tool).sort())
  })

  it('exactly one tool is a write, and it is save_price_watch', () => {
    expect(writeTools().map(d => d.tool)).toEqual(['save_price_watch'])
  })

  it('no write may be performed anonymously', () => {
    // A write is always scoped to an owner. If a descriptor ever claims otherwise, the permission
    // step in runAction would still refuse — but the table would be lying, and the table is what
    // an audit reads.
    expect(writeTools().filter(d => d.allowsAnonymous)).toEqual([])
  })

  it('every consequential write declares a confirmation requirement', () => {
    // Phase 0 does not BUILD the confirmation UI (owner decision D4). It records which actions
    // need one, so that decision is not made again from scratch when the UI arrives.
    for (const d of writeTools()) {
      expect(d.consequence).not.toBe('none')
      expect(['recommended', 'not_required']).toContain(d.confirmation)
    }
    expect(describeTool('save_price_watch')?.confirmation).toBe('recommended')
  })

  it('read tools carry no audit action — only writes are audited as actions', () => {
    for (const d of AI_TOOLS.filter(x => x.effect !== 'write')) {
      expect(d.auditAction).toBeUndefined()
    }
  })
})

// ── 2 · Permission ───────────────────────────────────────────────────────────

describe('P0-2 · permission', () => {
  it('refuses an unauthenticated actor and never touches the database', async () => {
    const db = fakeDb()
    const outcome = await run(null, ARGS, db)
    expect(outcome).toMatchObject({ ok: false, reason: 'unauthenticated' })
    expect(db.inserts).toEqual([])
  })

  it('audits the refusal — a denial is the row an abuse investigation needs', async () => {
    await run(null, ARGS)
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({
      action: 'ai.save_price_watch',
      actorRole: 'none',
      afterState: { outcome: 'denied', reason: 'unauthenticated' },
    })
  })

  it('refuses a tool the registry does not describe as a write', async () => {
    const outcome = await runAiWriteAction({
      tool: 'search_places',                       // a read tool
      actor: { userId: 'user-a' },
      rawArgs: ARGS,
      policy: savePriceWatchPolicy('vi', fakeDb().client),
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'not_a_write_action' })
  })
})

// ── 3 · Ownership: the model cannot choose whose row this is ─────────────────

describe('P0-2 · ownership is resolved server-side, never from the model', () => {
  it('writes the ACTOR as owner', async () => {
    const db = fakeDb()
    await run('user-a', ARGS, db)
    expect(db.inserts[0]).toMatchObject({ user_id: 'user-a' })
  })

  it('ignores a user_id the model tried to supply', async () => {
    // The attack this closes: an injected instruction persuades the model to pass someone else's
    // id. The validator does not read one, and execute() takes the owner from the boundary.
    const db = fakeDb()
    const outcome = await run('user-a', { ...ARGS, user_id: 'victim', userId: 'victim' }, db)
    expect(outcome.ok).toBe(true)
    expect(db.inserts[0]).toMatchObject({ user_id: 'user-a' })
    expect(JSON.stringify(db.inserts[0])).not.toContain('victim')
  })
})

// ── 4 · Argument policy ──────────────────────────────────────────────────────

describe('P0-2 · arguments are validated beyond their types', () => {
  // The zod schema on the tool guarantees a string and a number. It does not guarantee meaning,
  // and every case below is a valid string/number.
  const BAD: Array<[string, unknown]> = [
    ['empty product name', { ...ARGS, product_name: '   ' }],
    ['empty search query', { ...ARGS, search_query: '' }],
    ['zero price', { ...ARGS, target_price: 0 }],
    ['negative price', { ...ARGS, target_price: -1 }],
    ['NaN price', { ...ARGS, target_price: Number.NaN }],
    ['infinite price', { ...ARGS, target_price: Number.POSITIVE_INFINITY }],
    ['oversized product name', { ...ARGS, product_name: 'x'.repeat(201) }],
    ['oversized search query', { ...ARGS, search_query: 'x'.repeat(301) }],
    ['not an object', 'give me a price watch'],
  ]

  it.each(BAD)('refuses %s without writing', async (_label, args) => {
    const db = fakeDb()
    const outcome = await run('user-a', args, db)
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid_arguments' })
    expect(db.inserts).toEqual([])
  })

  it('accepts a valid request and rounds the price to whole VND', async () => {
    const db = fakeDb()
    const outcome = await run('user-a', { ...ARGS, target_price: 4_500_000.7 }, db)
    expect(outcome.ok).toBe(true)
    expect(db.inserts[0]).toMatchObject({ target_price: 4_500_001 })
  })
})

// ── 5 · Scope ────────────────────────────────────────────────────────────────

describe('P0-2 · scope', () => {
  it('refuses once the actor is at the cap, and writes nothing', async () => {
    const db = fakeDb({ activeCount: MAX_ACTIVE_WATCHES })
    const outcome = await run('user-a', ARGS, db)
    expect(outcome).toMatchObject({ ok: false, reason: 'scope_exceeded' })
    expect(db.inserts).toEqual([])
  })

  it('allows the actor one below the cap', async () => {
    const db = fakeDb({ activeCount: MAX_ACTIVE_WATCHES - 1 })
    expect((await run('user-a', ARGS, db)).ok).toBe(true)
  })
})

// ── 6 · Execution failure ────────────────────────────────────────────────────

describe('P0-2 · a failed side effect never leaks its cause to the model', () => {
  it('reports a user-facing message, not the database error', async () => {
    const db = fakeDb({ insertError: { code: '23505' } })
    const outcome = await run('user-a', ARGS, db)
    expect(outcome).toMatchObject({ ok: false, reason: 'execution_failed' })
    // The model reads tool results out loud, so a schema code must never appear in one.
    expect(outcome.ok === false && outcome.message).not.toContain('23505')
  })
})

// ── 7 · Audit ────────────────────────────────────────────────────────────────

describe('P0-2 · every outcome is audited', () => {
  it('records a success against the created row', async () => {
    await run('user-a', ARGS)
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({
      action: 'ai.save_price_watch',
      actorId: 'user-a',
      actorRole: 'none',
      targetType: 'price_watch',
      targetId: 'pw-1',
      afterState: { outcome: 'allowed', targetPriceVnd: 4_500_000 },
    })
  })

  it('records a scope denial', async () => {
    await run('user-a', ARGS, fakeDb({ activeCount: MAX_ACTIVE_WATCHES }))
    expect(auditCalls[0]).toMatchObject({ afterState: { outcome: 'denied', reason: 'scope_exceeded' } })
  })

  it('carries no user text or model prose into the audit row', async () => {
    // `after_state` is read by admins. Operational facts only — the product name the model chose
    // is free text and stays out of it.
    await run('user-a', ARGS)
    const after = JSON.stringify(auditCalls[0].afterState)
    expect(after).not.toContain('AirPods')
    expect(after).not.toContain('Shopee')
  })

  it('emits exactly one audit row per attempt', async () => {
    await run('user-a', ARGS)
    await run('user-a', ARGS)
    expect(auditCalls).toHaveLength(2)
  })
})
