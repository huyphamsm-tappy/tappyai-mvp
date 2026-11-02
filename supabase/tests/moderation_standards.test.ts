import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, ANON_USER, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// Moderation standards (migration 20261001d) on the FULL production schema, real PostgreSQL.
// The point of the suite: a report only ever enters the queue; the ledger is immutable; a sanctioned account can still be deleted (P8-4).

const MIG_B = readRepo('supabase/migrations/20261001b_user_reports.sql')
const MIG_D = readRepo('supabase/migrations/20261001d_moderation_standards.sql')
const ROLLBACK_D = readRepo('supabase/migrations/rollback/20261001d_moderation_standards_rollback.sql')

const REVIEWER = '66666666-6666-4666-8666-666666666666'
const REVIEWER2 = '77777777-7777-4777-8777-777777777777'
const R = 'aaaaaaaa-0000-4000-8000-00000000000a'
const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const N_REPORTERS = 100

let t: BlocksDb
let comment: string
const svc = (sql: string, params?: unknown[]) => t.exec('service_role', sql, null, params)
const as = (sub: string, sql: string) => t.exec('authenticated', sql, sub)
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await t.db.query(sql, params as never)).rows as T[]

const ledger = (over: Record<string, unknown> = {}) => {
  const row = { subject: ALICE, reviewer: REVIEWER, group: 'harassment', feature: 'comment', severity: 2, outcome: 'content_removed', strike: true,
    expires: `now() + interval '180 days'`, days: 'NULL', reason: 'Abusive language aimed at another user', ...over }
  return `INSERT INTO public.moderation_decisions (subject_user_id, reviewer_id, rule_group, feature, severity, outcome, strike, strike_expires_at, restrict_days, reason)
    VALUES ('${row.subject}', '${row.reviewer}', '${row.group}', '${row.feature}', ${row.severity}, '${row.outcome}', ${row.strike}, ${row.expires}, ${row.days}, '${row.reason}') RETURNING id`
}
const insertLedger = async (over: Record<string, unknown> = {}) => (await q<{ id: string }>(ledger(over)))[0].id

beforeAll(async () => {
  t = await startBlocksDb(54904, 'modstandards', [])
  // users first (the signup trigger is not there yet), then the production schema
  await t.db.query(`INSERT INTO auth.users (id, is_anonymous) VALUES ('${REVIEWER}', false), ('${REVIEWER2}', false)`)
  await t.db.query(`INSERT INTO auth.users (id, is_anonymous) SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, false FROM generate_series(1, ${N_REPORTERS}) g`)
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL, REVIEWER, REVIEWER2]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  await t.db.query(`INSERT INTO public.profiles (id, username) SELECT id, 'rep' || row_number() OVER () FROM auth.users WHERE id::text LIKE '00000000-0000-4000-8000-%'`)
  await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name) VALUES ($1,$2,'p','Phở A')`, [R, ALICE])
  comment = (await q<{ id: string }>(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R}','${BOB}','a comment people will report') RETURNING id`))[0].id
  await t.db.query(MIG_B)
  await t.db.query(MIG_D)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('a report only ever creates a queue row — 100 reports remove, hide and sanction nothing', () => {
  it('100 different people report the same comment', async () => {
    for (let i = 1; i <= N_REPORTERS; i++) {
      expect(await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(i)}','comment','${comment}','harassment')`)).toBeNull()
    }
    const queue = await q<{ n: string; open: string }>(`SELECT count(*) n, count(*) FILTER (WHERE status = 'pending') open FROM public.moderation_queue WHERE target_id = '${comment}'`)
    expect(Number(queue[0].n)).toBe(N_REPORTERS)
    expect(Number(queue[0].open)).toBe(N_REPORTERS)
    // nothing happened to anyone or anything
    expect((await q(`SELECT 1 FROM public.review_comments WHERE id = '${comment}'`)).length).toBe(1)
    expect((await q<{ publication_state: string | null; is_hidden: boolean | null }>(`SELECT publication_state, is_hidden FROM public.reviews WHERE id = '${R}'`))[0]).toMatchObject({ is_hidden: expect.anything() })
    expect(Number((await q<{ n: string }>('SELECT count(*) n FROM public.moderation_decisions'))[0].n)).toBe(0)
    expect(Number((await q<{ n: string }>(`SELECT count(*) n FROM public.account_status WHERE user_id IN ('${BOB}','${ALICE}')`))[0].n)).toBe(0)
    expect(Number((await q<{ n: string }>('SELECT count(*) n FROM public.moderation_actions'))[0].n)).toBe(0)
    // the comment is still readable by everybody who could read it before
    expect((await t.rows('authenticated', `SELECT id FROM public.review_comments WHERE id = '${comment}'`, CAROL)).length).toBe(1)
  })
})

