import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// A permanently locked account that is deleted leaves a keyed hash of its e-mail and NOTHING else (migration 20261001e); the same address
// cannot sign up again; a deletion is never blocked. Port 54906 (the other suites use 54901–54905).

const MIG_B = readRepo('supabase/migrations/20261001b_user_reports.sql')
const MIG_D = readRepo('supabase/migrations/20261001d_moderation_standards.sql')
const MIG_E = readRepo('supabase/migrations/20261001e_banned_identity_hash.sql')
const ROLLBACK_E = readRepo('supabase/migrations/rollback/20261001e_banned_identity_hash_rollback.sql')

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LOCKED = U(1), LOCKED_LEDGER = U(2), STRUCK = U(3), PLAIN = U(4), UNBANNED = U(5), PEPPERLESS = U(6)
const EMAIL = { [LOCKED]: 'Locked.Person@Example.com', [LOCKED_LEDGER]: 'ledger.only@example.com', [STRUCK]: 'struck@example.com', [PLAIN]: 'plain@example.com', [UNBANNED]: 'lifted@example.com', [PEPPERLESS]: 'nopepper@example.com' } as Record<string, string>

let t: BlocksDb
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await t.db.query(sql, params as never)).rows as T[]
const hashes = async () => (await q<{ identity_hash: string }>('SELECT identity_hash FROM public.banned_identities')).map((r) => r.identity_hash)
const del = (id: string) => t.db.query('DELETE FROM auth.users WHERE id = $1', [id])
const decision = (subject: string, outcome: string, extra = '') => q<{ id: string }>(`INSERT INTO public.moderation_decisions (subject_user_id, reviewer_id, rule_group, feature, severity, outcome, strike, strike_expires_at, restrict_days, reason)
  VALUES ('${subject}', '${ALICE}', 'harassment', 'comment', ${outcome === 'banned' ? 3 : 2}, '${outcome}', true, ${outcome === 'banned' ? 'NULL' : `now() + interval '180 days'`}, ${outcome === 'restricted' ? 7 : 'NULL'}, 'Abusive language aimed at another user') RETURNING id ${extra}`)

