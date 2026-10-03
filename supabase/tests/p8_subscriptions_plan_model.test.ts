import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, readRepo, startP8Db, type P8Db } from './p8Harness'

// PHASE 8 / Task 12 — subscriptions gain plan/source/period; release writers keep working.

const MIGRATION = readRepo('supabase/migrations/20260924_p8_subscriptions_plan_model.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20260924_p8_subscriptions_plan_model_rollback.sql')

/** The release table (20260712_prod_baseline_and_review_saves_indexes.sql) + one legacy row of each kind. */
const RELEASE_STATE = `
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  INSERT INTO public.profiles VALUES ('${ALICE}'), ('${BOB}'), ('${CAROL}');
  CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_customer_id text, stripe_sub_id text, plan text, status text,
    current_period_end timestamptz, cancel_at_period_end boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id)
  );
  ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  INSERT INTO public.subscriptions (user_id, stripe_customer_id, stripe_sub_id, plan, status, current_period_end)
    VALUES ('${ALICE}', 'cus_1', 'sub_1', 'pro', 'active', now() + interval '10 days'),
           ('${BOB}', NULL, 'apple_2000000001', 'pro', 'active', now() + interval '10 days'),
           ('${CAROL}', NULL, NULL, 'legacy_weird', 'canceled', NULL);
`

let t: P8Db
beforeAll(async () => {
  t = await startP8Db(54805, 'p8subs', [RELEASE_STATE])
  await t.db.query(MIGRATION)
}, 180_000)
afterAll(async () => { await t?.stop() })

const row = (user: string) => t.one(`SELECT plan, status, source, period_start FROM public.subscriptions WHERE user_id = '${user}'`)

describe('subscriptions plan model', () => {
  it('backfills source from what each release writer stored', async () => {
    expect((await row(ALICE)).source).toBe('web')
    expect((await row(BOB)).source).toBe('apple_iap')
    expect((await row(CAROL)).source).toBe('manual')
  })

  it('a historical row with an unknown plan survives (CHECK is NOT VALID)', async () => {
    expect((await row(CAROL)).plan).toBe('legacy_weird')
  })

  it('the release Stripe upsert still works unchanged and gets source=web', async () => {
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = '${ALICE}'`)
    // exactly the column set webhooks/stripe/route.ts writes — no `source`
    await t.db.query(`INSERT INTO public.subscriptions (user_id, stripe_sub_id, stripe_customer_id, status, plan, current_period_end)
      VALUES ('${ALICE}', 'sub_9', 'cus_9', 'active', 'pro', now() + interval '30 days')
      ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status`)
    expect((await row(ALICE)).source).toBe('web')
  })

  it('the release Apple upsert still works unchanged and gets source=apple_iap', async () => {
    await t.db.query(`INSERT INTO public.subscriptions (user_id, stripe_sub_id, plan, status, current_period_end)
      VALUES ('${BOB}', 'apple_2000000009', 'pro', 'active', now() + interval '7 days')
      ON CONFLICT (user_id) DO UPDATE SET stripe_sub_id = EXCLUDED.stripe_sub_id, status = EXCLUDED.status`)
    expect((await row(BOB)).source).toBe('apple_iap')
  })

  it('a manual grant records plan, period and provenance', async () => {
    await t.db.query(`INSERT INTO public.subscriptions (user_id, plan, status, period_start, current_period_end, source, granted_by, grant_note)
      VALUES ('${CAROL}', 'momo', 'active', now(), now() + interval '30 days', 'manual', '${ALICE}', 'uat')
      ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, period_start = EXCLUDED.period_start,
        current_period_end = EXCLUDED.current_period_end, source = EXCLUDED.source, granted_by = EXCLUDED.granted_by, grant_note = EXCLUDED.grant_note`)
    const r = await row(CAROL)
    expect(r).toMatchObject({ plan: 'momo', status: 'active', source: 'manual' })
    expect(r.period_start).not.toBeNull()
  })

  it('refuses an unknown plan or source on new writes', async () => {
    expect(await t.exec('postgres', `UPDATE public.subscriptions SET plan = 'gold' WHERE user_id = '${CAROL}'`)).toBe('23514')
    expect(await t.exec('postgres', `UPDATE public.subscriptions SET source = 'paypal' WHERE user_id = '${CAROL}'`)).toBe('23514')
  })

  it('a user still reads only their own row, and cannot write any', async () => {
    const own = await t.rows('authenticated', 'SELECT user_id FROM public.subscriptions', CAROL)
    expect(own).toEqual([{ user_id: CAROL }])
    expect(await t.exec('authenticated', `UPDATE public.subscriptions SET plan = 'sunny' WHERE user_id = '${CAROL}'`, CAROL)).toBeNull()
    expect((await row(CAROL)).plan).toBe('momo') // RLS: no UPDATE policy → 0 rows changed
  })

  it('rollback removes only the new columns; rows and entitlement survive', async () => {
    await t.db.query(ROLLBACK)
    const r = await t.one<{ plan: string; status: string }>(`SELECT plan, status FROM public.subscriptions WHERE user_id = '${CAROL}'`)
    expect(r).toEqual({ plan: 'momo', status: 'active' })
    await t.db.query(MIGRATION)
  })
})