describe('queue priority and the low-trust reporter', () => {
  it('severe reasons are priority 3; ordinary ones 1–2', async () => {
    const mk = async (reporter: string, reason: string) => {
      await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${reporter}','user','${CAROL}','${reason}')`)
    }
    await mk(rid(1), 'child_safety'); await mk(rid(2), 'self_harm'); await mk(rid(3), 'spam'); await mk(rid(4), 'harassment')
    const rows = await q<{ reason: string; priority: number }>(`SELECT reason, priority FROM public.moderation_queue WHERE target_id = '${CAROL}' ORDER BY reason`)
    expect(Object.fromEntries(rows.map((r) => [r.reason, r.priority]))).toEqual({ child_safety: 3, harassment: 2, self_harm: 3, spam: 1 })
  })

  it('a reporter whose reports are nearly all rejected goes last (priority 0) — but a severe reason is never demoted', async () => {
    const rep = rid(50)
    // five earlier reports from this reporter, all dismissed by a reviewer
    for (let i = 0; i < 5; i++) {
      await t.db.query(`INSERT INTO public.moderation_queue (type, status, priority, reported_by, target_type, target_id, reason, metadata)
        VALUES ('user_report','dismissed',1,'${rep}','user','${rid(900 + i)}','spam', jsonb_build_object('source_table','user_reports','source_id','old${i}'))`)
    }
    await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rep}','user','${ALICE}','spam')`)
    await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rep}','user','${BOB}','child_safety')`)
    const rows = await q<{ target_id: string; priority: number }>(`SELECT target_id, priority FROM public.moderation_queue WHERE reported_by = '${rep}' AND status = 'pending' AND target_type = 'user'`)
    expect(Object.fromEntries(rows.map((r) => [r.target_id, r.priority]))).toEqual({ [ALICE]: 0, [BOB]: 3 })
  })

  it('child_safety is an accepted reason (and an unknown one still is not)', async () => {
    expect(await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(60)}','user','${ALICE}','child_safety')`)).toBeNull()
    expect(await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(60)}','user','${BOB}','dislike')`)).toBe('23514')
  })
})

describe('who can read what', () => {
  it('no client role reads the queue, the ledger or the appeals — not even their own rows', async () => {
    const id = await insertLedger({ subject: BOB })
    for (const table of ['moderation_queue', 'moderation_decisions', 'moderation_appeals', 'moderation_actions']) {
      expect(await as(BOB, `SELECT * FROM public.${table}`), table).toBe('42501')
      expect(await as(ANON_USER, `SELECT * FROM public.${table}`), table).toBe('42501')
      expect(await t.exec('anon', `SELECT * FROM public.${table}`, null), table).toBe('42501')
    }
    expect(await as(BOB, `INSERT INTO public.moderation_appeals (decision_id, message) VALUES ('${id}', 'let me appeal this please')`)).toBe('42501')
    // the reporter reads only their own report row; the reported person reads none
    expect((await t.rows('authenticated', 'SELECT 1 FROM public.user_reports', ALICE)).length).toBe(0)
  })
})