beforeAll(async () => {
  t = await startBlocksDb(54906, 'bannedidentity', [])
  await t.db.query('ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN raw_user_meta_data jsonb') // the harness stub has no e-mail column; production has one
  await t.db.query(`INSERT INTO auth.users (id, is_anonymous) VALUES ${[LOCKED, LOCKED_LEDGER, STRUCK, PLAIN, UNBANNED, PEPPERLESS].map((i) => `('${i}', false)`).join(',')}`)
  for (const [id, email] of Object.entries(EMAIL)) await t.db.query('UPDATE auth.users SET email = $2 WHERE id = $1', [id, email])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL, LOCKED, LOCKED_LEDGER, STRUCK, PLAIN, UNBANNED, PEPPERLESS]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, id.slice(-6)])
  for (const m of [MIG_B, MIG_D, MIG_E]) await t.db.query(m)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('deleting a locked account leaves only a keyed hash', () => {
  it('locked through account_status: the address is hashed, nothing else is kept', async () => {
    await t.db.query(`INSERT INTO public.account_status (user_id, is_banned, ban_reason) VALUES ('${LOCKED}', true, 'child safety')`)
    await del(LOCKED)
    const h = await hashes()
    expect(h).toHaveLength(1)
    expect(h[0]).toMatch(/^[0-9a-f]{64}$/)
    // the table holds the hash and a date — no e-mail, no id, no name
    expect((await q<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'banned_identities' ORDER BY column_name`)).map((c) => c.column_name)).toEqual(['created_at', 'identity_hash'])
    expect(JSON.stringify(await q('SELECT * FROM public.banned_identities'))).not.toMatch(/locked|example\.com|person/i)
    // a keyed hash, not a plain one a dictionary of addresses could reverse
    expect(h[0]).not.toBe((await q<{ h: string }>(`SELECT encode(sha256(convert_to('locked.person@example.com','UTF8')),'hex') h`))[0].h)
    // and nothing personal remains anywhere else: the account, its profile and its status row are gone
    expect((await q(`SELECT 1 FROM auth.users WHERE id = '${LOCKED}'`)).length).toBe(0)
    expect((await q(`SELECT 1 FROM public.account_status WHERE user_id = '${LOCKED}'`)).length).toBe(0)
  })

  it('locked through the ledger only (a standing ban decision): also hashed', async () => {
    await decision(LOCKED_LEDGER, 'banned')
    await del(LOCKED_LEDGER)
    expect(await hashes()).toHaveLength(2)
    // the ledger row stays, anonymised (20261001d) — no way back to the person except the hash
    expect((await q<{ subject_user_id: string | null }>(`SELECT subject_user_id FROM public.moderation_decisions WHERE outcome = 'banned' AND rule_group = 'harassment'`)).every((r) => r.subject_user_id === null)).toBe(true)
  })

  it('a person who only has strikes or a restriction, or was never sanctioned, is NOT recorded', async () => {
    await decision(STRUCK, 'restricted')
    await del(STRUCK); await del(PLAIN)
    expect(await hashes()).toHaveLength(2)
  })

  it('a ban reversed on appeal does not count', async () => {
    const id = (await decision(UNBANNED, 'banned'))[0].id
    await q(`INSERT INTO public.moderation_appeals (decision_id, appellant_id, message) VALUES ('${id}', '${UNBANNED}', 'This was a mistake, please check again')`)
    await q(`UPDATE public.moderation_appeals SET status = 'reversed', resolved_by = '${ALICE}', resolved_at = now(), same_reviewer = false WHERE decision_id = '${id}'`)
    await del(UNBANNED)
    expect(await hashes()).toHaveLength(2)
  })
})

describe('the same address cannot sign up again — and nothing else is affected', () => {
  const signup = (email: string | null) => t.db.query(`INSERT INTO auth.users (id, is_anonymous, email) VALUES (gen_random_uuid(), false, $1)`, [email]).then(() => 'ok', (e: { code?: string; message: string }) => e.code ?? e.message)
  it('refuses the locked address in any case or spacing, with a generic error', async () => {
    expect(await signup('locked.person@example.com')).toBe('P0001')
    expect(await signup('  LOCKED.PERSON@EXAMPLE.COM ')).toBe('P0001')
    expect(await signup('ledger.only@example.com')).toBe('P0001')
    const err = await t.db.query(`INSERT INTO auth.users (id, is_anonymous, email) VALUES (gen_random_uuid(), false, 'locked.person@example.com')`).catch((e: Error) => e.message)
    expect(err).toBe('account_unavailable')
  })
  it('the obvious variants of a locked address are refused too: «+tag», and dots for Gmail (review 02/10)', async () => {
    expect(await signup('locked.person+promo@example.com')).toBe('P0001')
    // a locked Gmail address: dots and +tag are ignored by Gmail, so they are ignored here
    await t.db.query("INSERT INTO public.banned_identities (identity_hash) VALUES (safety_private.identity_hash('Gmail.Locked@gmail.com'))")
    expect(await signup('gmaillocked@gmail.com')).toBe('P0001')
    expect(await signup('g.m.a.i.l.locked+x@googlemail.com')).toBe('P0001')
    expect(await signup('gmaillocked@example.com')).toBe('ok') // dots are only ignored for Gmail
  })
  it('changing an existing account to a locked address is refused (UPDATE of email)', async () => {
    await t.db.query("INSERT INTO auth.users (id, is_anonymous, email) VALUES ('00000000-0000-4000-8000-0000000000aa', false, 'fresh.account@example.com')")
    const err = await t.db.query("UPDATE auth.users SET email = 'LOCKED.PERSON@example.com' WHERE id = '00000000-0000-4000-8000-0000000000aa'").then(() => 'ok', (e: { code?: string }) => e.code)
    expect(err).toBe('P0001')
    await expect(t.db.query("UPDATE auth.users SET email = 'another.fresh@example.com' WHERE id = '00000000-0000-4000-8000-0000000000aa'")).resolves.toBeTruthy()
    await t.db.query("DELETE FROM public.banned_identities WHERE identity_hash = safety_private.identity_hash('Gmail.Locked@gmail.com')")
  })
  it('other addresses, the lifted one, and anonymous sign-ins (no e-mail) are untouched', async () => {
    expect(await signup('someone.new@example.com')).toBe('ok')
    expect(await signup('lifted@example.com')).toBe('ok')
    expect(await signup(null)).toBe('ok')
  })
})

describe('safeguards', () => {
  it('no client role can read the hashes or the pepper', async () => {
    expect(await t.exec('authenticated', 'SELECT * FROM public.banned_identities', BOB)).toBe('42501')
    expect(await t.exec('anon', 'SELECT * FROM public.banned_identities', null)).toBe('42501')
    expect(await t.exec('authenticated', 'SELECT * FROM safety_private.identity_pepper', BOB)).toBe('42501')
    expect(await t.exec('authenticated', `SELECT safety_private.identity_hash('a@b.c')`, BOB)).toBe('42501')
  })
  it('a deletion is NEVER blocked: with the pepper gone, a locked account is still deleted (and simply not recorded)', async () => {
    await t.db.query(`INSERT INTO public.account_status (user_id, is_banned) VALUES ('${PEPPERLESS}', true)`)
    await t.db.query('DELETE FROM safety_private.identity_pepper')
    await expect(del(PEPPERLESS)).resolves.toBeTruthy()
    expect((await q(`SELECT 1 FROM auth.users WHERE id = '${PEPPERLESS}'`)).length).toBe(0)
    expect(await hashes()).toHaveLength(2)
    await t.db.query('INSERT INTO safety_private.identity_pepper (id) VALUES (true)') // restore for the next tests (a NEW pepper: old hashes no longer match — by design)
  })
  it('retention: purge removes hashes older than the period, service role only', async () => {
    await t.db.query(`UPDATE public.banned_identities SET created_at = now() - interval '400 days'`)
    expect(await t.exec('authenticated', 'SELECT public.purge_banned_identities(365)', BOB)).toBe('42501')
    expect((await q<{ n: number }>('SELECT public.purge_banned_identities(365) n'))[0].n).toBe(2)
    expect(await hashes()).toHaveLength(0)
  })
  it('rollback removes the table, the pepper and both triggers', async () => {
    await t.db.query(ROLLBACK_E)
    expect((await q<{ r: string | null }>(`SELECT to_regclass('public.banned_identities') r`))[0].r).toBeNull()
    expect((await q(`SELECT 1 FROM pg_trigger WHERE tgname IN ('keep_banned_identity','refuse_banned_identity','refuse_banned_identity_update')`)).length).toBe(0)
  })
})