describe('the ledger is immutable', () => {
  it('shape: a warning is no strike; severity 3 never expires; a restriction needs its days', async () => {
    expect(await svc(ledger({ outcome: 'warning', strike: false, expires: 'NULL', severity: 1 }).replace(' RETURNING id', ''))).toBeNull()
    expect(await svc(ledger({ outcome: 'warning', strike: true }).replace(' RETURNING id', ''))).toBe('23514')
    expect(await svc(ledger({ outcome: 'banned', severity: 3, expires: `now() + interval '1 day'` }).replace(' RETURNING id', ''))).toBe('23514')
    expect(await svc(ledger({ outcome: 'restricted', days: 'NULL' }).replace(' RETURNING id', ''))).toBe('23514')
    expect(await svc(ledger({ outcome: 'restricted', days: '7' }).replace(' RETURNING id', ''))).toBeNull()
    expect(await svc(ledger({ outcome: 'banned', severity: 3, expires: 'NULL' }).replace(' RETURNING id', ''))).toBeNull()
    expect(await svc(ledger({ group: 'nonsense' }).replace(' RETURNING id', ''))).toBe('23514')
    expect(await svc(ledger({ reason: 'short' }).replace(' RETURNING id', ''))).toBe('23514')
  })

  it('no update, no delete, no truncate — for any role, the service role included', async () => {
    const id = await insertLedger()
    for (const role of ['service_role', 'postgres']) {
      expect(await t.exec(role, `UPDATE public.moderation_decisions SET rule_group = 'spam' WHERE id = '${id}'`)).toBe('42501')
      expect(await t.exec(role, `UPDATE public.moderation_decisions SET outcome = 'no_violation' WHERE id = '${id}'`)).toBe('42501')
      expect(await t.exec(role, `UPDATE public.moderation_decisions SET strike_expires_at = now() WHERE id = '${id}'`)).toBe('42501')
      expect(await t.exec(role, `UPDATE public.moderation_decisions SET subject_user_id = '${CAROL}' WHERE id = '${id}'`)).toBe('42501')
      expect(await t.exec(role, `DELETE FROM public.moderation_decisions WHERE id = '${id}'`)).toBe('42501')
      // clearing the person's reference is ONLY for an account deletion — a direct UPDATE is refused, whoever runs it (security review 02/10)
      for (const col of ['subject_user_id', 'reviewer_id']) expect(await t.exec(role, `UPDATE public.moderation_decisions SET ${col} = NULL WHERE id = '${id}'`), `${role}:${col}`).toBe('42501')
    }
    // 0A000: the appeals table references the ledger, so TRUNCATE is refused by the foreign key even before the trigger
    expect(['42501', '0A000']).toContain(await t.exec('postgres', 'TRUNCATE public.moderation_decisions'))
  })

  it('one final decision per queue item: a retry cannot double a strike', async () => {
    const queueId = (await q<{ id: string }>(`SELECT id FROM public.moderation_queue WHERE target_id = '${comment}' LIMIT 1`))[0].id
    const ins = `INSERT INTO public.moderation_decisions (queue_id, subject_user_id, reviewer_id, rule_group, feature, severity, outcome, strike, strike_expires_at, reason)
      VALUES ('${queueId}', '${BOB}', '${REVIEWER}', 'harassment', 'comment', 2, 'content_removed', true, now() + interval '180 days', 'Abusive language aimed at another user')`
    expect(await svc(ins)).toBeNull()
    expect(await svc(ins)).toBe('23505')
  })

  it('the comment snapshot exists only for a removal, and can be purged (the one allowed edit)', async () => {
    expect(await svc(`INSERT INTO public.moderation_decisions (subject_user_id, reviewer_id, rule_group, feature, severity, outcome, strike, reason, content_snapshot)
      VALUES ('${ALICE}','${REVIEWER}','spam','comment',1,'warning',false,'Repeated advert in comments', '{"body":"x"}')`)).toBe('23514')
    const id = (await q<{ id: string }>(`INSERT INTO public.moderation_decisions (subject_user_id, reviewer_id, rule_group, feature, severity, outcome, strike, strike_expires_at, reason, content_snapshot, created_at)
      VALUES ('${ALICE}','${REVIEWER}','spam','comment',1,'content_removed',true, now() + interval '90 days','Repeated advert in comments', '{"body":"buy now"}', now() - interval '90 days') RETURNING id`))[0].id
    expect((await q<{ n: number }>('SELECT public.moderation_purge_snapshots(60) n'))[0].n).toBeGreaterThanOrEqual(1)
    expect((await q<{ content_snapshot: unknown }>(`SELECT content_snapshot FROM public.moderation_decisions WHERE id = '${id}'`))[0].content_snapshot).toBeNull()
    // purge is service-role only
    expect(await as(BOB, 'SELECT public.moderation_purge_snapshots(60)')).toBe('42501')
  })
})

describe('P8-4: a sanctioned account (and a reviewer) can still be deleted', () => {
  it('deleting the subject, the reviewer and the appellant keeps the history, anonymised', async () => {
    const queueId = (await q<{ id: string }>(`SELECT id FROM public.moderation_queue WHERE target_id = '${CAROL}' LIMIT 1`))[0].id
    const subject = rid(70); const reviewer = REVIEWER2
    const decision = (await q<{ id: string }>(`INSERT INTO public.moderation_decisions (queue_id, subject_user_id, reviewer_id, rule_group, feature, severity, outcome, strike, strike_expires_at, reason, content_snapshot)
      VALUES ('${queueId}', '${subject}', '${reviewer}', 'hate', 'comment', 2, 'content_removed', true, now() + interval '180 days', 'Slur aimed at a group of users', '{"body":"x"}') RETURNING id`))[0].id
    await q(`INSERT INTO public.moderation_appeals (decision_id, appellant_id, message) VALUES ('${decision}', '${subject}', 'I think this was a mistake please look again')`)
    await q(`UPDATE public.moderation_appeals SET status = 'upheld', resolved_by = '${reviewer}', resolved_at = now(), same_reviewer = false WHERE decision_id = '${decision}'`)
    await t.db.query(`DELETE FROM auth.users WHERE id = $1`, [subject])
    await t.db.query(`DELETE FROM auth.users WHERE id = $1`, [reviewer])
    const d = (await q<{ subject_user_id: string | null; reviewer_id: string | null; rule_group: string; outcome: string }>(`SELECT subject_user_id, reviewer_id, rule_group, outcome FROM public.moderation_decisions WHERE id = '${decision}'`))[0]
    expect(d).toEqual({ subject_user_id: null, reviewer_id: null, rule_group: 'hate', outcome: 'content_removed' })
    const a = (await q<{ appellant_id: string | null; resolved_by: string | null; status: string }>(`SELECT appellant_id, resolved_by, status FROM public.moderation_appeals WHERE decision_id = '${decision}'`))[0]
    expect(a).toEqual({ appellant_id: null, resolved_by: null, status: 'upheld' })
  })
})

describe('appeals: one per decision, resolved once', () => {
  it('a second appeal is refused; a resolved appeal cannot change; the message is fixed', async () => {
    const id = await insertLedger({ subject: ALICE })
    expect(await svc(`INSERT INTO public.moderation_appeals (decision_id, appellant_id, message) VALUES ('${id}', '${ALICE}', 'I did not write this, please check')`)).toBeNull()
    expect(await svc(`INSERT INTO public.moderation_appeals (decision_id, appellant_id, message) VALUES ('${id}', '${ALICE}', 'sending the same appeal again now')`)).toBe('23505')
    expect(await svc(`UPDATE public.moderation_appeals SET message = 'a different story entirely here' WHERE decision_id = '${id}'`)).toBe('42501')
    expect(await svc(`UPDATE public.moderation_appeals SET status = 'reversed', resolved_by = '${REVIEWER}', resolved_at = now(), same_reviewer = true, resolution_note = 'checked' WHERE decision_id = '${id}'`)).toBeNull()
    expect(await svc(`UPDATE public.moderation_appeals SET status = 'upheld' WHERE decision_id = '${id}'`)).toBe('42501')
    expect(await svc(`DELETE FROM public.moderation_appeals WHERE decision_id = '${id}'`)).toBe('42501')
    expect(await svc(`INSERT INTO public.moderation_appeals (decision_id, message, source) VALUES ('${await insertLedger()}', 'short', 'app')`)).toBe('23514')
    expect(await svc(`INSERT INTO public.moderation_appeals (decision_id, message, source) VALUES ('${await insertLedger()}', 'sent by email to support', 'sms')`)).toBe('23514')
  })
})

describe('rollback', () => {
  it('removes the ledger and the appeals, keeps content_reports and the queue', async () => {
    await t.db.query(ROLLBACK_D)
    for (const tbl of ['moderation_decisions', 'moderation_appeals']) expect((await q<{ r: string | null }>(`SELECT to_regclass('public.${tbl}') r`))[0].r).toBeNull()
    expect((await q<{ r: string | null }>(`SELECT to_regclass('public.moderation_queue') r`))[0].r).not.toBeNull()
    expect((await q<{ r: string | null }>(`SELECT to_regclass('public.content_reports') r`))[0].r).not.toBeNull()
    expect(await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(61)}','user','${ALICE}','child_safety')`)).toBe('23514')
    // no trigger left: a new report no longer reaches the queue
    const before = Number((await q<{ n: string }>('SELECT count(*) n FROM public.moderation_queue'))[0].n)
    await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(62)}','user','${CAROL}','spam')`)
    expect(Number((await q<{ n: string }>('SELECT count(*) n FROM public.moderation_queue'))[0].n)).toBe(before)
  })
})
